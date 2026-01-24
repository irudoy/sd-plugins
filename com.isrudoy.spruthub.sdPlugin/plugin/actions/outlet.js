/**
 * Outlet Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/outlet
 */

const { OUTLET_ACTION, COLORS } = require('../lib/common');
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
 * @typedef {Object} OutletSettings
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
 * @typedef {Object} OutletState
 * @property {boolean} on
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw outlet icon (power outlet shape)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @returns {void}
 */
function drawOutletIcon(ctx, x, y, size, color) {
  const width = size * 0.5;
  const height = size * 0.6;
  const radius = 8;

  // Outlet body (rounded rectangle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
  ctx.fill();

  // Outlet holes (two vertical slots)
  const holeWidth = size * 0.06;
  const holeHeight = size * 0.15;
  const holeSpacing = size * 0.15;
  const holeY = y - height * 0.15;

  ctx.fillStyle = COLORS.background;

  // Left hole
  ctx.beginPath();
  ctx.roundRect(x - holeSpacing - holeWidth / 2, holeY - holeHeight / 2, holeWidth, holeHeight, 2);
  ctx.fill();

  // Right hole
  ctx.beginPath();
  ctx.roundRect(x + holeSpacing - holeWidth / 2, holeY - holeHeight / 2, holeWidth, holeHeight, 2);
  ctx.fill();

  // Ground hole (semicircle at bottom)
  const groundY = y + height * 0.15;
  ctx.beginPath();
  ctx.arc(x, groundY, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render outlet state to button image
 * @param {OutletSettings} settings
 * @param {OutletState} state
 * @returns {string}
 */
function renderState(settings, state) {
  const { canvas, ctx } = createButtonCanvas();
  const name = getDisplayName(settings);

  if (state.on) {
    drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow);
    drawDeviceName(ctx, name, COLORS.white);
    drawStatusText(ctx, 'On', COLORS.warmYellow);
    drawStatusBar(ctx, COLORS.warmYellow);
  } else {
    drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.gray);
    drawDeviceName(ctx, name, COLORS.gray, LAYOUT.nameYOff);
    drawStatusBar(ctx, '#444444');
  }

  return canvas.toDataURL('image/png');
}

/**
 * Get display name
 * @param {OutletSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) return settings.customName;
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Outlet';
}

// ============================================================
// Action Configuration
// ============================================================

const outletAction = new BaseAction({
  actionType: OUTLET_ACTION,
  deviceTypeName: 'Outlet',
  drawIcon: drawOutletIcon,
  initialState: { on: false },

  findService: (accessory) => SprutHubClient.findOutletService(accessory),

  extractState: (_accessory, service, _settings) => {
    const onChar = SprutHubClient.findOnCharacteristic(service);
    const onValue = SprutHubClient.extractValue(onChar?.control?.value);
    return { on: Boolean(onValue) };
  },

  renderState,

  handleStateChange: (state, settings, characteristicId, value) => {
    if (
      settings.characteristicId === characteristicId ||
      characteristicId === SprutHubClient.CHAR_ON
    ) {
      return { ...state, on: Boolean(value) };
    }
    return state;
  },

  handleKeyUp: async (client, settings, currentState) => {
    const { accessoryId, serviceId, characteristicId, action } = settings;
    if (accessoryId == null || serviceId == null || characteristicId == null) return null;

    let newValue;
    if (action === 'on') {
      newValue = true;
    } else if (action === 'off') {
      newValue = false;
    } else {
      newValue = !currentState.on;
    }

    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

    return { ...currentState, on: newValue };
  },
});

// ============================================================
// Exports
// ============================================================

module.exports = outletAction.getExports();
