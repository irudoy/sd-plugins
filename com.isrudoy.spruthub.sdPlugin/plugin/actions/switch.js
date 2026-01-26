/**
 * Switch Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/switch
 */

const { SWITCH_ACTION } = require('../lib/common');
const {
  BaseAction,
  SprutHub,
  handleToggleKeyUp,
  handleOnOffStateChange,
  extractOnOffState,
} = require('../lib/base-action');
const {
  createButtonCanvas,
  createKnobCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_LAYOUT,
  COLORS,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * @typedef {Object} SwitchSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [characteristicId]
 * @property {string} [customName]
 * @property {string} [action] - toggle | on | off
 */

/**
 * @typedef {Object} SwitchState
 * @property {boolean} on
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw switch icon (toggle switch shape)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [isOn]
 * @returns {void}
 */
function drawSwitchIcon(ctx, x, y, size, color, isOn = false) {
  const width = size * 0.6;
  const height = size * 0.35;
  const radius = height / 2;

  // Switch track (rounded rectangle)
  ctx.fillStyle = isOn ? color : '#444444';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
  ctx.fill();

  // Switch knob
  const knobRadius = height * 0.35;
  const knobX = isOn ? x + width / 2 - radius : x - width / 2 + radius;
  ctx.fillStyle = isOn ? '#FFFFFF' : '#888888';
  ctx.beginPath();
  ctx.arc(knobX, y, knobRadius, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render switch state to button image
 * @param {SwitchSettings} settings
 * @param {SwitchState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();

  if (state.on) {
    drawSwitchIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow, true);
    drawDeviceName(ctx, name, COLORS.white);
    drawStatusText(ctx, 'On', COLORS.warmYellow);
    drawStatusBar(ctx, COLORS.warmYellow);
  } else {
    drawSwitchIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.gray, false);
    drawDeviceName(ctx, name, COLORS.gray, LAYOUT.nameYOff);
    drawStatusBar(ctx, '#444444');
  }

  return canvas.toDataURL('image/png');
}

/**
 * Render switch state to knob image (230x144, no status bar)
 * @param {SwitchSettings} settings
 * @param {SwitchState} state
 * @param {string} name
 * @returns {string}
 */
function renderKnobState(settings, state, name) {
  const { canvas, ctx } = createKnobCanvas();

  const iconColor = state.on ? COLORS.warmYellow : COLORS.gray;
  const textColor = state.on ? COLORS.white : COLORS.gray;

  // Draw icon on left side
  drawSwitchIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY,
    KNOB_LAYOUT.iconSize,
    iconColor,
    state.on
  );

  // Device name and status - vertically centered
  ctx.fillStyle = textColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const displayName = name || 'Switch';
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

  // Status text
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = state.on ? COLORS.warmYellow : COLORS.gray;
  const statusY = startY + (hasLine2 ? 2 : 1) * lineHeight + statusGap;
  ctx.fillText(state.on ? 'On' : 'Off', KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const switchAction = new BaseAction({
  actionType: SWITCH_ACTION,
  deviceTypeName: 'Switch',
  drawIcon: (ctx, x, y, size, color) => drawSwitchIcon(ctx, x, y, size, color, false),
  initialState: { on: false },

  findService: (accessory) => SprutHub.findSwitchService(accessory),

  extractState: extractOnOffState,

  renderState,
  renderKnobState,

  handleStateChange: handleOnOffStateChange,

  handleKeyUp: handleToggleKeyUp,
});

// ============================================================
// Exports
// ============================================================

module.exports = switchAction.getExports();
