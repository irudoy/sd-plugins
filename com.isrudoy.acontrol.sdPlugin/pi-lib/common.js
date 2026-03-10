/**
 * A Control Property Inspector Common Library
 * Provides shared functionality for speaker configuration.
 */

/* global document, $settings, $websocket */

// Required by sd-action.js SDK
const $dom = {};

const AControlPI = (function () {
  'use strict';

  /** @type {boolean} */
  let initialized = false;

  /** @type {boolean} */
  let discovering = false;

  /** @type {string[]} */
  let connectedSpeakers = [];

  /**
   * Initialize the Property Inspector
   * @param {Object} options
   * @param {Function} [options.onStatusUpdate] - Called when speaker status updates
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
        console.log('[AControlPI] didReceiveSettings:', JSON.stringify(data));
        const settings = data.settings || {};
        console.log('[AControlPI] Restoring settings:', JSON.stringify(settings));
        restoreSettings(settings);

        // Request current speaker status
        $websocket.sendToPlugin({ event: 'getStatus' });
      },

      /**
       * Handle sendToPropertyInspector from plugin
       * @param {Object} data
       */
      sendToPropertyInspector(data) {
        if (data.event === 'speakerStatus') {
          connectedSpeakers = data.speakers || [];
          discovering = data.discovering || false;
          updateSpeakerStatus(data.connected, connectedSpeakers, discovering);

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
    console.log('[AControlPI] restoreSettings called with:', JSON.stringify(settings));

    // Press action
    const pressAction = document.getElementById('pressAction');
    if (pressAction && settings.pressAction) {
      console.log('[AControlPI] Setting pressAction to:', settings.pressAction);
      pressAction.value = settings.pressAction;
    }

    // Dial action
    const dialAction = document.getElementById('dialAction');
    if (dialAction && settings.dialAction) {
      console.log('[AControlPI] Setting dialAction to:', settings.dialAction);
      dialAction.value = settings.dialAction;
    }

    // Volume step
    const volumeStep = document.getElementById('volumeStep');
    if (volumeStep && settings.volumeStep) {
      console.log('[AControlPI] Setting volumeStep to:', settings.volumeStep);
      volumeStep.value = settings.volumeStep;
    }

    // DIM level
    const dimLevel = document.getElementById('dimLevel');
    if (dimLevel && settings.dimLevel) {
      console.log('[AControlPI] Setting dimLevel to:', settings.dimLevel);
      dimLevel.value = settings.dimLevel;
    }
  }

  /**
   * Update speaker status display
   * @param {boolean} connected
   * @param {string[]} speakers
   * @param {boolean} isDiscovering
   */
  function updateSpeakerStatus(connected, speakers, isDiscovering) {
    const statusPanel = document.getElementById('speakerStatus');
    if (!statusPanel) return;

    let html = '<h4>Speakers</h4>';

    if (isDiscovering) {
      html += '<div class="status-message status-info">Searching for speakers...</div>';
    } else if (!connected || speakers.length === 0) {
      html +=
        '<div class="status-message status-error">No speakers found</div>' +
        '<p class="help-text">Make sure your Adam Audio A-Series speakers are powered on ' +
        'and connected to the same network. Close A Control app if running.</p>';
    } else {
      html += '<ul class="speaker-list">';
      for (const name of speakers) {
        html += `<li>${escapeHtml(name)}</li>`;
      }
      html += '</ul>';
    }

    statusPanel.innerHTML = html;

    // Update refresh button state
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.disabled = isDiscovering;
      refreshBtn.textContent = isDiscovering ? 'Searching...' : 'Refresh';
    }
  }

  /**
   * Save current settings to StreamDock
   */
  function saveSettings() {
    console.log('[AControlPI] saveSettings called, initialized:', initialized);
    if (!initialized) return;
    if (typeof $settings === 'undefined' || !$settings) {
      console.log('[AControlPI] $settings is undefined!');
      return;
    }

    const pressAction = getValue('pressAction', 'mute');
    const dialAction = getValue('dialAction', 'volume');
    const volumeStep = parseInt(getValue('volumeStep', '2'), 10);
    const dimLevel = parseInt(getValue('dimLevel', '-20'), 10);

    console.log('[AControlPI] Saving:', { pressAction, dialAction, volumeStep, dimLevel });

    $settings.pressAction = pressAction;
    $settings.dialAction = dialAction;
    $settings.volumeStep = volumeStep;
    $settings.dimLevel = dimLevel;
  }

  /**
   * Request speaker discovery refresh
   */
  function refreshSpeakers() {
    discovering = true;
    updateSpeakerStatus(false, [], true);
    $websocket.sendToPlugin({ event: 'refreshDiscovery' });
  }

  /**
   * Blink speaker LEDs for identification
   */
  function blinkLED() {
    $websocket.sendToPlugin({ event: 'blinkLED' });
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
    refreshSpeakers,
    blinkLED,
    restoreSettings,
    updateSpeakerStatus,
  };
})();
