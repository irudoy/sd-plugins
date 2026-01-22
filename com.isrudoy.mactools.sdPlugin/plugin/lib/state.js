/**
 * Shared state management for Mac Tools Plugin
 */

// ============================================================
// Global State
// ============================================================

// Context data storage: { [context]: { settings, action } }
const contexts = {};

// Timer storage: { [context]: intervalId }
const timers = {};

// Current Property Inspector state
let currentPIAction = null;
let currentPIContext = null;

// Battery device cache
const deviceCache = {
    apple: [],
    razer: []
};

// ============================================================
// State Management Functions
// ============================================================

function setContext(context, data) {
    contexts[context] = data;
}

function deleteContext(context) {
    delete contexts[context];
}

function setTimer(context, timer) {
    timers[context] = timer;
}

function stopTimer(context) {
    if (timers[context]) {
        clearInterval(timers[context]);
        delete timers[context];
    }
}

function getCurrentPI() {
    return { action: currentPIAction, context: currentPIContext };
}

function setCurrentPI(action, context) {
    currentPIAction = action;
    currentPIContext = context;
}

function clearCurrentPI(context) {
    if (currentPIContext === context) {
        currentPIContext = null;
        currentPIAction = null;
    }
}

function getDeviceCache(type) {
    return deviceCache[type] || [];
}

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
    setDeviceCache
};
