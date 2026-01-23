/**
 * Razer battery detection for Mac Tools Plugin
 *
 * Uses native IOKit helper - no node-hid dependency, no mouse blocking.
 * @module devices/razer
 */

const { log } = require('../lib/common');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================
// Type Definitions
// ============================================================

/**
 * Razer device configuration
 * @typedef {Object} RazerDeviceConfig
 * @property {number[]} pids - USB Product IDs
 * @property {number} transactionId - HID transaction ID
 */

/**
 * Razer device info from enumeration
 * @typedef {Object} RazerDeviceInfo
 * @property {string} name - Device name
 * @property {number} pid - USB Product ID
 * @property {number} transactionId - HID transaction ID
 * @property {string} path - HID device path
 * @property {boolean} [isWired] - Whether device is wired
 */

/**
 * Razer battery query result
 * @typedef {Object} RazerBatteryResult
 * @property {number|null} battery - Battery percentage or null
 * @property {boolean} isCharging - Whether device is charging
 * @property {string|null} [error] - Error code if any
 * @property {boolean} [sleeping] - Whether device is in sleep mode
 */

/**
 * Cached battery entry
 * @typedef {Object} RazerCacheEntry
 * @property {number} battery - Battery percentage
 * @property {string} deviceName - Device name
 * @property {number} timestamp - Cache timestamp
 */

/**
 * Helper enumeration result
 * @typedef {Object} HelperEnumerateResult
 * @property {Array<{name: string, pid: number, path: string, isWired?: boolean}>} [devices]
 */

/**
 * Helper battery result
 * @typedef {Object} HelperBatteryResult
 * @property {number|null} [battery]
 * @property {boolean} [charging]
 * @property {boolean} [sleeping]
 * @property {string} [error]
 */

// ============================================================
// Constants
// ============================================================

/** @type {number} */
const RAZER_VID = 0x1532;

/** @type {Record<string, RazerDeviceConfig>} */
const RAZER_DEVICES = {
  'Viper V3 Pro': { pids: [0x00c0, 0x00c1], transactionId: 0x1f },
};

/** @type {string} */
const HELPER_PATH = path.join(__dirname, 'razer-battery-helper');

/** @type {Map<string, RazerCacheEntry>} */
const batteryCache = new Map();

/** @type {boolean|null} */
let helperAvailable = null;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Check if native helper is available
 * @returns {boolean}
 */
function isHelperAvailable() {
  if (helperAvailable !== null) return helperAvailable;

  try {
    helperAvailable = fs.existsSync(HELPER_PATH) && (fs.statSync(HELPER_PATH).mode & 0o111) !== 0;
    log(
      `[Razer] Native helper ${helperAvailable ? 'available' : 'not available'} at ${HELPER_PATH}`
    );
  } catch (e) {
    helperAvailable = false;
    log(`[Razer] Helper check error: ${e.message}`);
  }

  return helperAvailable;
}

/**
 * Call native helper with arguments
 * @param {string} args - Command line arguments
 * @returns {Promise<unknown>}
 */
function callHelper(args) {
  return new Promise((resolve, reject) => {
    exec(`"${HELPER_PATH}" ${args}`, { timeout: 5000 }, (error, stdout, _stderr) => {
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

/** @type {Promise<void>} */
let queryLock = Promise.resolve();

/**
 * Execute function with mutex lock
 * @template T
 * @param {() => Promise<T>} fn - Function to execute
 * @returns {Promise<T>}
 */
async function withLock(fn) {
  const unlock = queryLock;
  /** @type {() => void} */
  let resolveLock = () => {};
  queryLock = new Promise((resolve) => {
    resolveLock = resolve;
  });
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

/**
 * Check if HID access is available
 * @returns {boolean}
 */
function isHIDAvailable() {
  return isHelperAvailable();
}

/**
 * Get list of connected Razer devices
 * @returns {Promise<RazerDeviceInfo[]>}
 */
async function getRazerDevices() {
  if (!isHelperAvailable()) {
    log('[Razer] Helper not available');
    return [];
  }

  try {
    const result = /** @type {HelperEnumerateResult} */ (await callHelper('--enumerate'));
    return (result.devices || []).map((d) => ({
      name: d.name,
      pid: d.pid,
      transactionId: RAZER_DEVICES[d.name]?.transactionId || 0x1f,
      path: d.path,
      isWired: d.isWired,
    }));
  } catch (e) {
    log(`[Razer] Enumerate error: ${e.message}`);
    return [];
  }
}

/**
 * Get battery level for Razer device
 * @param {RazerDeviceInfo} deviceInfo - Device info
 * @returns {Promise<RazerBatteryResult>}
 */
async function getRazerBattery(deviceInfo) {
  if (!isHelperAvailable()) {
    return { battery: null, isCharging: false, error: 'helper_not_available' };
  }

  return withLock(async () => {
    try {
      const result = /** @type {HelperBatteryResult} */ (
        await callHelper(`--path "${deviceInfo.path}"`)
      );

      // Handle sleeping state with cache
      if (result.sleeping) {
        const cached = batteryCache.get(deviceInfo.path);
        if (cached) {
          return {
            battery: cached.battery,
            isCharging: false,
            error: null,
            sleeping: true,
          };
        }
        return { battery: null, isCharging: false, error: 'timeout', sleeping: true };
      }

      // Handle errors
      if (result.error) {
        return { battery: null, isCharging: false, error: result.error };
      }

      // Cache successful reading
      if (result.battery != null) {
        batteryCache.set(deviceInfo.path, {
          battery: result.battery,
          deviceName: deviceInfo.name,
          timestamp: Date.now(),
        });
      }

      return {
        battery: result.battery ?? null,
        isCharging: result.charging || false,
        error: null,
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

/** @type {number} */
const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

/**
 * Get cached battery for Razer device
 * @param {string|null} [deviceName] - Device name to match
 * @returns {RazerCacheEntry|null}
 */
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
  getCachedRazerBattery,
};
