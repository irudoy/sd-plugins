/**
 * Common Canvas Drawing Utilities for Sprut.Hub Plugin
 * Shared drawing functions used by all actions
 * @module lib/draw-common
 */

const { createCanvas } = require('@napi-rs/canvas');
const {
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  KNOB_LAYOUT,
  COLORS,
} = require('./common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('@napi-rs/canvas').SKRSContext2D} CanvasContext
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
 * @returns {{canvas: import('@napi-rs/canvas').Canvas, ctx: CanvasContext}}
 */
function createButtonCanvas() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return { canvas, ctx };
}

/**
 * Create a 200x100 canvas for Knob (wide touchscreen area)
 * @returns {{canvas: import('@napi-rs/canvas').Canvas, ctx: CanvasContext}}
 */
function createKnobCanvas() {
  const canvas = createCanvas(KNOB_WIDTH, KNOB_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, KNOB_WIDTH, KNOB_HEIGHT);
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
// Knob State Drawings (200x100, no status bar)
// ============================================================

/**
 * Draw error state for knob
 * @param {string} message - Error message
 * @returns {string} Base64 PNG data URL
 */
function drawKnobError(message) {
  const { canvas, ctx } = createKnobCanvas();

  // Dark red background
  ctx.fillStyle = '#3d1a1a';
  ctx.fillRect(0, 0, KNOB_WIDTH, KNOB_HEIGHT);

  // Error icon (!)
  ctx.fillStyle = COLORS.red;
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY + 14);

  // Error message
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(truncateText(message || 'Error', 16), KNOB_LAYOUT.nameX, KNOB_HEIGHT / 2 + 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw connecting state for knob with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @returns {string} Base64 PNG data URL
 */
function drawKnobConnectingWithIcon(drawIconFn) {
  const { canvas, ctx } = createKnobCanvas();

  // Draw icon in yellow
  drawIconFn(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, COLORS.yellow);

  // "Connecting..." text
  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Connecting...', KNOB_LAYOUT.nameX, KNOB_HEIGHT / 2 + 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw not configured state for knob with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @returns {string} Base64 PNG data URL
 */
function drawKnobNotConfiguredWithIcon(drawIconFn) {
  const { canvas, ctx } = createKnobCanvas();

  // Dark blue background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, KNOB_WIDTH, KNOB_HEIGHT);

  // Draw icon in gray
  drawIconFn(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, COLORS.gray);

  // "Setup" text
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Setup', KNOB_LAYOUT.nameX, KNOB_LAYOUT.nameY);

  // Subtitle
  ctx.fillStyle = COLORS.gray;
  ctx.font = '14px sans-serif';
  ctx.fillText('Open settings', KNOB_LAYOUT.statusX, KNOB_LAYOUT.statusY);

  return canvas.toDataURL('image/png');
}

/**
 * Draw offline state for knob with icon
 * @param {IconDrawFn} drawIconFn - Function to draw the icon
 * @param {string} name - Device name
 * @returns {string} Base64 PNG data URL
 */
function drawKnobOfflineWithIcon(drawIconFn, name) {
  const { canvas, ctx } = createKnobCanvas();

  // Draw icon in unavailable color
  drawIconFn(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, COLORS.unavailable);

  // Device name and status - vertically centered relative to icon
  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const displayName = name || 'Device';
  const maxCharsPerLine = 10;
  const lineHeight = 18;
  const statusGap = 8;
  const centerY = KNOB_LAYOUT.iconY + 5;

  // Parse name into lines
  let line1 = '';
  let line2 = '';

  if (displayName.length > maxCharsPerLine) {
    const words = displayName.split(' ');
    for (const word of words) {
      if (line1.length === 0) {
        line1 = word;
      } else if ((line1 + ' ' + word).length <= maxCharsPerLine) {
        line1 += ' ' + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }
    if (line2.length > maxCharsPerLine) {
      line2 = line2.substring(0, maxCharsPerLine - 1) + '…';
    }
  } else {
    line1 = displayName;
  }

  // Calculate total height and starting Y
  const hasLine2 = line2.length > 0;
  const totalHeight = (hasLine2 ? 2 : 1) * lineHeight + statusGap + 20;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  // Draw name
  ctx.fillText(line1, KNOB_LAYOUT.nameX, startY);
  if (hasLine2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, startY + lineHeight);
  }

  // "Offline" status
  ctx.font = '20px sans-serif';
  const statusY = startY + (hasLine2 ? 2 : 1) * lineHeight + statusGap;
  ctx.fillText('Offline', KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Canvas utilities
  createButtonCanvas,
  createKnobCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  truncateText,
  // Constants re-exports for convenience
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  KNOB_LAYOUT,
  COLORS,
  // Common state drawings (Keypad)
  drawError,
  drawConnectingWithIcon,
  drawNotConfiguredWithIcon,
  drawOfflineWithIcon,
  // Common state drawings (Knob)
  drawKnobError,
  drawKnobConnectingWithIcon,
  drawKnobNotConfiguredWithIcon,
  drawKnobOfflineWithIcon,
};
