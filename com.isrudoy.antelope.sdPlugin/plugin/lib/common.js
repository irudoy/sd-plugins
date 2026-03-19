/**
 * Common constants and logging for Antelope Control Plugin
 * @module lib/common
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

/** @type {boolean} */
const DEBUG = true;

// Action UUIDs
/** @type {string} */
const OUTPUT_ACTION = 'com.isrudoy.antelope.output';
/** @type {string} */
const MIXER_ACTION = 'com.isrudoy.antelope.mixer';

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

// Drawing layout constants for Keypad (144x144) - circular arc style
const LAYOUT = {
  arcCenterY: 58, // Arc center Y
  arcRadius: 42, // Arc radius
  arcWidth: 8, // Arc line width
  dbY: 58, // dB text Y (center of arc)
  statusY: 78, // Status text Y (DIM/MUTE below dB)
  nameY: 128, // Output name Y (near bottom)
};

// Drawing layout constants for Knob (230x144)
const KNOB_LAYOUT = {
  arcCenterX: 55, // Arc center X (left side)
  arcCenterY: 72, // Arc center Y (vertical center)
  arcRadius: 38, // Arc radius
  arcWidth: 6, // Arc line width
  nameX: 110, // Name X position (right side)
  nameY: 55, // Name Y position
  statusX: 110, // Status X position
  statusY: 80, // Status Y position
  infoY: 105, // Info text Y
};

// ============================================================
// Colors
// ============================================================

/** @type {Record<string, string>} */
const COLORS = {
  background: '#000000',
  white: '#FFFFFF',
  gray: '#888888',
  darkGray: '#333333',
  green: '#4CAF50', // Volume arc (normal)
  blue: '#00AAFF', // Antelope blue (mixer)
  red: '#FF6B6B', // Muted
  orange: '#FFA726', // DIM
  gold: '#FFD700', // Solo
  yellow: '#FFC107', // Connecting
};

// ============================================================
// Output / Bus Names
// ============================================================

const { OUTPUT_NAMES, BUS_NAMES } = require('../../antelope/constants');

/** @type {string[]} */
const OUTPUT_SHORT = ['MON', 'HP1', 'HP2', 'LINE', 'OUT4', 'OUT5'];

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
// Volume Conversion
// ============================================================

/**
 * Convert volume (attenuation) to dB string
 * Volume is attenuation: 0 = 0dB (loudest), 95 = -95dB, 96+ = -inf
 * @param {number} volume - Volume/attenuation value
 * @returns {string} Formatted dB string
 */
function volumeToDB(volume) {
  if (volume >= 96) return '-inf';
  if (volume === 0) return '0 dB';
  return `-${volume} dB`;
}

/**
 * Convert fader level to dB string
 * Fader: 0 = 0dB (unity), 60 = -60dB, 90 = -inf
 * @param {number} fader - Fader/level value
 * @returns {string} Formatted dB string
 */
function faderToDB(fader) {
  if (fader >= 90) return '-inf';
  if (fader === 0) return '0 dB';
  return `-${fader} dB`;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  DEBUG,
  OUTPUT_ACTION,
  MIXER_ACTION,
  CANVAS_SIZE,
  CANVAS_CENTER,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  LAYOUT,
  KNOB_LAYOUT,
  COLORS,
  OUTPUT_NAMES,
  OUTPUT_SHORT,
  BUS_NAMES,
  logFile,
  log,
  volumeToDB,
  faderToDB,
};
