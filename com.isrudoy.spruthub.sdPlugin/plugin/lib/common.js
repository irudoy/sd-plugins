/**
 * Common constants and logging for Sprut.Hub Plugin
 * @module lib/common
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} Colors
 * @property {string} background - Background color
 * @property {string} white - White color
 * @property {string} gray - Gray color (off state)
 * @property {string} warmYellow - Warm yellow (on state)
 * @property {string} yellow - Yellow (connecting)
 * @property {string} red - Red (error)
 * @property {string} unavailable - Unavailable state color
 */

// ============================================================
// Configuration
// ============================================================

/** @type {boolean} */
const DEBUG = true;

// Action UUIDs
/** @type {string} */
const LIGHT_ACTION = 'com.isrudoy.spruthub.light';
/** @type {string} */
const SWITCH_ACTION = 'com.isrudoy.spruthub.switch';
/** @type {string} */
const OUTLET_ACTION = 'com.isrudoy.spruthub.outlet';
/** @type {string} */
const THERMOSTAT_ACTION = 'com.isrudoy.spruthub.thermostat';
/** @type {string} */
const COVER_ACTION = 'com.isrudoy.spruthub.cover';
/** @type {string} */
const LOCK_ACTION = 'com.isrudoy.spruthub.lock';
/** @type {string} */
const SENSOR_ACTION = 'com.isrudoy.spruthub.sensor';
/** @type {string} */
const BUTTON_ACTION = 'com.isrudoy.spruthub.button';

// Canvas dimensions
/** @type {number} */
const CANVAS_SIZE = 144;
/** @type {number} */
const CANVAS_CENTER = CANVAS_SIZE / 2;

// Drawing layout constants
const LAYOUT = {
  bulbY: 50,
  bulbSize: 70,
  bulbSizeSmall: 60,
  nameY: 104,
  nameYOff: 109,
  brightnessY: 125,
  statusBarY: CANVAS_SIZE - 6,
  statusBarHeight: 6,
};

// ============================================================
// Colors (from plan - HA reference)
// ============================================================

/** @type {Colors} */
const COLORS = {
  background: '#000000',
  white: '#FFFFFF',
  gray: '#888888',
  warmYellow: '#ffd484', // On/Active state
  yellow: '#FFC107', // Connecting
  red: '#FF6F91', // Unavailable/Error
  unavailable: '#FF6F91',
};

// ============================================================
// Sprut.Hub Constants
// ============================================================

/** @type {number} */
const DEFAULT_UPDATE_INTERVAL = 30;

/** @type {number} */
const REQUEST_TIMEOUT = 30000;

/** @type {number} */
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================================
// Logging
// ============================================================

/** @type {string} */
const logFile = path.join(__dirname, '..', 'plugin.log');

/**
 * Log messages to file (when DEBUG is true)
 * @param {...unknown} args - Values to log
 * @returns {void}
 */
function log(...args) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  try {
    fs.appendFileSync(logFile, message);
  } catch {}
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  DEBUG,
  LIGHT_ACTION,
  SWITCH_ACTION,
  OUTLET_ACTION,
  THERMOSTAT_ACTION,
  COVER_ACTION,
  LOCK_ACTION,
  SENSOR_ACTION,
  BUTTON_ACTION,
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  COLORS,
  DEFAULT_UPDATE_INTERVAL,
  REQUEST_TIMEOUT,
  MAX_RECONNECT_ATTEMPTS,
  logFile,
  log,
};
