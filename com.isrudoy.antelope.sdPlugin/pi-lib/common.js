/**
 * Antelope Control Property Inspector Common Library
 * Provides shared functionality for action configuration.
 */

/* global document, $settings, $websocket */

// Required by sd-action.js SDK
const $dom = {};

const AntelopePI = (function () {
  'use strict';

  /** @type {boolean} */
  let initialized = false;

  /** @type {boolean} */
  let connected = false;

  /**
   * Initialize the Property Inspector
   * @param {Object} options
   * @param {Function} [options.onStatusUpdate] - Called when status updates
   * @returns {{$propEvent: Object}}
   */
  function init(options = {}) {
    const { onStatusUpdate } = options;

    const $propEvent = {
      /**
       * Handle didReceiveSettings from StreamDock
       * @param {Object} data
       */
      didReceiveSettings(data) {
        console.log('[AntelopePI] didReceiveSettings:', JSON.stringify(data));
        const settings = data.settings || {};
        console.log('[AntelopePI] Restoring settings:', JSON.stringify(settings));
        restoreSettings(settings);

        // Request current status
        $websocket.sendToPlugin({ event: 'getStatus' });
      },

      /**
       * Handle sendToPropertyInspector from plugin
       * @param {Object} data
       */
      sendToPropertyInspector(data) {
        if (data.event === 'status') {
          connected = data.connected || false;
          updateConnectionStatus(connected);

          if (onStatusUpdate) {
            onStatusUpdate(data);
          }
        }
      },
    };

    // Initialize $dom.main for SDK compatibility
    $dom.main = document.querySelector('.sdpi-wrapper');

    // Show wrapper after initialization
    setTimeout(() => {
      if ($dom.main) {
        $dom.main.style.display = 'block';
      }
      initialized = true;
    }, 100);

    return { $propEvent };
  }

  /**
   * Restore settings to UI elements
   * @param {Object} settings
   */
  function restoreSettings(settings) {
    console.log('[AntelopePI] restoreSettings called with:', JSON.stringify(settings));

    // Iterate over all settings and restore to corresponding elements
    for (const [key, value] of Object.entries(settings)) {
      const el = document.getElementById(key);
      if (el) {
        console.log(`[AntelopePI] Setting ${key} to:`, value);
        el.value = value;
      }
    }
  }

  /**
   * Update connection status display
   * @param {boolean} isConnected
   */
  function updateConnectionStatus(isConnected) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    if (isConnected) {
      statusEl.innerHTML =
        '<div class="status-message status-success">Connected to Antelope Manager</div>';
    } else {
      statusEl.innerHTML =
        '<div class="status-message status-error">Not Connected</div>' +
        '<p class="help-text">Make sure Antelope Manager Server is running.</p>';
    }
  }

  /**
   * Save current settings to StreamDock
   */
  function saveSettings() {
    console.log('[AntelopePI] saveSettings called, initialized:', initialized);
    if (!initialized) return;
    if (typeof $settings === 'undefined' || !$settings) {
      console.log('[AntelopePI] $settings is undefined!');
      return;
    }

    // Get all input/select elements with data-setting attribute
    const elements = document.querySelectorAll('[data-setting]');
    for (const el of elements) {
      const key = el.getAttribute('data-setting');
      const type = el.getAttribute('data-type') || 'string';

      let value = el.value;
      if (type === 'number') {
        value = parseInt(value, 10);
      }

      console.log(`[AntelopePI] Saving ${key}:`, value);
      $settings[key] = value;
    }
  }

  /**
   * Get value from element
   * @param {string} id
   * @param {string} defaultValue
   * @returns {string}
   */
  function getValue(id, defaultValue) {
    const el = document.getElementById(id);
    return el ? el.value : defaultValue;
  }

  /**
   * Escape HTML special characters
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Public API
  return {
    init,
    saveSettings,
    restoreSettings,
    updateConnectionStatus,
    getValue,
    escapeHtml,
  };
})();
