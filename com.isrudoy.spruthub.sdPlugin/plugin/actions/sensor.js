/**
 * Sensor Action for Sprut.Hub Plugin
 * Supports: Temperature, Humidity, Motion, Contact sensors
 * @module actions/sensor
 */

const { createCanvas } = require('canvas');
const { log, SENSOR_ACTION, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
const { contexts, setContext, getContext, deleteContext, stopTimer } = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const {
  SprutHubClient,
  getClient,
  disconnectClient,
  getCurrentClient,
} = require('../lib/spruthub');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').AppearPayload} AppearPayload
 * @typedef {import('../../../types/streamdock').KeyPayload} KeyPayload
 * @typedef {import('../../../types/streamdock').SettingsPayload} SettingsPayload
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 */

/**
 * @typedef {'temperature'|'humidity'|'motion'|'contact'} SensorType
 */

/**
 * @typedef {Object} SensorSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected sensor accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual sensor service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [characteristicId] - Value characteristic ID (cId)
 * @property {SensorType} [sensorType] - Type of sensor
 * @property {string} [customName] - Custom display name
 */

/**
 * @typedef {Object} SensorState
 * @property {number|boolean} value - Sensor value
 * @property {SensorType} [sensorType] - Type of sensor
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 */

// Sensor colors
const SENSOR_COLORS = {
  temperature: '#00BCD4', // Cyan - neutral, not alarming
  humidity: '#2196F3', // Blue
  motion: '#4CAF50', // Green (detected) / gray (clear)
  contact: '#FF9800', // Orange (open) / green (closed)
};

// ============================================================
// State Listener
// ============================================================

/** @type {boolean} */
let stateListenerSetup = false;

/** @type {import('../lib/spruthub').SprutHubClient|null} */
let listenerClient = null;

/**
 * Setup state change listener
 * @returns {void}
 */
function setupStateListener() {
  const client = getCurrentClient();
  if (!client) return;

  if (listenerClient !== client) {
    stateListenerSetup = false;
    listenerClient = client;
  }

  if (stateListenerSetup) return;

  client.on('stateChange', (change) => {
    const { accessoryId, characteristicId, value } =
      /** @type {import('../lib/spruthub').StateChange} */ (change);

    const actualValue = SprutHubClient.extractValue(value);

    Object.entries(contexts).forEach(([context, data]) => {
      // Only process sensor action contexts
      if (data.action !== SENSOR_ACTION) return;

      /** @type {SensorSettings} */
      const settings = /** @type {SensorSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId && settings.characteristicId === characteristicId) {
        if (!data.state) {
          data.state = { value: 0, sensorType: settings.sensorType };
        }

        // Update value based on sensor type
        if (settings.sensorType === 'motion' || settings.sensorType === 'contact') {
          data.state.value = Boolean(actualValue) || Number(actualValue) === 1;
        } else {
          data.state.value = Number(actualValue) || 0;
        }

        updateButton(context, settings, /** @type {SensorState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw temperature icon (thermometer)
 * @param {import('canvas').CanvasRenderingContext2D} ctx
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
 * @param {import('canvas').CanvasRenderingContext2D} ctx
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
 * Draw motion icon (person silhouette with motion lines)
 * @param {import('canvas').CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} detected
 * @returns {void}
 */
function drawMotionIcon(ctx, x, y, size, color, detected) {
  // Head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.15, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';

  // Torso
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.05);
  ctx.lineTo(x, y + size * 0.1);
  ctx.stroke();

  // Arms
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, y);
  ctx.lineTo(x + size * 0.12, y);
  ctx.stroke();

  // Legs
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
 * @param {import('canvas').CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} isOpen
 * @returns {void}
 */
function drawContactIcon(ctx, x, y, size, color, isOpen) {
  const width = size * 0.3;
  const height = size * 0.45;

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  if (isOpen) {
    // Open door (angled)
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y - height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.lineTo(x, y + height / 2 - height * 0.1);
    ctx.lineTo(x, y - height / 2 + height * 0.1);
    ctx.closePath();
    ctx.stroke();

    // Door handle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - width * 0.1, y, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Closed door
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    // Door handle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + width / 4, y, size * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
}

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

/**
 * Get color for sensor state (unused for now, all white)
 * @param {SensorType} sensorType
 * @param {number|boolean} value
 * @returns {string}
 */
function _getSensorColor(sensorType, value) {
  switch (sensorType) {
    case 'temperature':
      return SENSOR_COLORS.temperature;
    case 'humidity':
      return SENSOR_COLORS.humidity;
    case 'motion':
      return value ? '#4CAF50' : COLORS.gray;
    case 'contact':
      return value ? '#FF9800' : '#4CAF50';
    default:
      return COLORS.gray;
  }
}

/**
 * Draw sensor button
 * @param {string} name - Sensor name
 * @param {SensorType} sensorType - Sensor type
 * @param {number|boolean} value - Sensor value
 * @returns {string} Base64 PNG data URL
 */
function drawSensor(name, sensorType, value) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // All sensor colors are white for now
  const color = COLORS.white;

  // Draw icon based on sensor type
  switch (sensorType) {
    case 'temperature':
      drawTemperatureIcon(ctx, CANVAS_CENTER, 45, 70, color);
      break;
    case 'humidity':
      drawHumidityIcon(ctx, CANVAS_CENTER, 45, 70, color);
      break;
    case 'motion':
      drawMotionIcon(ctx, CANVAS_CENTER, 50, 70, color, Boolean(value));
      break;
    case 'contact':
      drawContactIcon(ctx, CANVAS_CENTER, 45, 70, color, Boolean(value));
      break;
  }

  // Value
  ctx.fillStyle = color;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(getValueText(sensorType, value), CANVAS_CENTER, 105);

  // Name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  let displayName = name || 'Sensor';
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, 130);

  // No status bar for sensors

  return canvas.toDataURL('image/png');
}

/**
 * Draw sensor button - Error state
 * @param {string} message - Error message
 * @returns {string} Base64 PNG data URL
 */
function drawError(message) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#3d1a1a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = COLORS.red;
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', CANVAS_CENTER, 65);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 14px sans-serif';
  let displayMessage = message || 'Error';
  if (displayMessage.length > 14) {
    displayMessage = displayMessage.substring(0, 13) + '…';
  }
  ctx.fillText(displayMessage, CANVAS_CENTER, 100);

  ctx.fillStyle = COLORS.red;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw sensor button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawTemperatureIcon(ctx, CANVAS_CENTER, 50, 60, COLORS.yellow);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw sensor button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawTemperatureIcon(ctx, CANVAS_CENTER, 45, 50, COLORS.gray);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Setup', CANVAS_CENTER, 110);

  ctx.fillStyle = COLORS.gray;
  ctx.font = '14px sans-serif';
  ctx.fillText('Open settings', CANVAS_CENTER, 130);

  return canvas.toDataURL('image/png');
}

/**
 * Draw sensor button - Offline state
 * @param {string} name - Sensor name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawTemperatureIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable);

  // Name
  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Sensor';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Offline status
  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Offline', CANVAS_CENTER, LAYOUT.brightnessY);

  // Status bar
  ctx.fillStyle = COLORS.unavailable;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Button Update
// ============================================================

/**
 * Get display name for button
 * @param {SensorSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Sensor';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {SensorSettings} settings - Sensor settings
 * @param {SensorState} [state] - Current state
 * @returns {void}
 */
function updateButton(context, settings, state) {
  let imageData;

  if (state?.error) {
    imageData = drawError(state.error);
  } else if (state?.connecting) {
    imageData = drawConnecting();
  } else if (state?.offline) {
    imageData = drawOffline(getDisplayName(settings));
  } else if (!settings.host || !settings.token || !settings.serial || !settings.accessoryId) {
    imageData = drawNotConfigured();
  } else {
    const sensorType = settings.sensorType || state?.sensorType || 'temperature';
    imageData = drawSensor(getDisplayName(settings), sensorType, state?.value ?? 0);
  }

  setImage(context, imageData);
}

// ============================================================
// Sensor State Fetch
// ============================================================

/**
 * Fetch current sensor state from hub
 * @param {SensorSettings} settings - Sensor settings
 * @returns {Promise<SensorState>}
 */
async function fetchSensorState(settings) {
  const { host, token, serial, accessoryId, serviceId, sensorType } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { value: 0, sensorType: sensorType || 'temperature', error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return {
        value: 0,
        sensorType: sensorType || 'temperature',
        error: 'Missing connection parameters',
      };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { value: 0, sensorType: sensorType || 'temperature', error: 'Sensor not found' };
    }

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findSensorService(accessory);

    if (!service) {
      return { value: 0, sensorType: sensorType || 'temperature', error: 'No sensor service' };
    }

    // Check offline status
    const isOffline = SprutHubClient.isAccessoryOffline(accessory);

    // Determine sensor type from service if not specified
    const detectedType = SprutHubClient.getSensorType(service) || sensorType || 'temperature';

    // Get characteristic based on sensor type
    let valueChar;
    switch (detectedType) {
      case 'temperature':
        valueChar = SprutHubClient.findCurrentTempCharacteristic(service);
        break;
      case 'humidity':
        valueChar = SprutHubClient.findCurrentHumidityCharacteristic(service);
        break;
      case 'motion':
        valueChar = SprutHubClient.findMotionDetectedCharacteristic(service);
        break;
      case 'contact':
        valueChar = SprutHubClient.findContactStateCharacteristic(service);
        break;
    }

    const rawValue = SprutHubClient.extractValue(valueChar?.control?.value);
    const value =
      detectedType === 'motion' || detectedType === 'contact'
        ? Boolean(rawValue) || Number(rawValue) === 1
        : Number(rawValue) || 0;

    return {
      value,
      sensorType: detectedType,
      offline: isOffline,
    };
  } catch (err) {
    log('[Sensor] Error fetching state:', err);
    return {
      value: 0,
      sensorType: sensorType || 'temperature',
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================================
// Action Handlers
// ============================================================

/**
 * Handle willAppear event
 * @param {string} context - Action context
 * @param {AppearPayload} payload - Event payload
 * @returns {void}
 */
function onWillAppear(context, payload) {
  /** @type {SensorSettings} */
  const settings = /** @type {SensorSettings} */ (payload?.settings || {});
  setContext(context, {
    settings,
    action: SENSOR_ACTION,
    state: { value: 0, sensorType: settings.sensorType || 'temperature', connecting: true },
  });

  updateButton(context, settings, {
    value: 0,
    sensorType: settings.sensorType || 'temperature',
    connecting: true,
  });

  fetchSensorState(settings).then((state) => {
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = state;
      updateButton(context, settings, state);
    }
  });
}

/**
 * Handle willDisappear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onWillDisappear(context) {
  stopTimer(context);
  deleteContext(context);

  if (Object.keys(contexts).length === 0) {
    disconnectClient();
    stateListenerSetup = false;
    listenerClient = null;
  }
}

/**
 * Handle keyUp event - Refresh sensor
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {SensorSettings} */
  const settings = /** @type {SensorSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );

  // Sensors are read-only, keyUp just refreshes the state
  log('[Sensor] Refreshing sensor state');

  const ctx = getContext(context);
  if (ctx) {
    updateButton(context, settings, {
      value: 0,
      sensorType: settings.sensorType || 'temperature',
      connecting: true,
    });
  }

  const state = await fetchSensorState(settings);
  if (ctx) {
    ctx.state = state;
    updateButton(context, settings, state);
  }
}

/**
 * Handle sendToPlugin event from PI
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {boolean} - Whether event was handled
 */
function onSendToPlugin(context, payload) {
  if (!payload) {
    return false;
  }

  const host = typeof payload.host === 'string' ? payload.host : '';
  const token = typeof payload.token === 'string' ? payload.token : '';
  const serial = typeof payload.serial === 'string' ? payload.serial : '';

  if (payload.event) {
    switch (payload.event) {
      case 'testConnection':
        handleTestConnection(host, token, serial);
        return true;

      case 'getDevices':
        handleGetDevices(host, token, serial);
        return true;
    }
  }

  if (payload.accessoryId && payload.serviceId) {
    handleSettingsFromPI(context, payload);
    return true;
  }

  return false;
}

/**
 * Handle settings update from PI
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - Settings from PI
 * @returns {void}
 */
function handleSettingsFromPI(context, payload) {
  /** @type {SensorSettings} */
  const settings = {
    host: typeof payload.host === 'string' ? payload.host : undefined,
    token: typeof payload.token === 'string' ? payload.token : undefined,
    serial: typeof payload.serial === 'string' ? payload.serial : undefined,
    accessoryId: typeof payload.accessoryId === 'number' ? payload.accessoryId : undefined,
    accessoryName: typeof payload.accessoryName === 'string' ? payload.accessoryName : undefined,
    serviceId: typeof payload.serviceId === 'number' ? payload.serviceId : undefined,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : undefined,
    characteristicId:
      typeof payload.characteristicId === 'number' ? payload.characteristicId : undefined,
    sensorType: /** @type {SensorType|undefined} */ (
      typeof payload.sensorType === 'string' ? payload.sensorType : undefined
    ),
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
  };

  log('[Sensor] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {SensorSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, {
      settings,
      state: { value: 0, sensorType: settings.sensorType || 'temperature' },
    });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {SensorState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, {
    value: 0,
    sensorType: settings.sensorType || 'temperature',
    connecting: true,
  });

  fetchSensorState(settings).then((state) => {
    const c = getContext(context);
    if (c) {
      c.state = state;
      updateButton(context, settings, state);
    }
  });
}

/**
 * Handle test connection request from PI
 * @param {string} host
 * @param {string} token
 * @param {string} serial
 * @returns {Promise<void>}
 */
async function handleTestConnection(host, token, serial) {
  log('[Sensor] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      sendToPropertyInspector({
        event: 'testResult',
        success: false,
        error: 'Missing connection parameters',
      });
      return;
    }

    await client.waitForConnection();

    const [rooms, accessories] = await Promise.all([client.getRooms(), client.getAccessories()]);

    log('[Sensor] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasSensor = SprutHubClient.findSensorService(a) !== undefined;
      if (hasSensor) {
        log('[Sensor] Found sensor:', a.name, a.id);
      }
      return hasSensor;
    });

    log('[Sensor] Filtered sensors:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Sensor] Sent testResult to PI');
  } catch (err) {
    log('[Sensor] testConnection error:', err);
    sendToPropertyInspector({
      event: 'testResult',
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Handle get devices request from PI
 * @param {string} host
 * @param {string} token
 * @param {string} serial
 * @returns {Promise<void>}
 */
async function handleGetDevices(host, token, serial) {
  log('[Sensor] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      sendToPropertyInspector({
        event: 'error',
        message: 'Missing connection parameters',
      });
      return;
    }

    await client.waitForConnection();

    const [rooms, accessories] = await Promise.all([client.getRooms(), client.getAccessories()]);

    const devices = accessories.filter((a) => SprutHubClient.findSensorService(a) !== undefined);

    log('[Sensor] handleGetDevices: found', rooms.length, 'rooms,', devices.length, 'sensors');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Sensor] Sent deviceList to PI');
  } catch (err) {
    sendToPropertyInspector({
      event: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Handle settings update
 * @param {string} context - Action context
 * @param {SensorSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {SensorSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {SensorState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, {
    value: 0,
    sensorType: settings.sensorType || 'temperature',
    connecting: true,
  });

  fetchSensorState(settings).then((state) => {
    const c = getContext(context);
    if (c) {
      c.state = state;
      updateButton(context, settings, state);
    }
  });
}

/**
 * Handle didReceiveSettings event
 * @param {string} context - Action context
 * @param {SettingsPayload} payload - Settings payload
 * @returns {void}
 */
function onDidReceiveSettings(context, payload) {
  /** @type {SensorSettings} */
  const settings = /** @type {SensorSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {SensorSettings} */
  const settings = /** @type {SensorSettings} */ (ctx?.settings || {});

  if (settings.host && settings.token && settings.serial) {
    handleGetDevices(settings.host, settings.token, settings.serial);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  onWillAppear,
  onWillDisappear,
  onKeyUp,
  onSendToPlugin,
  onSettingsUpdate,
  onDidReceiveSettings,
  onPropertyInspectorDidAppear,
};
