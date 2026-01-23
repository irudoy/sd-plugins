/**
 * Battery Monitor - Property Inspector
 * Unified PI for Apple Bluetooth and Razer devices
 * Using StreamDock SDK pattern
 * @module battery/index
 */

// Make this file a module to avoid global scope conflicts
export {};

/**
 * @typedef {Object} BatteryPIDevice
 * @property {string} name
 * @property {'apple'|'razer'} type
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
  permissionError: $('#permissionError'),
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
        // Check if any Razer device has access error
        const hasAccessError = deviceList.some(
          (d) => d.type === 'razer' && d.error === 'access_denied'
        );
        if (!hasAccessError) {
          hidePermissionError();
        }
        populateDeviceLists();
        if (deviceList.length > 0) {
          const appleCount = deviceList.filter((d) => d.type === 'apple').length;
          const razerCount = deviceList.filter((d) => d.type === 'razer').length;
          let msg = 'Found ';
          /** @type {string[]} */
          const parts = [];
          if (appleCount > 0) parts.push(appleCount + ' Apple');
          if (razerCount > 0) parts.push(razerCount + ' Razer');
          msg += parts.join(', ') + ' device(s)';
          showStatus(msg, 'success');
        } else {
          showStatus('No devices found', 'info');
        }
        break;
      }
      case 'warning':
        showWarning(data.message || '');
        break;

      case 'permissionError':
        showPermissionError(data.message || '');
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
 * Get device display name with type prefix and battery info
 * @param {BatteryPIDevice} device
 * @returns {string}
 */
function getDeviceDisplayName(device) {
  const prefix = device.type === 'apple' ? '\uF8FF' : '\uD83D\uDDB1\uFE0F'; //  or 🖱️
  let batteryText;

  if (device.connected === false) {
    batteryText = device.lastBattery ? `(Offline, was ${device.lastBattery}%)` : '(Offline)';
  } else if (device.error === 'access_denied') {
    batteryText = '(No Access)';
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

  return `${prefix} ${device.name} ${batteryText}`;
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
    // Add "None" option for device 2
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '-- None (single device mode) --';
    select.appendChild(noneOption);
  } else {
    // Add "Auto (first device)" option for device 1
    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = '-- Auto (first available) --';
    select.appendChild(autoOption);
  }

  // Group devices by type
  const appleDevices = deviceList.filter((d) => d.type === 'apple');
  const razerDevices = deviceList.filter((d) => d.type === 'razer');

  // Add Apple devices
  if (appleDevices.length > 0) {
    const appleGroup = document.createElement('optgroup');
    appleGroup.label = 'Apple Bluetooth';
    appleDevices.forEach((device) => {
      const option = document.createElement('option');
      option.value = getDeviceId(device);
      option.textContent = getDeviceDisplayName(device);
      appleGroup.appendChild(option);
    });
    select.appendChild(appleGroup);
  }

  // Add Razer devices
  if (razerDevices.length > 0) {
    const razerGroup = document.createElement('optgroup');
    razerGroup.label = 'Razer';
    razerDevices.forEach((device) => {
      const option = document.createElement('option');
      option.value = getDeviceId(device);
      option.textContent = getDeviceDisplayName(device);
      razerGroup.appendChild(option);
    });
    select.appendChild(razerGroup);
  }

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

  // Update settings via proxy (auto-saves)
  $settings.device1 = $dom.device1?.value || '';
  $settings.device1Interval = parseInt($dom.device1Interval?.value) || 30;
  $settings.device2 = $dom.device2?.value || '';
  $settings.device2Interval = parseInt($dom.device2Interval?.value) || 30;

  // Also send to plugin for immediate update
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

  // Auto-hide success messages
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
 * Show permission error with instructions
 * @param {string} message
 */
function showPermissionError(message) {
  if (!$dom.permissionError) return;

  $dom.permissionError.innerHTML = message.replace(/\n/g, '<br>');
  $dom.permissionError.style.display = 'block';
}

/**
 * Hide permission error
 */
function hidePermissionError() {
  if (!$dom.permissionError) return;
  $dom.permissionError.style.display = 'none';
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
