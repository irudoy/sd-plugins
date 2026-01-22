/**
 * Razer battery detection for Mac Tools Plugin
 *
 * Uses native IOKit helper - no node-hid dependency, no mouse blocking.
 */

const { log } = require('../lib/common');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================
// Constants
// ============================================================

const RAZER_VID = 0x1532;
const RAZER_DEVICES = {
    'Viper V3 Pro': { pids: [0x00C0, 0x00C1], transactionId: 0x1f }
};

// Path to native helper
const HELPER_PATH = path.join(__dirname, 'razer-battery-helper');

// Battery cache
const batteryCache = new Map();

// Helper availability
let helperAvailable = null;

// ============================================================
// Helper Functions
// ============================================================

function isHelperAvailable() {
    if (helperAvailable !== null) return helperAvailable;

    try {
        helperAvailable = fs.existsSync(HELPER_PATH) && (fs.statSync(HELPER_PATH).mode & 0o111) !== 0;
        log(`[Razer] Native helper ${helperAvailable ? 'available' : 'not available'} at ${HELPER_PATH}`);
    } catch (e) {
        helperAvailable = false;
        log(`[Razer] Helper check error: ${e.message}`);
    }

    return helperAvailable;
}

function callHelper(args) {
    return new Promise((resolve, reject) => {
        exec(`"${HELPER_PATH}" ${args}`, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(error.message));
                return;
            }

            try {
                resolve(JSON.parse(stdout.trim()));
            } catch (e) {
                reject(new Error(`Parse error: ${e.message}, stdout: ${stdout}`));
            }
        });
    });
}

// ============================================================
// Mutex (prevents race conditions with multiple widgets)
// ============================================================

let queryLock = Promise.resolve();

async function withLock(fn) {
    const unlock = queryLock;
    let resolveLock;
    queryLock = new Promise(resolve => { resolveLock = resolve; });
    await unlock;
    try {
        return await fn();
    } finally {
        resolveLock();
    }
}

// ============================================================
// Main Functions
// ============================================================

function isHIDAvailable() {
    return isHelperAvailable();
}

async function getRazerDevices() {
    if (!isHelperAvailable()) {
        log('[Razer] Helper not available');
        return [];
    }

    try {
        const result = await callHelper('--enumerate');
        return (result.devices || []).map(d => ({
            name: d.name,
            pid: d.pid,
            transactionId: RAZER_DEVICES[d.name]?.transactionId || 0x1f,
            path: d.path,
            isWired: d.isWired
        }));
    } catch (e) {
        log(`[Razer] Enumerate error: ${e.message}`);
        return [];
    }
}

async function getRazerBattery(deviceInfo) {
    if (!isHelperAvailable()) {
        return { battery: null, isCharging: false, error: 'helper_not_available' };
    }

    return withLock(async () => {
        try {
            const result = await callHelper(`--path "${deviceInfo.path}"`);

            // Handle sleeping state with cache
            if (result.sleeping) {
                const cached = batteryCache.get(deviceInfo.path);
                if (cached) {
                    return { battery: cached.battery, isCharging: false, error: null, sleeping: true };
                }
                return { battery: null, isCharging: false, error: 'timeout', sleeping: true };
            }

            // Handle errors
            if (result.error) {
                return { battery: null, isCharging: false, error: result.error };
            }

            // Cache successful reading
            if (result.battery !== null) {
                batteryCache.set(deviceInfo.path, {
                    battery: result.battery,
                    deviceName: deviceInfo.name,
                    timestamp: Date.now()
                });
            }

            return {
                battery: result.battery,
                isCharging: result.charging || false,
                error: null
            };
        } catch (e) {
            log(`[Razer] Query error: ${e.message}`);
            return { battery: null, isCharging: false, error: e.message };
        }
    });
}

// ============================================================
// Cache Functions
// ============================================================

const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

function getCachedRazerBattery(deviceName) {
    const now = Date.now();
    for (const [path, cached] of batteryCache.entries()) {
        // Check expiration
        if (now - cached.timestamp > CACHE_MAX_AGE) {
            batteryCache.delete(path);
            continue;
        }
        // Match by deviceName if provided
        if (!deviceName || cached.deviceName === deviceName) {
            return cached;
        }
    }
    return null;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    RAZER_VID,
    RAZER_DEVICES,
    isHIDAvailable,
    getRazerDevices,
    getRazerBattery,
    getCachedRazerBattery
};
