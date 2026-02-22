/**
 * Drive Info action for Mac Tools Plugin
 * @module actions/driveinfo
 */

const { execSync, exec } = require('child_process');
const { createCanvas } = require('@napi-rs/canvas');
const { log, CANVAS_SIZE, DRIVEINFO_ACTION } = require('../lib/common');
const { contexts, stopTimer, setTimer, setContext } = require('../lib/state');
const { setImage, setTitle, sendToPropertyInspector } = require('../lib/websocket');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').AppearPayload<DriveInfoSettings>} AppearPayloadDrive
 * @typedef {import('../../../types/streamdock').KeyPayload<DriveInfoSettings>} KeyPayloadDrive
 * @typedef {import('../../../types/streamdock').SettingsPayload<DriveInfoSettings>} SettingsPayloadDrive
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 */

/**
 * Drive Info settings
 * @typedef {Object} DriveInfoSettings
 * @property {'0'|'1'} [displayMode] - '0' for single, '1' for rotation
 * @property {string} [selectedDrive] - Drive name or mountpoint
 * @property {number|string} [rotationSpeed] - Seconds between drives
 * @property {number|string} [updateInterval] - Seconds between updates
 * @property {string} [lowColor] - Hex color for low threshold
 * @property {number|string} [lowThreshold] - Low percentage threshold
 * @property {string} [criticalColor] - Hex color for critical threshold
 * @property {number|string} [criticalThreshold] - Critical percentage threshold
 * @property {boolean} [showLabel] - Show drive name
 * @property {boolean} [invertBar] - Invert progress bar
 */

/**
 * Disk information
 * @typedef {Object} DiskInfo
 * @property {string} device - Device path (/dev/diskX)
 * @property {number} total - Total bytes
 * @property {number} used - Used bytes
 * @property {number} free - Free bytes
 * @property {number} percent - Used percentage
 * @property {string} mountpoint - Mount path
 * @property {string} name - Display name
 * @property {string} displayName - Full display name with mountpoint
 */

// ============================================================
// Disk Information
// ============================================================

/**
 * Get information about all mounted disks
 * @returns {DiskInfo[]}
 */
function getDiskInfo() {
  try {
    const output = execSync('df -Pk', { encoding: 'utf8' });
    const lines = output.trim().split('\n').slice(1);

    const disks = lines
      .filter((line) => line.startsWith('/dev/'))
      .map((line) => {
        const parts = line.split(/\s+/);
        const mountpoint = parts.slice(5).join(' ');
        const name = mountpoint.split('/').pop() || 'Macintosh HD';

        return {
          device: parts[0],
          total: parseInt(parts[1]) * 1024,
          used: parseInt(parts[2]) * 1024,
          free: parseInt(parts[3]) * 1024,
          percent: parseInt(parts[4]),
          mountpoint: mountpoint,
          name: name === '' ? 'Macintosh HD' : name,
          displayName: `${name || 'Macintosh HD'} (${mountpoint})`,
        };
      });

    const dataPartition = disks.find((d) => d.mountpoint === '/System/Volumes/Data');

    const systemVolumePrefixes = [
      '/System/Volumes/VM',
      '/System/Volumes/Preboot',
      '/System/Volumes/Update',
      '/System/Volumes/xarts',
      '/System/Volumes/iSCPreboot',
      '/System/Volumes/Hardware',
      '/System/Volumes/Data',
    ];

    return disks
      .filter((d) => !systemVolumePrefixes.some((prefix) => d.mountpoint.startsWith(prefix)))
      .map((d) => {
        if (d.mountpoint === '/' && dataPartition) {
          return {
            ...dataPartition,
            name: 'Macintosh HD',
            displayName: 'Macintosh HD (/)',
            mountpoint: '/',
          };
        }
        return d;
      });
  } catch (error) {
    log('[DriveInfo] Error getting disk info:', error);
    return [];
  }
}

// ============================================================
// Drawing Functions
// ============================================================

/**
 * Draw drive info button
 * @param {DiskInfo} diskInfo - Disk information
 * @param {DriveInfoSettings} [settings] - Display settings
 * @returns {string|null} Base64 PNG data URL
 */
function drawDriveButton(diskInfo, settings = {}) {
  try {
    const showLabel = settings.showLabel !== false;
    const invertBar = settings.invertBar === true;
    const lowThreshold = parseInt(String(settings.lowThreshold)) || 20;
    const criticalThreshold = parseInt(String(settings.criticalThreshold)) || 10;
    const lowColor = settings.lowColor || '#FFFF00';
    const criticalColor = settings.criticalColor || '#FF0000';

    const freePercent = 100 - diskInfo.percent;
    const displayPercent = invertBar ? freePercent : diskInfo.percent;

    let barColor = '#4CAF50';
    if (freePercent <= criticalThreshold) {
      barColor = criticalColor;
    } else if (freePercent <= lowThreshold) {
      barColor = lowColor;
    }

    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 144, 144);

    if (showLabel) {
      let displayName = diskInfo.name;
      if (displayName.length > 12) {
        displayName = displayName.substring(0, 11) + '...';
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(displayName, 72, 28);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    const freeGB = (diskInfo.free / (1024 * 1024 * 1024)).toFixed(1);
    ctx.fillText(`${freeGB} GB`, 72, 62);

    ctx.fillStyle = '#AAAAAA';
    ctx.font = '19px sans-serif';
    ctx.textAlign = 'center';
    const totalGB = (diskInfo.total / (1024 * 1024 * 1024)).toFixed(0);
    ctx.fillText(`${diskInfo.percent}% of ${totalGB} GB`, 72, 88);

    const barX = 8;
    const barY = 110;
    const barWidth = 128;
    const barHeight = 16;
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 4);
    ctx.fill();

    const fillWidth = barWidth * (displayPercent / 100);
    if (fillWidth > 0) {
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
      ctx.fill();
    }

    return canvas.toDataURL('image/png');
  } catch (error) {
    log('[DriveInfo] Error drawing drive button:', error);
    return null;
  }
}

/**
 * Draw "Not Available" state
 * @param {string} [diskName] - Disk name
 * @returns {string|null} Base64 PNG data URL
 */
function drawDriveNotAvailable(diskName) {
  try {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 144, 144);

    let displayName = diskName || 'Disk';
    if (displayName.length > 12) {
      displayName = displayName.substring(0, 11) + '...';
    }
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(displayName, 72, 28);

    ctx.fillStyle = '#666666';
    ctx.font = '18px sans-serif';
    ctx.fillText('Not', 72, 60);
    ctx.fillText('Available', 72, 82);

    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.roundRect(8, 110, 128, 16, 4);
    ctx.fill();

    return canvas.toDataURL('image/png');
  } catch (error) {
    log('[DriveInfo] Error drawing not available:', error);
    return null;
  }
}

// ============================================================
// Update Functions
// ============================================================

/**
 * Update drive button display
 * @param {string} context - Action context
 * @param {DriveInfoSettings} [settings] - Display settings
 * @returns {void}
 */
function updateDriveButton(context, settings = {}) {
  const disks = getDiskInfo();

  if (disks.length === 0) {
    setTitle(context, 'No disks');
    return;
  }

  const contextData = contexts[context] || {};
  const displayMode = settings.displayMode || '0';
  const selectedDrive = settings.selectedDrive;

  /** @type {DiskInfo|undefined} */
  let diskToShow;

  if (displayMode === '1') {
    const currentIndex = contextData.currentDiskIndex || 0;
    diskToShow = disks[currentIndex % disks.length];
    contextData.currentDiskIndex = (currentIndex + 1) % disks.length;
  } else {
    diskToShow = disks.find((d) => d.name === selectedDrive || d.mountpoint === selectedDrive);

    if (!diskToShow && selectedDrive) {
      contexts[context] = contextData;
      const imageData = drawDriveNotAvailable(selectedDrive);
      setImage(context, imageData);
      return;
    }

    if (!diskToShow) {
      diskToShow = disks[0];
    }
  }

  contexts[context] = contextData;
  const imageData = drawDriveButton(diskToShow, settings);
  setImage(context, imageData);
}

// ============================================================
// Timer Functions
// ============================================================

/**
 * Start drive update timer
 * @param {string} context - Action context
 * @param {DriveInfoSettings} [settings] - Display settings
 * @returns {void}
 */
function startDriveTimer(context, settings = {}) {
  stopTimer(context);

  const displayMode = settings.displayMode || '0';
  const rotationSpeed = parseInt(String(settings.rotationSpeed)) || 5;
  const updateInterval = parseInt(String(settings.updateInterval)) || 5;
  const interval = displayMode === '1' ? rotationSpeed * 1000 : updateInterval * 1000;

  const timer = setInterval(() => {
    const currentSettings = contexts[context]?.settings || settings;
    updateDriveButton(context, currentSettings);
  }, interval);

  setTimer(context, timer);
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle action appearing
 * @param {string} context - Action context
 * @param {AppearPayloadDrive} payload - Event payload
 * @returns {void}
 */
function onWillAppear(context, payload) {
  const settings = payload?.settings || {};
  setContext(context, { settings, action: DRIVEINFO_ACTION });

  updateDriveButton(context, settings);
  startDriveTimer(context, settings);
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
 * @param {KeyPayloadDrive} payload - Event payload
 * @returns {void}
 */
function onKeyUp(context, payload) {
  const settings = payload?.settings || contexts[context]?.settings || {};
  const selectedDrive = settings.selectedDrive;
  const disks = getDiskInfo();
  const disk =
    disks.find((d) => d.name === selectedDrive || d.mountpoint === selectedDrive) || disks[0];

  if (disk) {
    exec(`open "${disk.mountpoint}"`, (error) => {
      if (error) {
        log('[DriveInfo] Error opening disk:', error.message);
      }
    });
  }
}

/**
 * Handle data from Property Inspector
 * @param {string} context - Action context
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {boolean}
 */
function onSendToPlugin(context, payload) {
  if (payload && payload.event === 'getDisks') {
    const disks = getDiskInfo();
    sendToPropertyInspector({
      event: 'diskList',
      disks: disks.map((d) => ({
        name: d.name,
        displayName: d.displayName,
        mountpoint: d.mountpoint,
      })),
    });
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
  const disks = getDiskInfo();
  sendToPropertyInspector({
    event: 'diskList',
    disks: disks.map((d) => ({
      name: d.name,
      displayName: d.displayName,
      mountpoint: d.mountpoint,
    })),
  });
}

/**
 * Handle settings update
 * @param {string} context - Action context
 * @param {DriveInfoSettings} settings - New settings
 * @returns {void}
 */
function onSettingsUpdate(context, settings) {
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    setContext(context, { settings, action: DRIVEINFO_ACTION });
  }

  updateDriveButton(context, settings);
  startDriveTimer(context, settings);
}

/**
 * Handle settings received
 * @param {string} context - Action context
 * @param {SettingsPayloadDrive} payload - Settings payload
 * @returns {void}
 */
function onDidReceiveSettings(context, payload) {
  onSettingsUpdate(context, payload?.settings || {});
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getDiskInfo,
  drawDriveButton,
  drawDriveNotAvailable,
  updateDriveButton,
  startDriveTimer,
  onWillAppear,
  onWillDisappear,
  onKeyUp,
  onSendToPlugin,
  onPropertyInspectorDidAppear,
  onDidReceiveSettings,
  onSettingsUpdate,
};
