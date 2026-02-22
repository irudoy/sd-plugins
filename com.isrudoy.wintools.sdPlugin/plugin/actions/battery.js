/**
 * Battery Monitor action for Win Tools Plugin
 * @module actions/battery
 */

const {
  MIN_UPDATE_INTERVAL,
  MAX_UPDATE_INTERVAL,
  DEFAULT_UPDATE_INTERVAL,
  BATTERY_ACTION,
} = require('../lib/common');
const {
  contexts,
  stopTimer,
  setTimer,
  setContext,
  setDeviceCache,
  getDeviceCache,
} = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const {
  getRazerDevices,
  getRazerBattery,
  getCachedRazerBattery,
  isHIDAvailable,
} = require('../devices/razer');
const {
  drawBattery,
  drawNoDevice,
  drawNotSupported,
  drawCharging,
  drawDualBattery,
  drawSingleDeviceButton,
} = require('../lib/battery-drawing');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').AppearPayload<BatterySettings>} AppearPayloadBattery
 * @typedef {import('../../../types/streamdock').KeyPayload<BatterySettings>} KeyPayloadBattery
 * @typedef {import('../../../types/streamdock').SettingsPayload<BatterySettings>} SettingsPayloadBattery
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 * @typedef {import('../lib/battery-drawing').BatteryDevice} BatteryDevice
 * @typedef {import('../lib/state').CachedDevice} CachedDevice
 */

/**
 * Battery Monitor settings
 * @typedef {Object} BatterySettings
 * @property {string} [device1] - First device ID (type:name)
 * @property {number|string} [device1Interval] - Update interval for device 1
 * @property {string} [device2] - Second device ID (empty for single mode)
 * @property {number|string} [device2Interval] - Update interval for device 2
 */

/**
 * Parsed device ID
 * @typedef {Object} DeviceId
 * @property {string|null} type - Device type ('razer')
 * @property {string|null} name - Device name
 */

// ============================================================
// Device Cache Management
// ============================================================

/**
 * Get unique key for device
 * @param {CachedDevice} device - Device info
 * @returns {string}
 */
function getDeviceKey(device) {
  return device.name;
}

/**
 * Update device cache with current devices
 * @param {CachedDevice[]} devices - Current devices
 * @returns {void}
 */
function updateDeviceCache(devices) {
  const now = Date.now();
  const cache = getDeviceCache('razer');

  for (const device of devices) {
    const key = getDeviceKey(device);
    const existing = cache.find((d) => getDeviceKey(d) === key);
    if (existing) {
      Object.assign(existing, device, { lastSeen: now, connected: true });
    } else {
      cache.push({ ...device, lastSeen: now, connected: true });
    }
  }

  for (const cached of cache) {
    const key = getDeviceKey(cached);
    if (!devices.find((d) => getDeviceKey(d) === key)) {
      cached.connected = false;
    }
  }

  const maxAge = 24 * 60 * 60 * 1000;
  setDeviceCache(
    'razer',
    cache.filter((d) => now - (d.lastSeen ?? 0) < maxAge)
  );
}

/**
 * Get merged list of current and cached devices
 * @param {CachedDevice[]} currentDevices - Currently connected devices
 * @returns {CachedDevice[]}
 */
function getMergedDeviceList(currentDevices) {
  updateDeviceCache(currentDevices);

  const result = [];
  const cache = getDeviceCache('razer');

  for (const device of currentDevices) {
    result.push({ ...device, connected: true });
  }

  for (const cached of cache) {
    const key = getDeviceKey(cached);
    if (!cached.connected && !result.find((d) => getDeviceKey(d) === key)) {
      result.push({
        name: cached.name,
        battery: null,
        connected: false,
        lastBattery: cached.battery,
        isWired: cached.isWired,
      });
    }
  }

  return result;
}

// ============================================================
// Device Detection
// ============================================================

/**
 * Parse device ID string into type and name
 * @param {string} deviceId - Device ID (e.g., "razer:Viper V3 Pro")
 * @returns {DeviceId}
 */
function parseDeviceId(deviceId) {
  if (!deviceId) return { type: null, name: null };
  const colonIndex = deviceId.indexOf(':');
  if (colonIndex === -1) return { type: null, name: deviceId };
  return {
    type: deviceId.substring(0, colonIndex),
    name: deviceId.substring(colonIndex + 1),
  };
}

/**
 * Get all battery devices (async)
 * @returns {Promise<BatteryDevice[]>}
 */
async function getAllBatteryDevicesAsync() {
  /** @type {BatteryDevice[]} */
  const allDevices = [];

  // Get Razer devices (async)
  const razerDevices = await getRazerDevices();
  const razerWithBattery = await Promise.all(
    razerDevices.map(async (d) => {
      const result = await getRazerBattery(d);
      return {
        name: d.name,
        battery: result.battery,
        isWired: d.isWired,
        isCharging: result.isCharging,
        error: result.error,
      };
    })
  );
  const mergedRazer = getMergedDeviceList(razerWithBattery);
  for (const device of mergedRazer) {
    allDevices.push({ ...device, type: 'razer' });
  }

  return allDevices;
}

/**
 * Get all battery devices (callback-based)
 * @param {(error: Error|null, devices: BatteryDevice[]) => void} callback
 * @returns {void}
 */
function getAllBatteryDevices(callback) {
  getAllBatteryDevicesAsync()
    .then((devices) => callback(null, devices))
    .catch((err) => callback(err, []));
}

/**
 * Get device by type and name (async)
 * @param {string|null} type - Device type
 * @param {string|null} name - Device name
 * @returns {Promise<BatteryDevice|null>}
 */
async function getDeviceByTypeAndNameAsync(type, name) {
  if (type === 'razer') {
    const razerDevices = await getRazerDevices();
    let device = razerDevices.find((d) => d.name === name);
    if (!device && razerDevices.length > 0) {
      device = razerDevices[0];
    }

    if (!device) {
      // Device not connected - return cached data with connected: false
      const cached = getCachedRazerBattery(name);
      if (cached) {
        return {
          name: name || 'Unknown Device',
          battery: cached.battery,
          isCharging: false,
          connected: false,
          type: 'razer',
        };
      }
      // No cache - return device with name from settings
      return {
        name: name || 'Unknown Device',
        battery: null,
        isCharging: false,
        connected: false,
        type: 'razer',
      };
    }

    const result = await getRazerBattery(device);
    return {
      name: device.name,
      battery: result.battery,
      isCharging: result.isCharging,
      isWired: device.isWired,
      sleeping: result.sleeping,
      error: result.error ?? undefined,
      type: 'razer',
    };
  } else {
    // Auto mode — pick first available device
    const razerDevices = await getRazerDevices();
    if (razerDevices.length === 0) return null;
    const device = razerDevices[0];
    const result = await getRazerBattery(device);
    return {
      name: device.name,
      battery: result.battery,
      isCharging: result.isCharging,
      isWired: device.isWired,
      sleeping: result.sleeping,
      error: result.error ?? undefined,
      type: 'razer',
    };
  }
}

/**
 * Get device by type and name (callback-based)
 * @param {string|null} type - Device type
 * @param {string|null} name - Device name
 * @param {(error: Error|null, device: BatteryDevice|null) => void} callback
 * @returns {void}
 */
function getDeviceByTypeAndName(type, name, callback) {
  getDeviceByTypeAndNameAsync(type, name)
    .then((device) => callback(null, device))
    .catch((err) => callback(err, null));
}

// ============================================================
// Update Functions
// ============================================================

/**
 * Update battery button display
 * @param {string} context - Action context
 * @param {BatterySettings} [settings] - Display settings
 * @returns {Promise<void>}
 */
async function updateBatteryButton(context, settings = {}) {
  const device1Id = settings.device1 || '';
  const device2Id = settings.device2 || '';

  const { type: type1, name: name1 } = parseDeviceId(device1Id);
  const { type: type2, name: name2 } = parseDeviceId(device2Id);

  const isDualMode = device2Id !== '';

  if (isDualMode) {
    // Parallel requests for both devices
    const [device1, device2] = await Promise.all([
      getDeviceByTypeAndNameAsync(type1, name1),
      getDeviceByTypeAndNameAsync(type2, name2),
    ]);
    const imageData = drawDualBattery(device1, device2);
    setImage(context, imageData);
  } else {
    const device = await getDeviceByTypeAndNameAsync(type1, name1);
    const imageData = drawSingleDeviceButton(device);
    setImage(context, imageData);
  }
}

// ============================================================
// Timer Functions
// ============================================================

/**
 * Start battery update timer
 * @param {string} context - Action context
 * @param {BatterySettings} [settings] - Display settings
 * @returns {void}
 */
function startBatteryTimer(context, settings = {}) {
  stopTimer(context);

  const interval1 = Math.max(
    MIN_UPDATE_INTERVAL,
    Math.min(
      parseInt(String(settings.device1Interval)) || DEFAULT_UPDATE_INTERVAL,
      MAX_UPDATE_INTERVAL
    )
  );
  const interval2 = settings.device2
    ? Math.max(
        MIN_UPDATE_INTERVAL,
        Math.min(
          parseInt(String(settings.device2Interval)) || DEFAULT_UPDATE_INTERVAL,
          MAX_UPDATE_INTERVAL
        )
      )
    : interval1;
  const updateInterval = Math.min(interval1, interval2);
  const interval = updateInterval * 1000;

  updateBatteryButton(context, settings);

  const timer = setInterval(() => {
    const ctx = contexts[context];
    if (ctx) {
      updateBatteryButton(context, ctx.settings || settings);
    }
  }, interval);

  setTimer(context, timer);
}

// ============================================================
// Property Inspector Communication
// ============================================================

/**
 * Send all device list to Property Inspector
 * @returns {void}
 */
function sendAllDeviceList() {
  const { log } = require('../lib/common');
  log('[Battery] sendAllDeviceList: starting device scan');
  getAllBatteryDevices((_error, allDevices) => {
    log(`[Battery] sendAllDeviceList: got ${allDevices.length} devices, sending to PI`);
    sendToPropertyInspector({
      event: 'allDeviceList',
      devices: allDevices.map((d) => ({
        name: d.name,
        type: d.type,
        battery: d.isCharging ? null : d.battery,
        connected: d.connected !== false,
        lastBattery: d.lastBattery,
        isCharging: d.isCharging,
        isWired: d.isWired,
        error: d.error,
      })),
    });

    if (!isHIDAvailable()) {
      sendToPropertyInspector({
        event: 'warning',
        message: 'Razer helper not available. Please compile razer-battery-helper.exe.',
      });
    }
  });
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle action appearing
 * @param {string} context - Action context
 * @param {AppearPayloadBattery} payload - Event payload
 * @returns {void}
 */
function onWillAppear(context, payload) {
  const settings = payload?.settings || {};
  setContext(context, { settings, action: BATTERY_ACTION });

  startBatteryTimer(context, settings);
}

/**
 * Handle action disappearing
 * @param {string} context - Action context
 * @returns {void}
 */
function onWillDisappear(context) {
  stopTimer(context);
}

/**
 * Handle key release
 * @param {string} context - Action context
 * @param {KeyPayloadBattery} payload - Event payload
 * @returns {void}
 */
function onKeyUp(context, payload) {
  const settings = payload?.settings || contexts[context]?.settings || {};
  updateBatteryButton(context, settings);
}

/**
 * Handle data from Property Inspector
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {boolean}
 */
function onSendToPlugin(context, payload) {
  if (payload && payload.event === 'getAllDevices') {
    sendAllDeviceList();
    return true;
  }
  return false;
}

/**
 * Handle Property Inspector appearing
 * @param {string} _context - Action context
 * @returns {void}
 */
function onPropertyInspectorDidAppear(_context) {
  sendAllDeviceList();
}

/**
 * Handle settings update
 * @param {string} context - Action context
 * @param {BatterySettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action: BATTERY_ACTION });
  }

  startBatteryTimer(context, settings);
}

/**
 * Handle settings received
 * @param {string} context - Action context
 * @param {SettingsPayloadBattery} payload - Settings payload
 * @returns {void}
 */
function onDidReceiveSettings(context, payload) {
  onSettingsUpdate(context, payload?.settings || {});
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getAllBatteryDevices,
  getDeviceByTypeAndName,
  parseDeviceId,
  drawBattery,
  drawNoDevice,
  drawNotSupported,
  drawCharging,
  drawDualBattery,
  drawSingleDeviceButton,
  updateBatteryButton,
  startBatteryTimer,
  sendAllDeviceList,
  onWillAppear,
  onWillDisappear,
  onKeyUp,
  onSendToPlugin,
  onPropertyInspectorDidAppear,
  onDidReceiveSettings,
  onSettingsUpdate,
};
