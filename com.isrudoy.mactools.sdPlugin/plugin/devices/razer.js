/**
 * Razer HID battery detection for Mac Tools Plugin
 */

const { log } = require('../lib/common');

// ============================================================
// Razer Constants
// ============================================================

const RAZER_VID = 0x1532;
const RAZER_DEVICES = {
    'Viper V3 Pro': { pids: [0x00C0, 0x00C1], transactionId: 0x1f }
};

// Razer HID protocol constants
const RAZER_PACKET_SIZE = 90;
const RAZER_CMD_POWER = 0x07;
const RAZER_CMD_BATTERY = 0x80;
const RAZER_CMD_CHARGING = 0x84;

// HID library (lazy loaded)
let HID = null;

// ============================================================
// HID Loading
// ============================================================

function loadHID() {
    if (HID !== null) return HID;

    try {
        HID = require('node-hid');
        return HID;
    } catch (e) {
        HID = false;
        return false;
    }
}

function isHIDAvailable() {
    return loadHID() !== false;
}

// ============================================================
// HID Mutex (prevents race conditions with multiple widgets)
// ============================================================

let hidLock = Promise.resolve();
let lockQueue = 0;

async function withHIDLock(fn) {
    const queuePos = ++lockQueue;
    log(`[Razer] HID lock requested (queue: ${queuePos})`);
    const unlock = hidLock;
    let resolveLock;
    hidLock = new Promise(resolve => { resolveLock = resolve; });
    await unlock;
    log(`[Razer] HID lock acquired (queue: ${queuePos})`);
    try {
        return await fn();
    } finally {
        log(`[Razer] HID lock released (queue: ${queuePos})`);
        resolveLock();
    }
}

// ============================================================
// Helper Functions
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRazerCommand(device, transactionId, commandClass, commandId) {
    const request = Buffer.alloc(RAZER_PACKET_SIZE);
    request[0] = 0x00;
    request[1] = transactionId;
    request[5] = 0x02;
    request[6] = commandClass;
    request[7] = commandId;

    let crc = 0;
    for (let i = 2; i < 88; i++) {
        crc ^= request[i];
    }
    request[88] = crc;

    device.sendFeatureReport([0x00, ...request]);
    await sleep(15);

    return device.getFeatureReport(0x00, RAZER_PACKET_SIZE + 1);
}

// ============================================================
// Main Functions
// ============================================================

function getRazerDevices() {
    const hid = loadHID();
    if (!hid) return [];

    try {
        const allDevices = hid.devices();
        const razerDevices = [];

        for (const [name, info] of Object.entries(RAZER_DEVICES)) {
            for (const pid of info.pids) {
                const found = allDevices.find(d =>
                    d.vendorId === RAZER_VID &&
                    d.productId === pid &&
                    d.interface === 0 &&
                    d.usage === 1
                );

                if (found) {
                    razerDevices.push({
                        name: name,
                        pid: pid,
                        transactionId: info.transactionId,
                        path: found.path,
                        isWired: pid === 0x00C0
                    });
                    break;
                }
            }
        }

        return razerDevices;
    } catch (e) {
        return [];
    }
}

async function getRazerBattery(deviceInfo) {
    const hid = loadHID();
    if (!hid) return { battery: null, isCharging: false, error: 'node-hid not available' };

    return withHIDLock(async () => {
        let device = null;

        try {
            device = new hid.HID(deviceInfo.path);

            const batteryResponse = await sendRazerCommand(device, deviceInfo.transactionId, RAZER_CMD_POWER, RAZER_CMD_BATTERY);

            if (!batteryResponse || batteryResponse.length < 11) {
                return { battery: null, isCharging: false, error: 'Invalid response' };
            }

            const batteryStatus = batteryResponse[1];
            const batteryRaw = batteryResponse[10];

            if (batteryStatus !== 2) {
                if (batteryStatus === 4) {
                    return { battery: null, isCharging: false, error: 'timeout' };
                }
                if (batteryStatus === 5 || batteryStatus === 3) {
                    return { battery: null, isCharging: false, error: 'not_supported' };
                }
            }

            const chargingResponse = await sendRazerCommand(device, deviceInfo.transactionId, RAZER_CMD_POWER, RAZER_CMD_CHARGING);

            let isCharging = false;
            if (chargingResponse && chargingResponse.length >= 11 && chargingResponse[1] === 2) {
                isCharging = chargingResponse[10] === 1;
            }

            const battery = Math.round(batteryRaw / 255 * 100);

            return { battery, isCharging, error: null };
        } catch (e) {
            const errorMsg = e.message || '';
            if (errorMsg.includes('cannot open device')) {
                return { battery: null, isCharging: false, error: 'access_denied' };
            }
            return { battery: null, isCharging: false, error: errorMsg };
        } finally {
            if (device) {
                try { device.close(); } catch (e) {}
            }
        }
    });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    RAZER_VID,
    RAZER_DEVICES,
    loadHID,
    isHIDAvailable,
    getRazerDevices,
    getRazerBattery
};
