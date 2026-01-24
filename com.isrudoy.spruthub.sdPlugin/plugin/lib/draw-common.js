/**
 * Common Canvas Drawing Utilities for Sprut.Hub Plugin
 * Shared drawing functions used by all actions
 * @module lib/draw-common
 */

const { createCanvas } = require('canvas');
const { CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('./common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * Icon drawing function signature
 * @callback IconDrawFn
 * @param {CanvasContext} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @returns {void}
 */

// ============================================================
// Canvas Utilities
// ============================================================

/**
 * Create a 144x144 canvas with black background
 * @returns {{canvas: import('canvas').Canvas, ctx: CanvasContext}}
 */
function createButtonCanvas() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return { canvas, ctx };
}

/**
 * Draw status bar at bottom of canvas
 * @param {CanvasContext} ctx - Canvas context
 * @param {string} color - Bar color
 * @returns {void}
 */
function drawStatusBar(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);
}

/**
 * Draw device name text
 * @param {CanvasContext} ctx - Canvas context
 * @param {string} name - Device name
 * @param {string} color - Text color
 * @param {number} [y] - Y position (default: LAYOUT.nameY)
 * @param {number} [maxLength] - Max length before truncation (default: 12)
 * @returns {void}
 */
function drawDeviceName(ctx, name, color, y = LAYOUT.nameY, maxLength = 12) {
  ctx.fillStyle = color;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Device';
  if (displayName.length > maxLength) {
    displayName = displayName.substring(0, maxLength - 1) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, y);
}

/**
 * Draw status text (below name)
 * @param {CanvasContext} ctx - Canvas context
 * @param {string} text - Status text
 * @param {string} color - Text color
 * @param {number} [y] - Y position (default: LAYOUT.brightnessY)
 * @returns {void}
 */
function drawStatusText(ctx, text, color, y = LAYOUT.brightnessY) {
  ctx.fillStyle = color;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, CANVAS_CENTER, y);
}

/**
 * Truncate text if too long
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Max length
 * @returns {string}
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 1) + '…';
  }
  return text;
}

// ============================================================
// Common State Drawings
// ============================================================

/**
 * Draw error state button
 * @param {string} message - Error message
 * @returns {string} Base64 PNG data URL
 */
function drawError(message) {
  const { canvas, ctx } = createButtonCanvas();

  // Dark red background
  ctx.fillStyle = '#3d1a1a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Error icon (!)
  ctx.fillStyle = COLORS.red;
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', CANVAS_CENTER, 65);

  // Error message
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(truncateText(message || 'Error', 14), CANVAS_CENTER, 100);

  // Status bar
  drawStatusBar(ctx, COLORS.red);

  return canvas.toDataURL('image/png');
}

/**
 * Draw connecting state button with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @returns {string} Base64 PNG data URL
 */
function drawConnectingWithIcon(drawIconFn) {
  const { canvas, ctx } = createButtonCanvas();

  // Draw icon in yellow
  drawIconFn(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.yellow);

  // "Connecting..." text
  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  // Status bar
  drawStatusBar(ctx, COLORS.yellow);

  return canvas.toDataURL('image/png');
}

/**
 * Draw not configured state button with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfiguredWithIcon(drawIconFn) {
  const { canvas, ctx } = createButtonCanvas();

  // Dark blue background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw icon in gray (smaller, higher position)
  drawIconFn(ctx, CANVAS_CENTER, 50, LAYOUT.bulbSizeSmall, COLORS.gray);

  // "Setup" text
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Setup', CANVAS_CENTER, 110);

  // Subtitle
  ctx.fillStyle = COLORS.gray;
  ctx.font = '14px sans-serif';
  ctx.fillText('Open settings', CANVAS_CENTER, 130);

  return canvas.toDataURL('image/png');
}

/**
 * Draw offline state button with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @param {string} name - Device name
 * @returns {string} Base64 PNG data URL
 */
function drawOfflineWithIcon(drawIconFn, name) {
  const { canvas, ctx } = createButtonCanvas();

  // Draw icon in unavailable color
  drawIconFn(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable);

  // Device name
  drawDeviceName(ctx, name, COLORS.unavailable);

  // "Offline" status
  drawStatusText(ctx, 'Offline', COLORS.unavailable);

  // Status bar
  drawStatusBar(ctx, COLORS.unavailable);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Canvas utilities
  createButtonCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  truncateText,
  // Constants re-exports for convenience
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  COLORS,
  // Common state drawings
  drawError,
  drawConnectingWithIcon,
  drawNotConfiguredWithIcon,
  drawOfflineWithIcon,
};
