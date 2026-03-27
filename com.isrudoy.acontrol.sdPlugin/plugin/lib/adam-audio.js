/**
 * Adam Audio A-Series UDP Client
 *
 * Handles OCA/AES70 communication with Adam Audio speakers.
 * Features: connection management, keepalive, command execution.
 */

const dgram = require('dgram');
const { EventEmitter } = require('events');
const { log } = require('./common');
const {
  OCA_PORT,
  PDU_TYPE,
  OCA_OBJECTS,
  encodeCommand,
  encodeKeepalive,
  decodeResponse,
  encodeUint16,
  encodeInt8,
  decodeUint16,
  decodeInt8,
} = require('./oca-protocol');

const KEEPALIVE_INTERVAL = 1000; // 1 second
const COMMAND_TIMEOUT = 2000; // 2 seconds
const MAX_RETRIES = 3;

/**
 * @typedef {Object} SpeakerState
 * @property {boolean} muted
 * @property {number} level - dB value (-40 to +12)
 * @property {number} voicing - 0=Pure, 1=UNR, 2=Ext
 * @property {number} input - 0=RCA, 1=XLR
 * @property {boolean} sleeping
 */

/**
 * Adam Audio UDP Client
 * @extends EventEmitter
 */
class AdamAudioClient extends EventEmitter {
  /**
   * @param {string} ip - Speaker IP address
   */
  constructor(ip) {
    super();
    this.ip = ip;
    this.socket = null;
    this.connected = false;
    this.keepaliveTimer = null;

    /** @type {Map<number, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>} */
    this.pendingCommands = new Map();

    /** @type {SpeakerState} */
    this.state = {
      muted: false,
      level: 0,
      voicing: 0,
      input: 0,
      sleeping: false,
    };
  }

  /**
   * Connect to the speaker
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg) => this.handleMessage(msg));

      this.socket.on('error', (err) => {
        this.emit('error', err);
        this.disconnect();
        reject(err);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });

      // Bind to any available port
      this.socket.bind(() => {
        this.connected = true;
        this.startKeepalive();
        this.emit('connected');
        resolve();
      });
    });
  }

  /**
   * Disconnect from the speaker
   */
  disconnect() {
    this.stopKeepalive();

    // Reject all pending commands
    for (const [_handle, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingCommands.clear();

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors
      }
      this.socket = null;
    }

    this.connected = false;
  }

  /**
   * Start keepalive timer
   * @private
   */
  startKeepalive() {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      this.sendKeepalive();
    }, KEEPALIVE_INTERVAL);
  }

  /**
   * Stop keepalive timer
   * @private
   */
  stopKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /**
   * Send keepalive packet
   * @private
   */
  sendKeepalive() {
    if (!this.connected || !this.socket) {
      return;
    }

    const packet = encodeKeepalive(1);
    this.socket.send(packet, OCA_PORT, this.ip, (err) => {
      if (err) {
        this.emit('error', err);
      }
    });
  }

  /**
   * Handle incoming UDP message
   * @param {Buffer} msg
   * @private
   */
  handleMessage(msg) {
    log(`[UDP] Received ${msg.length} bytes: ${msg.toString('hex').substring(0, 60)}...`);

    const response = decodeResponse(msg);
    if (!response) {
      log('[UDP] Failed to decode response');
      return;
    }

    log(
      `[UDP] Decoded: type=${response.type}, handle=${response.handle}, status=${response.status}`
    );

    if (response.type === PDU_TYPE.KEEPALIVE) {
      // Keepalive response, ignore
      return;
    }

    if (response.type === PDU_TYPE.RESPONSE && response.handle !== undefined) {
      const pending = this.pendingCommands.get(response.handle);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(response.handle);

        if (response.status === 0) {
          pending.resolve(response.params);
        } else {
          pending.reject(new Error(`OCA error: status ${response.status}`));
        }
      } else {
        log(`[UDP] No pending command for handle ${response.handle}`);
      }
    }
  }

  /**
   * Send command and wait for response
   * @param {number} oNo - Object number
   * @param {number} defLevel - Definition level
   * @param {number} methodIndex - Method index
   * @param {Buffer} [params] - Optional parameters
   * @param {number} [retries=MAX_RETRIES] - Number of retries
   * @returns {Promise<Buffer>}
   * @private
   */
  async sendCommand(oNo, defLevel, methodIndex, params = Buffer.alloc(0), retries = MAX_RETRIES) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected');
    }

    const { buffer, handle } = encodeCommand(oNo, defLevel, methodIndex, params);
    log(
      `[UDP] Sending to ${this.ip}: oNo=0x${oNo.toString(16)}, method=${defLevel}.${methodIndex}, handle=${handle}`
    );
    log(`[UDP] Packet: ${buffer.toString('hex')}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(handle);
        if (retries > 0) {
          this.sendCommand(oNo, defLevel, methodIndex, params, retries - 1)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error('Command timeout'));
        }
      }, COMMAND_TIMEOUT);

      this.pendingCommands.set(handle, { resolve, reject, timeout });

      const socket = this.socket;
      if (!socket) {
        clearTimeout(timeout);
        this.pendingCommands.delete(handle);
        reject(new Error('Socket closed'));
        return;
      }

      socket.send(buffer, OCA_PORT, this.ip, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingCommands.delete(handle);
          reject(err);
        }
      });
    });
  }

  // ==================== Get Methods ====================

  /**
   * Get mute state
   * @returns {Promise<boolean>} true if muted
   */
  async getMute() {
    // GET mute returns stale data — OCA set doesn't update the readable register
    return this.state.muted;
  }

  /**
   * Get level (volume)
   * @returns {Promise<number>} Level value (-40 to +12, represents -20dB to +6dB in 0.5dB steps)
   */
  async getLevel() {
    const obj = OCA_OBJECTS.LEVEL;
    const result = await this.sendCommand(obj.oNo, obj.get.level, obj.get.index);
    // Level is OcaInt8: -40..+12 (represents -20dB to +6dB in 0.5dB steps)
    const rawValue = decodeInt8(result, 0);
    this.state.level = rawValue;
    return this.state.level;
  }

  /**
   * Get voicing mode
   * @returns {Promise<number>} 0=Pure, 1=UNR, 2=Ext
   */
  async getVoicing() {
    const obj = OCA_OBJECTS.VOICING;
    const result = await this.sendCommand(obj.oNo, obj.get.level, obj.get.index);
    // Voicing is OcaUint16: 0=Pure, 1=UNR, 2=Ext
    const value = decodeUint16(result, 0);
    this.state.voicing = value;
    return this.state.voicing;
  }

  /**
   * Get input source
   * @returns {Promise<number>} 0=RCA, 1=XLR
   */
  async getInput() {
    const obj = OCA_OBJECTS.INPUT;
    const result = await this.sendCommand(obj.oNo, obj.get.level, obj.get.index);
    // Input is OcaUint16: 0=RCA, 1=XLR
    const value = decodeUint16(result, 0);
    this.state.input = value;
    return this.state.input;
  }

  /**
   * Fetch all speaker state
   * Note: Mute state is tracked locally (Adam Audio doesn't support GET for mute)
   * @returns {Promise<SpeakerState>}
   */
  async fetchState() {
    await Promise.all([this.getLevel(), this.getVoicing(), this.getInput(), this.getSleep()]);
    return this.state;
  }

  // ==================== Set Methods ====================

  /**
   * Set mute state
   * @param {boolean} muted
   * @returns {Promise<void>}
   */
  async setMute(muted) {
    const obj = OCA_OBJECTS.MUTE;
    // Adam Audio quirk: 1=unmuted, 5=muted (OcaUint16)
    const value = muted ? 5 : 1;
    const params = encodeUint16(value);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
    this.state.muted = muted;
  }

  /**
   * Toggle mute state
   * @returns {Promise<boolean>} New mute state
   */
  async toggleMute() {
    await this.getMute();
    await this.setMute(!this.state.muted);
    return this.state.muted;
  }

  /**
   * Set level (volume)
   * @param {number} level - Level value (-40 to +12, integer steps)
   * @returns {Promise<void>}
   */
  async setLevel(level) {
    // Clamp to valid range and round to integer
    // Range: -40 to +32 (-20dB to +16dB in 0.5dB steps)
    const clampedLevel = Math.max(-40, Math.min(32, Math.round(level)));

    const obj = OCA_OBJECTS.LEVEL;
    // Level is OcaInt8
    const params = encodeInt8(clampedLevel);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
    this.state.level = clampedLevel;
  }

  /**
   * Adjust level by delta
   * @param {number} delta - Change in level units (can be negative, each unit = 0.5dB)
   * @returns {Promise<number>} New level
   */
  async adjustLevel(delta) {
    await this.getLevel();
    const newLevel = this.state.level + Math.round(delta);
    await this.setLevel(newLevel);
    return this.state.level;
  }

  /**
   * Set voicing mode
   * @param {number} voicing - 0=Pure, 1=UNR, 2=Ext
   * @returns {Promise<void>}
   */
  async setVoicing(voicing) {
    const obj = OCA_OBJECTS.VOICING;
    // Voicing is OcaUint16
    const params = encodeUint16(voicing);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
    this.state.voicing = voicing;
  }

  /**
   * Cycle voicing mode: Pure -> UNR -> Ext -> Pure
   * @returns {Promise<number>} New voicing mode
   */
  async cycleVoicing() {
    await this.getVoicing();
    const newVoicing = (this.state.voicing + 1) % 3;
    await this.setVoicing(newVoicing);
    return this.state.voicing;
  }

  /**
   * Set input source
   * @param {number} input - 0=RCA, 1=XLR
   * @returns {Promise<void>}
   */
  async setInput(input) {
    const obj = OCA_OBJECTS.INPUT;
    // Input is OcaUint16
    const params = encodeUint16(input);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
    this.state.input = input;
  }

  /**
   * Cycle input: RCA <-> XLR
   * @returns {Promise<number>} New input
   */
  async cycleInput() {
    await this.getInput();
    const newInput = this.state.input === 0 ? 1 : 0;
    await this.setInput(newInput);
    return this.state.input;
  }

  /**
   * Get sleep state
   * @returns {Promise<boolean>} Whether speakers are sleeping
   */
  async getSleep() {
    const obj = OCA_OBJECTS.SLEEP;
    const result = await this.sendCommand(obj.oNo, obj.get.level, obj.get.index);
    // Sleep is OcaUint16: 0=awake, 1=sleeping
    const value = decodeUint16(result, 0);
    this.state.sleeping = value === 1;
    return this.state.sleeping;
  }

  /**
   * Set sleep state
   * @param {boolean} sleeping
   * @returns {Promise<void>}
   */
  async setSleep(sleeping) {
    const obj = OCA_OBJECTS.SLEEP;
    // Sleep is OcaUint16: 0=wake, 1=sleep
    const params = encodeUint16(sleeping ? 1 : 0);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
    this.state.sleeping = sleeping;
  }

  /**
   * Toggle sleep state
   * @returns {Promise<boolean>} New sleep state
   */
  async toggleSleep() {
    await this.getSleep();
    await this.setSleep(!this.state.sleeping);
    return this.state.sleeping;
  }

  /**
   * Blink LED (visual identification)
   * @returns {Promise<void>}
   */
  async blinkLED() {
    const obj = OCA_OBJECTS.LED;
    // LED blink uses OcaUint16 with value 0x0101
    const params = encodeUint16(0x0101);
    await this.sendCommand(obj.oNo, obj.set.level, obj.set.index, params);
  }
}

module.exports = { AdamAudioClient };
