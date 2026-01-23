/**
 * Light - Property Inspector
 * Using StreamDock SDK pattern
 * @module light/index
 */

/**
 * @typedef {Object} PIRoom
 * @property {number} id
 * @property {string} name
 */

/**
 * @typedef {Object} PICharacteristicControl
 * @property {unknown} [value]
 */

/**
 * @typedef {Object} PICharacteristic
 * @property {number} cId
 * @property {number|string} type
 * @property {PICharacteristicControl} [control]
 */

/**
 * @typedef {Object} PIService
 * @property {number} sId
 * @property {string} [name]
 * @property {number|string} type
 * @property {PICharacteristic[]} [characteristics]
 */

/**
 * @typedef {Object} PILight
 * @property {number} id
 * @property {string} name
 * @property {number} [roomId]
 * @property {PIService[]} [services]
 */

/**
 * Local settings (per-widget)
 * Connection params stored here for button operation (also stored globally for UI)
 * @typedef {Object} LightPISettings
 * @property {string} [host] - Hub hostname (copied from global)
 * @property {string} [token] - Auth token (copied from global)
 * @property {string} [serial] - Hub serial (copied from global)
 * @property {number} [roomId] - Selected room ID
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId] - Actual service ID (sId of Lightbulb service)
 * @property {string} [serviceName] - Service name for display
 * @property {number} [characteristicId] - Actual On characteristic ID (not type)
 * @property {string} [customName] - Custom display name (overrides auto name)
 * @property {string} [action]
 */

// SDK configuration
const $local = false;
const $back = false;

/**
 * @typedef {Object} GlobalSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 */

/** @type {GlobalSettings} */
let globalSettings = {};

// DOM elements cache
const $dom = {
  main: $('.sdpi-wrapper'),
  connectionBtn: $('#connectionBtn'),
  connectionStatusText: $('#connectionStatusText'),
  connectionSettings: $('#connectionSettings'),
  host: $('#host'),
  token: $('#token'),
  serial: $('#serial'),
  roomSelect: $('#roomSelect'),
  lightSelect: $('#lightSelect'),
  serviceSelectRow: $('#serviceSelectRow'),
  serviceSelect: $('#serviceSelect'),
  customName: $('#customName'),
  actionSelect: $('#actionSelect'),
  testButton: $('#testButton'),
  statusMessage: $('#statusMessage'),
};

/** @type {boolean} */
let connectionSettingsVisible = false;

/** @type {boolean} */
let devicesLoaded = false;

// Data storage
/** @type {PIRoom[]} */
let rooms = [];

/** @type {PILight[]} */
let lights = [];

// Service type for Lightbulb
const SERVICE_LIGHTBULB = 13;

/**
 * StreamDock event handlers - SDK pattern
 */
const $propEvent = {
  /**
   * Called when settings are received from StreamDock
   * @param {{settings: LightPISettings}} data
   */
  didReceiveSettings(data) {
    const settings = data.settings || {};

    // Load local device settings into UI
    loadSettings(settings);

    // Request global settings to get connection params
    requestGlobalSettings();
  },

  /**
   * Called when plugin sends data to PI
   * @param {{event?: string, rooms?: PIRoom[], lights?: PILight[], success?: boolean, error?: string, message?: string}} data
   */
  sendToPropertyInspector(data) {
    if (!data) return;

    switch (data.event) {
      case 'deviceList':
        rooms = data.rooms || [];
        lights = data.lights || [];
        devicesLoaded = true;
        populateRooms();
        populateLights();
        // Update status to connected (no status message to avoid flashing)
        updateConnectionStatus(true, globalSettings.host || $dom.host?.value?.trim());
        break;

      case 'testResult':
        if (data.success) {
          showStatus('Connection successful!', 'success');
          rooms = data.rooms || [];
          lights = data.lights || [];
          devicesLoaded = true;
          populateRooms();
          populateLights();
          // Save working connection settings globally
          saveGlobalSettings();
          // Update status to connected
          updateConnectionStatus(true, $dom.host?.value?.trim());
          // Hide settings panel after successful connection
          if (connectionSettingsVisible) {
            toggleConnectionSettings();
          }
        } else {
          showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
          updateConnectionStatus(false);
        }
        enableTestButton();
        break;

      case 'error':
        showStatus('Error: ' + (data.message || 'Unknown error'), 'error');
        break;
    }
  },

  /**
   * Called when global settings are received
   * @param {{settings: GlobalSettings}} data
   */
  didReceiveGlobalSettings(data) {
    globalSettings = data.settings || {};

    // Load connection settings into UI fields
    loadConnectionSettings(globalSettings);

    // Sync global connection settings to local (for button operation)
    if (typeof $settings !== 'undefined' && $settings) {
      if (globalSettings.host) $settings.host = globalSettings.host;
      if (globalSettings.token) $settings.token = globalSettings.token;
      if (globalSettings.serial) $settings.serial = globalSettings.serial;
    }

    const hasCredentials = globalSettings.host && globalSettings.token && globalSettings.serial;

    // Update connection status based on current state
    if (devicesLoaded && hasCredentials) {
      // Already connected and have devices
      updateConnectionStatus(true, globalSettings.host);
    } else if (!hasCredentials) {
      // No credentials configured
      updateConnectionStatus(false);
    }
    // If hasCredentials but !devicesLoaded, we'll request devices and status will update on response

    // If we have valid connection credentials and haven't loaded devices yet, request them
    if (!devicesLoaded && hasCredentials) {
      $websocket?.sendToPlugin({
        event: 'getDevices',
        host: globalSettings.host,
        token: globalSettings.token,
        serial: globalSettings.serial,
      });
    }
  },
};

/**
 * Populate rooms dropdown
 */
function populateRooms() {
  const select = $dom.roomSelect;
  if (!select) return;

  // Remember current selection or use saved setting
  const currentValue = select.value;
  const savedRoomId =
    typeof $settings !== 'undefined' && $settings?.roomId ? String($settings.roomId) : '';

  select.innerHTML = '<option value="">-- All Rooms --</option>';

  rooms.forEach((room) => {
    const option = document.createElement('option');
    option.value = String(room.id);
    option.textContent = room.name;
    select.appendChild(option);
  });

  // Restore selection
  if (currentValue) {
    select.value = currentValue;
  } else if (savedRoomId) {
    select.value = savedRoomId;
  }

  // Trigger light filtering
  populateLights();
}

/**
 * Populate lights dropdown (filtered by room if selected)
 */
function populateLights() {
  const select = $dom.lightSelect;
  if (!select) return;

  const roomId = $dom.roomSelect?.value;
  const currentValue = select.value;

  select.innerHTML = '<option value="">-- Select Device --</option>';

  // Hide service select by default
  hideServiceSelect();

  if (lights.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No devices found';
    option.disabled = true;
    select.appendChild(option);
    return;
  }

  // Filter by room if selected
  const filteredLights = roomId ? lights.filter((l) => l.roomId === parseInt(roomId)) : lights;

  filteredLights.forEach((light) => {
    const option = document.createElement('option');
    option.value = String(light.id);
    option.textContent = light.name;
    select.appendChild(option);
  });

  // Restore previous selection if exists
  let restored = false;
  if (currentValue && filteredLights.some((l) => l.id === parseInt(currentValue))) {
    select.value = currentValue;
    restored = true;
  } else if (typeof $settings !== 'undefined' && $settings && $settings.accessoryId) {
    const accessoryId = String($settings.accessoryId);
    if (filteredLights.some((l) => l.id === parseInt(accessoryId))) {
      select.value = accessoryId;
      restored = true;
    }
  }

  // If we restored a selection, populate services
  if (restored) {
    populateServices();
  }
}

/**
 * Filter lights when room changes
 */
function filterLights() {
  // Save selected room
  const roomId = $dom.roomSelect?.value;
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.roomId = roomId ? parseInt(roomId) : undefined;
  }
  populateLights();
}

// Characteristic types for On/Off (can be number or string)
const CHAR_TYPE_ON = 37;
const CHAR_TYPE_ON_NAMES = ['On', 'Power', 'PowerState'];

/**
 * Check if service is a Lightbulb
 * @param {PIService} service
 * @returns {boolean}
 */
function isLightbulbService(service) {
  return service.type === SERVICE_LIGHTBULB || service.type === 'Lightbulb';
}

/**
 * Get all Lightbulb services from accessory
 * @param {PILight} accessory
 * @returns {PIService[]}
 */
function getLightbulbServices(accessory) {
  return accessory.services?.filter(isLightbulbService) || [];
}

/**
 * Check if characteristic value is boolean type
 * @param {PICharacteristic} char
 * @returns {boolean}
 */
function isBooleanCharacteristic(char) {
  const value = char.control?.value;
  if (!value) return false;
  return typeof value === 'boolean' || 'boolValue' in value;
}

/**
 * Find On characteristic in service
 * @param {PIService} service
 * @returns {PICharacteristic|undefined}
 */
function findOnCharacteristic(service) {
  // Try by type name "On" or similar
  let onChar = service.characteristics?.find(
    (c) => c.type === CHAR_TYPE_ON || CHAR_TYPE_ON_NAMES.includes(String(c.type))
  );
  // Fallback: find by boolean value
  if (!onChar) {
    onChar = service.characteristics?.find((c) => isBooleanCharacteristic(c));
  }
  return onChar;
}

/**
 * Hide service select row
 */
function hideServiceSelect() {
  if ($dom.serviceSelectRow) {
    $dom.serviceSelectRow.style.display = 'none';
  }
}

/**
 * Show service select row
 */
function showServiceSelect() {
  if ($dom.serviceSelectRow) {
    $dom.serviceSelectRow.style.display = '';
  }
}

/**
 * Populate services dropdown for selected accessory
 */
function populateServices() {
  const accessoryId = $dom.lightSelect?.value;
  if (!accessoryId) {
    hideServiceSelect();
    return;
  }

  const accessory = lights.find((l) => l.id === parseInt(accessoryId));
  if (!accessory) {
    hideServiceSelect();
    return;
  }

  const lightbulbServices = getLightbulbServices(accessory);

  if (lightbulbServices.length === 0) {
    hideServiceSelect();
    return;
  }

  // If only one lightbulb service, auto-select it and hide dropdown
  if (lightbulbServices.length === 1) {
    hideServiceSelect();
    selectServiceById(lightbulbServices[0].sId);
    return;
  }

  // Multiple lightbulb services - show dropdown
  showServiceSelect();

  const select = $dom.serviceSelect;
  if (!select) return;

  select.innerHTML = '<option value="">-- Select Lightbulb --</option>';

  lightbulbServices.forEach((service) => {
    const option = document.createElement('option');
    option.value = String(service.sId);
    option.textContent = service.name || `Lightbulb ${service.sId}`;
    select.appendChild(option);
  });

  // Restore saved service selection
  if (typeof $settings !== 'undefined' && $settings && $settings.serviceId) {
    const savedServiceId = String($settings.serviceId);
    if (lightbulbServices.some((s) => s.sId === parseInt(savedServiceId))) {
      select.value = savedServiceId;
    }
  }
}

/**
 * Called when accessory is selected
 */
function selectAccessory() {
  const accessoryId = $dom.lightSelect?.value;

  // Clear service selection when accessory changes
  if ($dom.serviceSelect) {
    $dom.serviceSelect.value = '';
  }

  if (!accessoryId) {
    hideServiceSelect();
    // Clear settings
    if (typeof $settings !== 'undefined' && $settings) {
      $settings.accessoryId = undefined;
      $settings.accessoryName = undefined;
      $settings.serviceId = undefined;
      $settings.serviceName = undefined;
      $settings.characteristicId = undefined;
    }
    saveSettings();
    return;
  }

  const accessory = lights.find((l) => l.id === parseInt(accessoryId));
  if (!accessory) return;

  // Save accessory info
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.accessoryId = accessory.id;
    $settings.accessoryName = accessory.name;
  }

  // Populate services dropdown
  populateServices();
}

/**
 * Called when service is selected from dropdown
 */
function selectService() {
  const serviceId = $dom.serviceSelect?.value;
  if (!serviceId) return;

  selectServiceById(parseInt(serviceId));
}

/**
 * Select service by ID and save settings
 * @param {number} serviceId
 */
function selectServiceById(serviceId) {
  const accessoryId = $dom.lightSelect?.value;
  if (!accessoryId) return;

  const accessory = lights.find((l) => l.id === parseInt(accessoryId));
  if (!accessory) return;

  const service = accessory.services?.find((s) => s.sId === serviceId);
  if (!service) {
    return;
  }

  const onChar = findOnCharacteristic(service);
  if (!onChar) {
    return;
  }

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.serviceId = service.sId;
    $settings.serviceName = service.name;
    $settings.characteristicId = onChar.cId;
  }

  saveSettings();
}

/**
 * Load local settings into UI (device selection only)
 * Connection settings are loaded from globalSettings
 * @param {LightPISettings} settings
 */
function loadSettings(settings) {
  if (settings.roomId !== undefined && $dom.roomSelect) {
    $dom.roomSelect.value = String(settings.roomId);
  }

  if (settings.accessoryId !== undefined && $dom.lightSelect) {
    $dom.lightSelect.value = String(settings.accessoryId);
  }

  // Service selection will be restored when populateServices is called
  // after device list is received

  if (settings.customName !== undefined && $dom.customName) {
    $dom.customName.value = settings.customName;
  }

  if (settings.action !== undefined && $dom.actionSelect) {
    $dom.actionSelect.value = settings.action;
  }
}

/**
 * Load connection settings from global settings into UI fields
 * Does NOT update connection status - that's handled separately
 * @param {GlobalSettings} settings
 */
function loadConnectionSettings(settings) {
  if (settings.host !== undefined && $dom.host) {
    $dom.host.value = settings.host;
  }

  if (settings.token !== undefined && $dom.token) {
    $dom.token.value = settings.token;
  }

  if (settings.serial !== undefined && $dom.serial) {
    $dom.serial.value = settings.serial;
  }
}

/**
 * Save settings to StreamDock
 * Connection params are stored in both global (for UI) and local (for button operation)
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) {
    return;
  }

  // Get current connection settings (from global or DOM)
  const host = globalSettings.host || $dom.host?.value?.trim() || '';
  const token = globalSettings.token || $dom.token?.value || '';
  const serial = globalSettings.serial || $dom.serial?.value?.trim() || '';

  // Save connection params to local settings (for button operation)
  // This ensures the button works even after restart
  $settings.host = host;
  $settings.token = token;
  $settings.serial = serial;

  // Save action and custom name
  $settings.customName = $dom.customName?.value?.trim() || '';
  $settings.action = $dom.actionSelect?.value || 'toggle';

  // Send to plugin for immediate update
  sendSettingsToPlugin();
}

/**
 * Check if WebSocket is connected
 * @returns {boolean}
 */
function isWebSocketConnected() {
  return typeof $websocket !== 'undefined' && $websocket && $websocket.readyState === 1;
}

/**
 * Send current settings to plugin (combines global + local)
 */
function sendSettingsToPlugin() {
  if (!isWebSocketConnected()) {
    return;
  }
  if (typeof $settings === 'undefined' || !$settings) {
    return;
  }

  // Combine global connection settings with local device settings
  $websocket.sendToPlugin({
    // Connection from global settings
    host: globalSettings.host || '',
    token: globalSettings.token || '',
    serial: globalSettings.serial || '',
    // Device selection from local settings
    accessoryId: $settings.accessoryId,
    accessoryName: $settings.accessoryName,
    serviceId: $settings.serviceId,
    serviceName: $settings.serviceName,
    characteristicId: $settings.characteristicId,
    customName: $settings.customName,
    action: $settings.action,
  });
}

/**
 * Test connection to Sprut.Hub
 */
function testConnection() {
  const host = $dom.host?.value?.trim();
  const token = $dom.token?.value;
  const serial = $dom.serial?.value?.trim();

  if (!host) {
    showStatus('Please enter Host', 'error');
    return;
  }

  if (!token) {
    showStatus('Please enter Token', 'error');
    return;
  }

  if (!serial) {
    showStatus('Please enter Serial', 'error');
    return;
  }

  showStatus('Testing connection...', 'info');
  disableTestButton();

  if (!isWebSocketConnected()) {
    showStatus('Not connected to StreamDock', 'error');
    enableTestButton();
    return;
  }

  $websocket.sendToPlugin({
    event: 'testConnection',
    host: host,
    token: token,
    serial: serial,
  });

  // Timeout for test
  setTimeout(() => {
    if ($dom.testButton?.disabled) {
      showStatus('Connection timeout', 'error');
      enableTestButton();
    }
  }, 15000);
}

/**
 * Refresh device list from plugin
 */
function refreshDevices() {
  const host = $dom.host?.value?.trim();
  const token = $dom.token?.value;
  const serial = $dom.serial?.value?.trim();

  if (!host || !token || !serial) {
    showStatus('Please fill in connection settings', 'error');
    return;
  }

  if (!isWebSocketConnected()) {
    showStatus('Not connected to StreamDock', 'error');
    return;
  }

  showStatus('Refreshing devices...', 'info');
  $websocket.sendToPlugin({
    event: 'getDevices',
    host: host,
    token: token,
    serial: serial,
  });
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
 * Disable test button during test
 */
function disableTestButton() {
  if ($dom.testButton) {
    $dom.testButton.disabled = true;
    $dom.testButton.textContent = 'Testing...';
  }
}

/**
 * Enable test button after test
 */
function enableTestButton() {
  if ($dom.testButton) {
    $dom.testButton.disabled = false;
    $dom.testButton.textContent = 'Test Connection';
  }
}

// ============================================================
// Connection Settings UI
// ============================================================

/**
 * Toggle connection settings panel visibility
 */
function toggleConnectionSettings() {
  connectionSettingsVisible = !connectionSettingsVisible;

  if ($dom.connectionSettings) {
    $dom.connectionSettings.style.display = connectionSettingsVisible ? 'block' : 'none';
  }

  if ($dom.connectionBtn) {
    $dom.connectionBtn.textContent = connectionSettingsVisible
      ? 'Hide Settings'
      : 'Connection Settings';
  }
}

/**
 * Update connection status text
 * @param {boolean} connected
 * @param {string} [host]
 */
function updateConnectionStatus(connected, host) {
  if (!$dom.connectionStatusText) return;

  if (connected && host) {
    $dom.connectionStatusText.textContent = `Connected to ${host}`;
    $dom.connectionStatusText.className = 'connection-status connected';
  } else if (host) {
    $dom.connectionStatusText.textContent = `Configured: ${host}`;
    $dom.connectionStatusText.className = 'connection-status';
  } else {
    $dom.connectionStatusText.textContent = 'No connection configured';
    $dom.connectionStatusText.className = 'connection-status disconnected';
  }
}

// ============================================================
// Global Settings
// ============================================================

/**
 * Request global settings from StreamDock
 */
function requestGlobalSettings() {
  if (!isWebSocketConnected()) return;

  $websocket.send(
    JSON.stringify({
      event: 'getGlobalSettings',
      context: $uuid,
    })
  );
}

/**
 * Save connection settings to global settings
 */
function saveGlobalSettings() {
  if (!isWebSocketConnected()) return;

  const host = $dom.host?.value?.trim() || '';
  const token = $dom.token?.value || '';
  const serial = $dom.serial?.value?.trim() || '';

  // Only save if we have all connection params
  if (host && token && serial) {
    $websocket.send(
      JSON.stringify({
        event: 'setGlobalSettings',
        context: $uuid,
        payload: { host, token, serial },
      })
    );

    // Update local cache
    globalSettings = { host, token, serial };

    // Update status
    updateConnectionStatus(false, host);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // UI is ready
});
