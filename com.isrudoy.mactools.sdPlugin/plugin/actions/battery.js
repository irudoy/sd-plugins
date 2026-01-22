/**
 * Battery Monitor action for Mac Tools Plugin
 */

const { createCanvas } = require('canvas');
const {
    log,
    CANVAS_SIZE,
    COLORS,
    MIN_UPDATE_INTERVAL,
    MAX_UPDATE_INTERVAL,
    DEFAULT_UPDATE_INTERVAL,
    BATTERY_THRESHOLDS,
    BATTERY_ICON,
    BATTERY_ICON_COMPACT,
    BATTERY_ACTION
} = require('../lib/common');
const { contexts, stopTimer, setTimer, setContext, setDeviceCache, getDeviceCache } = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const { getAppleDevices, getAppleBattery } = require('../devices/apple');
const { getRazerDevices, getRazerBattery, loadHID } = require('../devices/razer');

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

    // Get Razer devices (now async)
    const razerDevices = getRazerDevices();
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
                    resolve(null);
                } else {
                    resolve({ ...device, type: 'apple' });
                }
            });
        });
    } else if (type === 'razer') {
        const razerDevices = getRazerDevices();
        let device = razerDevices.find(d => d.name === name);
        if (!device && razerDevices.length > 0) {
            device = razerDevices[0];
        }

        if (!device) {
            return null;
        }

        const result = await getRazerBattery(device);
        return {
            name: device.name,
            battery: result.battery,
            isCharging: result.isCharging,
            isWired: device.isWired,
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
// Drawing Helper Functions
// ============================================================

function getBatteryColor(percent) {
    if (percent > BATTERY_THRESHOLDS.high) {
        return COLORS.green;
    } else if (percent > BATTERY_THRESHOLDS.low) {
        return COLORS.yellow;
    }
    return COLORS.red;
}

function drawBatteryOutline(ctx, color = COLORS.white) {
    const { x, y, width, height, tipWidth, tipHeight, cornerRadius } = BATTERY_ICON;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, cornerRadius);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x + width, y + (height - tipHeight) / 2, tipWidth, tipHeight);
}

function drawBatteryFill(ctx, percent, color) {
    const { x, y, width, height, cornerRadius, padding } = BATTERY_ICON;

    const fillWidth = (width - padding * 2) * (percent / 100);
    if (fillWidth > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x + padding, y + padding, fillWidth, height - padding * 2, Math.max(0, cornerRadius - padding));
        ctx.fill();
    }
}

// ============================================================
// Single Device Drawing Functions
// ============================================================

function drawBattery(percent, deviceName) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const color = getBatteryColor(percent);
    drawBatteryOutline(ctx, COLORS.white);
    drawBatteryFill(ctx, percent, color);

    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${percent}%`, CANVAS_SIZE / 2, 105);

    if (deviceName) {
        let displayName = deviceName;
        if (displayName.length > 16) {
            displayName = displayName.substring(0, 15) + '...';
        }
        ctx.fillStyle = COLORS.lightGray;
        ctx.font = '16px sans-serif';
        ctx.fillText(displayName, CANVAS_SIZE / 2, 130);
    }

    return canvas.toDataURL('image/png');
}

function drawNoDevice(deviceType) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    const { x, y, width, height } = BATTERY_ICON;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    drawBatteryOutline(ctx, COLORS.dimGray);

    ctx.strokeStyle = COLORS.darkGray;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 10);
    ctx.lineTo(x + width - 20, y + height - 10);
    ctx.moveTo(x + width - 20, y + 10);
    ctx.lineTo(x + 20, y + height - 10);
    ctx.stroke();

    ctx.fillStyle = COLORS.gray;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No Device', CANVAS_SIZE / 2, 105);

    ctx.fillStyle = COLORS.darkGray;
    ctx.font = '16px sans-serif';
    ctx.fillText(deviceType || 'Disconnected', CANVAS_SIZE / 2, 125);

    return canvas.toDataURL('image/png');
}

function drawNotSupported(deviceName) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');
    const { x, y, width, height } = BATTERY_ICON;

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    drawBatteryOutline(ctx, COLORS.dimGray);

    ctx.fillStyle = COLORS.yellow;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', x + width / 2, y + height / 2 + 8);

    ctx.fillStyle = COLORS.yellow;
    ctx.font = '16px sans-serif';
    ctx.fillText('Wireless', CANVAS_SIZE / 2, 100);

    ctx.fillStyle = COLORS.gray;
    ctx.font = '16px sans-serif';
    ctx.fillText('Not Supported', CANVAS_SIZE / 2, 118);

    if (deviceName) {
        let displayName = deviceName.replace(' (Wireless)', '');
        if (displayName.length > 16) {
            displayName = displayName.substring(0, 15) + '...';
        }
        ctx.fillStyle = COLORS.darkGray;
        ctx.font = '11px sans-serif';
        ctx.fillText(displayName, CANVAS_SIZE / 2, 135);
    }

    return canvas.toDataURL('image/png');
}

function drawCharging(deviceName, batteryLevel) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    drawBatteryOutline(ctx, COLORS.green);

    if (batteryLevel !== null && batteryLevel !== undefined) {
        const { x, y, width, height, padding } = BATTERY_ICON;
        const innerWidth = width - padding * 2;
        const innerHeight = height - padding * 2;
        const fillWidth = (batteryLevel / 100) * innerWidth;

        ctx.fillStyle = COLORS.green;
        ctx.fillRect(x + padding, y + padding, fillWidth, innerHeight);
    }

    const { x, y, width, height } = BATTERY_ICON;
    ctx.fillStyle = COLORS.yellow;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u26A1', x + width / 2, y + height / 2 + 8);

    ctx.fillStyle = COLORS.green;
    ctx.font = 'bold 24px sans-serif';
    if (batteryLevel !== null && batteryLevel !== undefined) {
        ctx.fillText(`${batteryLevel}%`, CANVAS_SIZE / 2, 105);
    } else {
        ctx.fillText('Charging', CANVAS_SIZE / 2, 105);
    }

    if (deviceName) {
        let displayName = deviceName;
        if (displayName.length > 16) {
            displayName = displayName.substring(0, 15) + '...';
        }
        ctx.fillStyle = COLORS.lightGray;
        ctx.font = '16px sans-serif';
        ctx.fillText(displayName, CANVAS_SIZE / 2, 130);
    }

    return canvas.toDataURL('image/png');
}

// ============================================================
// Compact Mode Drawing Functions (Dual Device)
// ============================================================

function drawCompactBatteryOutline(ctx, x, y, color = COLORS.white) {
    const { width, height, tipWidth, tipHeight, cornerRadius } = BATTERY_ICON_COMPACT;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, cornerRadius);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x + width, y + (height - tipHeight) / 2, tipWidth, tipHeight);
}

function drawCompactBatteryFill(ctx, x, y, percent, color) {
    const { width, height, cornerRadius, padding } = BATTERY_ICON_COMPACT;

    const fillWidth = (width - padding * 2) * (percent / 100);
    if (fillWidth > 0) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x + padding, y + padding, fillWidth, height - padding * 2, Math.max(0, cornerRadius - padding));
        ctx.fill();
    }
}

function drawCompactDevice(ctx, device, yOffset) {
    const { width: battWidth, height: battHeight, tipWidth } = BATTERY_ICON_COMPACT;
    const batteryX = 12;
    const batteryY = yOffset + 16;
    const valueX = batteryX + battWidth + tipWidth + 14;
    const valueCenterY = batteryY + battHeight / 2;
    const nameY = yOffset + 59;

    if (!device || device.connected === false) {
        drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.dimGray);

        ctx.strokeStyle = COLORS.darkGray;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(batteryX + 10, batteryY + 5);
        ctx.lineTo(batteryX + battWidth - 10, batteryY + battHeight - 5);
        ctx.moveTo(batteryX + battWidth - 10, batteryY + 5);
        ctx.lineTo(batteryX + 10, batteryY + battHeight - 5);
        ctx.stroke();

        ctx.fillStyle = COLORS.gray;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('Offline', valueX, valueCenterY);

        if (device && device.name) {
            let displayName = device.name;
            ctx.font = '16px sans-serif';
            while (ctx.measureText(displayName).width > CANVAS_SIZE - 16 && displayName.length > 3) {
                displayName = displayName.substring(0, displayName.length - 4) + '...';
            }
            ctx.fillStyle = COLORS.darkGray;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(displayName, CANVAS_SIZE / 2, nameY);
        }
        return;
    }

    if (device.error === 'not_supported' || device.error === 'timeout') {
        drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.dimGray);

        ctx.fillStyle = COLORS.yellow;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', batteryX + battWidth / 2, valueCenterY);

        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.yellow;
        ctx.font = '20px sans-serif';
        ctx.fillText('N/A', valueX, valueCenterY);

        let displayName = device.name;
        ctx.font = '16px sans-serif';
        while (ctx.measureText(displayName).width > CANVAS_SIZE - 16 && displayName.length > 3) {
            displayName = displayName.substring(0, displayName.length - 4) + '...';
        }
        ctx.fillStyle = COLORS.darkGray;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(displayName, CANVAS_SIZE / 2, nameY);
        return;
    }

    if (device.isCharging) {
        drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.green);

        if (device.battery !== null && device.battery !== undefined) {
            drawCompactBatteryFill(ctx, batteryX, batteryY, device.battery, COLORS.green);
        }

        ctx.fillStyle = COLORS.yellow;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u26A1', batteryX + battWidth / 2, valueCenterY);

        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.green;
        ctx.font = 'bold 24px sans-serif';
        if (device.battery !== null && device.battery !== undefined) {
            ctx.fillText(`${device.battery}%`, valueX, valueCenterY);
        } else {
            ctx.font = '16px sans-serif';
            ctx.fillText('Charging', valueX, valueCenterY);
        }

        let displayName = device.name;
        ctx.font = '16px sans-serif';
        while (ctx.measureText(displayName).width > CANVAS_SIZE - 16 && displayName.length > 3) {
            displayName = displayName.substring(0, displayName.length - 4) + '...';
        }
        ctx.fillStyle = COLORS.lightGray;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(displayName, CANVAS_SIZE / 2, nameY);
        return;
    }

    if (device.battery !== null && device.battery !== undefined) {
        const color = getBatteryColor(device.battery);
        drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.white);
        drawCompactBatteryFill(ctx, batteryX, batteryY, device.battery, color);

        ctx.fillStyle = COLORS.white;
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${device.battery}%`, valueX, valueCenterY);

        let displayName = device.name;
        ctx.font = '16px sans-serif';
        while (ctx.measureText(displayName).width > CANVAS_SIZE - 16 && displayName.length > 3) {
            displayName = displayName.substring(0, displayName.length - 4) + '...';
        }
        ctx.fillStyle = COLORS.lightGray;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(displayName, CANVAS_SIZE / 2, nameY);
    } else {
        drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.dimGray);

        ctx.fillStyle = COLORS.gray;
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('N/A', valueX, valueCenterY);

        let displayName = device.name;
        ctx.font = '16px sans-serif';
        while (ctx.measureText(displayName).width > CANVAS_SIZE - 16 && displayName.length > 3) {
            displayName = displayName.substring(0, displayName.length - 4) + '...';
        }
        ctx.fillStyle = COLORS.darkGray;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(displayName, CANVAS_SIZE / 2, nameY);
    }
}

function drawDualBattery(device1, device2) {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = COLORS.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 72);
    ctx.lineTo(CANVAS_SIZE - 10, 72);
    ctx.stroke();

    drawCompactDevice(ctx, device1, 0);
    drawCompactDevice(ctx, device2, 72);

    return canvas.toDataURL('image/png');
}

function drawSingleDeviceButton(device) {
    if (!device) {
        return drawNoDevice('No Device');
    }

    if (device.connected === false) {
        return drawNoDevice(device.name || 'Disconnected');
    }

    if (device.error === 'not_supported' || device.error === 'timeout') {
        return drawNotSupported(device.name);
    }

    if (device.error) {
        return drawNoDevice(device.name);
    }

    if (device.isCharging) {
        return drawCharging(device.name, device.battery);
    }

    if (device.battery !== null && device.battery !== undefined) {
        return drawBattery(device.battery, device.name);
    }

    return drawNoDevice(device.name);
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

        const hid = loadHID();
        if (!hid) {
            sendToPropertyInspector({
                event: 'warning',
                message: 'node-hid not installed. Razer devices unavailable. Run: npm install node-hid'
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
