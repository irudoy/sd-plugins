/**
 * Thermostat - Property Inspector
 * @module thermostat/index
 */

const $local = false;
const $back = false;

let globalSettings = {};
const $dom = {
  main: $('.sdpi-wrapper'),
  connectionBtn: $('#connectionBtn'),
  connectionStatusText: $('#connectionStatusText'),
  connectionSettings: $('#connectionSettings'),
  host: $('#host'),
  token: $('#token'),
  serial: $('#serial'),
  roomSelect: $('#roomSelect'),
  deviceSelect: $('#deviceSelect'),
  serviceSelectRow: $('#serviceSelectRow'),
  serviceSelect: $('#serviceSelect'),
  customName: $('#customName'),
  actionSelect: $('#actionSelect'),
  tempStep: $('#tempStep'),
  testButton: $('#testButton'),
  statusMessage: $('#statusMessage'),
};

let connectionSettingsVisible = false;
let devicesLoaded = false;
let rooms = [];
let devices = [];

const SERVICE_THERMOSTAT = 'Thermostat';

const $propEvent = {
  didReceiveSettings(data) {
    const settings = data.settings || {};
    loadSettings(settings);
    requestGlobalSettings();
  },
  sendToPropertyInspector(data) {
    if (!data) return;
    switch (data.event) {
      case 'deviceList':
        rooms = data.rooms || [];
        devices = data.devices || [];
        devicesLoaded = true;
        populateRooms();
        populateDevices();
        updateConnectionStatus(true, globalSettings.host || $dom.host?.value?.trim());
        break;
      case 'testResult':
        if (data.success) {
          showStatus('Connection successful!', 'success');
          rooms = data.rooms || [];
          devices = data.devices || [];
          devicesLoaded = true;
          populateRooms();
          populateDevices();
          saveGlobalSettings();
          updateConnectionStatus(true, $dom.host?.value?.trim());
          if (connectionSettingsVisible) toggleConnectionSettings();
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
  didReceiveGlobalSettings(data) {
    globalSettings = data.settings || {};
    loadConnectionSettings(globalSettings);
    if (typeof $settings !== 'undefined' && $settings) {
      if (globalSettings.host) $settings.host = globalSettings.host;
      if (globalSettings.token) $settings.token = globalSettings.token;
      if (globalSettings.serial) $settings.serial = globalSettings.serial;
    }
    const hasCredentials = globalSettings.host && globalSettings.token && globalSettings.serial;
    if (devicesLoaded && hasCredentials) updateConnectionStatus(true, globalSettings.host);
    else if (!hasCredentials) updateConnectionStatus(false);
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

function populateRooms() {
  const select = $dom.roomSelect;
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
  if (currentValue) select.value = currentValue;
  else if (savedRoomId) select.value = savedRoomId;
  populateDevices();
}

function populateDevices() {
  const select = $dom.deviceSelect;
  if (!select) return;
  const roomId = $dom.roomSelect?.value;
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
  if (restored) populateServices();
}

function filterDevices() {
  const roomId = $dom.roomSelect?.value;
  if (typeof $settings !== 'undefined' && $settings)
    $settings.roomId = roomId ? parseInt(roomId) : undefined;
  populateDevices();
}

function isThermostatService(service) {
  return service.type === SERVICE_THERMOSTAT || service.type === 43;
}

function getThermostatServices(accessory) {
  return accessory.services?.filter(isThermostatService) || [];
}

/**
 * Get characteristic type (handles both c.type and c.control.type)
 */
function getCharType(c) {
  return c.type ?? c.control?.type;
}

function findThermostatCharacteristics(service) {
  const currentTemp = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'CurrentTemperature' || type === 17;
  });
  const targetTemp = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'TargetTemperature' || type === 53;
  });
  const currentMode = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'CurrentHeatingCoolingState' || type === 15;
  });
  const targetMode = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'TargetHeatingCoolingState' || type === 51;
  });
  return { currentTemp, targetTemp, currentMode, targetMode };
}

function hideServiceSelect() {
  if ($dom.serviceSelectRow) $dom.serviceSelectRow.style.display = 'none';
}
function showServiceSelect() {
  if ($dom.serviceSelectRow) $dom.serviceSelectRow.style.display = '';
}

function populateServices() {
  const accessoryId = $dom.deviceSelect?.value;
  if (!accessoryId) {
    hideServiceSelect();
    return;
  }
  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) {
    hideServiceSelect();
    return;
  }
  const thermostatServices = getThermostatServices(accessory);
  if (thermostatServices.length === 0) {
    hideServiceSelect();
    return;
  }
  if (thermostatServices.length === 1) {
    hideServiceSelect();
    selectServiceById(thermostatServices[0].sId);
    return;
  }
  showServiceSelect();
  const select = $dom.serviceSelect;
  if (!select) return;
  select.innerHTML = '<option value="">-- Select Thermostat --</option>';
  thermostatServices.forEach((service) => {
    const option = document.createElement('option');
    option.value = String(service.sId);
    option.textContent = service.name || `Thermostat ${service.sId}`;
    select.appendChild(option);
  });
  if (typeof $settings !== 'undefined' && $settings && $settings.serviceId) {
    const savedServiceId = String($settings.serviceId);
    if (thermostatServices.some((s) => s.sId === parseInt(savedServiceId)))
      select.value = savedServiceId;
  }
}

function selectAccessory() {
  const accessoryId = $dom.deviceSelect?.value;
  if ($dom.serviceSelect) $dom.serviceSelect.value = '';
  if (!accessoryId) {
    hideServiceSelect();
    if (typeof $settings !== 'undefined' && $settings) {
      $settings.accessoryId = undefined;
      $settings.accessoryName = undefined;
      $settings.serviceId = undefined;
      $settings.serviceName = undefined;
      $settings.currentTempCharId = undefined;
      $settings.targetTempCharId = undefined;
      $settings.currentModeCharId = undefined;
      $settings.targetModeCharId = undefined;
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

function selectService() {
  const serviceId = $dom.serviceSelect?.value;
  if (!serviceId) return;
  selectServiceById(parseInt(serviceId));
}

function selectServiceById(serviceId) {
  const accessoryId = $dom.deviceSelect?.value;
  if (!accessoryId) return;
  const accessory = devices.find((d) => d.id === parseInt(accessoryId));
  if (!accessory) return;
  const service = accessory.services?.find((s) => s.sId === serviceId);
  if (!service) return;
  const { currentTemp, targetTemp, currentMode, targetMode } =
    findThermostatCharacteristics(service);
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.serviceId = service.sId;
    $settings.serviceName = service.name;
    $settings.currentTempCharId = currentTemp?.cId;
    $settings.targetTempCharId = targetTemp?.cId;
    $settings.currentModeCharId = currentMode?.cId;
    $settings.targetModeCharId = targetMode?.cId;
  }
  saveSettings();
}

function loadSettings(settings) {
  if (settings.roomId !== undefined && $dom.roomSelect)
    $dom.roomSelect.value = String(settings.roomId);
  if (settings.accessoryId !== undefined && $dom.deviceSelect)
    $dom.deviceSelect.value = String(settings.accessoryId);
  if (settings.customName !== undefined && $dom.customName)
    $dom.customName.value = settings.customName;
  if (settings.action !== undefined && $dom.actionSelect) $dom.actionSelect.value = settings.action;
  if (settings.tempStep !== undefined && $dom.tempStep) $dom.tempStep.value = settings.tempStep;
}

function loadConnectionSettings(settings) {
  if (settings.host !== undefined && $dom.host) $dom.host.value = settings.host;
  if (settings.token !== undefined && $dom.token) $dom.token.value = settings.token;
  if (settings.serial !== undefined && $dom.serial) $dom.serial.value = settings.serial;
}

function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) return;
  $settings.host = globalSettings.host || $dom.host?.value?.trim() || '';
  $settings.token = globalSettings.token || $dom.token?.value || '';
  $settings.serial = globalSettings.serial || $dom.serial?.value?.trim() || '';
  $settings.customName = $dom.customName?.value?.trim() || '';
  $settings.action = $dom.actionSelect?.value || 'tempUp';
  $settings.tempStep = parseFloat($dom.tempStep?.value) || 0.5;
  sendSettingsToPlugin();
}

function isWebSocketConnected() {
  return typeof $websocket !== 'undefined' && $websocket && $websocket.readyState === 1;
}

function sendSettingsToPlugin() {
  if (!isWebSocketConnected()) return;
  if (typeof $settings === 'undefined' || !$settings) return;
  $websocket.sendToPlugin({
    host: globalSettings.host || '',
    token: globalSettings.token || '',
    serial: globalSettings.serial || '',
    accessoryId: $settings.accessoryId,
    accessoryName: $settings.accessoryName,
    serviceId: $settings.serviceId,
    serviceName: $settings.serviceName,
    currentTempCharId: $settings.currentTempCharId,
    targetTempCharId: $settings.targetTempCharId,
    currentModeCharId: $settings.currentModeCharId,
    targetModeCharId: $settings.targetModeCharId,
    customName: $settings.customName,
    action: $settings.action,
    tempStep: $settings.tempStep,
  });
}

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
  $websocket.sendToPlugin({ event: 'testConnection', host, token, serial });
  setTimeout(() => {
    if ($dom.testButton?.disabled) {
      showStatus('Connection timeout', 'error');
      enableTestButton();
    }
  }, 15000);
}

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
  $websocket.sendToPlugin({ event: 'getDevices', host, token, serial });
}

function showStatus(message, type) {
  if (!$dom.statusMessage) return;
  $dom.statusMessage.textContent = message;
  $dom.statusMessage.className = 'status-message status-' + type;
  $dom.statusMessage.style.display = 'block';
  if (type === 'success')
    setTimeout(() => {
      if ($dom.statusMessage.textContent === message) $dom.statusMessage.style.display = 'none';
    }, 5000);
}

function disableTestButton() {
  if ($dom.testButton) {
    $dom.testButton.disabled = true;
    $dom.testButton.textContent = 'Testing...';
  }
}
function enableTestButton() {
  if ($dom.testButton) {
    $dom.testButton.disabled = false;
    $dom.testButton.textContent = 'Test Connection';
  }
}

function toggleConnectionSettings() {
  connectionSettingsVisible = !connectionSettingsVisible;
  if ($dom.connectionSettings)
    $dom.connectionSettings.style.display = connectionSettingsVisible ? 'block' : 'none';
  if ($dom.connectionBtn)
    $dom.connectionBtn.textContent = connectionSettingsVisible
      ? 'Hide Settings'
      : 'Connection Settings';
}

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

function requestGlobalSettings() {
  if (!isWebSocketConnected()) return;
  $websocket.send(JSON.stringify({ event: 'getGlobalSettings', context: $uuid }));
}

function saveGlobalSettings() {
  if (!isWebSocketConnected()) return;
  const host = $dom.host?.value?.trim() || '';
  const token = $dom.token?.value || '';
  const serial = $dom.serial?.value?.trim() || '';
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

document.addEventListener('DOMContentLoaded', () => {});
