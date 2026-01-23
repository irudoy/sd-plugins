/**
 * Apple Bluetooth battery detection for Mac Tools Plugin
 * @module devices/apple
 */

const { exec } = require('child_process');

// ============================================================
// Type Definitions
// ============================================================

/**
 * Apple Bluetooth device
 * @typedef {Object} AppleDevice
 * @property {string} name - Device name
 * @property {number} battery - Battery percentage (0-100)
 * @property {boolean} isCharging - Whether device is charging
 * @property {string} [address] - Bluetooth address (lowercase, with dashes)
 */

/**
 * @callback AppleDevicesCallback
 * @param {Error|null} error - Error if any
 * @param {AppleDevice[]} devices - List of devices
 * @returns {void}
 */

/**
 * @callback AppleBatteryCallback
 * @param {Error|null} error - Error if any
 * @param {AppleDevice|null} device - Device or null
 * @returns {void}
 */

/**
 * Internal device state during parsing
 * @typedef {Object} ParsedDevice
 * @property {string|null} name
 * @property {number|undefined} battery
 * @property {string|null} address
 * @property {boolean} isCharging
 */

// ============================================================
// Helper Functions
// ============================================================

/**
 * Finalize parsed device into AppleDevice
 * @param {ParsedDevice} device - Parsed device
 * @param {Record<string, string>} deviceNames - Address to name mapping
 * @param {{deviceIndex: number}} counter - Counter for unnamed devices
 * @returns {AppleDevice|null}
 */
function finalizeAppleDevice(device, deviceNames, counter) {
  if (device.battery === undefined) {
    return null;
  }

  let name = device.name;
  const addr = device.address?.toLowerCase();
  if (addr && deviceNames[addr]) {
    name = deviceNames[addr];
  } else if (!name) {
    name = `Bluetooth Device ${++counter.deviceIndex}`;
  }

  return {
    name,
    battery: device.battery,
    isCharging: device.isCharging || false,
    address: addr,
  };
}

// ============================================================
// Main Functions
// ============================================================

/**
 * Get all connected Apple Bluetooth devices with battery
 * @param {AppleDevicesCallback} callback - Callback with devices
 * @returns {void}
 */
function getAppleDevices(callback) {
  exec('system_profiler SPBluetoothDataType 2>/dev/null', (profilerError, profilerOutput) => {
    /** @type {Record<string, string>} */
    const deviceNames = {};

    if (!profilerError && profilerOutput) {
      /** @type {string[]} */
      const lines = profilerOutput.split('\n');
      /** @type {string|null} */
      let currentName = null;
      for (const line of lines) {
        /** @type {RegExpMatchArray|null} */
        const nameMatch = line.match(/^\s{10,14}([^:]+):\s*$/);
        if (nameMatch) {
          currentName = nameMatch[1].trim();
        }
        const addrMatch = line.match(/Address:\s*([0-9A-Fa-f:]+)/);
        if (addrMatch && currentName) {
          const addr = addrMatch[1].toLowerCase().replace(/:/g, '-');
          deviceNames[addr] = currentName;
          currentName = null;
        }
      }
    }

    const cmd = `ioreg -r -k BatteryPercent | grep -E '"(Product|BatteryPercent|BatteryStatusFlags|DeviceAddress)" =' || true`;

    exec(cmd, (error, stdout) => {
      if (error) {
        callback(null, []);
        return;
      }

      /** @type {AppleDevice[]} */
      const devices = [];
      /** @type {string[]} */
      const lines = stdout.trim().split('\n');
      /** @type {ParsedDevice} */
      let currentDevice = {
        name: null,
        battery: undefined,
        address: null,
        isCharging: false,
      };
      const counter = { deviceIndex: 0 };

      for (const line of lines) {
        const productMatch = line.match(/"Product"\s*=\s*"?([^"]*)"?/);
        const batteryMatch = line.match(/"BatteryPercent"\s*=\s*(\d+)/);
        const addressMatch = line.match(/"DeviceAddress"\s*=\s*"([^"]+)"/);
        const statusFlagsMatch = line.match(/"BatteryStatusFlags"\s*=\s*(\d+)/);

        if (addressMatch) {
          const finalized = finalizeAppleDevice(currentDevice, deviceNames, counter);
          if (finalized) {
            devices.push(finalized);
          }
          currentDevice = {
            name: null,
            battery: undefined,
            address: addressMatch[1],
            isCharging: false,
          };
        } else if (productMatch) {
          const productName = productMatch[1]?.trim();
          if (productName) {
            currentDevice.name = productName;
          }
        } else if (batteryMatch) {
          currentDevice.battery = parseInt(batteryMatch[1]);
        } else if (statusFlagsMatch) {
          const flags = parseInt(statusFlagsMatch[1]);
          currentDevice.isCharging = (flags & 2) !== 0;
        }
      }

      const finalized = finalizeAppleDevice(currentDevice, deviceNames, counter);
      if (finalized) {
        devices.push(finalized);
      }

      callback(null, devices);
    });
  });
}

/**
 * Get battery for specific Apple device
 * @param {string|null} deviceName - Device name to find (null for first device)
 * @param {AppleBatteryCallback} callback - Callback with device
 * @returns {void}
 */
function getAppleBattery(deviceName, callback) {
  getAppleDevices((error, devices) => {
    if (error) {
      callback(error, null);
      return;
    }

    if (deviceName) {
      const device = devices.find((d) => d.name === deviceName);
      callback(null, device || null);
    } else {
      callback(null, devices[0] || null);
    }
  });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getAppleDevices,
  getAppleBattery,
};
