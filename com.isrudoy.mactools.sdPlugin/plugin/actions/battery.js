/**
 * Battery Monitor action for Mac Tools Plugin
 */

const {
    MIN_UPDATE_INTERVAL,
    MAX_UPDATE_INTERVAL,
    DEFAULT_UPDATE_INTERVAL,
    BATTERY_ACTION
} = require('../lib/common');
const { contexts, stopTimer, setTimer, setContext, setDeviceCache, getDeviceCache } = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const { getAppleDevices, getAppleBattery } = require('../devices/apple');
const { getRazerDevices, getRazerBattery, getCachedRazerBattery, isHIDAvailable } = require('../devices/razer');
const {
    drawBattery,
    drawNoDevice,
    drawNotSupported,
    drawCharging,
    drawDualBattery,
    drawSingleDeviceButton
} = require('../lib/battery-drawing');

// ============================================================
// Device Cache Management
// ============================================================

function getDeviceKey(device, type) {
    if (type === 'apple' && device.address) {
        return device.address;
    }
    return device.name;
}

function updateDeviceCache(type, devices) {
    const now = Date.now();
    const cache = getDeviceCache(type);

    for (const device of devices) {
        const key = getDeviceKey(device, type);
        const existing = cache.find(d => getDeviceKey(d, type) === key);
        if (existing) {
            Object.assign(existing, device, { lastSeen: now, connected: true });
        } else {
            cache.push({ ...device, lastSeen: now, connected: true });
        }
    }

    for (const cached of cache) {
        const key = getDeviceKey(cached, type);
        if (!devices.find(d => getDeviceKey(d, type) === key)) {
            cached.connected = false;
        }
    }

    const maxAge = 24 * 60 * 60 * 1000;
    setDeviceCache(type, cache.filter(d => now - d.lastSeen < maxAge));
}

function getMergedDeviceList(type, currentDevices) {
    updateDeviceCache(type, currentDevices);

    const result = [];
    const cache = getDeviceCache(type);

    for (const device of currentDevices) {
        result.push({ ...device, connected: true });
    }

    for (const cached of cache) {
        const key = getDeviceKey(cached, type);
        if (!cached.connected && !result.find(d => getDeviceKey(d, type) === key)) {
            result.push({
                name: cached.name,
                battery: null,
                connected: false,
                lastBattery: cached.battery,
                address: cached.address,
                isWired: cached.isWired
            });
        }
    }

    return result;
}

// ============================================================
// Device Detection
// ============================================================

function parseDeviceId(deviceId) {
    if (!deviceId) return { type: null, name: null };
    const colonIndex = deviceId.indexOf(':');
    if (colonIndex === -1) return { type: null, name: deviceId };
    return {
        type: deviceId.substring(0, colonIndex),
        name: deviceId.substring(colonIndex + 1)
    };
}

async function getAllBatteryDevicesAsync() {
    const allDevices = [];

    // Get Apple devices (callback-based, wrap in Promise)
    const appleDevices = await new Promise(resolve => {
        getAppleDevices((error, devices) => {
            resolve(error ? [] : devices);
        });
    });

    const mergedApple = getMergedDeviceList('apple', appleDevices);
    for (const device of mergedApple) {
        allDevices.push({ ...device, type: 'apple' });
    }

    // Get Razer devices (async)
    const razerDevices = await getRazerDevices();
    const razerWithBattery = await Promise.all(razerDevices.map(async d => {
        const result = await getRazerBattery(d);
        return {
            name: d.name,
            battery: result.battery,
            isWired: d.isWired,
            isCharging: result.isCharging,
            error: result.error
        };
    }));
    const mergedRazer = getMergedDeviceList('razer', razerWithBattery);
    for (const device of mergedRazer) {
        allDevices.push({ ...device, type: 'razer' });
    }

    return allDevices;
}

function getAllBatteryDevices(callback) {
    getAllBatteryDevicesAsync()
        .then(devices => callback(null, devices))
        .catch(err => callback(err, []));
}

async function getDeviceByTypeAndNameAsync(type, name) {
    if (type === 'apple') {
        return new Promise(resolve => {
            getAppleBattery(name, (error, device) => {
                if (error || !device) {
                    // Device not connected - check cache
                    const cache = getDeviceCache('apple');
                    const cached = cache.find(d => d.name === name);
                    if (cached) {
                        resolve({
                            name: cached.name,
                            battery: cached.battery,
                            isCharging: false,
                            connected: false,
                            type: 'apple'
                        });
                    } else {
                        // No cache - return device with name from settings
                        resolve({
                            name: name,
                            battery: null,
                            isCharging: false,
                            connected: false,
                            type: 'apple'
                        });
                    }
                } else {
                    resolve({ ...device, type: 'apple' });
                }
            });
        });
    } else if (type === 'razer') {
        const razerDevices = await getRazerDevices();
        let device = razerDevices.find(d => d.name === name);
        if (!device && razerDevices.length > 0) {
            device = razerDevices[0];
        }

        if (!device) {
            // Device not connected - return cached data with connected: false
            const cached = getCachedRazerBattery(name);
            if (cached) {
                return {
                    name: name,
                    battery: cached.battery,
                    isCharging: false,
                    connected: false,
                    type: 'razer'
                };
            }
            // No cache - return device with name from settings
            return {
                name: name,
                battery: null,
                isCharging: false,
                connected: false,
                type: 'razer'
            };
        }

        const result = await getRazerBattery(device);
        return {
            name: device.name,
            battery: result.battery,
            isCharging: result.isCharging,
            isWired: device.isWired,
            sleeping: result.sleeping,
            error: result.error,
            type: 'razer'
        };
    } else {
        // No device selected - require explicit selection
        return null;
    }
}

function getDeviceByTypeAndName(type, name, callback) {
    getDeviceByTypeAndNameAsync(type, name)
        .then(device => callback(null, device))
        .catch(err => callback(err, null));
}

// ============================================================
// Update Functions
// ============================================================

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
            getDeviceByTypeAndNameAsync(type2, name2)
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

function startBatteryTimer(context, settings = {}) {
    stopTimer(context);

    const interval1 = Math.max(MIN_UPDATE_INTERVAL, Math.min(parseInt(settings.device1Interval) || DEFAULT_UPDATE_INTERVAL, MAX_UPDATE_INTERVAL));
    const interval2 = settings.device2 ? Math.max(MIN_UPDATE_INTERVAL, Math.min(parseInt(settings.device2Interval) || DEFAULT_UPDATE_INTERVAL, MAX_UPDATE_INTERVAL)) : interval1;
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

function sendAllDeviceList() {
    let hasAccessError = false;

    getAllBatteryDevices((error, allDevices) => {
        hasAccessError = allDevices.some(d => d.type === 'razer' && d.error === 'access_denied');

        sendToPropertyInspector({
            event: 'allDeviceList',
            devices: allDevices.map(d => ({
                name: d.name,
                type: d.type,
                battery: d.isCharging ? null : d.battery,
                connected: d.connected !== false,
                lastBattery: d.lastBattery,
                isCharging: d.isCharging,
                isWired: d.isWired,
                error: d.error
            }))
        });

        if (hasAccessError) {
            sendToPropertyInspector({
                event: 'permissionError',
                message: 'StreamDock needs Input Monitoring permission to read Razer battery.\n\nSystem Preferences → Security & Privacy → Privacy → Input Monitoring → Add StreamDock'
            });
        }

        if (!isHIDAvailable()) {
            sendToPropertyInspector({
                event: 'warning',
                message: 'Razer helper not available. Razer devices unavailable.'
            });
        }
    });
}

// ============================================================
// Event Handlers
// ============================================================

function onWillAppear(context, payload) {
    const settings = payload?.settings || {};
    setContext(context, { settings, action: BATTERY_ACTION });

    startBatteryTimer(context, settings);
}

function onWillDisappear(context) {
    stopTimer(context);
}

function onKeyUp(context, payload) {
    const settings = payload?.settings || contexts[context]?.settings || {};
    updateBatteryButton(context, settings);
}

function onSendToPlugin(context, payload) {
    if (payload && payload.event === 'getAllDevices') {
        sendAllDeviceList();
        return true;
    }
    return false;
}

function onPropertyInspectorDidAppear(context) {
    sendAllDeviceList();
}

function onSettingsUpdate(context, settings) {
    if (contexts[context]) {
        contexts[context].settings = settings;
    } else {
        setContext(context, { settings, action: BATTERY_ACTION });
    }

    updateBatteryButton(context, settings);
    startBatteryTimer(context, settings);
}

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
    onSettingsUpdate
};
