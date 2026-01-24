/**
 * Outlet Action for Sprut.Hub Plugin
 * @module actions/outlet
 */

const { createCanvas } = require('canvas');
const { log, OUTLET_ACTION, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
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
 * @typedef {Object} OutletSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected outlet accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual outlet service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [characteristicId] - Actual On characteristic ID (cId)
 * @property {string} [customName] - Custom display name
 * @property {string} [action] - toggle | on | off
 */

/**
 * @typedef {Object} OutletState
 * @property {boolean} on - Whether outlet is on
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
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
      // Only process outlet action contexts
      if (data.action !== OUTLET_ACTION) return;

      /** @type {OutletSettings} */
      const settings = /** @type {OutletSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId) {
        if (!data.state) {
          data.state = { on: false };
        }

        if (
          settings.characteristicId === characteristicId ||
          characteristicId === SprutHubClient.CHAR_ON
        ) {
          data.state.on = Boolean(actualValue);
        }

        updateButton(context, settings, /** @type {OutletState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw outlet icon (power outlet shape)
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
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

/**
 * Draw outlet button - On state
 * @param {string} name - Outlet name
 * @returns {string} Base64 PNG data URL
 */
function drawOutletOn(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Outlet';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  ctx.fillStyle = COLORS.warmYellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('On', CANVAS_CENTER, LAYOUT.brightnessY);

  ctx.fillStyle = COLORS.warmYellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw outlet button - Off state
 * @param {string} name - Outlet name
 * @returns {string} Base64 PNG data URL
 */
function drawOutletOff(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.gray);

  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Outlet';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = '#444444';
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw outlet button - Error state
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
 * Draw outlet button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.yellow);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw outlet button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawOutletIcon(ctx, CANVAS_CENTER, 50, LAYOUT.bulbSizeSmall, COLORS.gray);

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
 * Draw outlet button - Offline state
 * @param {string} name - Outlet name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawOutletIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable);

  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Outlet';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Offline', CANVAS_CENTER, LAYOUT.brightnessY);

  ctx.fillStyle = COLORS.unavailable;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Button Update
// ============================================================

/**
 * Get display name for button
 * @param {OutletSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Outlet';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {OutletSettings} settings - Outlet settings
 * @param {OutletState} [state] - Current state
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
  } else if (state?.offline) {
    imageData = drawOffline(getDisplayName(settings));
  } else if (state?.on) {
    imageData = drawOutletOn(getDisplayName(settings));
  } else {
    imageData = drawOutletOff(getDisplayName(settings));
  }

  setImage(context, imageData);
}

// ============================================================
// Outlet State Fetch
// ============================================================

/**
 * Fetch current outlet state from hub
 * @param {OutletSettings} settings - Outlet settings
 * @returns {Promise<OutletState>}
 */
async function fetchOutletState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { on: false, error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return { on: false, error: 'Missing connection parameters' };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { on: false, error: 'Outlet not found' };
    }

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findOutletService(accessory);

    if (!service) {
      return { on: false, error: 'No outlet service' };
    }

    const isOffline = SprutHubClient.isAccessoryOffline(accessory);
    const onChar = SprutHubClient.findOnCharacteristic(service);
    const onValue = SprutHubClient.extractValue(onChar?.control?.value);

    return {
      on: Boolean(onValue),
      offline: isOffline,
    };
  } catch (err) {
    log('[Outlet] Error fetching state:', err);
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
  /** @type {OutletSettings} */
  const settings = /** @type {OutletSettings} */ (payload?.settings || {});
  setContext(context, { settings, action: OUTLET_ACTION, state: { on: false, connecting: true } });

  updateButton(context, settings, { on: false, connecting: true });

  fetchOutletState(settings).then((state) => {
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
 * Handle keyUp event - Toggle outlet
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {OutletSettings} */
  const settings = /** @type {OutletSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { host, token, serial, accessoryId, serviceId, characteristicId, action } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Outlet] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !characteristicId) {
    log('[Outlet] onKeyUp: missing serviceId or characteristicId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Outlet] onKeyUp: client not connected');
      return;
    }

    const ctx = getContext(context);
    /** @type {OutletState} */
    const currentState = /** @type {OutletState} */ (ctx?.state || { on: false });

    let newValue;
    if (action === 'on') {
      newValue = true;
    } else if (action === 'off') {
      newValue = false;
    } else {
      newValue = !currentState.on;
    }

    log('[Outlet] Toggling outlet:', { accessoryId, serviceId, characteristicId, newValue });

    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

    if (ctx) {
      ctx.state = { ...currentState, on: newValue };
      updateButton(context, settings, /** @type {OutletState} */ (ctx.state));
    }
  } catch (err) {
    log('[Outlet] Error toggling:', err);
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
  /** @type {OutletSettings} */
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

  log('[Outlet] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {OutletSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, { settings, state: { on: false } });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {OutletState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { on: false, connecting: true });

  fetchOutletState(settings).then((state) => {
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
  log('[Outlet] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Outlet] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasOutlet = SprutHubClient.findOutletService(a) !== undefined;
      if (hasOutlet) {
        log('[Outlet] Found outlet:', a.name, a.id);
      }
      return hasOutlet;
    });

    log('[Outlet] Filtered outlets:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Outlet] Sent testResult to PI');
  } catch (err) {
    log('[Outlet] testConnection error:', err);
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
  log('[Outlet] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    const devices = accessories.filter((a) => SprutHubClient.findOutletService(a) !== undefined);

    log('[Outlet] handleGetDevices: found', rooms.length, 'rooms,', devices.length, 'outlets');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Outlet] Sent deviceList to PI');
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
 * @param {OutletSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {OutletSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {OutletState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { on: false, connecting: true });

  fetchOutletState(settings).then((state) => {
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
  /** @type {OutletSettings} */
  const settings = /** @type {OutletSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {OutletSettings} */
  const settings = /** @type {OutletSettings} */ (ctx?.settings || {});

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
