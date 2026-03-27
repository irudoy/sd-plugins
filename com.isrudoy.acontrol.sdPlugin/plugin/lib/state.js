/**
 * Shared state management for A Control Plugin
 * @module lib/state
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} SpeakerState
 * @property {boolean} muted - Whether speakers are muted
 * @property {number} level - Volume level in dB (-40 to +12)
 * @property {number} voicing - Voicing mode (0=Pure, 1=UNR, 2=Ext)
 * @property {number} input - Input source (0=RCA, 1=XLR)
 * @property {boolean} sleeping - Whether speakers are sleeping
 * @property {boolean} [error] - Whether there's a connection error
 * @property {boolean} [connecting] - Whether connecting to speakers
 */

/**
 * @typedef {Object} ContextData
 * @property {Record<string, unknown>} [settings] - Action settings
 * @property {string} [action] - Action UUID
 * @property {SpeakerState} [state] - Current speaker state
 * @property {'Keypad' | 'Knob'} [controller] - Controller type (Keypad or Knob)
 */

// ============================================================
// Global State
// ============================================================

/** @type {Record<string, ContextData>} */
const contexts = {};

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const dialDebounceTimers = {};

/** @type {Record<string, number>} */
const pendingDialTicks = {};

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
 * Add dial ticks to pending and schedule debounced callback
 * @param {string} context - Context ID
 * @param {number} ticks - Number of ticks to add
 * @param {(totalTicks: number) => void} callback - Callback with accumulated ticks
 * @param {number} [delay=150] - Debounce delay in ms
 * @returns {void}
 */
function addDialTicks(context, ticks, callback, delay = 150) {
  // Accumulate ticks
  pendingDialTicks[context] = (pendingDialTicks[context] || 0) + ticks;

  // Clear existing timer
  if (dialDebounceTimers[context]) {
    clearTimeout(dialDebounceTimers[context]);
  }

  // Set new debounce timer
  dialDebounceTimers[context] = setTimeout(() => {
    const totalTicks = pendingDialTicks[context] || 0;
    delete pendingDialTicks[context];
    delete dialDebounceTimers[context];

    if (totalTicks !== 0) {
      callback(totalTicks);
    }
  }, delay);
}

/**
 * Clear dial debounce for context
 * @param {string} context - Context ID
 * @returns {void}
 */
function clearDialDebounce(context) {
  if (dialDebounceTimers[context]) {
    clearTimeout(dialDebounceTimers[context]);
    delete dialDebounceTimers[context];
  }
  delete pendingDialTicks[context];
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
  addDialTicks,
  clearDialDebounce,
};
