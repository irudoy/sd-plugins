/**
 * Shared Property Inspector Library for Sprut.Hub Plugin
 * Composable architecture: initConnection() + initDeviceSelection()
 * @module pi-lib/common
 */

/* global document, window, $settings, $websocket, $uuid */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} PIRoom
 * @property {number} id
 * @property {string} name
 */

/**
 * @typedef {Object} PICharacteristicControl
 * @property {unknown} [value]
 * @property {string|number} [type]
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
 * @typedef {Object} PIAccessory
 * @property {number} id
 * @property {string} name
 * @property {number} [roomId]
 * @property {PIService[]} [services]
 */

/**
 * @typedef {Object} GlobalSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 */

/**
 * @typedef {Object} DeviceSelectionConfig
 * @property {string} deviceSelectId - DOM ID for device select element
 * @property {string} serviceLabel - Label for service dropdown
 * @property {(service: PIService) => boolean} isServiceFn - Check if service matches type
 * @property {(service: PIService) => Record<string, number|undefined>} findCharacteristicsFn - Find characteristic IDs
 * @property {string} defaultAction - Default action value
 * @property {() => void} [loadExtraSettings] - Load extra settings fields
 * @property {() => void} [saveExtraSettings] - Save extra settings fields
 * @property {() => Record<string, unknown>} [getExtraPluginSettings] - Get extra settings for plugin
 * @property {(accessory: PIAccessory|null, services: PIService[]) => void} [onAccessorySelected] - Accessory selected callback
 */

/**
 * @callback SendToPIHandler
 * @param {Record<string, unknown>} data
 * @returns {boolean} - true if handled
 */

// ============================================================
// Global State
// ============================================================

/** @type {GlobalSettings} */
let globalSettings = {};

/** @type {boolean} */
let connectionSettingsVisible = false;

/** @type {boolean} */
let devicesLoaded = false;

/** @type {PIRoom[]} */
let rooms = [];

/** @type {PIAccessory[]} */
let devices = [];

/** @type {DeviceSelectionConfig|null} */
let deviceConfig = null;

/** @type {SendToPIHandler|null} */
let customSendToPIHandler = null;

// ============================================================
// DOM Element Cache
// ============================================================

/** @type {Record<string, HTMLElement|null>} */
const $dom = {};

// ============================================================
// Connection Settings HTML
// ============================================================

/**
 * Generate Connection Settings HTML
 * @returns {string}
 */
function renderConnectionSettings() {
  return `
    <div class="sdpi-item">
      <div class="sdpi-item-label empty"></div>
      <button class="sdpi-item-value connection-btn" id="connectionBtn" onclick="SprutHubPI.toggleConnectionSettings()">Connection Settings</button>
    </div>
    <div id="connectionStatusText" class="connection-status">Loading...</div>
    <div id="connectionSettings">
      <div class="sdpi-heading">Sprut.Hub Connection</div>
      <div class="sdpi-item">
        <div class="sdpi-item-label">Host</div>
        <input class="sdpi-item-value" type="text" id="host" placeholder="spruthub.local or IP" onchange="SprutHubPI.saveSettings()">
      </div>
      <div class="sdpi-item">
        <div class="sdpi-item-label">Token</div>
        <input class="sdpi-item-value" type="password" id="token" placeholder="API token" onchange="SprutHubPI.saveSettings()">
      </div>
      <div class="sdpi-item">
        <div class="sdpi-item-label">Serial</div>
        <input class="sdpi-item-value" type="text" id="serial" placeholder="Hub serial number" onchange="SprutHubPI.saveSettings()">
      </div>
      <div class="sdpi-item">
        <div class="sdpi-item-label empty"></div>
        <button class="sdpi-item-value" id="testButton" onclick="SprutHubPI.testConnection()">Test Connection</button>
      </div>
      <div class="sdpi-item">
        <div class="sdpi-item-label empty"></div>
        <div class="sdpi-item-value">
          <div id="statusMessage" class="status-message"></div>
        </div>
      </div>
    </div>`;
}

// ============================================================
// DOM Initialization
// ============================================================

/**
 * Initialize connection DOM elements
 */
function initConnectionDom() {
  const container = document.getElementById('connectionSettingsContainer');
  if (container) {
    container.innerHTML = renderConnectionSettings();
  }

  $dom.main = document.querySelector('.sdpi-wrapper');
  $dom.connectionBtn = document.getElementById('connectionBtn');
  $dom.connectionStatusText = document.getElementById('connectionStatusText');
  $dom.connectionSettings = document.getElementById('connectionSettings');
  $dom.host = document.getElementById('host');
  $dom.token = document.getElementById('token');
  $dom.serial = document.getElementById('serial');
  $dom.testButton = document.getElementById('testButton');
  $dom.statusMessage = document.getElementById('statusMessage');
  $dom.customName = document.getElementById('customName');
}

/**
 * Initialize device selection DOM elements
 * @param {string} deviceSelectId
 */
function initDeviceSelectionDom(deviceSelectId) {
  $dom.roomSelect = document.getElementById('roomSelect');
  $dom.deviceSelect = document.getElementById(deviceSelectId);
  $dom.serviceSelectRow = document.getElementById('serviceSelectRow');
  $dom.serviceSelect = document.getElementById('serviceSelect');
  $dom.actionSelect = document.getElementById('actionSelect');
}

// ============================================================
// Connection Management
// ============================================================

/**
 * Toggle connection settings panel
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
 * Update connection status display
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

/**
 * Test connection to Sprut.Hub
 */
function testConnection() {
  const host = getInputValue($dom.host);
  const token = getInputValue($dom.token);
  const serial = getInputValue($dom.serial);

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

  sendToPlugin({ event: 'testConnection', host, token, serial });

  setTimeout(() => {
    const testButton = /** @type {HTMLButtonElement|null} */ ($dom.testButton);
    if (testButton?.disabled) {
      showStatus('Connection timeout', 'error');
      enableTestButton();
    }
  }, 15000);
}

/**
 * Refresh device list
 */
function refreshDevices() {
  const host = getInputValue($dom.host);
  const token = getInputValue($dom.token);
  const serial = getInputValue($dom.serial);

  if (!host || !token || !serial) {
    showStatus('Please fill in connection settings', 'error');
    return;
  }

  if (!isWebSocketConnected()) {
    showStatus('Not connected to StreamDock', 'error');
    return;
  }

  showStatus('Refreshing devices...', 'info');
  sendToPlugin({ event: 'getDevices', host, token, serial });
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
 * Save global settings
 */
function saveGlobalSettings() {
  if (!isWebSocketConnected()) return;

  const host = getInputValue($dom.host);
  const token = getInputValue($dom.token);
  const serial = getInputValue($dom.serial);

  if (host && token && serial) {
    $websocket.send(
      JSON.stringify({
        event: 'setGlobalSettings',
        context: $uuid,
        payload: { host, token, serial },
      })
    );

    globalSettings = { host, token, serial };
    updateConnectionStatus(false, host);
  }
}

/**
 * Get current connection settings
 * @returns {GlobalSettings}
 */
function getConnectionSettings() {
  return {
    host: globalSettings.host || getInputValue($dom.host),
    token: globalSettings.token || getInputValue($dom.token),
    serial: globalSettings.serial || getInputValue($dom.serial),
  };
}

// ============================================================
// Settings Loading
// ============================================================

/**
 * Load connection settings into UI
 * @param {GlobalSettings|Record<string, unknown>} settings
 */
function loadConnectionSettings(settings) {
  const host = /** @type {HTMLInputElement|null} */ ($dom.host);
  const token = /** @type {HTMLInputElement|null} */ ($dom.token);
  const serial = /** @type {HTMLInputElement|null} */ ($dom.serial);

  if (settings.host !== undefined && host) {
    host.value = /** @type {string} */ (settings.host);
  }
  if (settings.token !== undefined && token) {
    token.value = /** @type {string} */ (settings.token);
  }
  if (settings.serial !== undefined && serial) {
    serial.value = /** @type {string} */ (settings.serial);
  }
}

/**
 * Load device selection settings into UI
 * @param {Record<string, unknown>} settings
 */
function loadDeviceSettings(settings) {
  const roomSelect = /** @type {HTMLSelectElement|null} */ ($dom.roomSelect);
  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const customName = /** @type {HTMLInputElement|null} */ ($dom.customName);
  const actionSelect = /** @type {HTMLSelectElement|null} */ ($dom.actionSelect);

  if (settings.roomId !== undefined && roomSelect) {
    roomSelect.value = String(settings.roomId);
  }
  if (settings.accessoryId !== undefined && deviceSelect) {
    deviceSelect.value = String(settings.accessoryId);
  }
  if (settings.customName !== undefined && customName) {
    customName.value = String(settings.customName);
  }
  if (settings.action !== undefined && actionSelect) {
    actionSelect.value = String(settings.action);
  }

  if (deviceConfig?.loadExtraSettings) {
    deviceConfig.loadExtraSettings();
  }
}

// ============================================================
// Settings Saving
// ============================================================

/**
 * Save settings (works for both connection-only and device selection modes)
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) return;

  // Connection settings
  $settings.host = globalSettings.host || getInputValue($dom.host);
  $settings.token = globalSettings.token || getInputValue($dom.token);
  $settings.serial = globalSettings.serial || getInputValue($dom.serial);

  // Common settings
  const customName = /** @type {HTMLInputElement|null} */ ($dom.customName);
  $settings.customName = customName?.value?.trim() || '';

  // Device selection specific
  if (deviceConfig) {
    const actionSelect = /** @type {HTMLSelectElement|null} */ ($dom.actionSelect);
    $settings.action = actionSelect?.value || deviceConfig.defaultAction || 'toggle';

    if (deviceConfig.saveExtraSettings) {
      deviceConfig.saveExtraSettings();
    }

    sendSettingsToPlugin();
  }
}

/**
 * Send settings to plugin
 */
function sendSettingsToPlugin() {
  if (!isWebSocketConnected() || !deviceConfig) return;
  if (typeof $settings === 'undefined' || !$settings) return;

  /** @type {Record<string, unknown>} */
  const payload = {
    host: globalSettings.host || '',
    token: globalSettings.token || '',
    serial: globalSettings.serial || '',
    accessoryId: $settings.accessoryId,
    accessoryName: $settings.accessoryName,
    roomName: $settings.roomName,
    serviceId: $settings.serviceId,
    serviceName: $settings.serviceName,
    customName: $settings.customName,
    action: $settings.action,
  };

  const charIdKeys = [
    'characteristicId',
    'brightnessCharId',
    'currentPositionCharId',
    'targetPositionCharId',
    'currentStateCharId',
    'currentTempCharId',
    'targetTempCharId',
    'currentModeCharId',
    'targetModeCharId',
    'valueCharId',
    'brightnessStep',
  ];

  charIdKeys.forEach((key) => {
    if ($settings[key] !== undefined) {
      payload[key] = $settings[key];
    }
  });

  if (deviceConfig.getExtraPluginSettings) {
    Object.assign(payload, deviceConfig.getExtraPluginSettings());
  }

  sendToPlugin(payload);
}

// ============================================================
// Device Population
// ============================================================

/**
 * Populate rooms dropdown
 */
function populateRooms() {
  const select = /** @type {HTMLSelectElement|null} */ ($dom.roomSelect);
  if (!select) return;

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

  if (currentValue) {
    select.value = currentValue;
  } else if (savedRoomId) {
    select.value = savedRoomId;
  }

  populateDevices();
}

/**
 * Populate devices dropdown
 */
function populateDevices() {
  const select = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  if (!select) return;

  const roomSelect = /** @type {HTMLSelectElement|null} */ ($dom.roomSelect);
  const roomId = roomSelect?.value;
  const currentValue = select.value;

  select.innerHTML = '<option value="">-- Select Device --</option>';
  hideServiceSelect();

  if (devices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No devices found';
    option.disabled = true;
    select.appendChild(option);
    return;
  }

  const filteredDevices = roomId ? devices.filter((d) => d.roomId === parseInt(roomId)) : devices;

  filteredDevices.forEach((device) => {
    const option = document.createElement('option');
    option.value = String(device.id);
    option.textContent = device.name;
    select.appendChild(option);
  });

  let restored = false;
  if (currentValue && filteredDevices.some((d) => d.id === parseInt(currentValue))) {
    select.value = currentValue;
    restored = true;
  } else if (typeof $settings !== 'undefined' && $settings && $settings.accessoryId) {
    const accessoryId = String($settings.accessoryId);
    if (filteredDevices.some((d) => d.id === parseInt(accessoryId))) {
      select.value = accessoryId;
      restored = true;
    }
  }

  if (restored) {
    // Call onAccessorySelected callback for PIs that need it (e.g., button)
    if (deviceConfig?.onAccessorySelected) {
      const accessoryId = select.value;
      const accessory = devices.find((d) => d.id === parseInt(accessoryId));
      if (accessory) {
        const matchingServices = accessory.services?.filter(deviceConfig.isServiceFn) || [];
        deviceConfig.onAccessorySelected(accessory, matchingServices);
      }
    }
    populateServices();
  }
}

/**
 * Filter devices when room changes
 */
function filterDevices() {
  const roomSelect = /** @type {HTMLSelectElement|null} */ ($dom.roomSelect);
  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const serviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.serviceSelect);
  const roomId = roomSelect?.value;

  // Reset downstream selects
  if (deviceSelect) {
    deviceSelect.value = '';
  }
  if (serviceSelect) {
    serviceSelect.value = '';
  }
  hideServiceSelect();

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.roomId = roomId ? parseInt(roomId) : undefined;
    // Clear device/service selection when room changes
    $settings.accessoryId = undefined;
    $settings.accessoryName = undefined;
    $settings.roomName = undefined;
    $settings.serviceId = undefined;
    $settings.serviceName = undefined;
    // Clear characteristic IDs
    $settings.characteristicId = undefined;
    $settings.currentPositionCharId = undefined;
    $settings.targetPositionCharId = undefined;
    $settings.currentStateCharId = undefined;
    $settings.currentTempCharId = undefined;
    $settings.targetTempCharId = undefined;
    $settings.currentModeCharId = undefined;
    $settings.targetModeCharId = undefined;
    $settings.valueCharId = undefined;
  }
  populateDevices();
  saveSettings();
}

// ============================================================
// Service Population
// ============================================================

function hideServiceSelect() {
  if ($dom.serviceSelectRow) {
    $dom.serviceSelectRow.style.display = 'none';
  }
}

function showServiceSelect() {
  if ($dom.serviceSelectRow) {
    $dom.serviceSelectRow.style.display = '';
  }
}

/**
 * Populate services dropdown
 */
function populateServices() {
  if (!deviceConfig) return;

  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const accessoryId = deviceSelect?.value;
  if (!accessoryId) {
    hideServiceSelect();
    return;
  }

  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) {
    hideServiceSelect();
    return;
  }

  const matchingServices = accessory.services?.filter(deviceConfig.isServiceFn) || [];

  if (matchingServices.length === 0) {
    hideServiceSelect();
    return;
  }

  // Always show dropdown so user can see what's selected
  showServiceSelect();

  const select = /** @type {HTMLSelectElement|null} */ ($dom.serviceSelect);
  if (!select) return;

  select.innerHTML = `<option value="">-- Select ${deviceConfig.serviceLabel} --</option>`;

  matchingServices.forEach((service) => {
    const option = document.createElement('option');
    option.value = String(service.sId);
    option.textContent = service.name || `${deviceConfig.serviceLabel} ${service.sId}`;
    select.appendChild(option);
  });

  let serviceRestored = false;
  if (typeof $settings !== 'undefined' && $settings && $settings.serviceId) {
    const savedServiceId = String($settings.serviceId);
    if (matchingServices.some((s) => s.sId === parseInt(savedServiceId))) {
      select.value = savedServiceId;
      serviceRestored = true;
    }
  }

  // Auto-select first service if not restored from settings
  if (!serviceRestored && matchingServices.length > 0) {
    selectServiceById(matchingServices[0].sId);
    select.value = String(matchingServices[0].sId);
  }
}

// ============================================================
// Selection Handlers
// ============================================================

/**
 * Called when accessory is selected
 */
function selectAccessory() {
  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const serviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.serviceSelect);
  const accessoryId = deviceSelect?.value;

  if (serviceSelect) {
    serviceSelect.value = '';
  }

  if (!accessoryId) {
    hideServiceSelect();
    if (typeof $settings !== 'undefined' && $settings) {
      $settings.accessoryId = undefined;
      $settings.accessoryName = undefined;
      $settings.roomName = undefined;
      $settings.serviceId = undefined;
      $settings.serviceName = undefined;
      $settings.characteristicId = undefined;
      $settings.currentPositionCharId = undefined;
      $settings.targetPositionCharId = undefined;
      $settings.currentStateCharId = undefined;
      $settings.currentTempCharId = undefined;
      $settings.targetTempCharId = undefined;
      $settings.currentModeCharId = undefined;
      $settings.targetModeCharId = undefined;
      $settings.valueCharId = undefined;
    }
    if (deviceConfig?.onAccessorySelected) {
      deviceConfig.onAccessorySelected(null, []);
    }
    saveSettings();
    return;
  }

  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) return;

  // Find room name
  const room = accessory.roomId ? rooms.find((r) => r.id === accessory.roomId) : null;

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.accessoryId = accessory.id;
    $settings.accessoryName = accessory.name;
    $settings.roomName = room?.name;
    // Clear service and characteristic IDs until selected
    $settings.serviceId = undefined;
    $settings.serviceName = undefined;
    $settings.characteristicId = undefined;
    $settings.currentPositionCharId = undefined;
    $settings.targetPositionCharId = undefined;
    $settings.currentStateCharId = undefined;
    $settings.currentTempCharId = undefined;
    $settings.targetTempCharId = undefined;
    $settings.currentModeCharId = undefined;
    $settings.targetModeCharId = undefined;
    $settings.valueCharId = undefined;
  }

  if (deviceConfig?.onAccessorySelected) {
    const matchingServices = accessory.services?.filter(deviceConfig.isServiceFn) || [];
    deviceConfig.onAccessorySelected(accessory, matchingServices);
  }

  // populateServices() calls saveSettings() only if there's exactly one service.
  // Always call it first to handle single-service case.
  populateServices();
}

/**
 * Called when service is selected from dropdown
 */
function selectService() {
  const serviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.serviceSelect);
  const serviceId = serviceSelect?.value;
  if (!serviceId) return;
  selectServiceById(parseInt(serviceId));
}

/**
 * Select service by ID and save settings
 * @param {number} serviceId
 */
function selectServiceById(serviceId) {
  if (!deviceConfig) return;

  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const accessoryId = deviceSelect?.value;
  if (!accessoryId) return;

  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) return;

  const service = accessory.services?.find((s) => s.sId === serviceId);
  if (!service) return;

  const charIds = deviceConfig.findCharacteristicsFn(service);

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.serviceId = service.sId;
    $settings.serviceName = service.name;

    Object.entries(charIds).forEach(([key, value]) => {
      $settings[key] = value;
    });
  }

  saveSettings();
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle didReceiveSettings (connection-only)
 * @param {{settings: Record<string, unknown>}} data
 */
function handleDidReceiveSettingsConnection(data) {
  loadConnectionSettings(data.settings || {});
  requestGlobalSettings();
}

/**
 * Handle didReceiveSettings (with device selection)
 * @param {{settings: Record<string, unknown>}} data
 */
function handleDidReceiveSettingsWithDevices(data) {
  const settings = data.settings || {};
  loadConnectionSettings(settings);
  loadDeviceSettings(settings);
  requestGlobalSettings();
}

/**
 * Handle didReceiveGlobalSettings (connection-only)
 * @param {{settings: GlobalSettings}} data
 */
function handleDidReceiveGlobalSettingsConnection(data) {
  globalSettings = data.settings || {};
  loadConnectionSettings(globalSettings);

  if (typeof $settings !== 'undefined' && $settings) {
    if (globalSettings.host) $settings.host = globalSettings.host;
    if (globalSettings.token) $settings.token = globalSettings.token;
    if (globalSettings.serial) $settings.serial = globalSettings.serial;
  }

  const hasCredentials = globalSettings.host && globalSettings.token && globalSettings.serial;

  // Show "Configured" (not "Connected") - actual connection status updated after test
  updateConnectionStatus(false, globalSettings.host);

  // Auto-collapse connection settings if already configured
  if (hasCredentials && connectionSettingsVisible) {
    toggleConnectionSettings();
  }
}

/**
 * Handle didReceiveGlobalSettings (with device selection)
 * @param {{settings: GlobalSettings}} data
 */
function handleDidReceiveGlobalSettingsWithDevices(data) {
  globalSettings = data.settings || {};
  loadConnectionSettings(globalSettings);

  if (typeof $settings !== 'undefined' && $settings) {
    if (globalSettings.host) $settings.host = globalSettings.host;
    if (globalSettings.token) $settings.token = globalSettings.token;
    if (globalSettings.serial) $settings.serial = globalSettings.serial;
  }

  const hasCredentials = globalSettings.host && globalSettings.token && globalSettings.serial;

  if (devicesLoaded && hasCredentials) {
    updateConnectionStatus(true, globalSettings.host);
  } else if (!hasCredentials) {
    updateConnectionStatus(false);
  }

  // Auto-collapse connection settings if already configured
  if (hasCredentials && connectionSettingsVisible) {
    toggleConnectionSettings();
  }

  if (!devicesLoaded && hasCredentials) {
    sendToPlugin({
      event: 'getDevices',
      host: globalSettings.host,
      token: globalSettings.token,
      serial: globalSettings.serial,
    });
  }
}

/**
 * Handle sendToPropertyInspector (connection-only)
 * @param {Record<string, unknown>} data
 */
function handleSendToPIConnection(data) {
  if (!data) return;

  // Custom handler first
  if (customSendToPIHandler && customSendToPIHandler(data)) {
    return;
  }

  switch (data.event) {
    case 'testResult':
      if (data.success) {
        showStatus('Connection successful!', 'success');
        saveGlobalSettings();
        updateConnectionStatus(true, getInputValue($dom.host));
        // Don't auto-collapse - let user collapse manually
      } else {
        showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
        updateConnectionStatus(false);
      }
      enableTestButton();
      break;

    case 'connectionStatus':
      if (data.status === 'success') {
        showStatus(/** @type {string} */ (data.message) || 'Connected', 'success');
        updateConnectionStatus(true, getInputValue($dom.host));
        // Don't auto-collapse - let user collapse manually
      } else if (data.status === 'error') {
        showStatus(/** @type {string} */ (data.message) || 'Connection failed', 'error');
      } else if (data.status === 'connecting') {
        showStatus('Connecting...', 'info');
      }
      break;

    case 'error':
      showStatus('Error: ' + (data.message || 'Unknown error'), 'error');
      break;
  }
}

/**
 * Handle sendToPropertyInspector (with device selection)
 * @param {Record<string, unknown>} data
 */
function handleSendToPIWithDevices(data) {
  if (!data) return;

  // Custom handler first
  if (customSendToPIHandler && customSendToPIHandler(data)) {
    return;
  }

  switch (data.event) {
    case 'deviceList':
      rooms = /** @type {PIRoom[]} */ (data.rooms) || [];
      devices = /** @type {PIAccessory[]} */ (data.devices || data.lights) || [];
      devicesLoaded = true;
      populateRooms();
      populateDevices();
      updateConnectionStatus(true, globalSettings.host || getInputValue($dom.host));
      break;

    case 'testResult':
      if (data.success) {
        showStatus('Connection successful!', 'success');
        rooms = /** @type {PIRoom[]} */ (data.rooms) || [];
        devices = /** @type {PIAccessory[]} */ (data.devices || data.lights) || [];
        devicesLoaded = true;
        populateRooms();
        populateDevices();
        saveGlobalSettings();
        updateConnectionStatus(true, getInputValue($dom.host));
        // Don't auto-collapse - let user collapse manually
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
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if WebSocket is connected
 * @returns {boolean}
 */
function isWebSocketConnected() {
  return typeof $websocket !== 'undefined' && $websocket && $websocket.readyState === 1;
}

/**
 * Send data to plugin
 * @param {Record<string, unknown>} data
 */
function sendToPlugin(data) {
  if (!isWebSocketConnected()) return;
  $websocket.sendToPlugin(data);
}

/**
 * Get trimmed value from input element
 * @param {HTMLElement|null} element
 * @returns {string}
 */
function getInputValue(element) {
  const input = /** @type {HTMLInputElement|null} */ (element);
  return input?.value?.trim() || '';
}

/**
 * Show status message
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 */
function showStatus(message, type) {
  if (!$dom.statusMessage) return;

  $dom.statusMessage.textContent = message;
  $dom.statusMessage.className = 'status-message status-' + type;
  $dom.statusMessage.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      if ($dom.statusMessage?.textContent === message) {
        $dom.statusMessage.style.display = 'none';
      }
    }, 5000);
  }
}

function disableTestButton() {
  const button = /** @type {HTMLButtonElement|null} */ ($dom.testButton);
  if (button) {
    button.disabled = true;
    button.textContent = 'Testing...';
  }
}

function enableTestButton() {
  const button = /** @type {HTMLButtonElement|null} */ ($dom.testButton);
  if (button) {
    button.disabled = false;
    button.textContent = 'Test Connection';
  }
}

// ============================================================
// Characteristic Helpers
// ============================================================

/**
 * Get characteristic type
 * @param {PICharacteristic} c
 * @returns {string|number|undefined}
 */
function getCharType(c) {
  return c.type ?? c.control?.type;
}

/**
 * Check if characteristic value is boolean
 * @param {PICharacteristic} c
 * @returns {boolean}
 */
function isBooleanCharacteristic(c) {
  const value = c.control?.value;
  if (!value) return false;
  return typeof value === 'boolean' || (typeof value === 'object' && 'boolValue' in value);
}

/**
 * Find On characteristic in service
 * @param {PIService} service
 * @returns {PICharacteristic|undefined}
 */
function findOnCharacteristic(service) {
  const CHAR_TYPE_ON = 37;
  const CHAR_TYPE_ON_NAMES = ['On', 'Power', 'PowerState'];

  let onChar = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === CHAR_TYPE_ON || CHAR_TYPE_ON_NAMES.includes(String(type));
  });

  if (!onChar) {
    onChar = service.characteristics?.find((c) => isBooleanCharacteristic(c));
  }

  return onChar;
}

/**
 * Find Brightness characteristic in service
 * @param {PIService} service
 * @returns {PICharacteristic|undefined}
 */
function findBrightnessCharacteristic(service) {
  const CHAR_TYPE_BRIGHTNESS = 38;
  const CHAR_TYPE_BRIGHTNESS_NAMES = ['Brightness'];

  return service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === CHAR_TYPE_BRIGHTNESS || CHAR_TYPE_BRIGHTNESS_NAMES.includes(String(type));
  });
}

// ============================================================
// Public API: Initialization Functions
// ============================================================

/**
 * Initialize connection settings only (no device selection)
 * @param {{onSendToPropertyInspector?: SendToPIHandler}} [options]
 * @returns {{ $propEvent: object }}
 */
function initConnection(options = {}) {
  initConnectionDom();
  customSendToPIHandler = options.onSendToPropertyInspector || null;

  return {
    $propEvent: {
      didReceiveSettings: handleDidReceiveSettingsConnection,
      sendToPropertyInspector: handleSendToPIConnection,
      didReceiveGlobalSettings: handleDidReceiveGlobalSettingsConnection,
    },
  };
}

/**
 * Initialize with device selection (full PI)
 * @param {DeviceSelectionConfig} config
 * @returns {{ $propEvent: object }}
 */
function initDeviceSelection(config) {
  deviceConfig = config;
  initConnectionDom();
  initDeviceSelectionDom(config.deviceSelectId);

  return {
    $propEvent: {
      didReceiveSettings: handleDidReceiveSettingsWithDevices,
      sendToPropertyInspector: handleSendToPIWithDevices,
      didReceiveGlobalSettings: handleDidReceiveGlobalSettingsWithDevices,
    },
  };
}

// ============================================================
// Exports
// ============================================================

window.SprutHubPI = {
  // Initialization
  initConnection,
  initDeviceSelection,

  // Event handlers (HTML onclick)
  selectAccessory,
  selectService,
  filterDevices,
  testConnection,
  refreshDevices,
  toggleConnectionSettings,
  saveSettings,

  // Helpers
  getCharType,
  isBooleanCharacteristic,
  findOnCharacteristic,
  findBrightnessCharacteristic,
  getConnectionSettings,

  // Accessors
  get $dom() {
    return $dom;
  },
  get $settings() {
    return typeof $settings !== 'undefined' ? $settings : null;
  },
  get devices() {
    return devices;
  },
  get config() {
    return deviceConfig;
  },
};
