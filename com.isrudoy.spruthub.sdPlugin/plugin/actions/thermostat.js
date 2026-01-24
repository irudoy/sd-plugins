/**
 * Thermostat Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/thermostat
 */

const { THERMOSTAT_ACTION, COLORS } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings } = require('../lib/base-action');
const { createButtonCanvas, drawStatusBar, CANVAS_CENTER, LAYOUT } = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * @typedef {Object} ThermostatSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [currentTempCharId] - CurrentTemperature characteristic ID
 * @property {number} [targetTempCharId] - TargetTemperature characteristic ID
 * @property {number} [currentModeCharId] - CurrentHeatingCoolingState characteristic ID
 * @property {number} [targetModeCharId] - TargetHeatingCoolingState characteristic ID
 * @property {string} [customName]
 * @property {string} [action] - tempUp | tempDown | toggleMode
 * @property {number} [tempStep] - Temperature change step (default 0.5)
 */

/**
 * @typedef {Object} ThermostatState
 * @property {number} currentTemp
 * @property {number} targetTemp
 * @property {number} currentMode - 0=OFF, 1=HEAT, 2=COOL
 * @property {number} targetMode - 0=OFF, 1=HEAT, 2=COOL, 3=AUTO
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// Mode constants
const MODE_OFF = 0;
const MODE_HEAT = 1;
const MODE_COOL = 2;
const MODE_AUTO = 3;

// Mode colors
const MODE_COLORS = {
  off: COLORS.gray,
  heat: '#FF5722',
  cool: '#2196F3',
  auto: '#4CAF50',
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get color for mode
 * @param {number} mode
 * @returns {string}
 */
function getModeColor(mode) {
  switch (mode) {
    case MODE_HEAT:
      return MODE_COLORS.heat;
    case MODE_COOL:
      return MODE_COLORS.cool;
    case MODE_AUTO:
      return MODE_COLORS.auto;
    default:
      return MODE_COLORS.off;
  }
}

/**
 * Get mode name
 * @param {number} mode
 * @returns {string}
 */
function getModeName(mode) {
  switch (mode) {
    case MODE_HEAT:
      return 'Heat';
    case MODE_COOL:
      return 'Cool';
    case MODE_AUTO:
      return 'Auto';
    default:
      return 'Off';
  }
}

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw thermometer icon
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {number} [fillLevel] - Fill level 0-1
 * @returns {void}
 */
function drawThermometerIcon(ctx, x, y, size, color, fillLevel = 0.5) {
  const tubeWidth = size * 0.15;
  const tubeHeight = size * 0.45;
  const bulbRadius = size * 0.15;

  // Tube outline
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - tubeWidth / 2, y - tubeHeight / 2);
  ctx.lineTo(x - tubeWidth / 2, y + tubeHeight / 2 - bulbRadius);
  ctx.arc(x, y + tubeHeight / 2, bulbRadius, Math.PI, 0, true);
  ctx.lineTo(x + tubeWidth / 2, y - tubeHeight / 2);
  ctx.arc(x, y - tubeHeight / 2, tubeWidth / 2, 0, Math.PI, true);
  ctx.stroke();

  // Fill (bulb + tube based on level)
  const fillHeight = tubeHeight * fillLevel;
  ctx.fillStyle = color;

  // Bulb fill
  ctx.beginPath();
  ctx.arc(x, y + tubeHeight / 2, bulbRadius - 2, 0, Math.PI * 2);
  ctx.fill();

  // Tube fill
  if (fillLevel > 0) {
    const fillTop = y + tubeHeight / 2 - bulbRadius - fillHeight + bulbRadius;
    ctx.fillRect(x - tubeWidth / 2 + 3, fillTop, tubeWidth - 6, fillHeight - 2);
  }
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render thermostat state to button image
 * @param {ThermostatSettings} settings
 * @param {ThermostatState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();
  const currentTemp = state.currentTemp ?? 0;
  const targetTemp = state.targetTemp ?? 0;
  const mode = state.currentMode ?? 0;
  const modeColor = getModeColor(mode);

  // Thermometer icon (small, top-left area)
  const fillLevel = Math.min(1, Math.max(0, (currentTemp - 10) / 30));
  drawThermometerIcon(ctx, 30, 45, 50, modeColor, fillLevel);

  // Target temperature (large, right side)
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${targetTemp.toFixed(1)}°`, CANVAS_CENTER + 20, 55);

  // Current temperature and mode (smaller, below)
  ctx.fillStyle = modeColor;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${currentTemp.toFixed(1)}° ${getModeName(mode)}`, CANVAS_CENTER, 85);

  // Name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  let displayName = name;
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Status bar
  drawStatusBar(ctx, modeColor);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const thermostatAction = new BaseAction({
  actionType: THERMOSTAT_ACTION,
  deviceTypeName: 'Thermostat',
  drawIcon: (ctx, x, y, size, color) => drawThermometerIcon(ctx, x, y, size, color, 0.5),
  initialState: { currentTemp: 0, targetTemp: 0, currentMode: 0, targetMode: 0 },

  findService: (accessory) => SprutHub.findThermostatService(accessory),

  extractState: (_accessory, service, _settings) => {
    const currentTempChar = SprutHub.findCurrentTempCharacteristic(service);
    const targetTempChar = SprutHub.findTargetTempCharacteristic(service);
    const currentModeChar = SprutHub.findHeatingCoolingCurrentCharacteristic(service);
    const targetModeChar = SprutHub.findHeatingCoolingTargetCharacteristic(service);

    return {
      currentTemp: Number(SprutHub.extractValue(currentTempChar?.control?.value)) || 0,
      targetTemp: Number(SprutHub.extractValue(targetTempChar?.control?.value)) || 0,
      currentMode: Number(SprutHub.extractValue(currentModeChar?.control?.value)) || 0,
      targetMode: Number(SprutHub.extractValue(targetModeChar?.control?.value)) || 0,
    };
  },

  renderState,

  handleStateChange: (state, settings, characteristicId, value) => {
    const newState = { ...state };
    if (settings.currentTempCharId === characteristicId) {
      newState.currentTemp = Number(value) || 0;
    } else if (settings.targetTempCharId === characteristicId) {
      newState.targetTemp = Number(value) || 0;
    } else if (settings.currentModeCharId === characteristicId) {
      newState.currentMode = Number(value) || 0;
    } else if (settings.targetModeCharId === characteristicId) {
      newState.targetMode = Number(value) || 0;
    }
    return newState;
  },

  handleKeyUp: async (client, settings, currentState) => {
    const { accessoryId, serviceId, targetTempCharId, targetModeCharId, action, tempStep } =
      settings;
    if (accessoryId == null || serviceId == null) return null;
    const step = tempStep || 0.5;
    const currentTargetTemp = currentState.targetTemp ?? 0;

    if (action === 'tempUp' && targetTempCharId != null) {
      const newTemp = currentTargetTemp + step;
      await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);
      return { ...currentState, targetTemp: newTemp };
    } else if (action === 'tempDown' && targetTempCharId != null) {
      const newTemp = currentTargetTemp - step;
      await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);
      return { ...currentState, targetTemp: newTemp };
    } else if (action === 'toggleMode' && targetModeCharId != null) {
      const modes = [MODE_OFF, MODE_HEAT, MODE_COOL, MODE_AUTO];
      const currentIndex = modes.indexOf(currentState.targetMode ?? 0);
      const nextIndex = (currentIndex + 1) % modes.length;
      const newMode = modes[nextIndex];
      await client.updateCharacteristic(accessoryId, serviceId, targetModeCharId, newMode);
      return { ...currentState, targetMode: newMode, currentMode: newMode };
    } else if (targetTempCharId != null) {
      // Default: increase temperature
      const newTemp = currentTargetTemp + step;
      await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);
      return { ...currentState, targetTemp: newTemp };
    }

    return null;
  },

  /**
   * Preview dial rotation (UI only, no API call)
   * @param {ThermostatSettings} settings
   * @param {ThermostatState} currentState
   * @param {{ticks: number}} payload
   * @returns {ThermostatState|null}
   */
  previewDialRotate: (settings, currentState, payload) => {
    const { tempStep } = settings;
    const step = tempStep || 0.5;
    const delta = payload.ticks > 0 ? step : -step;
    const newTemp = (currentState.targetTemp ?? 0) + delta;
    return { ...currentState, targetTemp: newTemp };
  },

  /**
   * Handle dial rotation for temperature control (sends to hub)
   * State is already updated by previewDialRotate, just send to hub
   * @param {import('../lib/spruthub').SprutHub} client
   * @param {ThermostatSettings} settings
   * @param {ThermostatState} currentState
   * @param {{ticks: number}} _payload
   * @returns {Promise<ThermostatState|null>}
   */
  handleDialRotate: async (client, settings, currentState, _payload) => {
    const { accessoryId, serviceId, targetTempCharId } = settings;
    if (accessoryId == null || serviceId == null || targetTempCharId == null) return null;

    // State already updated by preview, just send current value to hub
    const targetTemp = currentState.targetTemp ?? 0;

    await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, targetTemp);

    return currentState;
  },

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    currentTempCharId:
      typeof payload.currentTempCharId === 'number' ? payload.currentTempCharId : undefined,
    targetTempCharId:
      typeof payload.targetTempCharId === 'number' ? payload.targetTempCharId : undefined,
    currentModeCharId:
      typeof payload.currentModeCharId === 'number' ? payload.currentModeCharId : undefined,
    targetModeCharId:
      typeof payload.targetModeCharId === 'number' ? payload.targetModeCharId : undefined,
    tempStep: typeof payload.tempStep === 'number' ? payload.tempStep : undefined,
  }),
});

// ============================================================
// Exports
// ============================================================

module.exports = thermostatAction.getExports();
