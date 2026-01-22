/**
 * Apple Bluetooth battery detection for Mac Tools Plugin
 */

const { exec } = require('child_process');

// ============================================================
// Helper Functions
// ============================================================

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

function getAppleDevices(callback) {
  exec('system_profiler SPBluetoothDataType 2>/dev/null', (profilerError, profilerOutput) => {
    const deviceNames = {};

    if (!profilerError && profilerOutput) {
      const lines = profilerOutput.split('\n');
      let currentName = null;
      for (const line of lines) {
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

      const devices = [];
      const lines = stdout.trim().split('\n');
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
