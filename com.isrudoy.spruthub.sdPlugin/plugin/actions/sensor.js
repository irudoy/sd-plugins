/**
 * Sensor Action for Sprut.Hub Plugin
 * Supports: Temperature, Humidity, Motion, Contact sensors
 * Uses BaseAction for common functionality
 * @module actions/sensor
 */

const { SENSOR_ACTION } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings } = require('../lib/base-action');
const { getContext } = require('../lib/state');
const {
  createButtonCanvas,
  createKnobCanvas,
  CANVAS_CENTER,
  KNOB_LAYOUT,
  COLORS,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('@napi-rs/canvas').SKRSContext2D} CanvasContext
 */

/**
 * @typedef {'temperature'|'humidity'|'motion'|'contact'} SensorType
 */

/**
 * @typedef {Object} SensorSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [characteristicId]
 * @property {SensorType} [sensorType]
 * @property {string} [customName]
 */

/**
 * @typedef {Object} SensorState
 * @property {number|boolean} value
 * @property {SensorType} [sensorType]
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// ============================================================
// Icon Drawing Functions
// ============================================================

/**
 * Draw temperature icon (thermometer)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @returns {void}
 */
function drawTemperatureIcon(ctx, x, y, size, color) {
  const tubeWidth = size * 0.12;
  const tubeHeight = size * 0.4;
  const bulbRadius = size * 0.12;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - tubeWidth / 2, y - tubeHeight / 2);
  ctx.lineTo(x - tubeWidth / 2, y + tubeHeight / 2 - bulbRadius);
  ctx.arc(x, y + tubeHeight / 2, bulbRadius, Math.PI, 0, true);
  ctx.lineTo(x + tubeWidth / 2, y - tubeHeight / 2);
  ctx.arc(x, y - tubeHeight / 2, tubeWidth / 2, 0, Math.PI, true);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y + tubeHeight / 2, bulbRadius - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - tubeWidth / 2 + 3, y, tubeWidth - 6, tubeHeight / 2 - bulbRadius);
}

/**
 * Draw humidity icon (water drop)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @returns {void}
 */
function drawHumidityIcon(ctx, x, y, size, color) {
  const dropSize = size * 0.4;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - dropSize / 2);
  ctx.quadraticCurveTo(x + dropSize / 2, y, x + dropSize / 3, y + dropSize / 3);
  ctx.quadraticCurveTo(x, y + dropSize / 2, x - dropSize / 3, y + dropSize / 3);
  ctx.quadraticCurveTo(x - dropSize / 2, y, x, y - dropSize / 2);
  ctx.fill();
}

/**
 * Draw motion icon (person silhouette)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [detected]
 * @returns {void}
 */
function drawMotionIcon(ctx, x, y, size, color, detected = false) {
  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.15, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.05);
  ctx.lineTo(x, y + size * 0.1);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y);
  ctx.lineTo(x + size * 0.12, y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.1);
  ctx.lineTo(x - size * 0.08, y + size * 0.22);
  ctx.moveTo(x, y + size * 0.1);
  ctx.lineTo(x + size * 0.08, y + size * 0.22);
  ctx.stroke();

  // Motion lines (if detected)
  if (detected) {
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const lineX = x + size * 0.2 + i * size * 0.06;
      ctx.beginPath();
      ctx.moveTo(lineX, y - size * 0.1);
      ctx.lineTo(lineX, y + size * 0.1);
      ctx.stroke();
    }
  }
}

/**
 * Draw contact icon (door)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [isOpen]
 * @returns {void}
 */
function drawContactIcon(ctx, x, y, size, color, isOpen = false) {
  const width = size * 0.3;
  const height = size * 0.45;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  if (isOpen) {
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y - height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.lineTo(x, y + height / 2 - height * 0.1);
    ctx.lineTo(x, y - height / 2 + height * 0.1);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - width * 0.1, y, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + width / 4, y, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw icon based on sensor type
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {SensorType} [sensorType]
 * @param {number|boolean} [value]
 * @returns {void}
 */
function drawSensorIcon(ctx, x, y, size, color, sensorType = 'temperature', value = 0) {
  switch (sensorType) {
    case 'humidity':
      drawHumidityIcon(ctx, x, y, size, color);
      break;
    case 'motion':
      drawMotionIcon(ctx, x, y, size, color, Boolean(value));
      break;
    case 'contact':
      drawContactIcon(ctx, x, y, size, color, Boolean(value));
      break;
    default:
      drawTemperatureIcon(ctx, x, y, size, color);
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get value display text
 * @param {SensorType} sensorType
 * @param {number|boolean} value
 * @returns {string}
 */
function getValueText(sensorType, value) {
  switch (sensorType) {
    case 'temperature':
      return `${Number(value).toFixed(1)}°C`;
    case 'humidity':
      return `${Number(value).toFixed(0)}%`;
    case 'motion':
      return value ? 'Detected' : 'Clear';
    case 'contact':
      return value ? 'Open' : 'Closed';
    default:
      return String(value);
  }
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render sensor state to button image
 * @param {SensorSettings} settings
 * @param {SensorState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();
  const sensorType = settings.sensorType || state.sensorType || 'temperature';
  const value = state.value ?? 0;

  // Draw icon based on sensor type
  drawSensorIcon(ctx, CANVAS_CENTER, 45, 70, COLORS.white, sensorType, value);

  // Value
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(getValueText(sensorType, value), CANVAS_CENTER, 105);

  // Name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  let displayName = name;
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, 130);

  // No status bar for sensors

  return canvas.toDataURL('image/png');
}

/**
 * Render sensor state to knob image (230x144, no status bar)
 * @param {SensorSettings} settings
 * @param {SensorState} state
 * @param {string} name
 * @returns {string}
 */
function renderKnobState(settings, state, name) {
  const { canvas, ctx } = createKnobCanvas();
  const sensorType = settings.sensorType || state.sensorType || 'temperature';
  const value = state.value ?? 0;

  // Draw icon on left side
  drawSensorIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY,
    KNOB_LAYOUT.iconSize,
    COLORS.white,
    sensorType,
    value
  );

  // Device name and value - vertically centered
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const displayName = name || 'Sensor';
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
  const totalHeight = (hasLine2 ? 2 : 1) * lineHeight + statusGap + 24;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  // Draw name
  ctx.fillText(line1, KNOB_LAYOUT.nameX, startY);
  if (hasLine2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, startY + lineHeight);
  }

  // Value text (larger)
  ctx.font = 'bold 24px sans-serif';
  const statusY = startY + (hasLine2 ? 2 : 1) * lineHeight + statusGap;
  ctx.fillText(getValueText(sensorType, value), KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const sensorAction = new BaseAction({
  actionType: SENSOR_ACTION,
  deviceTypeName: 'Sensor',
  drawIcon: (ctx, x, y, size, color) => drawTemperatureIcon(ctx, x, y, size, color),
  initialState: { value: 0, sensorType: 'temperature' },

  findService: (accessory) => SprutHub.findSensorService(accessory),

  extractState: (_accessory, service, settings) => {
    const sensorType = SprutHub.getSensorType(service) || settings.sensorType || 'temperature';

    let valueChar;
    switch (sensorType) {
      case 'temperature':
        valueChar = SprutHub.findCurrentTempCharacteristic(service);
        break;
      case 'humidity':
        valueChar = SprutHub.findCurrentHumidityCharacteristic(service);
        break;
      case 'motion':
        valueChar = SprutHub.findMotionDetectedCharacteristic(service);
        break;
      case 'contact':
        valueChar = SprutHub.findContactStateCharacteristic(service);
        break;
    }

    const rawValue = SprutHub.extractValue(valueChar?.control?.value);
    const value =
      sensorType === 'motion' || sensorType === 'contact'
        ? Boolean(rawValue) || Number(rawValue) === 1
        : Number(rawValue) || 0;

    return { value, sensorType };
  },

  renderState,
  renderKnobState,

  handleStateChange: (state, settings, characteristicId, value) => {
    if (settings.characteristicId === characteristicId) {
      const sensorType = settings.sensorType || state.sensorType || 'temperature';
      const newValue =
        sensorType === 'motion' || sensorType === 'contact'
          ? Boolean(value) || Number(value) === 1
          : Number(value) || 0;
      return { ...state, value: newValue };
    }
    return state;
  },

  // Sensors are read-only, keyUp just refreshes
  handleKeyUp: async () => {
    // Return null - the refresh is handled by the custom onKeyUp below
    return null;
  },

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    sensorType: typeof payload.sensorType === 'string' ? payload.sensorType : undefined,
  }),
});

// ============================================================
// Custom onKeyUp - Refresh sensor data
// ============================================================

/**
 * Custom keyUp handler that refreshes sensor data
 * @param {string} context - Action context
 * @param {import('../../../types/streamdock').KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {SensorSettings} */
  const settings = /** @type {SensorSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );

  // Show connecting state
  const ctx = getContext(context);
  if (ctx) {
    sensorAction.updateButton(context, settings, {
      value: 0,
      sensorType: settings.sensorType || 'temperature',
      connecting: true,
    });
  }

  // Fetch fresh state
  const state = await sensorAction.fetchState(settings);
  const c = getContext(context);
  if (c) {
    c.state = state;
    sensorAction.updateButton(context, settings, state);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  ...sensorAction.getExports(),
  onKeyUp, // Override with refresh behavior
};
