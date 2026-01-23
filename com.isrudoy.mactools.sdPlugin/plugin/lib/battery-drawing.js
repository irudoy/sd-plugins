/**
 * Battery Monitor drawing functions
 * @module lib/battery-drawing
 */

const { createCanvas } = require('canvas');
const {
  CANVAS_SIZE,
  COLORS,
  BATTERY_THRESHOLDS,
  BATTERY_ICON,
  BATTERY_ICON_COMPACT,
} = require('./common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * Battery device information
 * @typedef {Object} BatteryDevice
 * @property {string} name - Device name
 * @property {number|null} battery - Battery percentage (0-100) or null if unknown
 * @property {boolean} [isCharging] - Whether device is charging
 * @property {boolean} [connected] - Whether device is connected
 * @property {boolean} [sleeping] - Whether device is in sleep mode
 * @property {'apple'|'razer'} [type] - Device type
 * @property {string} [error] - Error code ('access_denied', 'timeout', 'not_supported')
 * @property {boolean} [isWired] - Whether Razer device is wired
 * @property {number|null} [lastBattery] - Cached battery level when disconnected
 */

// ============================================================
// Color Helper Functions
// ============================================================

/**
 * Get battery color based on percentage
 * @param {number} percent - Battery percentage
 * @returns {string} Hex color code
 */
function getBatteryColor(percent) {
  if (percent > BATTERY_THRESHOLDS.high) {
    return COLORS.green;
  } else if (percent > BATTERY_THRESHOLDS.low) {
    return COLORS.yellow;
  }
  return COLORS.red;
}

/**
 * Get dimmed battery color for sleep state
 * @param {number} percent - Battery percentage
 * @returns {string} Hex color code
 */
function getDimBatteryColor(percent) {
  if (percent > BATTERY_THRESHOLDS.high) {
    return COLORS.dimGreen;
  } else if (percent > BATTERY_THRESHOLDS.low) {
    return COLORS.dimYellow;
  }
  return COLORS.dimRed;
}

// ============================================================
// Single Device Drawing Helpers
// ============================================================

/**
 * Draw battery icon outline
 * @param {CanvasContext} ctx - Canvas context
 * @param {string} [color] - Outline color
 * @returns {void}
 */
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

/**
 * Draw battery fill level
 * @param {CanvasContext} ctx - Canvas context
 * @param {number} percent - Battery percentage
 * @param {string} color - Fill color
 * @returns {void}
 */
function drawBatteryFill(ctx, percent, color) {
  const { x, y, width, height, cornerRadius, padding } = BATTERY_ICON;

  const fillWidth = (width - padding * 2) * (percent / 100);
  if (fillWidth > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(
      x + padding,
      y + padding,
      fillWidth,
      height - padding * 2,
      Math.max(0, cornerRadius - padding)
    );
    ctx.fill();
  }
}

// ============================================================
// Single Device Drawing Functions
// ============================================================

/**
 * Draw battery with percentage
 * @param {number} percent - Battery percentage
 * @param {string} [deviceName] - Device name to display
 * @returns {string} Base64 PNG data URL
 */
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
  ctx.fillText(`${percent}%`, CANVAS_SIZE / 2, 107);

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

/**
 * Draw "No Device" state
 * @param {string} [deviceType] - Device type description
 * @returns {string} Base64 PNG data URL
 */
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

/**
 * Draw "Not Supported" state (wireless Razer without battery)
 * @param {string} [deviceName] - Device name
 * @returns {string} Base64 PNG data URL
 */
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

/**
 * Draw charging state
 * @param {string} [deviceName] - Device name
 * @param {number|null} [batteryLevel] - Battery level if known
 * @returns {string} Base64 PNG data URL
 */
function drawCharging(deviceName, batteryLevel) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawBatteryOutline(ctx, COLORS.white);

  if (batteryLevel !== null && batteryLevel !== undefined) {
    const { x, y, width, height, padding } = BATTERY_ICON;
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const fillWidth = (batteryLevel / 100) * innerWidth;

    ctx.fillStyle = COLORS.green;
    ctx.fillRect(x + padding, y + padding, fillWidth, innerHeight);
  }

  // Charging icon with white outline
  const { x, y, width, height } = BATTERY_ICON;
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.strokeStyle = COLORS.white;
  ctx.lineWidth = 3;
  ctx.strokeText('\u26A1', x + width / 2, y + height / 2 + 8);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillText('\u26A1', x + width / 2, y + height / 2 + 8);

  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 28px sans-serif';
  if (batteryLevel !== null && batteryLevel !== undefined) {
    ctx.fillText(`${batteryLevel}%`, CANVAS_SIZE / 2, 107);
  } else {
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Charging', CANVAS_SIZE / 2, 107);
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

/**
 * Draw sleeping state (Razer device in sleep mode)
 * @param {string} [deviceName] - Device name
 * @param {number|null} [batteryLevel] - Battery level if known
 * @returns {string} Base64 PNG data URL
 */
function drawSleeping(deviceName, batteryLevel) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Dimmed battery outline
  drawBatteryOutline(ctx, COLORS.dimGray);

  const { x, y, width, height, padding, cornerRadius } = BATTERY_ICON;

  // Dimmed battery fill if we have a level
  if (batteryLevel !== null && batteryLevel !== undefined) {
    const dimColor = getDimBatteryColor(batteryLevel);
    const fillWidth = (width - padding * 2) * (batteryLevel / 100);
    if (fillWidth > 0) {
      ctx.fillStyle = dimColor;
      ctx.beginPath();
      ctx.roundRect(
        x + padding,
        y + padding,
        fillWidth,
        height - padding * 2,
        Math.max(0, cornerRadius - padding)
      );
      ctx.fill();
    }
  }

  // Zzz icon inside battery
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Zzz', x + width / 2, y + height / 2 + 6);

  // Battery percentage (dimmed but visible)
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 24px sans-serif';
  if (batteryLevel !== null && batteryLevel !== undefined) {
    ctx.fillText(`${batteryLevel}%`, CANVAS_SIZE / 2, 107);
  } else {
    ctx.font = '18px sans-serif';
    ctx.fillText('Sleep', CANVAS_SIZE / 2, 107);
  }

  // Device name (dimmed)
  if (deviceName) {
    let displayName = deviceName;
    if (displayName.length > 16) {
      displayName = displayName.substring(0, 15) + '...';
    }
    ctx.fillStyle = COLORS.darkGray;
    ctx.font = '16px sans-serif';
    ctx.fillText(displayName, CANVAS_SIZE / 2, 130);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Draw offline state
 * @param {string} [deviceName] - Device name
 * @param {number|null} [cachedBattery] - Cached battery level
 * @returns {string} Base64 PNG data URL
 */
function drawOffline(deviceName, cachedBattery) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  const { x, y, width, height } = BATTERY_ICON;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  drawBatteryOutline(ctx, COLORS.dimGray);

  // X mark inside battery
  ctx.strokeStyle = COLORS.darkGray;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 10);
  ctx.lineTo(x + width - 20, y + height - 10);
  ctx.moveTo(x + width - 20, y + 10);
  ctx.lineTo(x + 20, y + height - 10);
  ctx.stroke();

  // "Offline" text with optional cached battery
  ctx.fillStyle = COLORS.gray;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  if (cachedBattery !== null && cachedBattery !== undefined) {
    ctx.fillText(`Offline (${cachedBattery}%)`, CANVAS_SIZE / 2, 107);
  } else {
    ctx.fillText('Offline', CANVAS_SIZE / 2, 107);
  }

  // Device name (dimmed)
  if (deviceName) {
    let displayName = deviceName;
    if (displayName.length > 16) {
      displayName = displayName.substring(0, 15) + '...';
    }
    ctx.fillStyle = COLORS.darkGray;
    ctx.font = '16px sans-serif';
    ctx.fillText(displayName, CANVAS_SIZE / 2, 125);
  }

  return canvas.toDataURL('image/png');
}

// ============================================================
// Compact Mode Drawing Functions (Dual Device)
// ============================================================

/**
 * Draw compact battery outline (for dual device mode)
 * @param {CanvasContext} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} [color] - Outline color
 * @returns {void}
 */
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

/**
 * Draw compact battery fill (for dual device mode)
 * @param {CanvasContext} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} percent - Battery percentage
 * @param {string} color - Fill color
 * @returns {void}
 */
function drawCompactBatteryFill(ctx, x, y, percent, color) {
  const { width, height, cornerRadius, padding } = BATTERY_ICON_COMPACT;

  const fillWidth = (width - padding * 2) * (percent / 100);
  if (fillWidth > 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(
      x + padding,
      y + padding,
      fillWidth,
      height - padding * 2,
      Math.max(0, cornerRadius - padding)
    );
    ctx.fill();
  }
}

/**
 * Draw compact device row (for dual device mode)
 * @param {CanvasContext} ctx - Canvas context
 * @param {BatteryDevice|null} device - Device info
 * @param {number} yOffset - Y offset for this row
 * @returns {void}
 */
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
    ctx.fillText('Offline', valueX, valueCenterY + 1);

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

  // Sleeping state (Razer device in sleep mode)
  if (device.sleeping) {
    drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.dimGray);

    // Draw dimmed battery fill with appropriate color
    if (device.battery !== null && device.battery !== undefined) {
      const dimColor = getDimBatteryColor(device.battery);
      drawCompactBatteryFill(ctx, batteryX, batteryY, device.battery, dimColor);
    }

    // Zzz icon
    ctx.fillStyle = COLORS.gray;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Zzz', batteryX + battWidth / 2, valueCenterY);

    // Show percentage in compact mode (dimmed)
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.gray;
    ctx.font = '20px sans-serif';
    if (device.battery !== null && device.battery !== undefined) {
      ctx.fillText(`${device.battery}%`, valueX, valueCenterY + 1);
    } else {
      ctx.fillText('Sleep', valueX, valueCenterY + 1);
    }

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
    ctx.fillText('N/A', valueX, valueCenterY + 1);

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
    drawCompactBatteryOutline(ctx, batteryX, batteryY, COLORS.white);

    if (device.battery !== null && device.battery !== undefined) {
      drawCompactBatteryFill(ctx, batteryX, batteryY, device.battery, COLORS.green);
    }

    // Charging icon with white outline
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = COLORS.white;
    ctx.lineWidth = 2;
    ctx.strokeText('\u26A1', batteryX + battWidth / 2, valueCenterY);
    ctx.fillStyle = COLORS.yellow;
    ctx.fillText('\u26A1', batteryX + battWidth / 2, valueCenterY);

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.white;
    ctx.font = 'bold 24px sans-serif';
    if (device.battery !== null && device.battery !== undefined) {
      ctx.fillText(`${device.battery}%`, valueX, valueCenterY + 1);
    } else {
      ctx.font = '16px sans-serif';
      ctx.fillText('Charging', valueX, valueCenterY + 1);
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
    ctx.fillText(`${device.battery}%`, valueX, valueCenterY + 1);

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
    ctx.fillText('N/A', valueX, valueCenterY + 1);

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

/**
 * Draw dual device battery display
 * @param {BatteryDevice|null} device1 - First device
 * @param {BatteryDevice|null} device2 - Second device
 * @returns {string} Base64 PNG data URL
 */
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

/**
 * Draw single device button with appropriate state
 * @param {BatteryDevice|null} device - Device info
 * @returns {string} Base64 PNG data URL
 */
function drawSingleDeviceButton(device) {
  if (!device) {
    return drawNoDevice('No Device');
  }

  if (device.connected === false) {
    // Show offline state with device name and cached battery
    return drawOffline(device.name, device.battery);
  }

  if (device.sleeping) {
    return drawSleeping(device.name, device.battery);
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
// Exports
// ============================================================

module.exports = {
  getBatteryColor,
  getDimBatteryColor,
  drawBattery,
  drawNoDevice,
  drawNotSupported,
  drawCharging,
  drawSleeping,
  drawOffline,
  drawDualBattery,
  drawSingleDeviceButton,
};
