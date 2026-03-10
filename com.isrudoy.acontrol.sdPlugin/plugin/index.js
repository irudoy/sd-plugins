/**
 * A Control Plugin for StreamDock
 * Control Adam Audio A-Series speakers via OCA/AES70 protocol
 *
 * Entry point with event routing to action modules.
 * @module plugin/index
 */

const { log, SPEAKERS_ACTION } = require('./lib/common');
const {
  setCurrentPI,
  clearCurrentPI,
  setContext,
  deleteContext,
  contexts,
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
 * @typedef {import('../../types/streamdock').DialRotatePayload} DialRotatePayload
 */

// ============================================================
// Action Registry
// ============================================================

const speakersAction = require('./actions/speakers');

/**
 * Registry of all action handlers
 */
const actions = {
  [SPEAKERS_ACTION]: speakersAction,
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
  log('[AControl] Received event:', event, 'action:', action);

  const handler = actions[action];
  if (!handler) return;

  switch (event) {
    case 'willAppear': {
      const appearPayload = /** @type {AppearPayload} */ (payload);
      const settings = appearPayload.settings || {};
      const controller = appearPayload.controller || 'Keypad';
      handler.onWillAppear(context, settings, controller);
      break;
    }

    case 'willDisappear':
      handler.onWillDisappear(context);
      deleteContext(context);
      break;

    case 'keyUp':
      handler.onKeyUp(context);
      break;

    case 'keyDown':
      // Ignored
      break;

    case 'dialRotate': {
      const dialPayload = /** @type {DialRotatePayload} */ (payload);
      handler.onDialRotate(context, dialPayload.ticks || 0);
      break;
    }

    case 'dialDown':
      handler.onDialPress(context);
      break;

    case 'sendToPlugin': {
      const pluginPayload = /** @type {SendToPluginPayload} */ (payload);
      ensureContext(action, context);
      setCurrentPI(action, context);
      handler.onSendToPlugin(context, pluginPayload);
      break;
    }

    case 'didReceiveSettings': {
      const settingsPayload = /** @type {SettingsPayload} */ (payload);
      handler.onDidReceiveSettings(context, settingsPayload.settings || {});
      break;
    }

    case 'propertyInspectorDidAppear':
      setCurrentPI(action, context);
      ensureContext(action, context);
      handler.onPropertyInspectorDidAppear(context);
      break;

    case 'propertyInspectorDidDisappear':
      clearCurrentPI(context);
      handler.onPropertyInspectorDidDisappear(context);
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
