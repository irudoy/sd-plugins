/**
 * Light Action for Sprut.Hub Plugin
 * @module actions/light
 */

const { createCanvas } = require('canvas');
const { log, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
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
 * @typedef {Object} LightSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected light accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual lightbulb service ID (sId)
 * @property {string} [serviceName] - Service display name (for multi-bulb accessories)
 * @property {number} [characteristicId] - Actual On characteristic ID (cId)
 * @property {string} [customName] - Custom display name (overrides auto name)
 * @property {string} [action] - toggle | on | off
 */

/**
 * @typedef {Object} LightState
 * @property {boolean} on - Whether light is on
 * @property {number} [brightness] - Brightness level (0-100)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 */

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

  // Reset if client changed (reconnected with different settings)
  if (listenerClient !== client) {
    stateListenerSetup = false;
    listenerClient = client;
  }

  if (stateListenerSetup) return;

  client.on('stateChange', (change) => {
    const { accessoryId, characteristicId, value } =
      /** @type {import('../lib/spruthub').StateChange} */ (change);

    // Extract actual value from wrapper
    const actualValue = SprutHubClient.extractValue(value);

    // Find all buttons with this accessoryId
    Object.entries(contexts).forEach(([context, data]) => {
      /** @type {LightSettings} */
      const settings = /** @type {LightSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId) {
        // Update state based on characteristic
        if (!data.state) {
          data.state = { on: false };
        }

        // Match by stored characteristicId (On) or by type constants
        if (
          settings.characteristicId === characteristicId ||
          characteristicId === SprutHubClient.CHAR_ON
        ) {
          data.state.on = Boolean(actualValue);
        } else if (characteristicId === SprutHubClient.CHAR_BRIGHTNESS) {
          data.state.brightness = Number(actualValue);
        }

        // Update button
        updateButton(context, settings, /** @type {LightState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw lightbulb icon
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
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

/**
 * Draw light button - On state
 * @param {string} name - Light name
 * @param {number} [brightness] - Brightness level
 * @returns {string} Base64 PNG data URL
 */
function drawLightOn(name, brightness) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Lightbulb icon (warm yellow)
  drawLightbulb(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow);

  // Name (bottom)
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Light';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Brightness (if available)
  if (brightness !== undefined) {
    ctx.fillStyle = COLORS.warmYellow;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(brightness + '%', CANVAS_CENTER, LAYOUT.brightnessY);
  }

  // Status indicator line at bottom
  ctx.fillStyle = COLORS.warmYellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw light button - Off state
 * @param {string} name - Light name
 * @returns {string} Base64 PNG data URL
 */
function drawLightOff(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Lightbulb icon (gray)
  drawLightbulb(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.gray);

  // Name (bottom)
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Light';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameYOff);

  // Status indicator line at bottom
  ctx.fillStyle = '#444444';
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw light button - Error state
 * @param {string} message - Error message
 * @returns {string} Base64 PNG data URL
 */
function drawError(message) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Dark red background
  ctx.fillStyle = '#3d1a1a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Error icon (!)
  ctx.fillStyle = COLORS.red;
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('!', CANVAS_CENTER, 65);

  // Error message
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 14px sans-serif';
  let displayMessage = message || 'Error';
  if (displayMessage.length > 14) {
    displayMessage = displayMessage.substring(0, 13) + '…';
  }
  ctx.fillText(displayMessage, CANVAS_CENTER, 100);

  // Status indicator line at bottom
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw light button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Lightbulb icon (yellow)
  drawLightbulb(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.yellow);

  // "Connecting..." text
  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  // Status indicator line at bottom
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw light button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Dark blue background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Lightbulb icon (gray)
  drawLightbulb(ctx, CANVAS_CENTER, 50, LAYOUT.bulbSizeSmall, COLORS.gray);

  // "Setup" text
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Setup', CANVAS_CENTER, 110);

  // Subtitle
  ctx.fillStyle = COLORS.gray;
  ctx.font = '14px sans-serif';
  ctx.fillText('Open settings', CANVAS_CENTER, 130);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Button Update
// ============================================================

/**
 * Get display name for button
 * Priority: customName > serviceName (if different) > accessoryName
 * @param {LightSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  // Custom name has highest priority
  if (settings.customName) {
    return settings.customName;
  }
  // If serviceName exists and is different from accessoryName, use it
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Light';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {LightSettings} settings - Light settings
 * @param {LightState} [state] - Current state
 * @returns {void}
 */
function updateButton(context, settings, state) {
  let imageData;

  if (state?.error) {
    imageData = drawError(state.error);
  } else if (state?.connecting) {
    imageData = drawConnecting();
  } else if (!settings.host || !settings.token || !settings.serial || !settings.accessoryId) {
    imageData = drawNotConfigured();
  } else if (state?.on) {
    imageData = drawLightOn(getDisplayName(settings), state.brightness);
  } else {
    imageData = drawLightOff(getDisplayName(settings));
  }

  setImage(context, imageData);
}

// ============================================================
// Light State Fetch
// ============================================================

/**
 * Fetch current light state from hub
 * @param {LightSettings} settings - Light settings
 * @returns {Promise<LightState>}
 */
async function fetchLightState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { on: false, error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return { on: false, error: 'Missing connection parameters' };
    }

    // Use waitForConnection instead of manual event handling
    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { on: false, error: 'Light not found' };
    }

    // Find lightbulb service by stored serviceId or by type
    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findLightbulbService(accessory);

    if (!service) {
      return { on: false, error: 'No lightbulb service' };
    }

    // Get characteristics
    const onChar = SprutHubClient.findOnCharacteristic(service);
    const brightnessChar = SprutHubClient.findBrightnessCharacteristic(service);

    // Extract value from the nested structure (can be boolValue, doubleValue, etc.)
    const onValue = SprutHubClient.extractValue(onChar?.control?.value);
    const brightnessValue = SprutHubClient.extractValue(brightnessChar?.control?.value);

    return {
      on: Boolean(onValue),
      brightness: brightnessValue !== undefined ? Number(brightnessValue) : undefined,
    };
  } catch (err) {
    log('[Light] Error fetching state:', err);
    return { on: false, error: err instanceof Error ? err.message : 'Unknown error' };
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
  /** @type {LightSettings} */
  const settings = /** @type {LightSettings} */ (payload?.settings || {});
  setContext(context, { settings, state: { on: false, connecting: true } });

  // Show connecting state
  updateButton(context, settings, { on: false, connecting: true });

  // Fetch initial state
  fetchLightState(settings).then((state) => {
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

  // Disconnect if no more contexts
  if (Object.keys(contexts).length === 0) {
    disconnectClient();
    stateListenerSetup = false;
    listenerClient = null;
  }
}

/**
 * Handle keyUp event - Toggle light
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {LightSettings} */
  const settings = /** @type {LightSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { host, token, serial, accessoryId, serviceId, characteristicId, action } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Light] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !characteristicId) {
    log('[Light] onKeyUp: missing serviceId or characteristicId - please reconfigure the light');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Light] onKeyUp: client not connected');
      return;
    }

    const ctx = getContext(context);
    /** @type {LightState} */
    const currentState = /** @type {LightState} */ (ctx?.state || { on: false });

    // Determine new state based on action
    let newValue;
    if (action === 'on') {
      newValue = true;
    } else if (action === 'off') {
      newValue = false;
    } else {
      // toggle (default)
      newValue = !currentState.on;
    }

    log('[Light] Toggling light:', { accessoryId, serviceId, characteristicId, newValue });

    // Update characteristic using stored IDs
    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

    // Optimistic update
    if (ctx) {
      ctx.state = { ...currentState, on: newValue };
      updateButton(context, settings, /** @type {LightState} */ (ctx.state));
    }
  } catch (err) {
    log('[Light] Error toggling:', err);
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

  // Handle specific events
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

  // Handle settings update from PI (when light is selected)
  if (payload.accessoryId && payload.serviceId && payload.characteristicId) {
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
  /** @type {LightSettings} */
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
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
  };

  log('[Light] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {LightSettings|undefined} */ (ctx?.settings);

  // Check if device actually changed
  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  // Update context
  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, { settings, state: { on: false } });
  }

  // If device didn't change and we have state, just update button with existing state
  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {LightState} */ (ctx.state));
    return;
  }

  // Device changed or no state yet - fetch new state
  updateButton(context, settings, { on: false, connecting: true });

  fetchLightState(settings).then((state) => {
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
  log('[Light] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Light] Got rooms:', rooms.length, 'accessories:', accessories.length);

    // Filter lightbulb accessories
    const lights = accessories.filter((a) => {
      const hasLightbulb = SprutHubClient.findLightbulbService(a) !== undefined;
      if (hasLightbulb) {
        log('[Light] Found lightbulb:', a.name, a.id);
      }
      return hasLightbulb;
    });

    log('[Light] Filtered lights:', lights.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      lights,
    });

    log('[Light] Sent testResult to PI');
  } catch (err) {
    log('[Light] testConnection error:', err);
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
  log('[Light] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    // Filter lightbulb accessories
    const lights = accessories.filter((a) => SprutHubClient.findLightbulbService(a) !== undefined);

    log('[Light] handleGetDevices: found', rooms.length, 'rooms,', lights.length, 'lights');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      lights,
    });

    log('[Light] Sent deviceList to PI');
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
 * @param {LightSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {LightSettings|undefined} */ (ctx?.settings);

  // Check if device actually changed
  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  // If device didn't change and we have state, just update button with existing state
  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {LightState} */ (ctx.state));
    return;
  }

  // Device changed or no state yet - fetch new state
  updateButton(context, settings, { on: false, connecting: true });

  fetchLightState(settings).then((state) => {
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
  /** @type {LightSettings} */
  const settings = /** @type {LightSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {LightSettings} */
  const settings = /** @type {LightSettings} */ (ctx?.settings || {});

  // If we have connection settings, send device list
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
