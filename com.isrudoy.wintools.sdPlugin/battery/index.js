/**
 * Battery Monitor - Property Inspector
 * Razer devices only (Windows)
 * Using StreamDock SDK pattern
 * @module battery/index
 */

/**
 * @typedef {Object} BatteryPIDevice
 * @property {string} name
 * @property {'razer'} type
 * @property {number|null} battery
 * @property {boolean} [isCharging]
 * @property {boolean} [connected]
 * @property {string} [error]
 * @property {number} [lastBattery]
 */

/**
 * @typedef {Object} BatteryPISettings
 * @property {string} [device1]
 * @property {number} [device1Interval]
 * @property {string} [device2]
 * @property {number} [device2Interval]
 */

// SDK configuration
const $local = false; // No localization
const $back = false; // Auto-show UI when settings received

// DOM elements cache
const $dom = {
  main: $('.sdpi-wrapper'),
  device1: $('#device1'),
  device1Interval: $('#device1Interval'),
  device1IntervalLabel: $('#device1IntervalLabel'),
  device2: $('#device2'),
  device2Interval: $('#device2Interval'),
  device2IntervalLabel: $('#device2IntervalLabel'),
  statusMessage: $('#statusMessage'),
  warningMessage: $('#warningMessage'),
};

// Device list storage
/** @type {BatteryPIDevice[]} */
let deviceList = [];

/**
 * StreamDock event handlers - SDK pattern
 */
const $propEvent = {
  /**
   * Called when settings are received from StreamDock
   * @param {{settings: BatteryPISettings}} data
   */
  didReceiveSettings(data) {
    const settings = data.settings || {};
    loadSettings(settings);
    $websocket?.sendToPlugin({ event: 'getAllDevices' });
  },

  /**
   * Called when plugin sends data to PI
   * @param {{event?: string, devices?: BatteryPIDevice[], message?: string, settings?: BatteryPISettings}} data
   */
  sendToPropertyInspector(data) {
    if (!data) return;

    switch (data.event) {
      case 'allDeviceList': {
        deviceList = data.devices || [];
        populateDeviceLists();
        if (deviceList.length > 0) {
          showStatus('Found ' + deviceList.length + ' device(s)', 'success');
        } else {
          showStatus('No devices found', 'info');
        }
        break;
      }
      case 'warning':
        showWarning(data.message || '');
        break;

      case 'error':
        showStatus('Error: ' + (data.message || 'Unknown error'), 'error');
        break;
    }

    if (data.settings) {
      loadSettings(data.settings);
    }
  },

  /**
   * @param {Record<string, unknown>} _data
   */
  didReceiveGlobalSettings(_data) {
    // Global settings received
  },
};

/**
 * Get device display name with battery info
 * @param {BatteryPIDevice} device
 * @returns {string}
 */
function getDeviceDisplayName(device) {
  let batteryText;

  if (device.connected === false) {
    batteryText = device.lastBattery ? `(Offline, was ${device.lastBattery}%)` : '(Offline)';
  } else if (device.error === 'timeout') {
    batteryText = '(No Response)';
  } else if (device.error === 'not_supported') {
    batteryText = '(Not Supported)';
  } else if (device.isCharging) {
    batteryText = '(Charging)';
  } else if (device.battery !== null && device.battery !== undefined) {
    batteryText = `(${device.battery}%)`;
  } else {
    batteryText = '(N/A)';
  }

  return `${device.name} ${batteryText}`;
}

/**
 * Get unique device ID (type:name)
 * @param {BatteryPIDevice} device
 * @returns {string}
 */
function getDeviceId(device) {
  return `${device.type}:${device.name}`;
}

/**
 * Populate both device dropdowns with device list
 */
function populateDeviceLists() {
  populateDeviceSelect($dom.device1, 'device1');
  populateDeviceSelect($dom.device2, 'device2', true); // true = add "None" option
}

/**
 * Populate a single device select dropdown
 * @param {DOMElementWithMethods|null} select
 * @param {string} settingKey
 * @param {boolean} [addNoneOption]
 */
function populateDeviceSelect(select, settingKey, addNoneOption = false) {
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '';

  if (deviceList.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No devices found';
    select.appendChild(option);
    return;
  }

  if (addNoneOption) {
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '-- None (single device mode) --';
    select.appendChild(noneOption);
  } else {
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = '-- Auto (first available) --';
    select.appendChild(autoOption);
  }

  deviceList.forEach((device) => {
    const option = document.createElement('option');
    option.value = getDeviceId(device);
    option.textContent = getDeviceDisplayName(device);
    select.appendChild(option);
  });

  // Restore previous selection if exists
  if (currentValue && deviceList.some((d) => getDeviceId(d) === currentValue)) {
    select.value = currentValue;
  } else if (typeof $settings !== 'undefined' && $settings && $settings[settingKey]) {
    select.value = /** @type {string} */ ($settings[settingKey]);
  }
}

/**
 * Load settings into UI
 * @param {BatteryPISettings} settings
 */
function loadSettings(settings) {
  if (settings.device1 !== undefined && $dom.device1) {
    $dom.device1.value = settings.device1;
  }

  if (settings.device1Interval !== undefined && $dom.device1Interval) {
    $dom.device1Interval.value = String(settings.device1Interval);
    updateIntervalLabel1();
  }

  if (settings.device2 !== undefined && $dom.device2) {
    $dom.device2.value = settings.device2;
  }

  if (settings.device2Interval !== undefined && $dom.device2Interval) {
    $dom.device2Interval.value = String(settings.device2Interval);
    updateIntervalLabel2();
  }
}

/**
 * Save settings to StreamDock
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) {
    return;
  }

  $settings.device1 = $dom.device1?.value || '';
  $settings.device1Interval = parseInt($dom.device1Interval?.value) || 30;
  $settings.device2 = $dom.device2?.value || '';
  $settings.device2Interval = parseInt($dom.device2Interval?.value) || 30;

  if (typeof $websocket === 'undefined' || !$websocket) {
    return;
  }
  $websocket.sendToPlugin({
    device1: $settings.device1,
    device1Interval: $settings.device1Interval,
    device2: $settings.device2,
    device2Interval: $settings.device2Interval,
  });
}

/**
 * Refresh device list from plugin
 */
function refreshDevices() {
  if (typeof $websocket === 'undefined' || !$websocket) {
    return;
  }
  showStatus('Scanning for devices...', 'info');
  $websocket.sendToPlugin({ event: 'getAllDevices' });
}

/**
 * Show status message
 * @param {string} message
 * @param {string} type
 */
function showStatus(message, type) {
  if (!$dom.statusMessage) return;

  $dom.statusMessage.textContent = message;
  $dom.statusMessage.className = 'status-message status-' + type;
  $dom.statusMessage.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      if ($dom.statusMessage.textContent === message) {
        $dom.statusMessage.style.display = 'none';
      }
    }, 5000);
  }
}

/**
 * Show warning message (persistent)
 * @param {string} message
 */
function showWarning(message) {
  if (!$dom.warningMessage) return;

  $dom.warningMessage.textContent = message;
  $dom.warningMessage.style.display = 'block';
}

/**
 * Update interval label for device 1
 */
function updateIntervalLabel1() {
  const interval = $dom.device1Interval?.value || '30';
  if ($dom.device1IntervalLabel) {
    $dom.device1IntervalLabel.textContent = interval + ' sec';
  }
}

/**
 * Update interval label for device 2
 */
function updateIntervalLabel2() {
  const interval = $dom.device2Interval?.value || '30';
  if ($dom.device2IntervalLabel) {
    $dom.device2IntervalLabel.textContent = interval + ' sec';
  }
}

/**
 * Set update interval for device 1 from clickable spans
 * @param {string} value
 */
function setUpdateInterval1(value) {
  if ($dom.device1Interval) {
    $dom.device1Interval.value = value;
    updateIntervalLabel1();
    saveSettings();
  }
}

/**
 * Set update interval for device 2 from clickable spans
 * @param {string} value
 */
function setUpdateInterval2(value) {
  if ($dom.device2Interval) {
    $dom.device2Interval.value = value;
    updateIntervalLabel2();
    saveSettings();
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  updateIntervalLabel1();
  updateIntervalLabel2();
});
