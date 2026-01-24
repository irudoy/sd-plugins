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

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const dialDebounceTimers = {};

/** @type {Record<string, number>} */
const pendingDialTicks = {};

/** @type {Record<string, number>} */
const lastUpdateTimestamps = {};

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

/**
 * Mark context as recently updated (for optimistic UI)
 * @param {string} context - Context ID
 * @returns {void}
 */
function markUpdated(context) {
  lastUpdateTimestamps[context] = Date.now();
}

/**
 * Mark all contexts for a specific accessory as recently updated
 * @param {number} accessoryId - Accessory ID
 * @returns {void}
 */
function markAccessoryUpdated(accessoryId) {
  const now = Date.now();
  Object.entries(contexts).forEach(([context, data]) => {
    const settings = /** @type {{accessoryId?: number}} */ (data.settings || {});
    if (settings.accessoryId === accessoryId) {
      lastUpdateTimestamps[context] = now;
    }
  });
}

/**
 * Check if context was recently updated (within cooldown period)
 * @param {string} context - Context ID
 * @param {number} [cooldownMs=500] - Cooldown period in ms
 * @returns {boolean}
 */
function wasRecentlyUpdated(context, cooldownMs = 500) {
  const lastUpdate = lastUpdateTimestamps[context];
  if (!lastUpdate) return false;
  return Date.now() - lastUpdate < cooldownMs;
}

/**
 * Clear update timestamp for context
 * @param {string} context - Context ID
 * @returns {void}
 */
function clearUpdateTimestamp(context) {
  delete lastUpdateTimestamps[context];
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
  addDialTicks,
  clearDialDebounce,
  markUpdated,
  markAccessoryUpdated,
  wasRecentlyUpdated,
  clearUpdateTimestamp,
};
