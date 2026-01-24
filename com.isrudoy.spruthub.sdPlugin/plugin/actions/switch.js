/**
 * Switch Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/switch
 */

const { SWITCH_ACTION, COLORS } = require('../lib/common');
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
 * @returns {string}
 */
function renderState(settings, state) {
  const { canvas, ctx } = createButtonCanvas();
  const name = getDisplayName(settings);

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
 * Get display name
 * @param {SwitchSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) return settings.customName;
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Switch';
}

// ============================================================
// Action Configuration
// ============================================================

const switchAction = new BaseAction({
  actionType: SWITCH_ACTION,
  deviceTypeName: 'Switch',
  drawIcon: (ctx, x, y, size, color) => drawSwitchIcon(ctx, x, y, size, color, false),
  initialState: { on: false },

  findService: (accessory) => SprutHubClient.findSwitchService(accessory),

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

module.exports = switchAction.getExports();
