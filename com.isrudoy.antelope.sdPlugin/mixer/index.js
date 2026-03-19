/**
 * Mixer Property Inspector
 * Configuration for Antelope mixer control.
 */

const $local = false;
const $back = false;

/** @type {string[]} */
let channelNames = [];

/**
 * Get channel name (from plugin or default)
 * @param {number} channelId - Channel ID 0-15
 * @returns {string} Channel name
 */
function getChannelName(channelId) {
  if (channelNames[channelId]) {
    return channelNames[channelId];
  }
  // Default names for Zen Quadro SC (16 channels)
  if (channelId < 6) return `AFX ${channelId + 1}`;
  if (channelId < 8) return `USB ${channelId - 5}`;
  if (channelId < 16) return `ADAT ${channelId - 7}`;
  return `Ch ${channelId + 1}`;
}

/**
 * Populate channel dropdown with names
 * @param {string[]} [names] - Optional channel names from plugin
 */
function populateChannels(names) {
  if (names) {
    channelNames = names;
  }

  const channelSelect = document.getElementById('channelId');
  if (!channelSelect) return;

  // Save current selection
  const currentValue = channelSelect.value;

  channelSelect.innerHTML = '';
  for (let i = 1; i < 16; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = getChannelName(i);
    channelSelect.appendChild(option);
  }

  // Restore selection
  if (currentValue) {
    channelSelect.value = currentValue;
  }
}

/**
 * Update UI visibility based on settings
 */
function updateVisibility() {
  const dialAction = document.getElementById('dialAction');
  const faderStepRow = document.getElementById('faderStepRow');

  if (faderStepRow && dialAction) {
    faderStepRow.style.display = dialAction.value === 'fader' ? '' : 'none';
  }
}

// Initialize PI with event handlers
const piInit = AntelopePI.init({
  onStatusUpdate: function () {
    // Request channel names when connected
    if (typeof $websocket !== 'undefined') {
      $websocket.sendToPlugin({ event: 'getChannelNames' });
    }
  },
});

// Export $propEvent for StreamDock SDK
const $propEvent = {
  didReceiveSettings: function (data) {
    piInit.$propEvent.didReceiveSettings(data);
    updateVisibility();
  },
  sendToPropertyInspector: function (data) {
    piInit.$propEvent.sendToPropertyInspector(data);

    // Handle channel names from plugin
    if (data && data.event === 'channelNames' && Array.isArray(data.names)) {
      populateChannels(data.names);
    }
  },
};

// Initial setup
document.addEventListener('DOMContentLoaded', function () {
  populateChannels();
  updateVisibility();

  // Request channel names
  setTimeout(function () {
    if (typeof $websocket !== 'undefined') {
      $websocket.sendToPlugin({ event: 'getChannelNames' });
    }
  }, 100);
});
