/**
 * Antelope Manager - Singleton
 *
 * Manages connection to Antelope Manager Server, state cache,
 * and provides optimistic updates for responsive UI.
 *
 * @module lib/antelope-manager
 */

const { EventEmitter } = require('events');
const { AntelopeClient } = require('../../antelope/antelope');
const { log } = require('./common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../antelope/antelope').ZenState} ZenState
 * @typedef {import('../../antelope/antelope').OutputState} OutputState
 * @typedef {import('../../antelope/antelope').MixerChannelState} MixerChannelState
 */

// ============================================================
// Manager Class
// ============================================================

class AntelopeManager extends EventEmitter {
  constructor() {
    super();

    /** @type {AntelopeClient|null} */
    this.client = null;

    /** @type {number} */
    this.refCount = 0;
  }

  /**
   * Add reference (connects on first call)
   */
  addRef() {
    this.refCount++;
    log('[AntelopeManager] addRef:', this.refCount);

    if (this.refCount === 1) {
      this.connect();
    }
  }

  /**
   * Remove reference
   */
  removeRef() {
    this.refCount--;
    if (this.refCount < 0) this.refCount = 0;
    log('[AntelopeManager] removeRef:', this.refCount);
  }

  /**
   * Connect to Antelope Manager Server
   * @private
   */
  async connect() {
    if (this.client?.isConnected()) return;

    this.client = new AntelopeClient();

    this.client.on('connected', () => {
      log('[AntelopeManager] Connected');
      this.emit('connected');
    });

    this.client.on('disconnected', () => {
      log('[AntelopeManager] Disconnected');
      this.emit('disconnected');
    });

    this.client.on('stateChanged', (state) => {
      this.emit('stateChanged', state);
    });

    this.client.on('error', (err) => {
      log('[AntelopeManager] Error:', err.message);
      this.emit('error', err);
    });

    try {
      await this.client.connect();
    } catch (err) {
      log('[AntelopeManager] Connection failed:', /** @type {Error} */ (err).message);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.client?.isConnected() ?? false;
  }

  /**
   * Get current state
   * @returns {ZenState|null}
   */
  getState() {
    return this.client?.getState() ?? null;
  }

  // ============================================================
  // Output Methods
  // ============================================================

  /**
   * Set output volume
   * @param {number} outputId - Output ID 0-5
   * @param {number} volume - Volume 0-255
   */
  setVolume(outputId, volume) {
    this.client?.setVolume(outputId, volume);
  }

  /**
   * Adjust volume optimistically (immediate state update)
   * @param {number} outputId - Output ID 0-5
   * @param {number} delta - Volume change
   * @returns {number} New volume
   */
  adjustVolumeOptimistic(outputId, delta) {
    const state = this.getState();
    if (!state?.outputs?.[outputId]) return 0;

    const output = state.outputs[outputId];
    // Volume is attenuation: 0 = 0dB (loud), 96 = -inf (silent)
    // Positive delta (clockwise) should decrease attenuation (louder)
    const newVolume = Math.max(0, Math.min(96, output.volume - Math.round(delta)));
    output.volume = newVolume;

    this.client?.lockOutputVolume(outputId);
    this.client?.setVolume(outputId, newVolume);
    this.emit('stateChanged', state);
    return newVolume;
  }

  /**
   * Toggle mute for output
   * @param {number} outputId - Output ID 0-5
   */
  toggleMute(outputId) {
    const state = this.getState();
    const output = state?.outputs?.[outputId];
    if (!output) return;

    const newMute = !output.mute;
    output.mute = newMute;
    this.client?.lockOutputMute(outputId);
    this.client?.setMute(outputId, newMute);
    this.emit('stateChanged', state);
  }

  /**
   * Toggle DIM for output
   * @param {number} outputId - Output ID 0-5
   */
  toggleDim(outputId) {
    const state = this.getState();
    const output = state?.outputs?.[outputId];
    if (!output) return;

    const newDim = !output.dim;
    output.dim = newDim;
    this.client?.lockOutputDim(outputId);
    this.client?.setDim(outputId, newDim);
    this.emit('stateChanged', state);
  }

  // ============================================================
  // Mixer Methods
  // ============================================================

  /**
   * Get linked partner channel for a mixer channel
   * @private
   * @param {number} busId - Bus ID
   * @param {number} channel - Channel ID
   * @returns {number|null} Partner channel or null
   */
  _getLinkedPartner(busId, channel) {
    return this.client?.getLinkedPartner(busId, channel) ?? null;
  }

  /**
   * Set mixer channel fader
   * @param {number} busId - Bus ID 0-3
   * @param {number} channel - Channel 0-31
   * @param {number} level - Level 0-90
   */
  setMixerFader(busId, channel, level) {
    this.client?.setMixerFader(busId, channel, level);
  }

  /**
   * Adjust fader optimistically (immediate state update)
   * Level: 0 = 0dB (unity), 60 = -60dB, 90 = -inf
   * Positive delta (clockwise) should decrease level (louder)
   * @param {number} busId - Bus ID 0-2
   * @param {number} channel - Channel 0-15
   * @param {number} delta - Dial ticks (positive = clockwise = louder)
   * @returns {number} New level value
   */
  adjustFaderOptimistic(busId, channel, delta) {
    const state = this.getState();
    const ch = state?.mixer?.[busId]?.[channel];
    if (!ch) return 60;

    const newLevel = Math.max(0, Math.min(60, ch.level - Math.round(delta)));
    ch.level = newLevel;

    this.client?.setMixerFader(busId, channel, newLevel);

    // Update linked partner
    const partner = this._getLinkedPartner(busId, channel);
    if (partner !== null) {
      const partnerCh = state?.mixer?.[busId]?.[partner];
      if (partnerCh) {
        partnerCh.level = newLevel;
        this.client?.setMixerFader(busId, partner, newLevel);
      }
    }

    this.emit('stateChanged', state);
    return newLevel;
  }

  /**
   * Toggle mute for mixer channel
   * @param {number} busId - Bus ID 0-3
   * @param {number} channel - Channel 0-31
   */
  toggleMixerMute(busId, channel) {
    const state = this.getState();
    const ch = state?.mixer?.[busId]?.[channel];
    if (!ch) return;

    const newMute = !ch.mute;
    ch.mute = newMute;
    this.client?.setMixerMute(busId, channel, newMute);

    // Update linked partner
    const partner = this._getLinkedPartner(busId, channel);
    if (partner !== null) {
      const partnerCh = state?.mixer?.[busId]?.[partner];
      if (partnerCh) {
        partnerCh.mute = newMute;
        this.client?.setMixerMute(busId, partner, newMute);
      }
    }

    this.emit('stateChanged', state);
  }

  /**
   * Toggle solo for mixer channel
   * @param {number} busId - Bus ID 0-3
   * @param {number} channel - Channel 0-31
   */
  toggleMixerSolo(busId, channel) {
    const state = this.getState();
    const ch = state?.mixer?.[busId]?.[channel];
    if (!ch) return;

    const newSolo = !ch.solo;
    ch.solo = newSolo;
    this.client?.setMixerSolo(busId, channel, newSolo);

    // Update linked partner
    const partner = this._getLinkedPartner(busId, channel);
    if (partner !== null) {
      const partnerCh = state?.mixer?.[busId]?.[partner];
      if (partnerCh) {
        partnerCh.solo = newSolo;
        this.client?.setMixerSolo(busId, partner, newSolo);
      }
    }

    this.emit('stateChanged', state);
  }

  // ============================================================
  // Display Names
  // ============================================================

  /**
   * Get mixer channel display names
   * @returns {string[]} Array of channel names
   */
  getChannelNames() {
    return this.client?.getChannelNames() ?? [];
  }
}

// ============================================================
// Singleton Instance
// ============================================================

const antelopeManager = new AntelopeManager();

// Prevent crashes from unhandled 'error' events
antelopeManager.on('error', (err) => {
  log('[AntelopeManager] Unhandled error (suppressed):', err.message);
});

// ============================================================
// Exports
// ============================================================

module.exports = { AntelopeManager, antelopeManager };
