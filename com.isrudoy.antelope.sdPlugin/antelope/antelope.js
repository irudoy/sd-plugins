const net = require('net');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const {
  encodeCommand,
  extractPacket,
  parsePacket,
  isCyclicReport,
  isNotification,
  isGetResponse,
} = require('./protocol');
const {
  HOST,
  PORT_RANGE,
  NUM_BUSES,
  PERIPH_NAMES,
  MIXER_ROUTING_BANK_BASE,
  AFX_INPUT_BANK,
  AFX_PERIPH,
  GROUP_TO_PERIPH,
} = require('./constants');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} OutputState
 * @property {number} volume - Volume/attenuation 0-255
 * @property {boolean} mute - Mute state
 * @property {boolean} dim - DIM state
 * @property {boolean} mono - Mono state
 * @property {number} trim - Trim value
 */

/**
 * @typedef {Object} MixerChannelState
 * @property {number} level - Fader level (0=0dB, 90=-inf)
 * @property {number} pan - Pan position (0=L, 32=C, 63=R)
 * @property {boolean} mute - Mute state
 * @property {boolean} solo - Solo state
 * @property {boolean} link - Stereo linked to next channel
 */

/**
 * @typedef {Object} ZenState
 * @property {OutputState[]} outputs - Output states
 * @property {number} currentPreset - Current preset 0-7
 * @property {MixerChannelState[][]} mixer - 3 buses × N channels
 */

// ============================================================
// Port Autodiscovery
// ============================================================

/**
 * Test if a port is the Antelope Manager main protocol port
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function tryPort(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);

    sock.on('connect', () => {
      let buf = Buffer.alloc(0);
      const timer = setTimeout(() => {
        sock.destroy();
        resolve(false);
      }, 1500);

      sock.on('data', (data) => {
        buf = Buffer.concat([buf, data]);
        let result;
        while ((result = extractPacket(buf)).packet) {
          buf = result.remaining;
          try {
            const msg = parsePacket(result.packet);
            if (isCyclicReport(msg) && msg.contents?.volumes) {
              clearTimeout(timer);
              sock.destroy();
              resolve(true);
              return;
            }
          } catch {}
        }
      });
    });

    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => {
      sock.destroy();
      resolve(false);
    });

    sock.connect(port, HOST);
  });
}

/**
 * Discover main protocol port (with console output for CLI)
 * @returns {Promise<number|null>}
 */
async function discoverPort() {
  process.stdout.write('Scanning ports');
  for (let port = PORT_RANGE[0]; port <= PORT_RANGE[1]; port++) {
    process.stdout.write(` ${port}`);
    if (await tryPort(port)) {
      console.log(` -> found!`);
      return port;
    }
  }
  console.log(' -> not found');
  return null;
}

/**
 * Discover main protocol port (silent, for programmatic use)
 * @returns {Promise<number|null>}
 */
async function discoverPortSilent() {
  for (let port = PORT_RANGE[0]; port <= PORT_RANGE[1]; port++) {
    if (await tryPort(port)) return port;
  }
  return null;
}

// ============================================================
// Persistence
// ============================================================

/**
 * Get persistence.JSON path for current platform
 * @returns {string|null}
 */
function getPersistencePath() {
  if (process.platform === 'darwin') {
    return '/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/persistence.JSON';
  } else if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(programData, '.AntelopeAudio', 'zenquadrosc_usb2', 'persistence.JSON');
  }
  return null;
}

/**
 * Load channel names from persistence.JSON
 * @returns {Record<number, Record<number, string>>} channelNames[periphId][ch] = name
 */
function loadChannelNamesFromFile() {
  /** @type {Record<number, Record<number, string>>} */
  const names = {};
  try {
    const persistPath = getPersistencePath();
    if (!persistPath) return names;
    const data = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
    const groups = data?.TMP_ROUTING?.routing_matrix || [];
    for (const group of groups) {
      const periphId = GROUP_TO_PERIPH[group.group_name];
      if (periphId === undefined) continue;
      names[periphId] = {};
      for (const ch of group.channels || []) {
        const m = ch.uniqueid?.match(/CH(\d+)$/);
        if (m) {
          names[periphId][parseInt(m[1]) - 1] = ch.name;
        }
      }
    }
  } catch {}
  return names;
}

/**
 * Get report_format path for current platform
 * @returns {string}
 */
function getReportFormatPath() {
  if (process.platform === 'win32') {
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    return path.join(
      programData,
      '.AntelopeAudio',
      'zenquadrosc_usb2',
      'panels',
      'report_format_1.0.4'
    );
  }
  return '/Users/Shared/.AntelopeAudio/zenquadrosc_usb2/panels/report_format_1.0.4';
}

// ============================================================
// Client Class
// ============================================================

class AntelopeClient extends EventEmitter {
  constructor() {
    super();

    /** @type {net.Socket|null} */
    this.socket = null;
    /** @type {Buffer} */
    this.buffer = Buffer.alloc(0);
    /** @type {boolean} */
    this._connected = false;
    /** @type {boolean} */
    this._connecting = false;
    /** @type {number|null} */
    this.port = null;

    // Mixer state (populated from get_mixer responses)
    /** @type {MixerChannelState[][]|null} */
    this.mixer = null;
    /** @type {number} */
    this.mixerSize = 0;
    // Routing state: routing[bankId] = [{periph, ch}, ...] per channel
    /** @type {Record<number, Array<{periph: number, ch: number}>>} */
    this.routing = {};

    // Mixer link state (raw array from get_mixer_links)
    /** @type {Array<{linked: number}>} */
    this.mixerLinks = [];

    // Persistence channel names: channelNames[periphId][ch] = name
    /** @type {Record<number, Record<number, string>>|null} */
    this._persistenceNames = null;
    /** @type {number} */
    this._persistenceNamesTime = 0;

    // Normalized state for plugin
    /** @type {ZenState|null} */
    this._state = null;

    // Auto-reconnect
    /** @type {ReturnType<typeof setTimeout>|null} */
    this._reconnectTimer = null;
    /** @type {number} */
    this._reconnectAttempts = 0;
    /** @type {boolean} */
    this._disconnecting = false;

    // Data ready (for CLI waitForData)
    /** @type {boolean} */
    this._dataReady = false;
    /** @type {((value?: unknown) => void)|null} */
    this._dataResolve = null;
    /** @type {((value?: unknown) => void)|null} */
    this._routingResolve = null;
    /** @type {number} */
    this._routingTarget = 0;

    // Last device_updated flag for CLI
    /** @type {boolean} */
    this._lastDeviceUpdated = false;

    // Optimistic locks: suppress cyclic updates per output field
    /** @type {number[]} */
    this._outputVolumeLockedUntil = [];
    /** @type {number[]} */
    this._outputMuteLockedUntil = [];
    /** @type {number[]} */
    this._outputDimLockedUntil = [];

    // Callbacks for CLI (deprecated, use events instead)
    /** @type {((contents: import('./protocol').CyclicReportContents) => void)|null} */
    this.onCyclic = null;
    /** @type {((contents: unknown) => void)|null} */
    this.onNotification = null;
    /** @type {((msg: unknown) => void)|null} */
    this.onResponse = null;
  }

  // ============================================================
  // Connection
  // ============================================================

  /**
   * Connect to Antelope Manager Server
   * If port is provided, connects directly. Otherwise autodiscovers.
   * @param {number} [port] - Optional port number
   * @returns {Promise<void>}
   */
  async connect(port) {
    if (this._connected || this._connecting) return;
    this._disconnecting = false;

    if (port) {
      await this._connectToPort(port);
    } else {
      const discovered = await discoverPortSilent();
      if (discovered) {
        await this._connectToPort(discovered);
      } else {
        this._scheduleReconnect();
        throw new Error('Antelope Manager Server not found');
      }
    }
  }

  /**
   * Connect to a specific port
   * @private
   * @param {number} port
   * @returns {Promise<void>}
   */
  _connectToPort(port) {
    this.port = port;
    this._connecting = true;

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setTimeout(5000);

      this.socket.connect(port, HOST, () => {
        this._connected = true;
        this._connecting = false;
        this._reconnectAttempts = 0;
        if (this.socket) this.socket.setTimeout(0);

        this._sendInitFormat();
        this.requestAllMixers();
        this.requestRouting();
        this.requestMixerLinks();

        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.buffer = Buffer.concat([this.buffer, data]);
        this._processBuffer();
      });

      this.socket.on('close', () => {
        const wasConnected = this._connected;
        this._connected = false;
        this._connecting = false;
        this.socket = null;
        this.buffer = Buffer.alloc(0);

        if (wasConnected) {
          this.emit('disconnected');
        }

        if (!this._disconnecting) {
          this._scheduleReconnect();
        }
      });

      this.socket.on('timeout', () => {
        this.socket?.destroy();
        this._connecting = false;
        reject(new Error('Connection timeout'));
      });

      this.socket.on('error', (err) => {
        if (this._connecting) {
          this._connecting = false;
          reject(err);
        }
        this.emit('error', err);
      });
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    if (this._reconnectTimer || this._disconnecting) return;

    const delays = [1000, 2000, 4000, 8000, 15000, 30000];
    const delay = delays[Math.min(this._reconnectAttempts, delays.length - 1)];
    this._reconnectAttempts++;

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      if (this._disconnecting) return;

      try {
        // Re-discover port on reconnect
        const port = await discoverPortSilent();
        if (port && !this._disconnecting) {
          await this._connectToPort(port);
        } else if (!this._disconnecting) {
          this._scheduleReconnect();
        }
      } catch {
        // Error triggers close → scheduleReconnect via close handler
      }
    }, delay);
  }

  /**
   * Disconnect and stop reconnecting
   */
  disconnect() {
    this._disconnecting = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this._connected = false;
    this._connecting = false;
    this.buffer = Buffer.alloc(0);
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  /**
   * Get normalized state for plugin
   * @returns {ZenState|null}
   */
  getState() {
    return this._state;
  }

  // ============================================================
  // Buffer Processing
  // ============================================================

  /**
   * @private
   */
  _processBuffer() {
    let result;
    while ((result = extractPacket(this.buffer)).packet) {
      this.buffer = result.remaining;
      try {
        const msg = parsePacket(result.packet);
        this._handleMessage(msg);
      } catch {}
    }
  }

  /**
   * @private
   * @param {unknown} msg
   */
  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (isCyclicReport(msg)) {
      this._updateStateFromCyclic(msg.contents);
      if (this.onCyclic) this.onCyclic(msg.contents);
    } else if (isNotification(msg)) {
      const c = msg.contents;
      if (Array.isArray(c) && c[0] === 'set_mixer' && c[1]?.length >= 2) {
        this._updateMixerChannel(c[1][0], c[1][1], c[2] || {});
      }
      if (Array.isArray(c) && c[0] === 'set_stereo_link') {
        this.requestMixerLinks();
      }
      if (this.onNotification) this.onNotification(c);
    } else if (isGetResponse(msg)) {
      // get_mixer response (ext2 === 4)
      if (msg.header.ext2 === 4 && Array.isArray(msg.contents)) {
        const busId = msg.header.ext3;
        this._updateMixerBus(busId, msg.contents);
        this._checkDataReady();
      }
      // get_mixer_links response (ext2 === 11, ext3 === 3)
      if (msg.header.ext2 === 11 && msg.header.ext3 === 3 && Array.isArray(msg.contents)) {
        this.mixerLinks = msg.contents;
        this._applyMixerLinks();
        if (this._state && this.mixer) {
          this._state.mixer = this.mixer;
          this.emit('stateChanged', this._state);
        }
      }
      // get_routing response (ext2 === 3)
      const routingContents =
        /** @type {{bank_configs?: Array<{in_periph_id: number, in_chann: number}>}} */ (
          msg.contents
        );
      if (msg.header.ext2 === 3 && routingContents.bank_configs) {
        const bankIdx = msg.header.ext3;
        this.routing[bankIdx] = routingContents.bank_configs.map(
          (/** @type {{in_periph_id: number, in_chann: number}} */ cfg) => ({
            periph: cfg.in_periph_id,
            ch: cfg.in_chann,
          })
        );
        this._checkDataReady();
        this._checkRoutingReady();
      }
      if (this.onResponse) this.onResponse(msg);
    }
  }

  // ============================================================
  // State Management
  // ============================================================

  /**
   * Update state from cyclic report
   * @private
   * @param {import('./protocol').CyclicReportContents} contents
   */
  _updateStateFromCyclic(contents) {
    const prev = this._state;

    const now = Date.now();
    const prevOutputs = this._state?.outputs;

    this._state = {
      outputs: (contents.volumes || []).map((v, i) => {
        const prev = prevOutputs?.[i];
        return {
          volume: this._outputVolumeLockedUntil[i] > now && prev ? prev.volume : (v.volume ?? 0),
          mute: this._outputMuteLockedUntil[i] > now && prev ? prev.mute : Boolean(v.mute),
          dim: this._outputDimLockedUntil[i] > now && prev ? prev.dim : Boolean(v.dim_on),
          mono: Boolean(v.mono),
          trim: v.trim ?? 0,
        };
      }),
      currentPreset: contents.current_preset ?? 0,
      mixer: this._state?.mixer || this._initMixer(),
    };

    // Refresh mixer on device_updated
    if (contents.device_updated && !this._lastDeviceUpdated) {
      this._lastDeviceUpdated = true;
      this.requestAllMixers();
      this.requestRouting();
      this.requestMixerLinks();
    } else if (!contents.device_updated) {
      this._lastDeviceUpdated = false;
    }

    if (!prev || this._hasStateChanged(prev, this._state)) {
      this.emit('stateChanged', this._state);
    }
  }

  /**
   * Update mixer bus from get_mixer response
   * @private
   * @param {number} busId
   * @param {Array<{level: number, pan: number, mute: number, solo: number}>} channels
   */
  _updateMixerBus(busId, channels) {
    if (!this.mixer || this.mixerSize !== channels.length) {
      this.mixerSize = channels.length;
      this.mixer = Array(NUM_BUSES)
        .fill(null)
        .map(() =>
          Array(channels.length)
            .fill(null)
            .map(() => ({ level: 90, pan: 32, mute: false, solo: false, link: false }))
        );
    }
    if (busId < 0 || busId >= NUM_BUSES) return;
    for (let i = 0; i < channels.length; i++) {
      this.mixer[busId][i] = {
        level: channels[i].level ?? 90,
        pan: channels[i].pan ?? 32,
        mute: Boolean(channels[i].mute),
        solo: Boolean(channels[i].solo),
        link: this.mixer[busId][i]?.link ?? false,
      };
    }
    // Re-apply link state after mixer refresh
    if (this.mixerLinks.length > 0) {
      this._applyMixerLinks();
    }
    // Sync mixer into normalized state
    if (this._state) {
      this._state.mixer = this.mixer;
      this.emit('stateChanged', this._state);
    }
  }

  /**
   * Update single mixer channel from notification
   * @private
   * @param {number} busId
   * @param {number} chId
   * @param {Record<string, unknown>} kwargs
   */
  _updateMixerChannel(busId, chId, kwargs) {
    if (!this.mixer?.[busId]?.[chId]) return;
    const ch = this.mixer[busId][chId];
    if ('level' in kwargs) ch.level = /** @type {number} */ (kwargs.level);
    if ('pan' in kwargs) ch.pan = /** @type {number} */ (kwargs.pan);
    if ('mute' in kwargs) ch.mute = Boolean(kwargs.mute);
    if ('solo' in kwargs) ch.solo = Boolean(kwargs.solo);

    if (this._state) {
      this._state.mixer = this.mixer;
      this.emit('stateChanged', this._state);
    }
  }

  /**
   * Initialize empty mixer state
   * @private
   * @returns {MixerChannelState[][]}
   */
  _initMixer() {
    return Array(NUM_BUSES)
      .fill(null)
      .map(() =>
        Array(16)
          .fill(null)
          .map(() => ({ level: 90, pan: 32, mute: false, solo: false, link: false }))
      );
  }

  /**
   * Check if state has meaningfully changed
   * @private
   * @param {ZenState} prev
   * @param {ZenState} curr
   * @returns {boolean}
   */
  _hasStateChanged(prev, curr) {
    if (prev.currentPreset !== curr.currentPreset) return true;

    for (let i = 0; i < curr.outputs.length; i++) {
      const po = prev.outputs[i];
      const co = curr.outputs[i];
      if (!po) return true;
      if (
        po.volume !== co.volume ||
        po.mute !== co.mute ||
        po.dim !== co.dim ||
        po.mono !== co.mono
      ) {
        return true;
      }
    }

    return false;
  }

  // ============================================================
  // Init Format
  // ============================================================

  /**
   * @private
   */
  _sendInitFormat() {
    try {
      const formatPath = getReportFormatPath();
      const reportFormat = fs.readFileSync(formatPath, 'utf8');
      const payload = `["initialize_format",[${reportFormat}],{}]`;
      const payloadBuf = Buffer.from(payload, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(4 + payloadBuf.length, 0);
      this.socket?.write(Buffer.concat([header, payloadBuf]));
    } catch {
      // report_format not available, continue without init
    }
  }

  // ============================================================
  // Send Command
  // ============================================================

  /**
   * Send command to server
   * @param {string} command
   * @param {unknown[]} [args]
   * @param {Record<string, unknown>} [kwargs]
   */
  send(command, args = [], kwargs = {}) {
    if (!this.socket || !this._connected) return;
    const buf = encodeCommand(command, args, kwargs);
    this.socket.write(buf);
  }

  // ============================================================
  // Output Controls
  // ============================================================

  /**
   * Mark output volume as optimistically updated
   * @param {number} outputId
   * @param {number} [durationMs=1000]
   */
  lockOutputVolume(outputId, durationMs = 1000) {
    this._outputVolumeLockedUntil[outputId] = Date.now() + durationMs;
  }

  /**
   * Mark output mute as optimistically updated
   * @param {number} outputId
   * @param {number} [durationMs=1000]
   */
  lockOutputMute(outputId, durationMs = 1000) {
    this._outputMuteLockedUntil[outputId] = Date.now() + durationMs;
  }

  /**
   * Mark output dim as optimistically updated
   * @param {number} outputId
   * @param {number} [durationMs=1000]
   */
  lockOutputDim(outputId, durationMs = 1000) {
    this._outputDimLockedUntil[outputId] = Date.now() + durationMs;
  }

  /** @param {number} id @param {number} volume */
  setVolume(id, volume) {
    this.send('set_volume', [id, Math.round(volume)]);
  }
  /** @param {number} id @param {boolean} mute */
  setMute(id, mute) {
    this.send('set_mute', [id, mute ? 1 : 0]);
  }
  /** @param {number} id @param {boolean} dim */
  setDim(id, dim) {
    this.send('set_dim', [id, dim ? 1 : 0]);
  }

  // ============================================================
  // Preamp Controls
  // ============================================================

  /** @param {number} id @param {number} gain */
  setPreGain(id, gain) {
    this.send('set_pre_gain', [id, gain], { sender: 'unique' });
  }
  /** @param {number} id @param {boolean} phantom */
  setPrePhantom(id, phantom) {
    this.send('set_pre_phantom', [id, phantom ? 1 : 0]);
  }
  /** @param {number} id @param {boolean} phase */
  setPrePhase(id, phase) {
    this.send('set_pre_phase_inv', [id, phase ? 1 : 0]);
  }
  /** @param {number} id @param {number} type */
  setPreType(id, type) {
    this.send('set_pre_type', [id, type]);
  }

  // ============================================================
  // Mixer Controls
  // ============================================================

  /**
   * Check if mixer channel is in valid range (excludes system ch 0 and overflow)
   * @param {number} busId
   * @param {number} chId
   * @returns {boolean}
   */
  isValidMixerChannel(busId, chId) {
    return busId >= 0 && busId < NUM_BUSES && chId >= 1 && chId < this.mixerSize;
  }

  /**
   * Get full mixer channel params for command
   * Protocol requires ALL params: sender, level, pan, mute, solo
   * @param {number} busId
   * @param {number} chId
   * @returns {{sender: number, level: number, pan: number, mute: number, solo: number}|null}
   */
  getMixerChannelParams(busId, chId) {
    if (!this.isValidMixerChannel(busId, chId)) return null;
    const ch = this.mixer?.[busId]?.[chId];
    if (!ch) return null;
    return {
      sender: chId,
      level: ch.level,
      pan: ch.pan,
      mute: ch.mute ? 1 : 0,
      solo: ch.solo ? 1 : 0,
    };
  }

  /** @param {number} busId @param {number} ch @param {number} level */
  setMixerFader(busId, ch, level) {
    const params = this.getMixerChannelParams(busId, ch);
    if (!params) return;
    params.level = Math.round(level);
    this.send('set_mixer', [busId, ch], params);
  }

  /** @param {number} busId @param {number} ch @param {number} pan */
  setMixerPan(busId, ch, pan) {
    const params = this.getMixerChannelParams(busId, ch);
    if (!params) return;
    params.pan = pan;
    this.send('set_mixer', [busId, ch], params);
  }

  /** @param {number} busId @param {number} ch @param {boolean} mute */
  setMixerMute(busId, ch, mute) {
    const params = this.getMixerChannelParams(busId, ch);
    if (!params) return;
    params.mute = mute ? 1 : 0;
    this.send('set_mixer', [busId, ch], params);
  }

  /** @param {number} busId @param {number} ch @param {boolean} solo */
  setMixerSolo(busId, ch, solo) {
    const params = this.getMixerChannelParams(busId, ch);
    if (!params) return;
    params.solo = solo ? 1 : 0;
    this.send('set_mixer', [busId, ch], params);
  }

  /** @param {number} busId */
  requestMixer(busId) {
    this.send('get_mixer', [], { ext3: busId });
  }

  requestAllMixers() {
    for (let i = 0; i < NUM_BUSES; i++) {
      this.requestMixer(i);
    }
  }

  requestRouting() {
    this.send('get_routing', [], { ext3: AFX_INPUT_BANK });
    for (let i = 0; i < NUM_BUSES; i++) {
      this.send('get_routing', [], { ext3: MIXER_ROUTING_BANK_BASE + i });
    }
  }

  requestAllRouting() {
    for (let i = 0; i <= 12; i++) {
      this.send('get_routing', [], { ext3: i });
    }
  }

  requestMixerLinks() {
    this.send('get_mixer_links', []);
  }

  /**
   * Apply mixer link state from raw array to mixer channels.
   * Layout hypothesis: 16 entries per bus section.
   * Entry p in bus b → channels (2*p+1, 2*p+2) are linked.
   * @private
   */
  _applyMixerLinks() {
    if (!this.mixer) return;

    // Reset all link flags first
    for (let b = 0; b < NUM_BUSES; b++) {
      for (let ch = 0; ch < this.mixer[b].length; ch++) {
        this.mixer[b][ch].link = false;
      }
    }

    // Apply link flags: entry i in flat array
    // Hypothesis: 16 entries per bus, entry p → pair (2p+1, 2p+2)
    const entriesPerBus = 16;
    for (let b = 0; b < NUM_BUSES; b++) {
      for (let p = 0; p < entriesPerBus; p++) {
        const idx = b * entriesPerBus + p;
        if (idx >= this.mixerLinks.length) break;
        if (this.mixerLinks[idx]?.linked) {
          const ch1 = 2 * p + 1;
          const ch2 = 2 * p + 2;
          if (ch1 < this.mixer[b].length) this.mixer[b][ch1].link = true;
          if (ch2 < this.mixer[b].length) this.mixer[b][ch2].link = true;
        }
      }
    }
  }

  /**
   * Get linked partner channel for a given mixer channel
   * @param {number} busId - Bus ID
   * @param {number} channel - Channel ID
   * @returns {number|null} Partner channel ID or null if not linked
   */
  getLinkedPartner(busId, channel) {
    if (!this.mixer?.[busId]?.[channel]?.link) return null;

    // Linked channels come in pairs: odd+even (1+2, 3+4, 5+6...)
    if (channel % 2 === 1) {
      // Odd channel → partner is next (even)
      const partner = channel + 1;
      if (this.mixer[busId][partner]?.link) return partner;
    } else {
      // Even channel → partner is previous (odd)
      const partner = channel - 1;
      if (partner >= 1 && this.mixer[busId][partner]?.link) return partner;
    }
    return null;
  }

  /** @param {number} periphId @param {number} channelId @param {boolean} linked */
  setStereoLink(periphId, channelId, linked) {
    this.send('set_stereo_link', [periphId, channelId, linked ? 1 : 0]);
  }

  // ============================================================
  // AFX Controls
  // ============================================================

  /** @param {number} periphType @param {number} periphId @param {number} enabled */
  setAfxBypass(periphType, periphId, enabled) {
    this.send('set_afx_bypass', [periphType, periphId, enabled]);
  }

  // ============================================================
  // Global Controls
  // ============================================================

  /** @param {number} srcIndex */
  setClockSource(srcIndex) {
    this.send('set_sync_source', [srcIndex]);
  }
  /** @param {number} rateIndex */
  setSampleRate(rateIndex) {
    this.send('set_samp_rate', [rateIndex]);
  }
  /** @param {number} presetIdx */
  presetSave(presetIdx) {
    this.send('preset_save', [presetIdx]);
  }
  /** @param {number} presetIdx */
  presetRecall(presetIdx) {
    this.send('preset_recall', [presetIdx]);
  }

  // ============================================================
  // Channel Name Resolution
  // ============================================================

  /**
   * Get persistence channel names (cached 30s)
   * @private
   * @returns {Record<number, Record<number, string>>}
   */
  _getPersistenceNames() {
    const now = Date.now();
    if (this._persistenceNames && now - this._persistenceNamesTime < 30000) {
      return this._persistenceNames;
    }
    this._persistenceNames = loadChannelNamesFromFile();
    this._persistenceNamesTime = now;
    return this._persistenceNames;
  }

  /**
   * Get display name for a mixer channel source
   * @param {number} busId
   * @param {number} chId - Channel ID (0-based)
   * @returns {string}
   */
  getChannelSourceName(busId, chId) {
    const bank = MIXER_ROUTING_BANK_BASE + busId;
    // Routing entries map to mixer channels 1+: routing[0] → mixer ch 1
    // Channel 0 is system (no routing entry)
    let r = chId > 0 ? this.routing[bank]?.[chId - 1] : undefined;
    if (!r) return `Ch ${chId}`;

    // Trace through AFX
    if (r.periph === AFX_PERIPH) {
      const afxInput = this.routing[AFX_INPUT_BANK]?.[r.ch];
      if (afxInput) r = afxInput;
    }

    const names = this._getPersistenceNames();
    const name = PERIPH_NAMES[r.periph] ?? `P${r.periph}`;
    const chNum = r.ch + 1;
    const custom = names[r.periph]?.[r.ch];
    if (custom && custom !== String(chNum)) {
      return `${name} ${chNum} (${custom})`;
    }
    return `${name} ${chNum}`;
  }

  /**
   * Get display names for all mixer channels (bus 0 as reference)
   * @returns {string[]}
   */
  getChannelNames() {
    if (!this.mixer) return [];
    const result = [];
    for (let i = 0; i < this.mixerSize; i++) {
      result.push(this.getChannelSourceName(0, i));
    }
    return result;
  }

  // ============================================================
  // Data Ready (for CLI)
  // ============================================================

  waitForData() {
    if (this._dataReady) return Promise.resolve();
    return new Promise((resolve) => {
      this._dataResolve = resolve;
    });
  }

  /** @private */
  _checkDataReady() {
    if (this._dataReady) return;
    const hasMixer = this.mixer !== null;
    const hasRouting = Object.keys(this.routing).length >= NUM_BUSES + 1;
    if (hasMixer && hasRouting) {
      this._dataReady = true;
      if (this._dataResolve) this._dataResolve();
    }
  }

  /** @param {number} count */
  waitForRouting(count) {
    return /** @type {Promise<void>} */ (
      new Promise((resolve) => {
        if (Object.keys(this.routing).length >= count) return resolve();
        this._routingResolve = resolve;
        this._routingTarget = count;
      })
    );
  }

  /** @private */
  _checkRoutingReady() {
    if (this._routingResolve && Object.keys(this.routing).length >= this._routingTarget) {
      this._routingResolve();
    }
  }

  /**
   * Close connection (alias for CLI compatibility)
   */
  close() {
    this.disconnect();
  }
}

// Export for use as module
module.exports = { AntelopeClient, discoverPort };
