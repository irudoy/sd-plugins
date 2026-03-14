/**
 * Speaker Manager
 *
 * Manages all discovered Adam Audio speakers.
 * Broadcasts commands to all speakers simultaneously.
 * Reads state from any speaker (they are physically synchronized).
 */

const { EventEmitter } = require('events');
const { AdamAudioClient } = require('./adam-audio');
const { discoverSpeakers } = require('./mdns-discovery');
const { log } = require('./common');

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000]; // Exponential backoff

/**
 * @typedef {import('./adam-audio').SpeakerState} SpeakerState
 * @typedef {import('./mdns-discovery').Speaker} Speaker
 */

/**
 * Speaker Manager - broadcasts commands to all speakers
 * @extends EventEmitter
 */
class SpeakerManager extends EventEmitter {
  constructor() {
    super();

    /** @type {Map<string, AdamAudioClient>} */
    this.clients = new Map();

    /** @type {Speaker[]} */
    this.speakers = [];

    /** @type {SpeakerState | null} */
    this.state = null;

    this.discovering = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    /** @type {number} */
    this.refCount = 0;

    // DIM state (shared across all speakers)
    this.dimmed = false;
    this.dimSavedLevel = 0;
  }

  /**
   * Add reference (starts discovery on first call, stays connected forever)
   */
  addRef() {
    this.refCount++;
    log(`[SpeakerManager] addRef: refCount=${this.refCount}`);
    if (this.refCount === 1 && !this.isConnected()) {
      this.startDiscovery();
    }
  }

  /**
   * Remove reference (no-op, we stay connected)
   */
  removeRef() {
    this.refCount--;
    log(`[SpeakerManager] removeRef: refCount=${this.refCount}`);
    if (this.refCount < 0) {
      this.refCount = 0;
    }
    // Don't disconnect - stay connected while plugin is running
  }

  /**
   * Start speaker discovery — try cached IPs first, fall back to mDNS
   * @returns {Promise<Speaker[]>}
   */
  async startDiscovery() {
    if (this.discovering) {
      return this.speakers;
    }

    this.discovering = true;

    try {
      // Try cached speakers first (skip mDNS on reconnect)
      if (this.speakers.length > 0) {
        log('Reconnecting to cached speakers...');
        await this.connectAll();
        if (this.clients.size > 0) {
          this.reconnectAttempts = 0;
          this.emit('discovered', this.speakers);
          return this.speakers;
        }
        log('Cached speakers unreachable, falling back to mDNS');
      }

      log('Starting mDNS discovery...');
      this.speakers = await discoverSpeakers();
      log(`Discovered ${this.speakers.length} speaker(s)`);

      if (this.speakers.length > 0) {
        await this.connectAll();
        this.reconnectAttempts = 0;
      } else {
        this.scheduleReconnect();
      }

      this.emit('discovered', this.speakers);
      return this.speakers;
    } catch (err) {
      log(`Discovery error: ${err.message}`);
      this.scheduleReconnect();
      return [];
    } finally {
      this.discovering = false;
    }
  }

  /**
   * Schedule reconnection attempt
   * @private
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempts++;

    log(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.refCount > 0) {
        this.startDiscovery();
      }
    }, delay);
  }

  /**
   * Connect to all discovered speakers
   * @returns {Promise<void>}
   */
  async connectAll() {
    const connectPromises = this.speakers.map(async (speaker) => {
      if (this.clients.has(speaker.name)) {
        return; // Already connected
      }

      const client = new AdamAudioClient(speaker.ip);

      client.on('error', (err) => {
        log(`Speaker ${speaker.name} error: ${err.message}`);
      });

      client.on('disconnected', () => {
        log(`Speaker ${speaker.name} disconnected`);
        this.clients.delete(speaker.name);

        // Schedule reconnect if we have refs
        if (this.refCount > 0 && this.clients.size === 0) {
          this.scheduleReconnect();
        }
      });

      try {
        await client.connect();
        this.clients.set(speaker.name, client);
        log(`Connected to ${speaker.name} (${speaker.ip})`);
      } catch (err) {
        log(`Failed to connect to ${speaker.name}: ${err.message}`);
      }
    });

    await Promise.all(connectPromises);

    // Fetch initial state from first connected speaker
    if (this.clients.size > 0) {
      // Initialize default state so UI shows "connected"
      log('[SpeakerManager] connectAll: setting default state');
      this.state = {
        muted: false,
        level: 0,
        voicing: 0,
        input: 0,
        sleeping: false,
        dimmed: false,
        dimSavedLevel: 0,
      };
      this.emit('connected');

      // Try to fetch actual state (don't block on it)
      log('[SpeakerManager] connectAll: fetching actual state');
      this.fetchState().catch((err) => {
        log(`Initial fetchState failed: ${err.message}`);
      });
    }
  }

  /**
   * Disconnect all speakers
   */
  disconnectAll() {
    log('[SpeakerManager] disconnectAll called');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const client of this.clients.values()) {
      client.disconnect();
    }
    this.clients.clear();
    this.speakers = [];
    this.state = null;

    this.emit('disconnected');
  }

  /**
   * Check if any speaker is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.clients.size > 0;
  }

  /**
   * Get list of connected speaker names
   * @returns {string[]}
   */
  getSpeakerNames() {
    return this.speakers.map((s) => s.name);
  }

  /**
   * Get first connected client (for reading state)
   * @returns {AdamAudioClient | null}
   * @private
   */
  getFirstClient() {
    const firstEntry = this.clients.values().next();
    return firstEntry.done ? null : firstEntry.value;
  }

  /**
   * Broadcast command to all speakers
   * @param {string} method - Method name to call
   * @param {...unknown} args - Method arguments
   * @returns {Promise<unknown>} Result from first speaker
   * @private
   */
  async broadcast(method, ...args) {
    if (this.clients.size === 0) {
      throw new Error('No speakers connected');
    }

    const promises = [];
    let firstResult = null;

    for (const client of this.clients.values()) {
      // Cast to Record to allow dynamic method access
      const clientAsRecord = /** @type {Record<string, Function>} */ (
        /** @type {unknown} */ (client)
      );
      const promise = clientAsRecord[method](...args);
      promises.push(
        promise.catch((/** @type {Error} */ err) => {
          log(`Broadcast ${method} error: ${err.message}`);
          return null;
        })
      );
    }

    const results = await Promise.all(promises);

    // Return first successful result
    for (const result of results) {
      if (result !== null) {
        firstResult = result;
        break;
      }
    }

    return firstResult;
  }

  // ==================== State Methods ====================

  /**
   * Fetch state from first connected speaker
   * @returns {Promise<SpeakerState | null>}
   */
  async fetchState() {
    const client = this.getFirstClient();
    if (!client) {
      return null;
    }

    try {
      this.state = await client.fetchState();
      // Add DIM state
      this.state.dimmed = this.dimmed;
      this.emit('stateChanged', this.state);
      return this.state;
    } catch (err) {
      log(`fetchState error: ${err.message}`);
      return null;
    }
  }

  /**
   * Get cached state
   * @returns {SpeakerState | null}
   */
  getState() {
    return this.state;
  }

  // ==================== Control Methods ====================

  /**
   * Toggle mute on all speakers
   * @returns {Promise<boolean>} New mute state
   */
  async toggleMute() {
    // Use cached state to determine new value, then set explicitly
    // This ensures all speakers get the same value even if they were out of sync
    const newMuted = !(this.state?.muted ?? false);
    await this.setMute(newMuted);
    return newMuted;
  }

  /**
   * Set mute on all speakers
   * @param {boolean} muted
   * @returns {Promise<void>}
   */
  async setMute(muted) {
    await this.broadcast('setMute', muted);
    if (this.state) {
      this.state.muted = muted;
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Set level on all speakers
   * @param {number} level
   * @returns {Promise<void>}
   */
  async setLevel(level) {
    await this.broadcast('setLevel', level);
    if (this.state) {
      this.state.level = level;
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Adjust level optimistically (update state immediately, no API call)
   * @param {number} delta
   * @returns {number} New level
   */
  adjustLevelOptimistic(delta) {
    if (!this.state) {
      return 0;
    }
    // Clamp to valid range: -40 to +32 (-20dB to +16dB)
    const newLevel = Math.max(-40, Math.min(32, this.state.level + Math.round(delta)));
    this.state.level = newLevel;
    this.emit('stateChanged', this.state);
    return newLevel;
  }

  /**
   * Adjust level on all speakers
   * @param {number} delta
   * @returns {Promise<number>} New level
   */
  async adjustLevel(delta) {
    // Calculate new value from cached state, then set explicitly
    // This ensures all speakers get the same value even if they were out of sync
    const currentLevel = this.state?.level ?? 0;
    const newLevel = Math.max(-40, Math.min(32, currentLevel + Math.round(delta)));
    await this.setLevel(newLevel);
    return newLevel;
  }

  /**
   * Set voicing on all speakers
   * @param {number} voicing - 0=Pure, 1=UNR, 2=Ext
   * @returns {Promise<void>}
   */
  async setVoicing(voicing) {
    await this.broadcast('setVoicing', voicing);
    if (this.state) {
      this.state.voicing = voicing;
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Cycle voicing on all speakers
   * @returns {Promise<number>} New voicing
   */
  async cycleVoicing() {
    // Calculate new value from cached state, then set explicitly
    // This ensures all speakers get the same value even if they were out of sync
    const currentVoicing = this.state?.voicing ?? 0;
    const newVoicing = (currentVoicing + 1) % 3;
    await this.setVoicing(newVoicing);
    return newVoicing;
  }

  /**
   * Set input on all speakers
   * @param {number} input - 0=RCA, 1=XLR
   * @returns {Promise<void>}
   */
  async setInput(input) {
    await this.broadcast('setInput', input);
    if (this.state) {
      this.state.input = input;
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Cycle input on all speakers
   * @returns {Promise<number>} New input
   */
  async cycleInput() {
    // Calculate new value from cached state, then set explicitly
    // This ensures all speakers get the same value even if they were out of sync
    const currentInput = this.state?.input ?? 0;
    const newInput = currentInput === 0 ? 1 : 0;
    await this.setInput(newInput);
    return newInput;
  }

  /**
   * Set sleep on all speakers
   * @param {boolean} sleeping
   * @returns {Promise<void>}
   */
  async setSleep(sleeping) {
    await this.broadcast('setSleep', sleeping);
    if (this.state) {
      this.state.sleeping = sleeping;
      this.emit('stateChanged', this.state);
    }
  }

  /**
   * Toggle sleep on all speakers
   * @returns {Promise<boolean>} New sleep state
   */
  async toggleSleep() {
    // Calculate new value from cached state, then set explicitly
    // This ensures all speakers get the same value even if they were out of sync
    const newSleeping = !(this.state?.sleeping ?? false);
    await this.setSleep(newSleeping);
    return newSleeping;
  }

  /**
   * Toggle DIM on all speakers (software implementation)
   * @param {number} [dimAmount=-40] - Amount to reduce in level units (each unit = 0.5dB, so -40 = -20dB)
   * @returns {Promise<boolean>} New dimmed state
   */
  async toggleDim(dimAmount = -40) {
    // Fetch current level first
    await this.fetchState();

    if (this.dimmed) {
      // Restore saved level
      await this.setLevel(this.dimSavedLevel);
      this.dimmed = false;
      if (this.state) {
        this.state.dimmed = false;
      }
    } else {
      // Save current level and dim
      this.dimSavedLevel = this.state?.level ?? 0;
      // Clamp to minimum -40 (-20dB)
      const dimLevel = Math.max(-40, this.dimSavedLevel + dimAmount);
      await this.setLevel(dimLevel);
      this.dimmed = true;
      if (this.state) {
        this.state.dimmed = true;
      }
    }

    this.emit('stateChanged', this.state);
    return this.dimmed;
  }

  /**
   * Blink LED on all speakers
   * @returns {Promise<void>}
   */
  async blinkLED() {
    await this.broadcast('blinkLED');
  }
}

// Singleton instance
const speakerManager = new SpeakerManager();

module.exports = { SpeakerManager, speakerManager };
