/**
 * Common constants and logging for Mac Tools Plugin
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
 * @property {string} gray - Gray color
 * @property {string} darkGray - Dark gray color
 * @property {string} dimGray - Dim gray color
 * @property {string} lightGray - Light gray color
 * @property {string} green - Green color (high battery)
 * @property {string} yellow - Yellow color (medium battery)
 * @property {string} red - Red color (low battery)
 * @property {string} dimGreen - Dimmed green (sleep state)
 * @property {string} dimYellow - Dimmed yellow (sleep state)
 * @property {string} dimRed - Dimmed red (sleep state)
 * @property {string} divider - Divider line color
 */

/**
 * @typedef {Object} BatteryThresholds
 * @property {number} high - High battery threshold
 * @property {number} low - Low battery threshold
 */

/**
 * Battery icon dimensions (compact version, no position)
 * @typedef {Object} BatteryIconCompact
 * @property {number} width - Icon width
 * @property {number} height - Icon height
 * @property {number} tipWidth - Battery tip width
 * @property {number} tipHeight - Battery tip height
 * @property {number} cornerRadius - Corner radius
 * @property {number} padding - Internal padding
 */

/**
 * Full battery icon with position
 * @typedef {Object} BatteryIconFull
 * @property {number} x - X position
 * @property {number} y - Y position
 * @property {number} width - Icon width
 * @property {number} height - Icon height
 * @property {number} tipWidth - Battery tip width
 * @property {number} tipHeight - Battery tip height
 * @property {number} cornerRadius - Corner radius
 * @property {number} padding - Internal padding
 */

// ============================================================
// Configuration
// ============================================================

/** @type {boolean} */
const DEBUG = true;

// Action UUIDs
/** @type {string} */
const DRIVEINFO_ACTION = 'com.isrudoy.mactools.driveinfo';
/** @type {string} */
const BATTERY_ACTION = 'com.isrudoy.mactools.battery';
/** @type {string} */
const OSASCRIPT_ACTION = 'com.isrudoy.mactools.osascript';

// Canvas dimensions
/** @type {number} */
const CANVAS_SIZE = 144;

// ============================================================
// Colors
// ============================================================

/** @type {Colors} */
const COLORS = {
  background: '#000000',
  white: '#FFFFFF',
  gray: '#888888',
  darkGray: '#666666',
  dimGray: '#555555',
  lightGray: '#AAAAAA',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
  // Dimmed versions for sleep state
  dimGreen: '#2D6B30',
  dimYellow: '#8C6A04',
  dimRed: '#8B2720',
  divider: '#333344',
};

// ============================================================
// Battery Constants
// ============================================================

/** @type {number} */
const MIN_UPDATE_INTERVAL = 1;
/** @type {number} */
const MAX_UPDATE_INTERVAL = 300;
/** @type {number} */
const DEFAULT_UPDATE_INTERVAL = 30;

/** @type {BatteryThresholds} */
const BATTERY_THRESHOLDS = {
  high: 50,
  low: 20,
};

/** @type {BatteryIconFull} */
const BATTERY_ICON = {
  x: 32,
  y: 35,
  width: 80,
  height: 40,
  tipWidth: 6,
  tipHeight: 16,
  cornerRadius: 6,
  padding: 4,
};

/** @type {BatteryIconCompact} */
const BATTERY_ICON_COMPACT = {
  width: 50,
  height: 20,
  tipWidth: 4,
  tipHeight: 10,
  cornerRadius: 4,
  padding: 2,
};

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
  DRIVEINFO_ACTION,
  BATTERY_ACTION,
  OSASCRIPT_ACTION,
  CANVAS_SIZE,
  COLORS,
  MIN_UPDATE_INTERVAL,
  MAX_UPDATE_INTERVAL,
  DEFAULT_UPDATE_INTERVAL,
  BATTERY_THRESHOLDS,
  BATTERY_ICON,
  BATTERY_ICON_COMPACT,
  logFile,
  log,
};
