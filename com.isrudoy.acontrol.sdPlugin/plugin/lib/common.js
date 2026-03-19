/**
 * Common constants and logging for A Control Plugin
 * @module lib/common
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

/** @type {boolean} */
const DEBUG = true;

// Action UUID
/** @type {string} */
const SPEAKERS_ACTION = 'com.isrudoy.acontrol.speakers';

// Canvas dimensions for Keypad (square button)
/** @type {number} */
const CANVAS_SIZE = 144;
/** @type {number} */
const CANVAS_CENTER = CANVAS_SIZE / 2;

// Canvas dimensions for Knob (wide touchscreen area)
/** @type {number} */
const KNOB_WIDTH = 230;
/** @type {number} */
const KNOB_HEIGHT = 144;
/** @type {number} */
const KNOB_CENTER_Y = KNOB_HEIGHT / 2;

// Drawing layout constants for Keypad (144x144)
const LAYOUT = {
  iconY: 50,
  iconSize: 70,
  nameY: 104,
  statusY: 125,
  statusBarY: CANVAS_SIZE - 6,
  statusBarHeight: 6,
};

// Drawing layout constants for Knob (230x144)
const KNOB_LAYOUT = {
  iconX: 50,
  iconY: 72,
  iconSize: 70,
  nameX: 95,
  statusX: 95,
};

// ============================================================
// Colors
// ============================================================

/** @type {Record<string, string>} */
const COLORS = {
  background: '#000000',
  white: '#FFFFFF',
  gray: '#888888',
  active: '#FFFFFF', // White for active/unmuted
  muted: '#FF6F91', // Red/pink for muted
  yellow: '#FFC107', // Connecting
  dim: '#FFA726', // Orange for DIM mode
};

// ============================================================
// Voicing and Input Labels
// ============================================================

/** @type {string[]} */
const VOICING_LABELS = ['Pure', 'UNR', 'Ext.'];

/** @type {string[]} */
const INPUT_LABELS = ['RCA', 'XLR'];

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
  } catch {
    // Ignore write errors
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  DEBUG,
  SPEAKERS_ACTION,
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  KNOB_CENTER_Y,
  KNOB_LAYOUT,
  COLORS,
  VOICING_LABELS,
  INPUT_LABELS,
  logFile,
  log,
};
