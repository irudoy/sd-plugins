/**
 * Sprut.Hub Plugin for StreamDock
 * Control smart home devices via Sprut.Hub
 *
 * Entry point with event routing to action modules.
 * @module plugin/index
 */

const {
  log,
  LIGHT_ACTION,
  SWITCH_ACTION,
  OUTLET_ACTION,
  THERMOSTAT_ACTION,
  COVER_ACTION,
  LOCK_ACTION,
  SENSOR_ACTION,
  BUTTON_ACTION,
} = require('./lib/common');
const {
  contexts,
  setCurrentPI,
  clearCurrentPI,
  setContext,
  deleteContext,
} = require('./lib/state');
const { initWebSocket } = require('./lib/websocket');

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
 * Action handler interface - all actions export these methods
 * @typedef {Object} ActionHandler
 * @property {(context: string, payload: AppearPayload) => void} onWillAppear
 * @property {(context: string) => void} onWillDisappear
 * @property {(context: string, payload: KeyPayload) => void | Promise<void>} onKeyUp
 * @property {(context: string, payload: SendToPluginPayload) => boolean} onSendToPlugin
 * @property {(context: string, settings: Record<string, unknown>) => void} onSettingsUpdate
 * @property {(context: string, payload: SettingsPayload) => void} onDidReceiveSettings
 * @property {(context: string) => void} onPropertyInspectorDidAppear
 * @property {(context: string, payload: KeyPayload) => void | Promise<void>} [onDialRotate]
 * @property {(context: string, payload: KeyPayload) => void | Promise<void>} [onDialDown]
 */

// ============================================================
// Action Registry
// ============================================================

/**
 * Registry of all action handlers
 * @type {Record<string, ActionHandler>}
 */
const actions = {
  [LIGHT_ACTION]: /** @type {ActionHandler} */ (require('./actions/light')),
  [SWITCH_ACTION]: /** @type {ActionHandler} */ (require('./actions/switch')),
  [OUTLET_ACTION]: /** @type {ActionHandler} */ (require('./actions/outlet')),
  [LOCK_ACTION]: /** @type {ActionHandler} */ (require('./actions/lock')),
  [COVER_ACTION]: /** @type {ActionHandler} */ (require('./actions/cover')),
  [THERMOSTAT_ACTION]: /** @type {ActionHandler} */ (require('./actions/thermostat')),
  [SENSOR_ACTION]: /** @type {ActionHandler} */ (require('./actions/sensor')),
  [BUTTON_ACTION]: /** @type {ActionHandler} */ (require('./actions/button')),
};

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
  log('[SprutHub] Received event:', event, 'action:', action);

  const handler = actions[action];
  if (!handler) return;

  switch (event) {
    case 'willAppear':
      handler.onWillAppear(context, /** @type {AppearPayload} */ (payload));
      break;

    case 'willDisappear':
      handler.onWillDisappear(context);
      deleteContext(context);
      break;

    case 'keyUp':
      handler.onKeyUp(context, /** @type {KeyPayload} */ (payload));
      break;

    case 'keyDown':
      // Ignored
      break;

    case 'dialRotate':
      handler.onDialRotate?.(context, /** @type {KeyPayload} */ (payload));
      break;

    case 'dialDown':
      handler.onDialDown?.(context, /** @type {KeyPayload} */ (payload));
      break;

    case 'sendToPlugin':
      onSendToPlugin(handler, action, context, /** @type {SendToPluginPayload} */ (payload));
      break;

    case 'didReceiveSettings':
      handler.onDidReceiveSettings(context, /** @type {SettingsPayload} */ (payload));
      break;

    case 'propertyInspectorDidAppear':
      setCurrentPI(action, context);
      ensureContext(action, context);
      handler.onPropertyInspectorDidAppear(context);
      break;

    case 'propertyInspectorDidDisappear':
      clearCurrentPI(context);
      break;
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Ensure context exists for action
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @returns {void}
 */
function ensureContext(action, context) {
  if (!contexts[context]) {
    setContext(context, { action });
  } else if (!contexts[context].action) {
    contexts[context].action = action;
  }
}

/**
 * Handle sendToPlugin event
 * @param {ActionHandler} handler - Action handler
 * @param {string} action - Action UUID
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {void}
 */
function onSendToPlugin(handler, action, context, payload) {
  ensureContext(action, context);
  setCurrentPI(action, context);

  // Try action-specific handlers first
  const handled = handler.onSendToPlugin(context, payload);
  if (handled) return;

  // Handle settings update
  /** @type {Record<string, unknown>} */
  const settings = /** @type {Record<string, unknown>} */ (payload);
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action });
  }

  handler.onSettingsUpdate(context, settings);
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
