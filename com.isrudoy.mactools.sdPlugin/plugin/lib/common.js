/**
 * Common constants and logging for Mac Tools Plugin
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Configuration
// ============================================================

const DEBUG = false;

// Action UUIDs
const DRIVEINFO_ACTION = 'com.isrudoy.mactools.driveinfo';
const BATTERY_ACTION = 'com.isrudoy.mactools.battery';
const OSASCRIPT_ACTION = 'com.isrudoy.mactools.osascript';

// Canvas dimensions
const CANVAS_SIZE = 144;

// ============================================================
// Colors
// ============================================================

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

const MIN_UPDATE_INTERVAL = 1;
const MAX_UPDATE_INTERVAL = 300;
const DEFAULT_UPDATE_INTERVAL = 30;

const BATTERY_THRESHOLDS = {
  high: 50,
  low: 20,
};

// Battery icon dimensions - full size (single device mode)
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

// Battery icon dimensions - compact size (dual device mode)
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

const logFile = path.join(__dirname, '..', 'plugin.log');

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
