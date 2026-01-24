/**
 * Shared state management for Sprut.Hub Plugin
 * @module lib/state
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * Generic device state that encompasses all possible device state properties.
 * Each action module uses this base type with all properties optional.
 * The action module is responsible for setting and reading the correct properties.
 *
 * @typedef {Object} DeviceState
 * @property {boolean} [on] - Whether device is on (Light, Switch, Outlet)
 * @property {number} [brightness] - Brightness level 0-100 (Light)
 * @property {boolean} [locked] - Whether lock is locked (Lock)
 * @property {number} [position] - Current position 0-100 (Cover)
 * @property {number} [targetPosition] - Target position 0-100 (Cover)
 * @property {number} [currentTemp] - Current temperature (Thermostat)
 * @property {number} [targetTemp] - Target temperature (Thermostat)
 * @property {number} [currentMode] - Current heating/cooling mode (Thermostat)
 * @property {number} [targetMode] - Target heating/cooling mode (Thermostat)
 * @property {number|boolean} [value] - Sensor value (Sensor)
 * @property {string} [sensorType] - Type of sensor (Sensor)
 * @property {boolean} [ready] - Whether button is ready (Button)
 * @property {boolean} [pressed] - Temporary pressed state for feedback (Button)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline/unreachable
 */

/**
 * Alias for backward compatibility with light action
 * @typedef {DeviceState} LightState
 */

/**
 * @typedef {Object} ContextData
 * @property {Record<string, unknown>} [settings] - Action settings
 * @property {string} [action] - Action UUID
 * @property {DeviceState} [state] - Current device state
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
 * Get context data
 * @param {string} context - Context ID
 * @returns {ContextData|undefined}
 */
function getContext(context) {
  return contexts[context];
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

// ============================================================
// Exports
// ============================================================

module.exports = {
  contexts,
  setContext,
  getContext,
  deleteContext,
  stopTimer,
  getCurrentPI,
  setCurrentPI,
  clearCurrentPI,
};
