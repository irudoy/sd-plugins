/**
 * Lock Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/lock
 */

const { LOCK_ACTION, COLORS } = require('../lib/common');
const { BaseAction, SprutHubClient } = require('../lib/base-action');
const {
  createButtonCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  CANVAS_CENTER,
  LAYOUT,
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
 * @returns {string}
 */
function renderState(settings, state) {
  const { canvas, ctx } = createButtonCanvas();
  const name = getDisplayName(settings);

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
 * Get display name
 * @param {LockSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) return settings.customName;
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Lock';
}

// ============================================================
// Action Configuration
// ============================================================

const lockAction = new BaseAction({
  actionType: LOCK_ACTION,
  deviceTypeName: 'Lock',
  drawIcon: (ctx, x, y, size, color) => drawLockIcon(ctx, x, y, size, color, true),
  initialState: { locked: false },

  findService: (accessory) => SprutHubClient.findLockService(accessory),

  extractState: (_accessory, service, _settings) => {
    const currentStateChar = SprutHubClient.findLockCurrentStateCharacteristic(service);
    const currentValue = SprutHubClient.extractValue(currentStateChar?.control?.value);
    return { locked: Number(currentValue) === LOCK_SECURED };
  },

  renderState,

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
    host: typeof payload.host === 'string' ? payload.host : undefined,
    token: typeof payload.token === 'string' ? payload.token : undefined,
    serial: typeof payload.serial === 'string' ? payload.serial : undefined,
    accessoryId: typeof payload.accessoryId === 'number' ? payload.accessoryId : undefined,
    accessoryName: typeof payload.accessoryName === 'string' ? payload.accessoryName : undefined,
    serviceId: typeof payload.serviceId === 'number' ? payload.serviceId : undefined,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : undefined,
    characteristicId:
      typeof payload.characteristicId === 'number' ? payload.characteristicId : undefined,
    currentStateCharId:
      typeof payload.currentStateCharId === 'number' ? payload.currentStateCharId : undefined,
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
  }),
});

// ============================================================
// Exports
// ============================================================

module.exports = lockAction.getExports();
