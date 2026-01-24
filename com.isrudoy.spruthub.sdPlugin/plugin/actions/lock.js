/**
 * Lock Action for Sprut.Hub Plugin
 * @module actions/lock
 */

const { createCanvas } = require('canvas');
const { log, LOCK_ACTION, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
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
 * @typedef {Object} LockSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected lock accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual lock service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [characteristicId] - LockTargetState characteristic ID (cId)
 * @property {number} [currentStateCharId] - LockCurrentState characteristic ID (for reading)
 * @property {string} [customName] - Custom display name
 * @property {string} [action] - toggle | lock | unlock
 */

/**
 * @typedef {Object} LockState
 * @property {boolean} locked - Whether lock is locked (0=unlocked, 1=locked)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 */

// Lock states from HomeKit spec
const LOCK_UNSECURED = 0;
const LOCK_SECURED = 1;

// Colors for lock (inverted: green=locked, red=unlocked)
const LOCK_COLORS = {
  locked: '#4CAF50', // Green - secured
  unlocked: '#F44336', // Red - unsecured
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
      // Only process lock action contexts
      if (data.action !== LOCK_ACTION) return;

      /** @type {LockSettings} */
      const settings = /** @type {LockSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId) {
        if (!data.state) {
          data.state = { locked: false };
        }

        // Check if this is the current state or target state characteristic
        if (
          settings.currentStateCharId === characteristicId ||
          settings.characteristicId === characteristicId
        ) {
          // 0 = unsecured, 1 = secured
          data.state.locked = Number(actualValue) === LOCK_SECURED;
        }

        updateButton(context, settings, /** @type {LockState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw lock icon
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @param {boolean} isLocked - Whether lock is locked
 * @returns {void}
 */
function drawLockIcon(ctx, x, y, size, color, isLocked) {
  const bodyWidth = size * 0.45;
  const bodyHeight = size * 0.35;
  const shackleWidth = size * 0.3;
  const shackleHeight = size * 0.25;

  // Lock body (rounded rectangle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - bodyWidth / 2, y, bodyWidth, bodyHeight, 6);
  ctx.fill();

  // Shackle (U-shape)
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';

  const shackleY = y - shackleHeight + size * 0.05;

  if (isLocked) {
    // Closed shackle
    ctx.beginPath();
    ctx.moveTo(x - shackleWidth / 2, y + 5);
    ctx.lineTo(x - shackleWidth / 2, shackleY + shackleHeight * 0.3);
    ctx.quadraticCurveTo(x - shackleWidth / 2, shackleY, x, shackleY);
    ctx.quadraticCurveTo(
      x + shackleWidth / 2,
      shackleY,
      x + shackleWidth / 2,
      shackleY + shackleHeight * 0.3
    );
    ctx.lineTo(x + shackleWidth / 2, y + 5);
    ctx.stroke();
  } else {
    // Open shackle (right side raised)
    ctx.beginPath();
    ctx.moveTo(x - shackleWidth / 2, y + 5);
    ctx.lineTo(x - shackleWidth / 2, shackleY + shackleHeight * 0.3);
    ctx.quadraticCurveTo(x - shackleWidth / 2, shackleY, x, shackleY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + shackleWidth / 2, y - shackleHeight * 0.3);
    ctx.lineTo(x + shackleWidth / 2, shackleY - shackleHeight * 0.3);
    ctx.stroke();
  }

  // Keyhole
  ctx.fillStyle = COLORS.background;
  const keyholeY = y + bodyHeight * 0.4;
  ctx.beginPath();
  ctx.arc(x, keyholeY, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - size * 0.03, keyholeY);
  ctx.lineTo(x + size * 0.03, keyholeY);
  ctx.lineTo(x + size * 0.02, keyholeY + size * 0.08);
  ctx.lineTo(x - size * 0.02, keyholeY + size * 0.08);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw lock button - Locked state
 * @param {string} name - Lock name
 * @returns {string} Base64 PNG data URL
 */
function drawLockLocked(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawLockIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY - 10, LAYOUT.bulbSize, LOCK_COLORS.locked, true);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Lock';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  ctx.fillStyle = LOCK_COLORS.locked;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Locked', CANVAS_CENTER, LAYOUT.brightnessY);

  ctx.fillStyle = LOCK_COLORS.locked;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw lock button - Unlocked state
 * @param {string} name - Lock name
 * @returns {string} Base64 PNG data URL
 */
function drawLockUnlocked(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawLockIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY - 10, LAYOUT.bulbSize, LOCK_COLORS.unlocked, false);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Lock';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  ctx.fillStyle = LOCK_COLORS.unlocked;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('Unlocked', CANVAS_CENTER, LAYOUT.brightnessY);

  ctx.fillStyle = LOCK_COLORS.unlocked;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw lock button - Error state
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
 * Draw lock button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawLockIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY - 10, LAYOUT.bulbSize, COLORS.yellow, true);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw lock button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawLockIcon(ctx, CANVAS_CENTER, 45, LAYOUT.bulbSizeSmall, COLORS.gray, true);

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
 * Draw lock button - Offline state
 * @param {string} name - Lock name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawLockIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable, true);

  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Lock';
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
 * @param {LockSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Lock';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {LockSettings} settings - Lock settings
 * @param {LockState} [state] - Current state
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
  } else if (state?.locked) {
    imageData = drawLockLocked(getDisplayName(settings));
  } else {
    imageData = drawLockUnlocked(getDisplayName(settings));
  }

  setImage(context, imageData);
}

// ============================================================
// Lock State Fetch
// ============================================================

/**
 * Fetch current lock state from hub
 * @param {LockSettings} settings - Lock settings
 * @returns {Promise<LockState>}
 */
async function fetchLockState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { locked: false, error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return { locked: false, error: 'Missing connection parameters' };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { locked: false, error: 'Lock not found' };
    }

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findLockService(accessory);

    if (!service) {
      return { locked: false, error: 'No lock service' };
    }

    const isOffline = SprutHubClient.isAccessoryOffline(accessory);

    // Get current state (read-only)
    const currentStateChar = SprutHubClient.findLockCurrentStateCharacteristic(service);
    const currentValue = SprutHubClient.extractValue(currentStateChar?.control?.value);

    return {
      locked: Number(currentValue) === LOCK_SECURED,
      offline: isOffline,
    };
  } catch (err) {
    log('[Lock] Error fetching state:', err);
    return { locked: false, error: err instanceof Error ? err.message : 'Unknown error' };
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
  /** @type {LockSettings} */
  const settings = /** @type {LockSettings} */ (payload?.settings || {});
  setContext(context, {
    settings,
    action: LOCK_ACTION,
    state: { locked: false, connecting: true },
  });

  updateButton(context, settings, { locked: false, connecting: true });

  fetchLockState(settings).then((state) => {
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
 * Handle keyUp event - Toggle lock
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {LockSettings} */
  const settings = /** @type {LockSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { host, token, serial, accessoryId, serviceId, characteristicId, action } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Lock] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !characteristicId) {
    log('[Lock] onKeyUp: missing serviceId or characteristicId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Lock] onKeyUp: client not connected');
      return;
    }

    const ctx = getContext(context);
    /** @type {LockState} */
    const currentState = /** @type {LockState} */ (ctx?.state || { locked: false });

    // Determine new state (0=unlocked, 1=locked)
    let newValue;
    if (action === 'lock') {
      newValue = LOCK_SECURED;
    } else if (action === 'unlock') {
      newValue = LOCK_UNSECURED;
    } else {
      // toggle
      newValue = currentState.locked ? LOCK_UNSECURED : LOCK_SECURED;
    }

    log('[Lock] Setting lock:', { accessoryId, serviceId, characteristicId, newValue });

    // Update LockTargetState characteristic (uses intValue)
    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

    if (ctx) {
      ctx.state = { ...currentState, locked: newValue === LOCK_SECURED };
      updateButton(context, settings, /** @type {LockState} */ (ctx.state));
    }
  } catch (err) {
    log('[Lock] Error toggling:', err);
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
  /** @type {LockSettings} */
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
    currentStateCharId:
      typeof payload.currentStateCharId === 'number' ? payload.currentStateCharId : undefined,
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
  };

  log('[Lock] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {LockSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, { settings, state: { locked: false } });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {LockState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { locked: false, connecting: true });

  fetchLockState(settings).then((state) => {
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
  log('[Lock] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Lock] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasLock = SprutHubClient.findLockService(a) !== undefined;
      if (hasLock) {
        log('[Lock] Found lock:', a.name, a.id);
      }
      return hasLock;
    });

    log('[Lock] Filtered locks:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Lock] Sent testResult to PI');
  } catch (err) {
    log('[Lock] testConnection error:', err);
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
  log('[Lock] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    const devices = accessories.filter((a) => SprutHubClient.findLockService(a) !== undefined);

    log('[Lock] handleGetDevices: found', rooms.length, 'rooms,', devices.length, 'locks');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Lock] Sent deviceList to PI');
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
 * @param {LockSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {LockSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {LockState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { locked: false, connecting: true });

  fetchLockState(settings).then((state) => {
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
  /** @type {LockSettings} */
  const settings = /** @type {LockSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {LockSettings} */
  const settings = /** @type {LockSettings} */ (ctx?.settings || {});

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
