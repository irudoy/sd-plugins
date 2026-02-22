/**
 * Shared state management for Win Tools Plugin
 * @module lib/state
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} ContextData
 * @property {Record<string, unknown>} [settings] - Action settings
 * @property {string} [action] - Action UUID
 */

/**
 * @typedef {Object} CachedDevice
 * @property {string} name - Device name
 * @property {number|null} battery - Last known battery level
 * @property {boolean} [isCharging] - Whether device was charging
 * @property {boolean} [connected] - Whether device is connected
 * @property {number} [lastSeen] - Timestamp of last update
 * @property {boolean} [isWired] - Whether device is wired (Razer devices)
 */

/**
 * @typedef {Object} DeviceCache
 * @property {CachedDevice[]} razer - Cached Razer devices
 */

/**
 * @typedef {Object} CurrentPI
 * @property {string|null} action - Current PI action UUID
 * @property {string|null} context - Current PI context
 */

// ============================================================
// Global State
// ============================================================

/** @type {Record<string, ContextData>} */
const contexts = {};

/** @type {Record<string, ReturnType<typeof setInterval>>} */
const timers = {};

/** @type {string|null} */
let currentPIAction = null;

/** @type {string|null} */
let currentPIContext = null;

/** @type {DeviceCache} */
const deviceCache = {
  razer: [],
};

// ============================================================
// State Management Functions
// ============================================================

/**
 * Set context data
 * @param {string} context - Context ID
 * @param {ContextData} data - Context data
 * @returns {void}
 */
function setContext(context, data) {
  contexts[context] = data;
}

/**
 * Delete context data
 * @param {string} context - Context ID
 * @returns {void}
 */
function deleteContext(context) {
  delete contexts[context];
}

/**
 * Set timer for context
 * @param {string} context - Context ID
 * @param {ReturnType<typeof setInterval>} timer - Timer ID
 * @returns {void}
 */
function setTimer(context, timer) {
  timers[context] = timer;
}

/**
 * Stop and remove timer for context
 * @param {string} context - Context ID
 * @returns {void}
 */
function stopTimer(context) {
  if (timers[context]) {
    clearInterval(timers[context]);
    delete timers[context];
  }
}

/**
 * Get current Property Inspector state
 * @returns {CurrentPI}
 */
function getCurrentPI() {
  return { action: currentPIAction, context: currentPIContext };
}

/**
 * Set current Property Inspector state
 * @param {string} action - Action UUID
 * @param {string} context - Context ID
 * @returns {void}
 */
function setCurrentPI(action, context) {
  currentPIAction = action;
  currentPIContext = context;
}

/**
 * Clear current Property Inspector if it matches context
 * @param {string} context - Context ID to match
 * @returns {void}
 */
function clearCurrentPI(context) {
  if (currentPIContext === context) {
    currentPIContext = null;
    currentPIAction = null;
  }
}

/**
 * Get cached devices by type
 * @param {'razer'} type - Device type
 * @returns {CachedDevice[]}
 */
function getDeviceCache(type) {
  return deviceCache[type] || [];
}

/**
 * Set cached devices for type
 * @param {'razer'} type - Device type
 * @param {CachedDevice[]} devices - Devices to cache
 * @returns {void}
 */
function setDeviceCache(type, devices) {
  deviceCache[type] = devices;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  contexts,
  timers,
  setContext,
  deleteContext,
  setTimer,
  stopTimer,
  getCurrentPI,
  setCurrentPI,
  clearCurrentPI,
  getDeviceCache,
  setDeviceCache,
};
