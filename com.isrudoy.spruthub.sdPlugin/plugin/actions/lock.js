/**
 * Lock Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/lock
 */

const { LOCK_ACTION } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings } = require('../lib/base-action');
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
 * @typedef {Object} LockSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [characteristicId] - LockTargetState characteristic ID
 * @property {number} [currentStateCharId] - LockCurrentState characteristic ID
 * @property {string} [customName]
 * @property {string} [action] - toggle | lock | unlock
 */

/**
 * @typedef {Object} LockState
 * @property {boolean} locked
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// Lock states from HomeKit spec
const LOCK_UNSECURED = 0;
const LOCK_SECURED = 1;

// Colors for lock (green=locked/secure, red=unlocked/insecure)
const LOCK_COLORS = {
  locked: '#4CAF50',
  unlocked: '#F44336',
};

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw lock icon
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [isLocked]
 * @returns {void}
 */
function drawLockIcon(ctx, x, y, size, color, isLocked = true) {
  const bodyWidth = size * 0.45;
  const bodyHeight = size * 0.35;
  const shackleWidth = size * 0.3;
  const shackleHeight = size * 0.25;

  // Lock body (rounded rectangle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - bodyWidth / 2, y, bodyWidth, bodyHeight, 6);
  ctx.fill();

  // Shackle (U-shape)
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';

  const shackleY = y - shackleHeight + size * 0.05;

  if (isLocked) {
    // Closed shackle
    ctx.beginPath();
    ctx.moveTo(x - shackleWidth / 2, y + 5);
    ctx.lineTo(x - shackleWidth / 2, shackleY + shackleHeight * 0.3);
    ctx.quadraticCurveTo(x - shackleWidth / 2, shackleY, x, shackleY);
    ctx.quadraticCurveTo(
      x + shackleWidth / 2,
      shackleY,
      x + shackleWidth / 2,
      shackleY + shackleHeight * 0.3
    );
    ctx.lineTo(x + shackleWidth / 2, y + 5);
    ctx.stroke();
  } else {
    // Open shackle (right side raised)
    ctx.beginPath();
    ctx.moveTo(x - shackleWidth / 2, y + 5);
    ctx.lineTo(x - shackleWidth / 2, shackleY + shackleHeight * 0.3);
    ctx.quadraticCurveTo(x - shackleWidth / 2, shackleY, x, shackleY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + shackleWidth / 2, y - shackleHeight * 0.3);
    ctx.lineTo(x + shackleWidth / 2, shackleY - shackleHeight * 0.3);
    ctx.stroke();
  }

  // Keyhole
  ctx.fillStyle = COLORS.background;
  const keyholeY = y + bodyHeight * 0.4;
  ctx.beginPath();
  ctx.arc(x, keyholeY, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.03, keyholeY);
  ctx.lineTo(x + size * 0.03, keyholeY);
  ctx.lineTo(x + size * 0.02, keyholeY + size * 0.08);
  ctx.lineTo(x - size * 0.02, keyholeY + size * 0.08);
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render lock state to button image
 * @param {LockSettings} settings
 * @param {LockState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();

  if (state.locked) {
    drawLockIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY - 10, LAYOUT.bulbSize, LOCK_COLORS.locked, true);
    drawDeviceName(ctx, name, COLORS.white);
    drawStatusText(ctx, 'Locked', LOCK_COLORS.locked);
    drawStatusBar(ctx, LOCK_COLORS.locked);
  } else {
    drawLockIcon(
      ctx,
      CANVAS_CENTER,
      LAYOUT.bulbY - 10,
      LAYOUT.bulbSize,
      LOCK_COLORS.unlocked,
      false
    );
    drawDeviceName(ctx, name, COLORS.white);
    drawStatusText(ctx, 'Unlocked', LOCK_COLORS.unlocked);
    drawStatusBar(ctx, LOCK_COLORS.unlocked);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Render lock state to knob image (230x144, no status bar)
 * @param {LockSettings} settings
 * @param {LockState} state
 * @param {string} name
 * @returns {string}
 */
function renderKnobState(settings, state, name) {
  const { canvas, ctx } = createKnobCanvas();

  const iconColor = state.locked ? LOCK_COLORS.locked : LOCK_COLORS.unlocked;

  // Draw icon on left side (slightly higher for lock icon)
  drawLockIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY - 10,
    KNOB_LAYOUT.iconSize,
    iconColor,
    state.locked
  );

  // Device name and status - vertically centered
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const displayName = name || 'Lock';
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
  ctx.fillStyle = iconColor;
  const statusY = startY + (hasLine2 ? 2 : 1) * lineHeight + statusGap;
  ctx.fillText(state.locked ? 'Locked' : 'Unlocked', KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const lockAction = new BaseAction({
  actionType: LOCK_ACTION,
  deviceTypeName: 'Lock',
  drawIcon: (ctx, x, y, size, color) => drawLockIcon(ctx, x, y, size, color, true),
  initialState: { locked: false },

  findService: (accessory) => SprutHub.findLockService(accessory),

  extractState: (_accessory, service, _settings) => {
    const currentStateChar = SprutHub.findLockCurrentStateCharacteristic(service);
    const currentValue = SprutHub.extractValue(currentStateChar?.control?.value);
    return { locked: Number(currentValue) === LOCK_SECURED };
  },

  renderState,
  renderKnobState,

  handleStateChange: (state, settings, characteristicId, value) => {
    if (
      settings.currentStateCharId === characteristicId ||
      settings.characteristicId === characteristicId
    ) {
      return { ...state, locked: Number(value) === LOCK_SECURED };
    }
    return state;
  },

  handleKeyUp: async (client, settings, currentState) => {
    const { accessoryId, serviceId, characteristicId, action } = settings;
    if (accessoryId == null || serviceId == null || characteristicId == null) return null;

    let newValue;
    if (action === 'lock') {
      newValue = LOCK_SECURED;
    } else if (action === 'unlock') {
      newValue = LOCK_UNSECURED;
    } else {
      newValue = currentState.locked ? LOCK_UNSECURED : LOCK_SECURED;
    }

    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

    return { ...currentState, locked: newValue === LOCK_SECURED };
  },

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    currentStateCharId:
      typeof payload.currentStateCharId === 'number' ? payload.currentStateCharId : undefined,
  }),
});

// ============================================================
// Exports
// ============================================================

module.exports = lockAction.getExports();
