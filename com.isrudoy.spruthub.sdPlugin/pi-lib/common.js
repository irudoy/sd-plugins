/**
 * Shared Property Inspector Library for Sprut.Hub Plugin
 * Extracts common functionality from all PI files
 * @module pi-lib/common
 */

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
 * @typedef {Object} PIConfig
 * @property {string} deviceSelectId - DOM ID for device select element
 * @property {string} serviceLabel - Label for service dropdown (e.g., 'Lightbulb', 'Thermostat')
 * @property {(service: PIService) => boolean} isServiceFn - Check if service matches type
 * @property {(service: PIService) => Record<string, number|undefined>} findCharacteristicsFn - Find characteristic IDs
 * @property {string} defaultAction - Default action value (e.g., 'toggle', 'tempUp')
 * @property {() => void} [loadExtraSettings] - Load extra settings fields
 * @property {() => void} [saveExtraSettings] - Save extra settings fields
 * @property {() => Record<string, unknown>} [getExtraPluginSettings] - Get extra settings to send to plugin
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

/** @type {PIConfig|null} */
let piConfig = null;

// ============================================================
// DOM Element Cache
// ============================================================

/** @type {Record<string, HTMLElement|null>} */
const $dom = {};

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

/**
 * Initialize DOM element cache
 * @param {string} deviceSelectId - ID of device select element
 */
function initDom(deviceSelectId) {
  // Inject connection settings HTML if container exists
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
  $dom.roomSelect = document.getElementById('roomSelect');
  $dom.deviceSelect = document.getElementById(deviceSelectId);
  $dom.serviceSelectRow = document.getElementById('serviceSelectRow');
  $dom.serviceSelect = document.getElementById('serviceSelect');
  $dom.customName = document.getElementById('customName');
  $dom.actionSelect = document.getElementById('actionSelect');
  $dom.testButton = document.getElementById('testButton');
  $dom.statusMessage = document.getElementById('statusMessage');
}

// ============================================================
// Initialization
// ============================================================

/**
 * Initialize the Property Inspector with configuration
 * @param {PIConfig} config
 * @returns {{ $propEvent: object }}
 */
function initPI(config) {
  piConfig = config;
  initDom(config.deviceSelectId);

  return {
    $propEvent: {
      didReceiveSettings,
      sendToPropertyInspector,
      didReceiveGlobalSettings,
    },
  };
}

// ============================================================
// StreamDock Event Handlers
// ============================================================

/**
 * Called when settings are received from StreamDock
 * @param {{settings: Record<string, unknown>}} data
 */
function didReceiveSettings(data) {
  const settings = data.settings || {};
  loadSettings(settings);
  requestGlobalSettings();
}

/**
 * Called when plugin sends data to PI
 * @param {{event?: string, rooms?: PIRoom[], devices?: PIAccessory[], lights?: PIAccessory[], success?: boolean, error?: string, message?: string}} data
 */
function sendToPropertyInspector(data) {
  if (!data) return;

  switch (data.event) {
    case 'deviceList':
      rooms = data.rooms || [];
      // Support both 'devices' and 'lights' for backwards compatibility
      devices = data.devices || data.lights || [];
      devicesLoaded = true;
      populateRooms();
      populateDevices();
      updateConnectionStatus(true, globalSettings.host || getInputValue($dom.host));
      break;

    case 'testResult':
      if (data.success) {
        showStatus('Connection successful!', 'success');
        rooms = data.rooms || [];
        devices = data.devices || data.lights || [];
        devicesLoaded = true;
        populateRooms();
        populateDevices();
        saveGlobalSettings();
        updateConnectionStatus(true, getInputValue($dom.host));
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
}

/**
 * Called when global settings are received
 * @param {{settings: GlobalSettings}} data
 */
function didReceiveGlobalSettings(data) {
  globalSettings = data.settings || {};
  loadConnectionSettings(globalSettings);

  // Sync global connection settings to local (for button operation)
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

  // Request devices if we have credentials but haven't loaded them yet
  if (!devicesLoaded && hasCredentials) {
    sendToPlugin({
      event: 'getDevices',
      host: globalSettings.host,
      token: globalSettings.token,
      serial: globalSettings.serial,
    });
  }
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
 * Populate devices dropdown (filtered by room if selected)
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

  // Restore selection
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
    populateServices();
  }
}

/**
 * Filter devices when room changes
 */
function filterDevices() {
  const roomSelect = /** @type {HTMLSelectElement|null} */ ($dom.roomSelect);
  const roomId = roomSelect?.value;
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.roomId = roomId ? parseInt(roomId) : undefined;
  }
  populateDevices();
}

// ============================================================
// Service Population
// ============================================================

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
  if (!piConfig) return;

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

  const matchingServices = accessory.services?.filter(piConfig.isServiceFn) || [];

  if (matchingServices.length === 0) {
    hideServiceSelect();
    return;
  }

  // Auto-select if only one service
  if (matchingServices.length === 1) {
    hideServiceSelect();
    selectServiceById(matchingServices[0].sId);
    return;
  }

  // Multiple services - show dropdown
  showServiceSelect();

  const select = /** @type {HTMLSelectElement|null} */ ($dom.serviceSelect);
  if (!select) return;

  select.innerHTML = `<option value="">-- Select ${piConfig.serviceLabel} --</option>`;

  matchingServices.forEach((service) => {
    const option = document.createElement('option');
    option.value = String(service.sId);
    option.textContent = service.name || `${piConfig.serviceLabel} ${service.sId}`;
    select.appendChild(option);
  });

  // Restore saved selection
  if (typeof $settings !== 'undefined' && $settings && $settings.serviceId) {
    const savedServiceId = String($settings.serviceId);
    if (matchingServices.some((s) => s.sId === parseInt(savedServiceId))) {
      select.value = savedServiceId;
    }
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

  // Clear service selection
  if (serviceSelect) {
    serviceSelect.value = '';
  }

  if (!accessoryId) {
    hideServiceSelect();
    if (typeof $settings !== 'undefined' && $settings) {
      $settings.accessoryId = undefined;
      $settings.accessoryName = undefined;
      $settings.serviceId = undefined;
      $settings.serviceName = undefined;
      // Clear all characteristic IDs (handled by each PI's characteristic finder)
    }
    saveSettings();
    return;
  }

  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) return;

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.accessoryId = accessory.id;
    $settings.accessoryName = accessory.name;
  }

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
  if (!piConfig) return;

  const deviceSelect = /** @type {HTMLSelectElement|null} */ ($dom.deviceSelect);
  const accessoryId = deviceSelect?.value;
  if (!accessoryId) return;

  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) return;

  const service = accessory.services?.find((s) => s.sId === serviceId);
  if (!service) return;

  // Find characteristics using the device-specific function
  const charIds = piConfig.findCharacteristicsFn(service);

  if (typeof $settings !== 'undefined' && $settings) {
    $settings.serviceId = service.sId;
    $settings.serviceName = service.name;

    // Set all characteristic IDs from the finder function
    Object.entries(charIds).forEach(([key, value]) => {
      $settings[key] = value;
    });
  }

  saveSettings();
}

// ============================================================
// Settings Management
// ============================================================

/**
 * Load settings into UI
 * @param {Record<string, unknown>} settings
 */
function loadSettings(settings) {
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

  // Load extra settings if defined
  if (piConfig?.loadExtraSettings) {
    piConfig.loadExtraSettings();
  }
}

/**
 * Load connection settings into UI
 * @param {GlobalSettings} settings
 */
function loadConnectionSettings(settings) {
  const host = /** @type {HTMLInputElement|null} */ ($dom.host);
  const token = /** @type {HTMLInputElement|null} */ ($dom.token);
  const serial = /** @type {HTMLInputElement|null} */ ($dom.serial);

  if (settings.host !== undefined && host) {
    host.value = settings.host;
  }

  if (settings.token !== undefined && token) {
    token.value = settings.token;
  }

  if (settings.serial !== undefined && serial) {
    serial.value = settings.serial;
  }
}

/**
 * Save settings to StreamDock
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings || !piConfig) return;

  const customName = /** @type {HTMLInputElement|null} */ ($dom.customName);
  const actionSelect = /** @type {HTMLSelectElement|null} */ ($dom.actionSelect);

  // Connection settings
  $settings.host = globalSettings.host || getInputValue($dom.host);
  $settings.token = globalSettings.token || getInputValue($dom.token);
  $settings.serial = globalSettings.serial || getInputValue($dom.serial);

  // Common settings
  $settings.customName = customName?.value?.trim() || '';
  $settings.action = actionSelect?.value || piConfig.defaultAction;

  // Save extra settings if defined
  if (piConfig.saveExtraSettings) {
    piConfig.saveExtraSettings();
  }

  sendSettingsToPlugin();
}

/**
 * Send settings to plugin
 */
function sendSettingsToPlugin() {
  if (!isWebSocketConnected() || !piConfig) return;
  if (typeof $settings === 'undefined' || !$settings) return;

  /** @type {Record<string, unknown>} */
  const payload = {
    host: globalSettings.host || '',
    token: globalSettings.token || '',
    serial: globalSettings.serial || '',
    accessoryId: $settings.accessoryId,
    accessoryName: $settings.accessoryName,
    serviceId: $settings.serviceId,
    serviceName: $settings.serviceName,
    customName: $settings.customName,
    action: $settings.action,
  };

  // Add all characteristic IDs and extra settings from settings
  // These are set by selectServiceById based on findCharacteristicsFn
  const charIdKeys = [
    'characteristicId',
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

  // Add extra settings if defined
  if (piConfig.getExtraPluginSettings) {
    const extraSettings = piConfig.getExtraPluginSettings();
    Object.assign(payload, extraSettings);
  }

  sendToPlugin(payload);
}

// ============================================================
// Connection Management
// ============================================================

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

  // Timeout
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

/**
 * Disable test button
 */
function disableTestButton() {
  const button = /** @type {HTMLButtonElement|null} */ ($dom.testButton);
  if (button) {
    button.disabled = true;
    button.textContent = 'Testing...';
  }
}

/**
 * Enable test button
 */
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
 * Get characteristic type (handles both c.type and c.control.type)
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

// ============================================================
// Exports (for browser global scope)
// ============================================================

// These are exposed globally for the PI to use
window.SprutHubPI = {
  init: initPI,
  // Event handlers (called by HTML onclick)
  selectAccessory,
  selectService,
  filterDevices,
  testConnection,
  refreshDevices,
  toggleConnectionSettings,
  saveSettings,
  // Helpers for characteristic finding
  getCharType,
  isBooleanCharacteristic,
  findOnCharacteristic,
  // Access to DOM cache
  get $dom() {
    return $dom;
  },
  // Access to settings
  get $settings() {
    return typeof $settings !== 'undefined' ? $settings : null;
  },
};
