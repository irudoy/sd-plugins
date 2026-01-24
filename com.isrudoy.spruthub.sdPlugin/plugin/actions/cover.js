/**
 * Cover (WindowCovering) Action for Sprut.Hub Plugin
 * @module actions/cover
 */

const { createCanvas } = require('canvas');
const { log, COVER_ACTION, CANVAS_SIZE, CANVAS_CENTER, LAYOUT, COLORS } = require('../lib/common');
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
 * @typedef {Object} CoverSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected cover accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Actual cover service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [targetPositionCharId] - TargetPosition characteristic ID (cId)
 * @property {number} [currentPositionCharId] - CurrentPosition characteristic ID (for reading)
 * @property {string} [customName] - Custom display name
 * @property {string} [action] - toggle | open | close | stop
 */

/**
 * @typedef {Object} CoverState
 * @property {number} position - Current position (0-100, 0=closed, 100=open)
 * @property {number} [targetPosition] - Target position (for opening/closing state)
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 */

// Cover colors
const COVER_COLORS = {
  open: '#4CAF50', // Green - open
  partial: COLORS.warmYellow, // Yellow - partial
  closed: COLORS.gray, // Gray - closed
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
      // Only process cover action contexts
      if (data.action !== COVER_ACTION) return;

      /** @type {CoverSettings} */
      const settings = /** @type {CoverSettings} */ (data.settings || {});
      if (settings.accessoryId === accessoryId) {
        if (!data.state) {
          data.state = { position: 0, targetPosition: 0 };
        }

        // Track current and target positions separately
        if (settings.currentPositionCharId === characteristicId) {
          data.state.position = Number(actualValue) || 0;
        } else if (settings.targetPositionCharId === characteristicId) {
          data.state.targetPosition = Number(actualValue) || 0;
        }

        updateButton(context, settings, /** @type {CoverState} */ (data.state));
      }
    });
  });

  stateListenerSetup = true;
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw cover/blinds icon
 * @param {import('canvas').CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @param {number} position - Cover position (0-100)
 * @returns {void}
 */
function drawCoverIcon(ctx, x, y, size, color, position) {
  const width = size * 0.6;
  const height = size * 0.5;
  const numSlats = 5;
  const slatHeight = height / numSlats;
  const openSlats = Math.round((position / 100) * numSlats);

  // Window frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - width / 2, y - height / 2, width, height);

  // Slats (from top, closed slats are visible)
  ctx.fillStyle = color;
  for (let i = 0; i < numSlats - openSlats; i++) {
    const slatY = y - height / 2 + i * slatHeight;
    ctx.fillRect(x - width / 2 + 2, slatY + 2, width - 4, slatHeight - 2);
  }

  // Top bar (valance)
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2 - 4, y - height / 2 - 8, width + 8, 10);
}

/**
 * Get color based on position
 * @param {number} position
 * @returns {string}
 */
function getPositionColor(position) {
  if (position >= 95) return COVER_COLORS.open;
  if (position <= 5) return COVER_COLORS.closed;
  return COVER_COLORS.partial;
}

/**
 * Get position text
 * @param {number} position
 * @param {number} [targetPosition]
 * @returns {string}
 */
function getPositionText(position, targetPosition) {
  // Check if moving
  if (targetPosition !== undefined && Math.abs(position - targetPosition) > 2) {
    if (targetPosition > position) return 'Closing...';
    return 'Opening...';
  }
  if (position >= 95) return 'Open';
  if (position <= 5) return 'Closed';
  return `${position}%`;
}

/**
 * Draw cover button
 * @param {string} name - Cover name
 * @param {number} position - Position 0-100
 * @param {number} [targetPosition] - Target position (for opening/closing state)
 * @returns {string} Base64 PNG data URL
 */
function drawCover(name, position, targetPosition) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  const color = getPositionColor(position);
  drawCoverIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, color, position);

  ctx.fillStyle = position <= 5 ? COLORS.gray : COLORS.white;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Cover';
  if (displayName.length > 12) {
    displayName = displayName.substring(0, 11) + '…';
  }
  ctx.fillText(displayName, CANVAS_CENTER, LAYOUT.nameY);

  ctx.fillStyle = color;
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(getPositionText(position, targetPosition), CANVAS_CENTER, LAYOUT.brightnessY);

  ctx.fillStyle = color;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw cover button - Error state
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
 * Draw cover button - Connecting state
 * @returns {string} Base64 PNG data URL
 */
function drawConnecting() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawCoverIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.yellow, 50);

  ctx.fillStyle = COLORS.yellow;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Connecting...', CANVAS_CENTER, LAYOUT.nameYOff);

  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(0, LAYOUT.statusBarY, CANVAS_SIZE, LAYOUT.statusBarHeight);

  return canvas.toDataURL('image/png');
}

/**
 * Draw cover button - Not configured state
 * @returns {string} Base64 PNG data URL
 */
function drawNotConfigured() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawCoverIcon(ctx, CANVAS_CENTER, 50, LAYOUT.bulbSizeSmall, COLORS.gray, 50);

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
 * Draw cover button - Offline state
 * @param {string} name - Cover name
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(name) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawCoverIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, COLORS.unavailable, 50);

  ctx.fillStyle = COLORS.unavailable;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  let displayName = name || 'Cover';
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
 * @param {CoverSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) {
    return settings.customName;
  }
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Cover';
}

/**
 * Update button image
 * @param {string} context - Action context
 * @param {CoverSettings} settings - Cover settings
 * @param {CoverState} [state] - Current state
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
  } else {
    imageData = drawCover(getDisplayName(settings), state?.position ?? 0, state?.targetPosition);
  }

  setImage(context, imageData);
}

// ============================================================
// Cover State Fetch
// ============================================================

/**
 * Fetch current cover state from hub
 * @param {CoverSettings} settings - Cover settings
 * @returns {Promise<CoverState>}
 */
async function fetchCoverState(settings) {
  const { host, token, serial, accessoryId, serviceId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    return { position: 0, error: 'Not configured' };
  }

  try {
    const client = getClient(host, token, serial);

    if (!client) {
      return { position: 0, error: 'Missing connection parameters' };
    }

    await client.waitForConnection();

    setupStateListener();

    const accessories = await client.getAccessories();
    const accessory = accessories.find((a) => a.id === accessoryId);

    if (!accessory) {
      return { position: 0, error: 'Cover not found' };
    }

    const service = serviceId
      ? accessory.services?.find((s) => s.sId === serviceId)
      : SprutHubClient.findCoverService(accessory);

    if (!service) {
      return { position: 0, error: 'No cover service' };
    }

    const isOffline = SprutHubClient.isAccessoryOffline(accessory);

    // Get current position (read-only) and target position
    const currentPositionChar = SprutHubClient.findCurrentPositionCharacteristic(service);
    const targetPositionChar = SprutHubClient.findTargetPositionCharacteristic(service);
    const currentValue = SprutHubClient.extractValue(currentPositionChar?.control?.value);
    const targetValue = SprutHubClient.extractValue(targetPositionChar?.control?.value);

    return {
      position: Number(currentValue) || 0,
      targetPosition: Number(targetValue) || 0,
      offline: isOffline,
    };
  } catch (err) {
    log('[Cover] Error fetching state:', err);
    return { position: 0, error: err instanceof Error ? err.message : 'Unknown error' };
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
  /** @type {CoverSettings} */
  const settings = /** @type {CoverSettings} */ (payload?.settings || {});
  setContext(context, { settings, action: COVER_ACTION, state: { position: 0, connecting: true } });

  updateButton(context, settings, { position: 0, connecting: true });

  fetchCoverState(settings).then((state) => {
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
 * Handle keyUp event - Control cover
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {CoverSettings} */
  const settings = /** @type {CoverSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { host, token, serial, accessoryId, serviceId, targetPositionCharId, action } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Cover] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !targetPositionCharId) {
    log('[Cover] onKeyUp: missing serviceId or targetPositionCharId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Cover] onKeyUp: client not connected');
      return;
    }

    const ctx = getContext(context);
    /** @type {CoverState} */
    const currentState = /** @type {CoverState} */ (ctx?.state || { position: 0 });

    // Determine new position based on action
    let newPosition;
    if (action === 'open') {
      newPosition = 100;
    } else if (action === 'close') {
      newPosition = 0;
    } else {
      // toggle - if mostly open, close; if mostly closed, open
      newPosition = currentState.position > 50 ? 0 : 100;
    }

    log('[Cover] Setting cover position:', {
      accessoryId,
      serviceId,
      targetPositionCharId,
      newPosition,
    });

    // Update TargetPosition characteristic
    await client.updateCharacteristic(accessoryId, serviceId, targetPositionCharId, newPosition);

    if (ctx) {
      ctx.state = { ...currentState, position: newPosition };
      updateButton(context, settings, /** @type {CoverState} */ (ctx.state));
    }
  } catch (err) {
    log('[Cover] Error controlling:', err);
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

  if (payload.accessoryId && payload.serviceId && payload.targetPositionCharId) {
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
  /** @type {CoverSettings} */
  const settings = {
    host: typeof payload.host === 'string' ? payload.host : undefined,
    token: typeof payload.token === 'string' ? payload.token : undefined,
    serial: typeof payload.serial === 'string' ? payload.serial : undefined,
    accessoryId: typeof payload.accessoryId === 'number' ? payload.accessoryId : undefined,
    accessoryName: typeof payload.accessoryName === 'string' ? payload.accessoryName : undefined,
    serviceId: typeof payload.serviceId === 'number' ? payload.serviceId : undefined,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : undefined,
    targetPositionCharId:
      typeof payload.targetPositionCharId === 'number' ? payload.targetPositionCharId : undefined,
    currentPositionCharId:
      typeof payload.currentPositionCharId === 'number' ? payload.currentPositionCharId : undefined,
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
  };

  log('[Cover] Received settings from PI:', settings);

  const ctx = getContext(context);
  const oldSettings = /** @type {CoverSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  } else {
    setContext(context, { settings, state: { position: 0 } });
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {CoverState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { position: 0, connecting: true });

  fetchCoverState(settings).then((state) => {
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
  log('[Cover] handleTestConnection:', { host, token: token ? '***' : undefined, serial });

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

    log('[Cover] Got rooms:', rooms.length, 'accessories:', accessories.length);

    const devices = accessories.filter((a) => {
      const hasCover = SprutHubClient.findCoverService(a) !== undefined;
      if (hasCover) {
        log('[Cover] Found cover:', a.name, a.id);
      }
      return hasCover;
    });

    log('[Cover] Filtered covers:', devices.length);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      rooms,
      devices,
    });

    log('[Cover] Sent testResult to PI');
  } catch (err) {
    log('[Cover] testConnection error:', err);
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
  log('[Cover] handleGetDevices:', { host, token: token ? '***' : undefined, serial });

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

    const devices = accessories.filter((a) => SprutHubClient.findCoverService(a) !== undefined);

    log('[Cover] handleGetDevices: found', rooms.length, 'rooms,', devices.length, 'covers');

    sendToPropertyInspector({
      event: 'deviceList',
      rooms,
      devices,
    });

    log('[Cover] Sent deviceList to PI');
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
 * @param {CoverSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  const ctx = getContext(context);
  const oldSettings = /** @type {CoverSettings|undefined} */ (ctx?.settings);

  const deviceChanged =
    !oldSettings ||
    oldSettings.accessoryId !== settings.accessoryId ||
    oldSettings.serviceId !== settings.serviceId;

  if (ctx) {
    ctx.settings = settings;
  }

  if (!deviceChanged && ctx?.state) {
    updateButton(context, settings, /** @type {CoverState} */ (ctx.state));
    return;
  }

  updateButton(context, settings, { position: 0, connecting: true });

  fetchCoverState(settings).then((state) => {
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
  /** @type {CoverSettings} */
  const settings = /** @type {CoverSettings} */ (payload?.settings || {});
  onSettingsUpdate(context, settings);
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(context) {
  const ctx = getContext(context);
  /** @type {CoverSettings} */
  const settings = /** @type {CoverSettings} */ (ctx?.settings || {});

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
