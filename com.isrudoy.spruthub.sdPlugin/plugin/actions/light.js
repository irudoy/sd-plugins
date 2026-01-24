/**
 * Light Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/light
 */

const { LIGHT_ACTION, COLORS } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings, handleToggleKeyUp } = require('../lib/base-action');
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
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * @typedef {Object} LightSettings
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
 * @property {number} [brightnessStep] - Brightness change step (default 10)
 */

/**
 * @typedef {Object} LightState
 * @property {boolean} on
 * @property {number} [brightness]
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw lightbulb icon
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @returns {void}
 */
function drawLightbulb(ctx, x, y, size, color) {
  const bulbRadius = size * 0.35;
  const baseWidth = size * 0.35;
  const baseHeight = size * 0.2;

  ctx.fillStyle = color;

  // Bulb (circle)
  ctx.beginPath();
  ctx.arc(x, y - size * 0.1, bulbRadius, 0, Math.PI * 2);
  ctx.fill();

  // Base (rectangle with rounded bottom)
  const baseY = y + bulbRadius * 0.5;
  ctx.fillRect(x - baseWidth / 2, baseY, baseWidth, baseHeight);

  // Base lines
  ctx.strokeStyle = COLORS.background;
  ctx.lineWidth = 2;
  for (let i = 1; i <= 2; i++) {
    const ly = baseY + (baseHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x - baseWidth / 2, ly);
    ctx.lineTo(x + baseWidth / 2, ly);
    ctx.stroke();
  }

  // Tip
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - baseWidth / 4, baseY + baseHeight);
  ctx.lineTo(x + baseWidth / 4, baseY + baseHeight);
  ctx.lineTo(x, baseY + baseHeight + size * 0.08);
  ctx.closePath();
  ctx.fill();
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render light state to button image
 * @param {LightSettings} settings
 * @param {LightState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();

  if (state.on) {
    // On state
    drawLightbulb(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow);
    drawDeviceName(ctx, name, COLORS.white);

    if (state.brightness !== undefined) {
      drawStatusText(ctx, state.brightness + '%', COLORS.warmYellow);
    }

    drawStatusBar(ctx, COLORS.warmYellow);
  } else {
    // Off state
    drawLightbulb(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.gray);
    drawDeviceName(ctx, name, COLORS.gray, LAYOUT.nameYOff);
    drawStatusBar(ctx, '#444444');
  }

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const lightAction = new BaseAction({
  actionType: LIGHT_ACTION,
  deviceTypeName: 'Light',
  drawIcon: drawLightbulb,
  initialState: { on: false },

  findService: (accessory) => SprutHub.findLightbulbService(accessory),

  extractState: (accessory, service, _settings) => {
    const onChar = SprutHub.findOnCharacteristic(service);
    const brightnessChar = SprutHub.findBrightnessCharacteristic(service);

    const onValue = SprutHub.extractValue(onChar?.control?.value);
    const brightnessValue = SprutHub.extractValue(brightnessChar?.control?.value);

    return {
      on: Boolean(onValue),
      brightness: brightnessValue !== undefined ? Number(brightnessValue) : undefined,
    };
  },

  renderState,

  handleStateChange: (state, settings, characteristicId, value) => {
    const newState = { ...state };

    if (settings.characteristicId === characteristicId || characteristicId === SprutHub.CHAR_ON) {
      newState.on = Boolean(value);
    } else if (characteristicId === SprutHub.CHAR_BRIGHTNESS) {
      newState.brightness = Number(value);
    }

    return newState;
  },

  handleKeyUp: handleToggleKeyUp,

  /**
   * Preview dial rotation (UI only, no API call)
   * @param {LightSettings} settings
   * @param {LightState} currentState
   * @param {{ticks: number}} payload
   * @returns {LightState|null}
   */
  previewDialRotate: (settings, currentState, payload) => {
    const step = settings.brightnessStep || 10;
    const delta = payload.ticks > 0 ? step : -step;
    const currentBrightness = currentState.brightness ?? 100;
    const newBrightness = Math.max(0, Math.min(100, currentBrightness + delta));

    if (newBrightness === 0 && currentState.on) {
      return { ...currentState, brightness: newBrightness, on: false };
    }
    if (newBrightness > 0 && !currentState.on) {
      return { ...currentState, brightness: newBrightness, on: true };
    }
    return { ...currentState, brightness: newBrightness };
  },

  /**
   * Handle dial rotation for brightness control (sends to hub)
   * State is already updated by previewDialRotate, just send to hub
   * @param {import('../lib/spruthub').SprutHub} client
   * @param {LightSettings} settings
   * @param {LightState} currentState
   * @param {{ticks: number}} _payload
   * @returns {Promise<LightState|null>}
   */
  handleDialRotate: async (client, settings, currentState, _payload) => {
    const { accessoryId, serviceId } = settings;
    if (accessoryId == null || serviceId == null) return null;

    // Find brightness characteristic
    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);
    if (!accessory) return null;

    const service = accessory.services?.find((s) => s.sId === serviceId);
    if (!service) return null;

    const brightnessChar = SprutHub.findBrightnessCharacteristic(service);
    if (!brightnessChar) return null;

    // State already updated by preview, just send current value to hub
    const brightness = currentState.brightness ?? 0;

    await client.updateCharacteristic(accessoryId, serviceId, brightnessChar.cId, brightness);

    // If turning off via dial (brightness = 0), also turn off
    if (brightness === 0 && currentState.on) {
      const onChar = SprutHub.findOnCharacteristic(service);
      if (onChar) {
        await client.updateCharacteristic(accessoryId, serviceId, onChar.cId, false);
      }
      return { ...currentState, on: false };
    }

    // If turning on via dial (brightness > 0 and was off)
    if (brightness > 0 && !currentState.on) {
      const onChar = SprutHub.findOnCharacteristic(service);
      if (onChar) {
        await client.updateCharacteristic(accessoryId, serviceId, onChar.cId, true);
      }
      return { ...currentState, on: true };
    }

    return currentState;
  },

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    brightnessStep: typeof payload.brightnessStep === 'number' ? payload.brightnessStep : undefined,
  }),
});

// ============================================================
// Exports
// ============================================================

module.exports = lightAction.getExports();
