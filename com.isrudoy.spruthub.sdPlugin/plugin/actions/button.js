/**
 * Button Action for Sprut.Hub Plugin
 * Controls StatelessProgrammableSwitch devices (doorbell buttons, Aqara buttons, etc.)
 * @module actions/button
 */

const { createCanvas } = require('canvas');
const { log, BUTTON_ACTION, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
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
 * @typedef {Object} ButtonSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected button accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual button service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [characteristicId] - ProgrammableSwitchEvent characteristic ID (cId)
 * @property {string} [customName] - Custom display name
 * @property {number} [pressType] - Press type: 0=single, 1=double, 2=long
 */

/**
 * @typedef {Object} ButtonState
 * @property {boolean} ready - Whether button is ready
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 * @property {boolean} [pressed] - Temporary pressed state for feedback
 */

// Press type constants
const PRESS_SINGLE = 0;
const PRESS_DOUBLE = 1;
const PRESS_LONG = 2;

// Press type names
/** @type {Record<number, string>} */
const PRESS_NAMES = {
  [PRESS_SINGLE]: 'Single',
  [PRESS_DOUBLE]: 'Double',
  [PRESS_LONG]: 'Long',
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

  // Buttons don't have state changes to listen to - they only send events
  // But we still set up the listener for connection monitoring
  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw button icon (circular button shape)
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @param {boolean} pressed - Whether button appears pressed
 * @returns {void}
 */
function drawButtonIcon(ctx, x, y, size, color, pressed) {
  const outerRadius = size * 0.35;
  const innerRadius = size * 0.25;

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle (filled when pressed)
  if (pressed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Draw button - Ready state
 * @param {string} name - Button name
 * @param {number} pressType - Press type for display
 * @returns {string} Base64 PNG data URL
 */
function drawButtonReady(name, pressType) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Button icon
  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.white, false);

  // Name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Button';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Press type
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 16px sans-serif';
  const pressName = PRESS_NAMES[pressType] || 'Single';
  ctx.fillText(pressName, CANVAS_CENTER, LAYOUT.brightnessY);

  // Status bar
  ctx.fillStyle = COLORS.gray;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw button - Pressed state (visual feedback)
 * @param {string} name - Button name
 * @param {number} pressType - Press type for display
 * @returns {string} Base64 PNG data URL
 */
function drawButtonPressed(name, pressType) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Button icon (pressed)
  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.warmYellow, true);

  // Name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Button';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  // Press type
  ctx.fillStyle = COLORS.warmYellow;
  ctx.font = 'bold 16px sans-serif';
  const pressName = PRESS_NAMES[pressType] || 'Single';
  ctx.fillText(pressName, CANVAS_CENTER, LAYOUT.brightnessY);

  // Status bar
  ctx.fillStyle = COLORS.warmYellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw button - Error state
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
 * Draw button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.yellow, false);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawButtonIcon(ctx, CANVAS_CENTER, 45, 50, COLORS.gray, false);

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
 * Draw button - Offline state
 * @param {string} name - Button name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable, false);

  // Name
  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Button';
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
 * @param {ButtonSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Button';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {ButtonSettings} settings - Button settings
 * @param {ButtonState} [state] - Current state
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
  } else if (state?.pressed) {
    imageData = drawButtonPressed(getDisplayName(settings), settings.pressType ?? PRESS_SINGLE);
  } else {
    imageData = drawButtonReady(getDisplayName(settings), settings.pressType ?? PRESS_SINGLE);
  }

  setImage(context, imageData);
}

// ============================================================
// Button State Fetch
// ============================================================

/**
 * Fetch current button state from hub
 * @param {ButtonSettings} settings - Button settings
 * @returns {Promise<ButtonState>}
 */
async function fetchButtonState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { ready: false, error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return { ready: false, error: 'Missing connection parameters' };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { ready: false, error: 'Button not found' };
    }

    // Check offline status
    const isOffline = SprutHubClient.isAccessoryOffline(accessory);

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findButtonService(accessory);

    if (!service) {
      return { ready: false, error: 'No button service' };
    }

    return {
      ready: true,
      offline: isOffline,
    };
  } catch (err) {
    log('[Button] Error fetching state:', err);
    return {
      ready: false,
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
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (payload?.settings || {});
  setContext(context, {
    settings,
    action: BUTTON_ACTION,
    state: { ready: false, connecting: true },
  });

  updateButton(context, settings, { ready: false, connecting: true });

  fetchButtonState(settings).then((state) => {
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
 * Handle keyUp event - Trigger button press
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { host, token, serial, accessoryId, serviceId, characteristicId, pressType } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Button] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !characteristicId) {
    log('[Button] onKeyUp: missing serviceId or characteristicId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Button] onKeyUp: client not connected');
      return;
    }

    // Show pressed state for visual feedback
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = { ...ctx.state, pressed: true };
      updateButton(context, settings, /** @type {ButtonState} */ (ctx.state));
    }

    // Send the button press event
    const eventValue = pressType ?? PRESS_SINGLE;
    log('[Button] Triggering button press:', { accessoryId, serviceId, characteristicId, eventValue });
    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, eventValue);

    // Reset to ready state after brief delay
    setTimeout(() => {
      const c = getContext(context);
      if (c) {
        c.state = { ...c.state, pressed: false };
        updateButton(context, settings, /** @type {ButtonState} */ (c.state));
      }
    }, 300);
  } catch (err) {
    log('[Button] Error triggering button:', err);
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
  /** @type {ButtonSettings} */
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
    pressType: typeof payload.pressType === 'number' ? payload.pressType : PRESS_SINGLE,
  };

  log('[Button] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {ButtonSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, {
      settings,
      state: { ready: false },
    });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {ButtonState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { ready: false, connecting: true });

  fetchButtonState(settings).then((state) => {
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
  log('[Button] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Button] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasButton = SprutHubClient.findButtonService(a) !== undefined;
      if (hasButton) {
        log('[Button] Found button:', a.name, a.id);
      }
      return hasButton;
    });

    log('[Button] Filtered buttons:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Button] Sent testResult to PI');
  } catch (err) {
    log('[Button] testConnection error:', err);
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
  log('[Button] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    const devices = accessories.filter((a) => SprutHubClient.findButtonService(a) !== undefined);

    log('[Button] handleGetDevices: found', rooms.length, 'rooms,', devices.length, 'buttons');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Button] Sent deviceList to PI');
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
 * @param {ButtonSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {ButtonSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {ButtonState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { ready: false, connecting: true });

  fetchButtonState(settings).then((state) => {
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
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (ctx?.settings || {});

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
