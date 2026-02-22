/**
 * Win Tools Plugin for StreamDock
 * - Battery Monitor Action: Shows battery levels for Razer devices
 *
 * Entry point with event routing to action modules.
 * @module plugin/index
 */

const { log, BATTERY_ACTION } = require('./lib/common');
const {
  contexts,
  setCurrentPI,
  clearCurrentPI,
  setContext,
  deleteContext,
} = require('./lib/state');
const { initWebSocket } = require('./lib/websocket');
const battery = require('./actions/battery');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../types/streamdock').StreamDockMessage} StreamDockMessage
 * @typedef {import('../../types/streamdock').AppearPayload} AppearPayload
 * @typedef {import('../../types/streamdock').KeyPayload} KeyPayload
 * @typedef {import('../../types/streamdock').SettingsPayload} SettingsPayload
 * @typedef {import('../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 */

/**
 * @typedef {import('./actions/battery').BatterySettings} BatterySettings
 */

// ============================================================
// Message Handler
// ============================================================

/**
 * Handle incoming StreamDock message
 * @param {StreamDockMessage} message - Incoming message
 * @returns {void}
 */
function handleMessage(message) {
  const { event, action, context, payload } = message;
  log('[WinTools] Received event:', event, 'action:', action);

  switch (event) {
    case 'willAppear':
      onWillAppear(action, context, payload);
      break;
    case 'willDisappear':
      onWillDisappear(action, context, payload);
      break;
    case 'keyUp':
      onKeyUp(action, context, payload);
      break;
    case 'keyDown':
      break;
    case 'sendToPlugin':
      onSendToPlugin(action, context, payload);
      break;
    case 'didReceiveSettings':
      onDidReceiveSettings(action, context, payload);
      break;
    case 'propertyInspectorDidAppear':
      onPropertyInspectorDidAppear(action, context, payload);
      break;
    case 'propertyInspectorDidDisappear':
      clearCurrentPI(context);
      break;
  }
}

// ============================================================
// Event Routing
// ============================================================

/**
 * Route willAppear event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {AppearPayload} payload - Event payload
 * @returns {void}
 */
function onWillAppear(action, context, payload) {
  if (action === BATTERY_ACTION) {
    battery.onWillAppear(context, payload);
  }
}

/**
 * Route willDisappear event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {unknown} _payload - Event payload (unused)
 * @returns {void}
 */
function onWillDisappear(action, context, _payload) {
  if (action === BATTERY_ACTION) {
    battery.onWillDisappear(context);
  }
  deleteContext(context);
}

/**
 * Route keyUp event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {KeyPayload} payload - Event payload
 * @returns {void}
 */
function onKeyUp(action, context, payload) {
  if (action === BATTERY_ACTION) {
    battery.onKeyUp(context, payload);
  }
}

/**
 * Route sendToPlugin event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {void}
 */
function onSendToPlugin(action, context, payload) {
  // Ensure context exists
  if (!contexts[context]) {
    setContext(context, { action });
  } else if (!contexts[context].action) {
    contexts[context].action = action;
  }

  setCurrentPI(action, context);

  if (action === BATTERY_ACTION) {
    battery.onSendToPlugin(context, payload);
  }
}

/**
 * Route propertyInspectorDidAppear event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {unknown} _payload - Event payload (unused)
 * @returns {void}
 */
function onPropertyInspectorDidAppear(action, context, _payload) {
  setCurrentPI(action, context);

  if (!contexts[context]) {
    setContext(context, { action });
  } else if (!contexts[context].action) {
    contexts[context].action = action;
  }

  if (action === BATTERY_ACTION) {
    battery.onPropertyInspectorDidAppear(context);
  }
}

/**
 * Route didReceiveSettings event to action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {SettingsPayload} payload - Settings payload
 * @returns {void}
 */
function onDidReceiveSettings(action, context, payload) {
  if (action === BATTERY_ACTION) {
    battery.onDidReceiveSettings(context, payload);
  }
}

// ============================================================
// WebSocket Connection
// ============================================================

/**
 * StreamDock entry point
 * @param {string} port - WebSocket port
 * @param {string} uuid - Plugin UUID
 * @param {string} registerEvent - Registration event
 * @param {string} [_info] - Application info (unused)
 * @returns {void}
 */
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info) {
  initWebSocket(port, uuid, registerEvent, handleMessage);
}

// ============================================================
// Entry Point
// ============================================================

module.exports = { connectElgatoStreamDeckSocket };

if (process.argv.length > 2) {
  /** @type {string[]} */
  const args = process.argv.slice(2);
  /** @type {string|undefined} */
  let port;
  /** @type {string|undefined} */
  let uuid;
  /** @type {string|undefined} */
  let registerEvent;
  /** @type {string|undefined} */
  let info;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-port':
        port = args[++i];
        break;
      case '-pluginUUID':
        uuid = args[++i];
        break;
      case '-registerEvent':
        registerEvent = args[++i];
        break;
      case '-info':
        info = args[++i];
        break;
    }
  }

  if (port && uuid && registerEvent) {
    connectElgatoStreamDeckSocket(port, uuid, registerEvent, info);
  }
}
