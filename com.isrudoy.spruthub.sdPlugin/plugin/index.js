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
const light = require('./actions/light');
const switchAction = require('./actions/switch');
const outlet = require('./actions/outlet');
const lock = require('./actions/lock');
const cover = require('./actions/cover');
const thermostat = require('./actions/thermostat');
const sensor = require('./actions/sensor');
const button = require('./actions/button');

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
  switch (action) {
    case LIGHT_ACTION:
      light.onWillAppear(context, payload);
      break;
    case SWITCH_ACTION:
      switchAction.onWillAppear(context, payload);
      break;
    case OUTLET_ACTION:
      outlet.onWillAppear(context, payload);
      break;
    case LOCK_ACTION:
      lock.onWillAppear(context, payload);
      break;
    case COVER_ACTION:
      cover.onWillAppear(context, payload);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onWillAppear(context, payload);
      break;
    case SENSOR_ACTION:
      sensor.onWillAppear(context, payload);
      break;
    case BUTTON_ACTION:
      button.onWillAppear(context, payload);
      break;
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
  switch (action) {
    case LIGHT_ACTION:
      light.onWillDisappear(context);
      break;
    case SWITCH_ACTION:
      switchAction.onWillDisappear(context);
      break;
    case OUTLET_ACTION:
      outlet.onWillDisappear(context);
      break;
    case LOCK_ACTION:
      lock.onWillDisappear(context);
      break;
    case COVER_ACTION:
      cover.onWillDisappear(context);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onWillDisappear(context);
      break;
    case SENSOR_ACTION:
      sensor.onWillDisappear(context);
      break;
    case BUTTON_ACTION:
      button.onWillDisappear(context);
      break;
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
  switch (action) {
    case LIGHT_ACTION:
      light.onKeyUp(context, payload);
      break;
    case SWITCH_ACTION:
      switchAction.onKeyUp(context, payload);
      break;
    case OUTLET_ACTION:
      outlet.onKeyUp(context, payload);
      break;
    case LOCK_ACTION:
      lock.onKeyUp(context, payload);
      break;
    case COVER_ACTION:
      cover.onKeyUp(context, payload);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onKeyUp(context, payload);
      break;
    case SENSOR_ACTION:
      sensor.onKeyUp(context, payload);
      break;
    case BUTTON_ACTION:
      button.onKeyUp(context, payload);
      break;
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
  /** @type {boolean} */
  let handled = false;
  switch (action) {
    case LIGHT_ACTION:
      handled = light.onSendToPlugin(context, payload);
      break;
    case SWITCH_ACTION:
      handled = switchAction.onSendToPlugin(context, payload);
      break;
    case OUTLET_ACTION:
      handled = outlet.onSendToPlugin(context, payload);
      break;
    case LOCK_ACTION:
      handled = lock.onSendToPlugin(context, payload);
      break;
    case COVER_ACTION:
      handled = cover.onSendToPlugin(context, payload);
      break;
    case THERMOSTAT_ACTION:
      handled = thermostat.onSendToPlugin(context, payload);
      break;
    case SENSOR_ACTION:
      handled = sensor.onSendToPlugin(context, payload);
      break;
    case BUTTON_ACTION:
      handled = button.onSendToPlugin(context, payload);
      break;
  }
  if (handled) return;

  // Handle settings update
  /** @type {Record<string, unknown>} */
  const settings = /** @type {Record<string, unknown>} */ (payload);
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action });
  }

  switch (action) {
    case LIGHT_ACTION:
      light.onSettingsUpdate(context, settings);
      break;
    case SWITCH_ACTION:
      switchAction.onSettingsUpdate(context, settings);
      break;
    case OUTLET_ACTION:
      outlet.onSettingsUpdate(context, settings);
      break;
    case LOCK_ACTION:
      lock.onSettingsUpdate(context, settings);
      break;
    case COVER_ACTION:
      cover.onSettingsUpdate(context, settings);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onSettingsUpdate(context, settings);
      break;
    case SENSOR_ACTION:
      sensor.onSettingsUpdate(context, settings);
      break;
    case BUTTON_ACTION:
      button.onSettingsUpdate(context, settings);
      break;
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

  switch (action) {
    case LIGHT_ACTION:
      light.onPropertyInspectorDidAppear(context);
      break;
    case SWITCH_ACTION:
      switchAction.onPropertyInspectorDidAppear(context);
      break;
    case OUTLET_ACTION:
      outlet.onPropertyInspectorDidAppear(context);
      break;
    case LOCK_ACTION:
      lock.onPropertyInspectorDidAppear(context);
      break;
    case COVER_ACTION:
      cover.onPropertyInspectorDidAppear(context);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onPropertyInspectorDidAppear(context);
      break;
    case SENSOR_ACTION:
      sensor.onPropertyInspectorDidAppear(context);
      break;
    case BUTTON_ACTION:
      button.onPropertyInspectorDidAppear(context);
      break;
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
  switch (action) {
    case LIGHT_ACTION:
      light.onDidReceiveSettings(context, payload);
      break;
    case SWITCH_ACTION:
      switchAction.onDidReceiveSettings(context, payload);
      break;
    case OUTLET_ACTION:
      outlet.onDidReceiveSettings(context, payload);
      break;
    case LOCK_ACTION:
      lock.onDidReceiveSettings(context, payload);
      break;
    case COVER_ACTION:
      cover.onDidReceiveSettings(context, payload);
      break;
    case THERMOSTAT_ACTION:
      thermostat.onDidReceiveSettings(context, payload);
      break;
    case SENSOR_ACTION:
      sensor.onDidReceiveSettings(context, payload);
      break;
    case BUTTON_ACTION:
      button.onDidReceiveSettings(context, payload);
      break;
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
