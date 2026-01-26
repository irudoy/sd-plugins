/**
 * Light Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/light
 */

const { LIGHT_ACTION } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings, handleToggleKeyUp } = require('../lib/base-action');
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

/**
 * Render light state to knob image (230x144, no status bar)
 * @param {LightSettings} settings
 * @param {LightState} state
 * @param {string} _name
 * @returns {string}
 */
function renderKnobState(settings, state, _name) {
  const { canvas, ctx } = createKnobCanvas();

  const iconColor = state.on ? COLORS.warmYellow : COLORS.gray;
  const textColor = state.on ? COLORS.white : COLORS.gray;
  const statusColor = state.on ? COLORS.warmYellow : COLORS.gray;

  // Draw icon on left side
  drawLightbulb(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, iconColor);

  // Room + Device name (2 lines) + status - centered relative to icon (Y=72)
  ctx.textAlign = 'left';
  const maxChars = 11;

  // Parse device name into lines
  const deviceName = settings.accessoryName || 'Light';
  let line1 = '';
  let line2 = '';
  if (deviceName.length > maxChars) {
    const words = deviceName.split(' ');
    for (const word of words) {
      if (line1.length === 0) {
        line1 = word;
      } else if ((line1 + ' ' + word).length <= maxChars) {
        line1 += ' ' + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }
    if (line2.length > maxChars) {
      line2 = line2.substring(0, maxChars - 1) + '…';
    }
  } else {
    line1 = deviceName;
  }

  // Calculate total height and center vertically around icon (Y=71)
  const roomH = 14;
  const nameH = 20;
  const statusH = 20;
  const gapRoomName = 6;
  const gapNameStatus = 5;
  const totalHeight = roomH + gapRoomName + nameH + (line2 ? nameH : 0) + gapNameStatus + statusH;
  const startY = KNOB_LAYOUT.iconY - 2 - totalHeight / 2 + roomH;

  // Room name
  let roomName = settings.roomName || '';
  if (roomName.length > maxChars) {
    roomName = roomName.substring(0, maxChars - 1) + '…';
  }
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(roomName, KNOB_LAYOUT.nameX, startY);

  // Device name
  ctx.fillStyle = textColor;
  ctx.font = 'bold 20px sans-serif';
  const name1Y = startY + gapRoomName + nameH;
  ctx.fillText(line1, KNOB_LAYOUT.nameX, name1Y);
  if (line2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, name1Y + nameH);
  }

  // Status
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = statusColor;
  const statusY = name1Y + (line2 ? nameH : 0) + gapNameStatus + statusH;
  if (state.on && state.brightness !== undefined) {
    ctx.fillText(state.brightness + '%', KNOB_LAYOUT.statusX, statusY);
  } else {
    ctx.fillText(state.on ? 'On' : 'Off', KNOB_LAYOUT.statusX, statusY);
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
  renderKnobState,

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
