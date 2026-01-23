/**
 * Drive Info - Property Inspector
 * Using StreamDock SDK pattern
 * @module driveinfo/index
 */

/**
 * @typedef {Object} DrivePIDisk
 * @property {string} name
 * @property {string} displayName
 * @property {string} mountpoint
 */

/**
 * @typedef {Object} DrivePISettings
 * @property {string} [displayMode]
 * @property {string} [selectedDrive]
 * @property {number|string} [rotationSpeed]
 * @property {number|string} [updateInterval]
 * @property {string} [lowColor]
 * @property {number|string} [lowThreshold]
 * @property {string} [criticalColor]
 * @property {number|string} [criticalThreshold]
 * @property {boolean} [showLabel]
 * @property {boolean} [invertBar]
 */

// SDK configuration
const $local = false; // No localization
const $back = false; // Auto-show UI when settings received

// DOM elements cache
const $dom = {
  main: $('.sdpi-wrapper'),
  displayMode: $('#displayMode'),
  selectedDrive: $('#selectedDrive'),
  singleDriveSettings: $('#singleDriveSettings'),
  allDrivesSettings: $('#allDrivesSettings'),
  rotationSpeed: $('#rotationSpeed'),
  rotationLabel: $('#rotationLabel'),
  updateInterval: $('#updateInterval'),
  updateIntervalLabel: $('#updateIntervalLabel'),
  lowColor: $('#lowColor'),
  lowThreshold: $('#lowThreshold'),
  criticalColor: $('#criticalColor'),
  criticalThreshold: $('#criticalThreshold'),
  showLabel: $('#showLabel'),
  invertBar: $('#invertBar'),
};

// Disk list storage
/** @type {DrivePIDisk[]} */
let diskList = [];

/**
 * StreamDock event handlers - SDK pattern
 */
const $propEvent = {
  /**
   * Called when settings are received from StreamDock
   * @param {{settings: DrivePISettings}} data
   */
  didReceiveSettings(data) {
    const settings = data.settings || {};
    loadSettings(settings);
    $websocket?.sendToPlugin({ event: 'getDisks' });
  },

  /**
   * Called when plugin sends data to PI
   * @param {{event?: string, disks?: DrivePIDisk[], settings?: DrivePISettings}} data
   */
  sendToPropertyInspector(data) {
    if (data && data.event === 'diskList') {
      diskList = data.disks || [];
      populateDriveList();
    }
    if (data && data.settings) {
      loadSettings(data.settings);
    }
  },

  /**
   * @param {Record<string, unknown>} _data
   */
  didReceiveGlobalSettings(_data) {
    // Global settings received
  },
};

/**
 * Populate drive dropdown with disk list
 */
function populateDriveList() {
  const select = $dom.selectedDrive;
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '';

  if (diskList.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No drives found';
    select.appendChild(option);
    return;
  }

  diskList.forEach((disk) => {
    const option = document.createElement('option');
    option.value = disk.name;
    option.textContent = disk.displayName;
    select.appendChild(option);
  });

  // Restore previous selection if exists
  if (currentValue && diskList.some((d) => d.name === currentValue)) {
    select.value = currentValue;
  } else if (typeof $settings !== 'undefined' && $settings && $settings.selectedDrive) {
    select.value = /** @type {string} */ ($settings.selectedDrive);
  }
}

/**
 * Load settings into UI
 * @param {DrivePISettings} settings
 */
function loadSettings(settings) {
  // Display mode
  if (settings.displayMode !== undefined && $dom.displayMode) {
    $dom.displayMode.value = settings.displayMode;
    updateDisplayMode();
  }

  // Selected drive - will be applied after disk list loads
  if (settings.selectedDrive !== undefined && $dom.selectedDrive) {
    $dom.selectedDrive.value = settings.selectedDrive;
  }

  // Rotation speed
  if (settings.rotationSpeed !== undefined && $dom.rotationSpeed) {
    $dom.rotationSpeed.value = String(settings.rotationSpeed);
    updateRotationLabel();
  }

  // Update interval
  if (settings.updateInterval !== undefined && $dom.updateInterval) {
    $dom.updateInterval.value = String(settings.updateInterval);
    updateIntervalLabel();
  }

  // Thresholds
  if (settings.lowColor !== undefined && $dom.lowColor) {
    $dom.lowColor.value = settings.lowColor;
  }
  if (settings.lowThreshold !== undefined && $dom.lowThreshold) {
    $dom.lowThreshold.value = String(settings.lowThreshold);
  }
  if (settings.criticalColor !== undefined && $dom.criticalColor) {
    $dom.criticalColor.value = settings.criticalColor;
  }
  if (settings.criticalThreshold !== undefined && $dom.criticalThreshold) {
    $dom.criticalThreshold.value = String(settings.criticalThreshold);
  }

  // Checkboxes
  if (settings.showLabel !== undefined && $dom.showLabel) {
    $dom.showLabel.checked = settings.showLabel;
  }
  if (settings.invertBar !== undefined && $dom.invertBar) {
    $dom.invertBar.checked = settings.invertBar;
  }
}

/**
 * Save settings to StreamDock
 */
function saveSettings() {
  if (typeof $settings === 'undefined' || !$settings) {
    return;
  }

  // Update settings via proxy (auto-saves)
  $settings.displayMode = $dom.displayMode?.value || '0';
  $settings.selectedDrive = $dom.selectedDrive?.value || '';
  $settings.rotationSpeed = parseInt($dom.rotationSpeed?.value) || 5;
  $settings.updateInterval = parseInt($dom.updateInterval?.value) || 5;
  $settings.lowColor = $dom.lowColor?.value || '#FFFF00';
  $settings.lowThreshold = parseInt($dom.lowThreshold?.value) || 20;
  $settings.criticalColor = $dom.criticalColor?.value || '#FF0000';
  $settings.criticalThreshold = parseInt($dom.criticalThreshold?.value) || 10;
  $settings.showLabel = $dom.showLabel?.checked ?? true;
  $settings.invertBar = $dom.invertBar?.checked ?? false;

  // Also send to plugin for immediate update
  if (typeof $websocket === 'undefined' || !$websocket) {
    return;
  }
  $websocket.sendToPlugin({
    displayMode: $settings.displayMode,
    selectedDrive: $settings.selectedDrive,
    rotationSpeed: $settings.rotationSpeed,
    updateInterval: $settings.updateInterval,
    lowColor: $settings.lowColor,
    lowThreshold: $settings.lowThreshold,
    criticalColor: $settings.criticalColor,
    criticalThreshold: $settings.criticalThreshold,
    showLabel: $settings.showLabel,
    invertBar: $settings.invertBar,
  });

  updateDisplayMode();
}

/**
 * Update display mode visibility
 */
function updateDisplayMode() {
  const mode = $dom.displayMode?.value;

  if (mode === '1') {
    // All drives mode
    if ($dom.singleDriveSettings) $dom.singleDriveSettings.style.display = 'none';
    if ($dom.allDrivesSettings) $dom.allDrivesSettings.style.display = 'block';
  } else {
    // Single drive mode
    if ($dom.singleDriveSettings) $dom.singleDriveSettings.style.display = 'block';
    if ($dom.allDrivesSettings) $dom.allDrivesSettings.style.display = 'none';
  }
}

/**
 * Update rotation speed label
 */
function updateRotationLabel() {
  const speed = $dom.rotationSpeed?.value || '5';
  if ($dom.rotationLabel) {
    $dom.rotationLabel.textContent = speed + ' sec';
  }
}

/**
 * Set rotation speed from clickable spans
 * @param {string} value
 */
function setRotationSpeed(value) {
  if ($dom.rotationSpeed) {
    $dom.rotationSpeed.value = value;
    updateRotationLabel();
    saveSettings();
  }
}

/**
 * Update interval label
 */
function updateIntervalLabel() {
  const interval = $dom.updateInterval?.value || '5';
  if ($dom.updateIntervalLabel) {
    $dom.updateIntervalLabel.textContent = interval + ' sec';
  }
}

/**
 * Set update interval from clickable spans
 * @param {string} value
 */
function setUpdateInterval(value) {
  if ($dom.updateInterval) {
    $dom.updateInterval.value = value;
    updateIntervalLabel();
    saveSettings();
  }
}

/**
 * Refresh disk list from plugin
 */
function refreshDisks() {
  if (typeof $websocket === 'undefined' || !$websocket) {
    return;
  }
  $websocket.sendToPlugin({ event: 'getDisks' });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  updateDisplayMode();
  updateRotationLabel();
  updateIntervalLabel();
});
