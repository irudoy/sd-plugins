/**
 * OSA Script action for Mac Tools Plugin
 * Runs AppleScript and JavaScript for Automation (JXA) scripts
 * @module actions/osascript
 */

const { exec } = require('child_process');
const { createCanvas } = require('canvas');
const { log, CANVAS_SIZE, OSASCRIPT_ACTION } = require('../lib/common');
const { contexts, setContext } = require('../lib/state');
const { setImage, clearImage } = require('../lib/websocket');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').AppearPayload<OSAScriptSettings>} AppearPayloadOSA
 * @typedef {import('../../../types/streamdock').KeyPayload<OSAScriptSettings>} KeyPayloadOSA
 * @typedef {import('../../../types/streamdock').SettingsPayload<OSAScriptSettings>} SettingsPayloadOSA
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 */

/**
 * OSA Script settings
 * @typedef {Object} OSAScriptSettings
 * @property {'AppleScript'|'JavaScript'} [language] - Script language
 * @property {string} [scriptText] - Script content
 */

/**
 * @callback ScriptCallback
 * @param {Error|null} error - Error if any
 * @param {string} stdout - Standard output
 * @param {string} stderr - Standard error
 * @returns {void}
 */

// ============================================================
// Script Execution
// ============================================================

/**
 * Run AppleScript or JXA script
 * @param {'AppleScript'|'JavaScript'} language - Script language
 * @param {string} scriptText - Script content
 * @param {ScriptCallback} callback - Result callback
 * @returns {void}
 */
function runScript(language, scriptText, callback) {
  const langArg = language === 'JavaScript' ? '-l JavaScript' : '';
  const cmd = `osascript ${langArg} -`;

  log('[OSAScript] Running script:', language);

  const child = exec(cmd, { timeout: 30000 }, callback);
  child.stdin?.write(scriptText);
  child.stdin?.end();
}

// ============================================================
// Feedback Drawing
// ============================================================

/**
 * Draw success feedback (green checkmark)
 * @returns {string} Base64 PNG data URL
 */
function drawSuccessFeedback() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = '#4CAF50';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(40, 75);
  ctx.lineTo(62, 97);
  ctx.lineTo(104, 55);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/**
 * Draw error feedback (red X)
 * @returns {string} Base64 PNG data URL
 */
function drawErrorFeedback() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2e1a1a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = '#F44336';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(48, 48);
  ctx.lineTo(96, 96);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(96, 48);
  ctx.lineTo(48, 96);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

// ============================================================
// Feedback Functions
// ============================================================

/**
 * Show success feedback on button
 * @param {string} context - Action context
 * @returns {void}
 */
function showOk(context) {
  const feedbackImage = drawSuccessFeedback();
  setImage(context, feedbackImage);

  setTimeout(() => {
    clearImage(context);
  }, 500);
}

/**
 * Show error feedback on button
 * @param {string} context - Action context
 * @returns {void}
 */
function showAlert(context) {
  const feedbackImage = drawErrorFeedback();
  setImage(context, feedbackImage);

  setTimeout(() => {
    clearImage(context);
  }, 800);
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle action appearing
 * @param {string} context - Action context
 * @param {AppearPayloadOSA} payload - Event payload
 * @returns {void}
 */
function onWillAppear(context, payload) {
  const settings = payload?.settings || {};
  setContext(context, { settings, action: OSASCRIPT_ACTION });
}

/**
 * Handle action disappearing
 * @param {string} _context - Action context
 * @returns {void}
 */
function onWillDisappear(_context) {
  // Nothing to clean up for osascript
}

/**
 * Handle key release
 * @param {string} context - Action context
 * @param {KeyPayloadOSA} _payload - Event payload
 * @returns {void}
 */
function onKeyUp(context, _payload) {
  const contextData = contexts[context];
  if (!contextData) {
    log('[OSAScript] No context data for:', context);
    return;
  }

  /** @type {OSAScriptSettings} */
  const settings = contextData.settings || {};
  const language = settings.language || 'AppleScript';
  const scriptText = settings.scriptText || '';

  if (!scriptText.trim()) {
    log('[OSAScript] No script to run');
    showAlert(context);
    return;
  }

  runScript(language, scriptText, (error, stdout, _stderr) => {
    if (error) {
      log('[OSAScript] Script error:', error.message);
      showAlert(context);
    } else {
      log('[OSAScript] Script output:', stdout);
      showOk(context);
    }
  });
}

/**
 * Handle data from Property Inspector
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {boolean}
 */
function onSendToPlugin(context, payload) {
  if (contexts[context]?.settings) {
    if (payload.language !== undefined) {
      contexts[context].settings.language = payload.language;
    }
    if (payload.scriptText !== undefined) {
      contexts[context].settings.scriptText = payload.scriptText;
    }
  }
  return false;
}

/**
 * Handle Property Inspector appearing
 * @param {string} _context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(_context) {
  // Nothing to send to PI
}

/**
 * Handle settings received
 * @param {string} context - Action context
 * @param {SettingsPayloadOSA} payload - Settings payload
 * @returns {void}
 */
function onDidReceiveSettings(context, payload) {
  onSettingsUpdate(context, payload?.settings || {});
}

/**
 * Handle settings update
 * @param {string} context - Action context
 * @param {OSAScriptSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action: OSASCRIPT_ACTION });
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  runScript,
  showOk,
  showAlert,
  onWillAppear,
  onWillDisappear,
  onKeyUp,
  onSendToPlugin,
  onPropertyInspectorDidAppear,
  onDidReceiveSettings,
  onSettingsUpdate,
};
