/**
 * Mac Tools Plugin for StreamDock
 * - Drive Info Action: Shows disk space usage
 * - Battery Monitor Action: Shows battery levels for Apple/Razer devices
 *
 * Entry point with event routing to action modules.
 * @module plugin/index
 */

const { log, DRIVEINFO_ACTION, BATTERY_ACTION, OSASCRIPT_ACTION } = require('./lib/common');
const {
  contexts,
  setCurrentPI,
  clearCurrentPI,
  setContext,
  deleteContext,
} = require('./lib/state');
const { initWebSocket } = require('./lib/websocket');
const driveinfo = require('./actions/driveinfo');
const battery = require('./actions/battery');
const osascript = require('./actions/osascript');

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
 * Action-specific settings types (imported from action modules)
 * @typedef {import('./actions/driveinfo').DriveInfoSettings} DriveInfoSettings
 * @typedef {import('./actions/battery').BatterySettings} BatterySettings
 * @typedef {import('./actions/osascript').OSAScriptSettings} OSAScriptSettings
 */

/**
 * Union type for all action settings
 * @typedef {DriveInfoSettings | BatterySettings | OSAScriptSettings} ActionSettings
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
  log('[MacTools] Received event:', event, 'action:', action);

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
  if (action === DRIVEINFO_ACTION) {
    driveinfo.onWillAppear(context, payload);
  } else if (action === BATTERY_ACTION) {
    battery.onWillAppear(context, payload);
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onWillAppear(context, payload);
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
  if (action === DRIVEINFO_ACTION) {
    driveinfo.onWillDisappear(context);
  } else if (action === BATTERY_ACTION) {
    battery.onWillDisappear(context);
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onWillDisappear(context);
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
  if (action === DRIVEINFO_ACTION) {
    driveinfo.onKeyUp(context, payload);
  } else if (action === BATTERY_ACTION) {
    battery.onKeyUp(context, payload);
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onKeyUp(context, payload);
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

  // Try action-specific handlers first
  if (action === DRIVEINFO_ACTION) {
    if (driveinfo.onSendToPlugin(context, payload)) {
      return;
    }
  } else if (action === BATTERY_ACTION) {
    if (battery.onSendToPlugin(context, payload)) {
      return;
    }
  } else if (action === OSASCRIPT_ACTION) {
    if (osascript.onSendToPlugin(context, payload)) {
      return;
    }
  }

  // Handle settings update
  /** @type {ActionSettings} */
  const settings = /** @type {ActionSettings} */ (payload);
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action });
  }

  if (action === DRIVEINFO_ACTION) {
    driveinfo.onSettingsUpdate(context, /** @type {DriveInfoSettings} */ (settings));
  } else if (action === BATTERY_ACTION) {
    battery.onSettingsUpdate(context, /** @type {BatterySettings} */ (settings));
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onSettingsUpdate(context, /** @type {OSAScriptSettings} */ (settings));
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

  if (action === DRIVEINFO_ACTION) {
    driveinfo.onPropertyInspectorDidAppear(context);
  } else if (action === BATTERY_ACTION) {
    battery.onPropertyInspectorDidAppear(context);
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onPropertyInspectorDidAppear(context);
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
  if (action === DRIVEINFO_ACTION) {
    driveinfo.onDidReceiveSettings(context, payload);
  } else if (action === BATTERY_ACTION) {
    battery.onDidReceiveSettings(context, payload);
  } else if (action === OSASCRIPT_ACTION) {
    osascript.onDidReceiveSettings(context, payload);
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
