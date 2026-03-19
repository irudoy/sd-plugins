/**
 * Shared state management for Antelope Control Plugin
 * @module lib/state
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} ContextData
 * @property {Record<string, unknown>} [settings] - Action settings
 * @property {string} [action] - Action UUID
 * @property {'Keypad' | 'Knob'} [controller] - Controller type
 */

// ============================================================
// Global State
// ============================================================

/** @type {Record<string, ContextData>} */
const contexts = {};

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
 */
function deleteContext(context) {
  delete contexts[context];
}

/**
 * Get all contexts
 * @returns {Record<string, ContextData>}
 */
function getAllContexts() {
  return contexts;
}

/**
 * Get current Property Inspector state
 * @returns {{action: string|null, context: string|null}}
 */
function getCurrentPI() {
  return { action: currentPIAction, context: currentPIContext };
}

/**
 * Set current Property Inspector state
 * @param {string} action - Action UUID
 * @param {string} context - Context ID
 */
function setCurrentPI(action, context) {
  currentPIAction = action;
  currentPIContext = context;
}

/**
 * Clear current Property Inspector if it matches context
 * @param {string} context - Context ID to match
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
  getAllContexts,
  getCurrentPI,
  setCurrentPI,
  clearCurrentPI,
};
