/**
 * Shared state management for Sprut.Hub Plugin
 * @module lib/state
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} LightState
 * @property {boolean} on - Whether light is on
 * @property {number} [brightness] - Brightness level (0-100)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 */

/**
 * @typedef {Object} ContextData
 * @property {Record<string, unknown>} [settings] - Action settings
 * @property {string} [action] - Action UUID
 * @property {LightState} [state] - Current light state
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
