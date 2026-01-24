/**
 * Thermostat Action for Sprut.Hub Plugin
 * @module actions/thermostat
 */

const { createCanvas } = require('canvas');
const {
  log,
  THERMOSTAT_ACTION,
  CANVAS_SIZE,
  CANVAS_CENTER,
  LAYOUT,
  COLORS,
} = require('../lib/common');
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
 * @typedef {Object} ThermostatSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected thermostat accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual thermostat service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [currentTempCharId] - CurrentTemperature characteristic ID
 * @property {number} [targetTempCharId] - TargetTemperature characteristic ID
 * @property {number} [currentModeCharId] - CurrentHeatingCoolingState characteristic ID
 * @property {number} [targetModeCharId] - TargetHeatingCoolingState characteristic ID
 * @property {string} [customName] - Custom display name
 * @property {string} [action] - tempUp | tempDown | toggleMode
 * @property {number} [tempStep] - Temperature change step (default 0.5)
 */

/**
 * @typedef {Object} ThermostatState
 * @property {number} currentTemp - Current temperature
 * @property {number} targetTemp - Target temperature
 * @property {number} currentMode - Current heating/cooling mode (0=OFF, 1=HEAT, 2=COOL)
 * @property {number} targetMode - Target heating/cooling mode (0=OFF, 1=HEAT, 2=COOL, 3=AUTO)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 */

// Heating/Cooling modes
const MODE_OFF = 0;
const MODE_HEAT = 1;
const MODE_COOL = 2;
const MODE_AUTO = 3;

// Mode colors
const MODE_COLORS = {
  off: COLORS.gray,
  heat: '#FF5722', // Orange
  cool: '#2196F3', // Blue
  auto: '#4CAF50', // Green
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
      // Only process thermostat action contexts
      if (data.action !== THERMOSTAT_ACTION) return;

      /** @type {ThermostatSettings} */
      const settings = /** @type {ThermostatSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId) {
        if (!data.state) {
          data.state = { currentTemp: 0, targetTemp: 0, currentMode: 0, targetMode: 0 };
        }

        if (settings.currentTempCharId === characteristicId) {
          data.state.currentTemp = Number(actualValue) || 0;
        } else if (settings.targetTempCharId === characteristicId) {
          data.state.targetTemp = Number(actualValue) || 0;
        } else if (settings.currentModeCharId === characteristicId) {
          data.state.currentMode = Number(actualValue) || 0;
        } else if (settings.targetModeCharId === characteristicId) {
          data.state.targetMode = Number(actualValue) || 0;
        }

        updateButton(context, settings, /** @type {ThermostatState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
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

/**
 * Draw thermometer icon
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @param {number} fillLevel - Fill level 0-1
 * @returns {void}
 */
function drawThermometerIcon(ctx, x, y, size, color, fillLevel) {
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

/**
 * Draw thermostat button
 * @param {string} name - Thermostat name
 * @param {number} currentTemp - Current temperature
 * @param {number} targetTemp - Target temperature
 * @param {number} mode - Current mode
 * @returns {string} Base64 PNG data URL
 */
function drawThermostat(name, currentTemp, targetTemp, mode) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const modeColor = getModeColor(mode);

  // Thermometer icon (small, top-left area)
  const fillLevel = Math.min(1, Math.max(0, (currentTemp - 10) / 30)); // Normalize 10-40 range
  drawThermometerIcon(ctx, 30, 45, 50, modeColor, fillLevel);

  // Target temperature (large, right side) - what we're setting
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
  let displayName = name || 'Thermostat';
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Status bar
  ctx.fillStyle = modeColor;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw thermostat button - Error state
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
 * Draw thermostat button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawThermometerIcon(ctx, CANVAS_CENTER, 50, 60, COLORS.yellow, 0.5);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw thermostat button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawThermometerIcon(ctx, CANVAS_CENTER, 45, 50, COLORS.gray, 0.3);

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
 * Draw thermostat button - Offline state
 * @param {string} name - Thermostat name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawThermometerIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable, 0.3);

  // Name
  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Thermostat';
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
 * @param {ThermostatSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Thermostat';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {ThermostatSettings} settings - Thermostat settings
 * @param {ThermostatState} [state] - Current state
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
    imageData = drawThermostat(
      getDisplayName(settings),
      state?.currentTemp ?? 0,
      state?.targetTemp ?? 0,
      state?.currentMode ?? 0
    );
  }

  setImage(context, imageData);
}

// ============================================================
// Thermostat State Fetch
// ============================================================

/**
 * Fetch current thermostat state from hub
 * @param {ThermostatSettings} settings - Thermostat settings
 * @returns {Promise<ThermostatState>}
 */
async function fetchThermostatState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return {
      currentTemp: 0,
      targetTemp: 0,
      currentMode: 0,
      targetMode: 0,
      error: 'Not configured',
    };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return {
        currentTemp: 0,
        targetTemp: 0,
        currentMode: 0,
        targetMode: 0,
        error: 'Missing connection parameters',
      };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return {
        currentTemp: 0,
        targetTemp: 0,
        currentMode: 0,
        targetMode: 0,
        error: 'Thermostat not found',
      };
    }

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findThermostatService(accessory);

    if (!service) {
      return {
        currentTemp: 0,
        targetTemp: 0,
        currentMode: 0,
        targetMode: 0,
        error: 'No thermostat service',
      };
    }

    // Check offline status
    const isOffline = SprutHubClient.isAccessoryOffline(accessory);

    // Get characteristics
    const currentTempChar = SprutHubClient.findCurrentTempCharacteristic(service);
    const targetTempChar = SprutHubClient.findTargetTempCharacteristic(service);
    const currentModeChar = SprutHubClient.findHeatingCoolingCurrentCharacteristic(service);
    const targetModeChar = SprutHubClient.findHeatingCoolingTargetCharacteristic(service);

    return {
      currentTemp: Number(SprutHubClient.extractValue(currentTempChar?.control?.value)) || 0,
      targetTemp: Number(SprutHubClient.extractValue(targetTempChar?.control?.value)) || 0,
      currentMode: Number(SprutHubClient.extractValue(currentModeChar?.control?.value)) || 0,
      targetMode: Number(SprutHubClient.extractValue(targetModeChar?.control?.value)) || 0,
      offline: isOffline,
    };
  } catch (err) {
    log('[Thermostat] Error fetching state:', err);
    return {
      currentTemp: 0,
      targetTemp: 0,
      currentMode: 0,
      targetMode: 0,
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
  /** @type {ThermostatSettings} */
  const settings = /** @type {ThermostatSettings} */ (payload?.settings || {});
  setContext(context, {
    settings,
    action: THERMOSTAT_ACTION,
    state: { currentTemp: 0, targetTemp: 0, currentMode: 0, targetMode: 0, connecting: true },
  });

  updateButton(context, settings, {
    currentTemp: 0,
    targetTemp: 0,
    currentMode: 0,
    targetMode: 0,
    connecting: true,
  });

  fetchThermostatState(settings).then((state) => {
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
 * Handle keyUp event - Control thermostat
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {ThermostatSettings} */
  const settings = /** @type {ThermostatSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const {
    host,
    token,
    serial,
    accessoryId,
    serviceId,
    targetTempCharId,
    targetModeCharId,
    action,
    tempStep,
  } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Thermostat] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId) {
    log('[Thermostat] onKeyUp: missing serviceId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Thermostat] onKeyUp: client not connected');
      return;
    }

    const ctx = getContext(context);
    /** @type {ThermostatState} */
    const currentState = /** @type {ThermostatState} */ (
      ctx?.state || { currentTemp: 0, targetTemp: 20, currentMode: 0, targetMode: 0 }
    );

    const step = tempStep || 0.5;

    if (action === 'tempUp' && targetTempCharId) {
      const newTemp = currentState.targetTemp + step;
      log('[Thermostat] Increasing temperature to:', newTemp);
      await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);

      if (ctx) {
        ctx.state = { ...currentState, targetTemp: newTemp };
        updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
      }
    } else if (action === 'tempDown' && targetTempCharId) {
      const newTemp = currentState.targetTemp - step;
      log('[Thermostat] Decreasing temperature to:', newTemp);
      await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);

      if (ctx) {
        ctx.state = { ...currentState, targetTemp: newTemp };
        updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
      }
    } else if (action === 'toggleMode' && targetModeCharId) {
      // Cycle through modes: OFF -> HEAT -> COOL -> AUTO -> OFF
      const modes = [MODE_OFF, MODE_HEAT, MODE_COOL, MODE_AUTO];
      const currentIndex = modes.indexOf(currentState.targetMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const newMode = modes[nextIndex];
      log('[Thermostat] Setting mode to:', getModeName(newMode));
      await client.updateCharacteristic(accessoryId, serviceId, targetModeCharId, newMode);

      if (ctx) {
        ctx.state = { ...currentState, targetMode: newMode, currentMode: newMode };
        updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
      }
    } else {
      // Default: increase temperature
      if (targetTempCharId) {
        const newTemp = currentState.targetTemp + step;
        log('[Thermostat] Default action - increasing temperature to:', newTemp);
        await client.updateCharacteristic(accessoryId, serviceId, targetTempCharId, newTemp);

        if (ctx) {
          ctx.state = { ...currentState, targetTemp: newTemp };
          updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
        }
      }
    }
  } catch (err) {
    log('[Thermostat] Error controlling:', err);
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
  /** @type {ThermostatSettings} */
  const settings = {
    host: typeof payload.host === 'string' ? payload.host : undefined,
    token: typeof payload.token === 'string' ? payload.token : undefined,
    serial: typeof payload.serial === 'string' ? payload.serial : undefined,
    accessoryId: typeof payload.accessoryId === 'number' ? payload.accessoryId : undefined,
    accessoryName: typeof payload.accessoryName === 'string' ? payload.accessoryName : undefined,
    serviceId: typeof payload.serviceId === 'number' ? payload.serviceId : undefined,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : undefined,
    currentTempCharId:
      typeof payload.currentTempCharId === 'number' ? payload.currentTempCharId : undefined,
    targetTempCharId:
      typeof payload.targetTempCharId === 'number' ? payload.targetTempCharId : undefined,
    currentModeCharId:
      typeof payload.currentModeCharId === 'number' ? payload.currentModeCharId : undefined,
    targetModeCharId:
      typeof payload.targetModeCharId === 'number' ? payload.targetModeCharId : undefined,
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
    tempStep: typeof payload.tempStep === 'number' ? payload.tempStep : undefined,
  };

  log('[Thermostat] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {ThermostatSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, {
      settings,
      state: { currentTemp: 0, targetTemp: 0, currentMode: 0, targetMode: 0 },
    });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, {
    currentTemp: 0,
    targetTemp: 0,
    currentMode: 0,
    targetMode: 0,
    connecting: true,
  });

  fetchThermostatState(settings).then((state) => {
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
  log('[Thermostat] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Thermostat] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasThermostat = SprutHubClient.findThermostatService(a) !== undefined;
      if (hasThermostat) {
        log('[Thermostat] Found thermostat:', a.name, a.id);
      }
      return hasThermostat;
    });

    log('[Thermostat] Filtered thermostats:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Thermostat] Sent testResult to PI');
  } catch (err) {
    log('[Thermostat] testConnection error:', err);
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
  log('[Thermostat] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    const devices = accessories.filter(
      (a) => SprutHubClient.findThermostatService(a) !== undefined
    );

    log(
      '[Thermostat] handleGetDevices: found',
      rooms.length,
      'rooms,',
      devices.length,
      'thermostats'
    );

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Thermostat] Sent deviceList to PI');
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
 * @param {ThermostatSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {ThermostatSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {ThermostatState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, {
    currentTemp: 0,
    targetTemp: 0,
    currentMode: 0,
    targetMode: 0,
    connecting: true,
  });

  fetchThermostatState(settings).then((state) => {
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
  /** @type {ThermostatSettings} */
  const settings = /** @type {ThermostatSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {ThermostatSettings} */
  const settings = /** @type {ThermostatSettings} */ (ctx?.settings || {});

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
