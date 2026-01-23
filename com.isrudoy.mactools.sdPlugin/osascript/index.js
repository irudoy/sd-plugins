/**
 * OSA Script - Property Inspector
 * Using StreamDock SDK pattern
 * @module osascript/index
 */

/**
 * @typedef {Object} OSAScriptPISettings
 * @property {'AppleScript'|'JavaScript'} [language]
 * @property {string} [scriptText]
 */

// SDK configuration
const $local = false; // No localization
const $back = false; // Auto-show UI when settings received

// DOM elements cache
const $dom = {
  main: $('.sdpi-wrapper'),
  applescriptLang: $('#applescriptLang'),
  javascriptLang: $('#javascriptLang'),
  scriptText: $('#scriptText'),
};

/**
 * StreamDock event handlers - SDK pattern
 */
const $propEvent = {
  /**
   * Called when settings are received from StreamDock
   * @param {{settings: OSAScriptPISettings}} data
   */
  didReceiveSettings(data) {
    const settings = data.settings || {};
    loadSettings(settings);
  },

  /**
   * Called when plugin sends data to PI
   * @param {Record<string, unknown>} _data
   */
  sendToPropertyInspector(_data) {
    // No data expected from plugin for this simple action
  },

  /**
   * @param {Record<string, unknown>} _data
   */
  didReceiveGlobalSettings(_data) {
    // Global settings received
  },
};

/**
 * Load settings into UI
 * @param {OSAScriptPISettings} settings
 */
function loadSettings(settings) {
  // Default to AppleScript
  const isJavaScript = settings.language === 'JavaScript';

  if ($dom.applescriptLang) {
    $dom.applescriptLang.checked = !isJavaScript;
  }
  if ($dom.javascriptLang) {
    $dom.javascriptLang.checked = isJavaScript;
  }
  if ($dom.scriptText) {
    $dom.scriptText.value = settings.scriptText || '';
  }
}

/**
 * Save settings to StreamDock
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) {
    return;
  }

  // Update settings via proxy (auto-saves)
  $settings.language = $dom.javascriptLang?.checked ? 'JavaScript' : 'AppleScript';
  $settings.scriptText = $dom.scriptText?.value || '';
}
