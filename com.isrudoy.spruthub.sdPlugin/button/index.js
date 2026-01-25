/**
 * Button - Property Inspector
 * Uses shared SprutHubPI library
 * Each action (main press, dial left/right/press) has its own button selection
 * @module button/index
 */

/* global $controller */

// SDK configuration
const $local = false;
const $back = false;

// Service type for Button (StatelessProgrammableSwitch)
const SERVICE_BUTTON = 'StatelessProgrammableSwitch';

/**
 * @typedef {Object} ButtonService
 * @property {number} sId
 * @property {string} [name]
 * @property {number} characteristicId
 */

// ============================================================
// DOM Elements
// ============================================================

/** @type {HTMLSelectElement|null} */
let mainButton = null;
/** @type {HTMLSelectElement|null} */
let mainPress = null;
/** @type {HTMLElement|null} */
let mainPressRow = null;

/** @type {HTMLSelectElement|null} */
let dialLeftButton = null;
/** @type {HTMLSelectElement|null} */
let dialLeftPress = null;
/** @type {HTMLElement|null} */
let dialLeftPressRow = null;

/** @type {HTMLSelectElement|null} */
let dialRightButton = null;
/** @type {HTMLSelectElement|null} */
let dialRightPress = null;
/** @type {HTMLElement|null} */
let dialRightPressRow = null;

/** @type {HTMLSelectElement|null} */
let dialPressButton = null;
/** @type {HTMLSelectElement|null} */
let dialPressPress = null;
/** @type {HTMLElement|null} */
let dialPressPressRow = null;

/** @type {ButtonService[]} */
let availableButtons = [];

/** @type {HTMLElement|null} */
let buttonPressSection = null;
/** @type {HTMLElement|null} */
let dialActionsSection = null;

// ============================================================
// Service Helpers
// ============================================================

/**
 * Check if service is a Button (StatelessProgrammableSwitch)
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isButtonService(service) {
  return service.type === SERVICE_BUTTON || service.type === 89;
}

/**
 * Find ProgrammableSwitchEvent characteristic in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const getCharType = SprutHubPI.getCharType;

  const eventChar = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 115 || type === 'ProgrammableSwitchEvent';
  });

  return {
    characteristicId: eventChar?.cId,
  };
}

/**
 * Get characteristic ID for a button service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {number|undefined}
 */
function getCharacteristicId(service) {
  const chars = findCharacteristics(service);
  return chars.characteristicId;
}

// ============================================================
// DOM Initialization
// ============================================================

/**
 * Initialize DOM element references
 */
function initElements() {
  // Sections
  if (!buttonPressSection) {
    buttonPressSection = document.getElementById('buttonPressSection');
  }
  if (!dialActionsSection) {
    dialActionsSection = document.getElementById('dialActionsSection');
  }

  // Main Button
  if (!mainButton) {
    mainButton = /** @type {HTMLSelectElement|null} */ (document.getElementById('mainButton'));
  }
  if (!mainPress) {
    mainPress = /** @type {HTMLSelectElement|null} */ (document.getElementById('mainPress'));
  }
  if (!mainPressRow) {
    mainPressRow = document.getElementById('mainPressRow');
  }

  // Dial Left
  if (!dialLeftButton) {
    dialLeftButton = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialLeftButton')
    );
  }
  if (!dialLeftPress) {
    dialLeftPress = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialLeftPress')
    );
  }
  if (!dialLeftPressRow) {
    dialLeftPressRow = document.getElementById('dialLeftPressRow');
  }

  // Dial Right
  if (!dialRightButton) {
    dialRightButton = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialRightButton')
    );
  }
  if (!dialRightPress) {
    dialRightPress = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialRightPress')
    );
  }
  if (!dialRightPressRow) {
    dialRightPressRow = document.getElementById('dialRightPressRow');
  }

  // Dial Press
  if (!dialPressButton) {
    dialPressButton = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialPressButton')
    );
  }
  if (!dialPressPress) {
    dialPressPress = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('dialPressPress')
    );
  }
  if (!dialPressPressRow) {
    dialPressPressRow = document.getElementById('dialPressPressRow');
  }
}

// ============================================================
// Button Dropdown Population
// ============================================================

/**
 * Populate a button dropdown with available buttons
 * @param {HTMLSelectElement} select
 * @param {number|undefined} savedServiceId
 */
function populateButtonDropdown(select, savedServiceId) {
  select.innerHTML = '<option value="">— Disabled —</option>';

  availableButtons.forEach((btn) => {
    const option = document.createElement('option');
    option.value = String(btn.sId);
    option.textContent = btn.name || `Button ${btn.sId}`;
    select.appendChild(option);
  });

  // Restore saved selection
  if (savedServiceId !== undefined) {
    const exists = availableButtons.some((b) => b.sId === savedServiceId);
    if (exists) {
      select.value = String(savedServiceId);
    }
  }
}

/**
 * Populate all button dropdowns
 */
function populateAllDropdowns() {
  initElements();
  if (typeof $settings === 'undefined' || !$settings) return;

  // Don't reset dropdowns if we don't have button data yet
  if (availableButtons.length === 0) return;

  // Main button (uses serviceId for compatibility)
  if (mainButton) {
    populateButtonDropdown(mainButton, $settings.serviceId);
    updatePressVisibility('main');
  }

  // Dial buttons
  if (dialLeftButton) {
    populateButtonDropdown(dialLeftButton, $settings.dialLeftServiceId);
    updatePressVisibility('left');
  }
  if (dialRightButton) {
    populateButtonDropdown(dialRightButton, $settings.dialRightServiceId);
    updatePressVisibility('right');
  }
  if (dialPressButton) {
    populateButtonDropdown(dialPressButton, $settings.dialPressServiceId);
    updatePressVisibility('press');
  }
}

/**
 * Update visibility of press type row based on button selection
 * @param {'main'|'left'|'right'|'press'} action
 */
function updatePressVisibility(action) {
  /** @type {HTMLSelectElement|null} */
  let buttonSelect = null;
  /** @type {HTMLElement|null} */
  let pressRow = null;

  switch (action) {
    case 'main':
      buttonSelect = mainButton;
      pressRow = mainPressRow;
      break;
    case 'left':
      buttonSelect = dialLeftButton;
      pressRow = dialLeftPressRow;
      break;
    case 'right':
      buttonSelect = dialRightButton;
      pressRow = dialRightPressRow;
      break;
    case 'press':
      buttonSelect = dialPressButton;
      pressRow = dialPressPressRow;
      break;
  }

  if (pressRow) {
    const hasSelection = buttonSelect?.value && buttonSelect.value !== '';
    pressRow.style.display = hasSelection ? '' : 'none';
  }
}

/**
 * Handle button selection change (called from HTML)
 * @param {'main'|'left'|'right'|'press'} action
 */
function onDialButtonChange(action) {
  initElements();
  updatePressVisibility(action);
  SprutHubPI.saveSettings();
}

// Make it globally accessible for HTML onclick
// @ts-ignore
window.onDialButtonChange = onDialButtonChange;

/**
 * Update section visibility based on controller type
 * Keypad = button, Encoder/Knob = dial/knob
 */
function updateSectionVisibility() {
  initElements();
  // Controller can be 'Keypad', 'Encoder', or 'Knob' depending on SDK version
  const ctrl = typeof $controller !== 'undefined' ? $controller : 'Keypad';
  const isKnob = ctrl === 'Encoder' || ctrl === 'Knob';

  if (buttonPressSection) {
    buttonPressSection.style.display = isKnob ? 'none' : '';
  }
  if (dialActionsSection) {
    dialActionsSection.style.display = isKnob ? '' : 'none';
  }
}

// ============================================================
// Accessory Selection Callback
// ============================================================

/**
 * Called when accessory is selected - populate all dropdowns
 * @param {import('../pi-lib/common').PIAccessory|null} accessory
 * @param {import('../pi-lib/common').PIService[]} services
 */
function onAccessorySelected(accessory, services) {
  // Build list of available buttons with their characteristic IDs
  availableButtons = services.map((s) => ({
    sId: s.sId,
    name: s.name,
    characteristicId: getCharacteristicId(s) || 0,
  }));

  populateAllDropdowns();
}

// ============================================================
// Settings Load/Save
// ============================================================

/**
 * Load extra settings
 */
function loadExtraSettings() {
  initElements();

  // Show/hide sections based on controller type
  updateSectionVisibility();

  if (typeof $settings === 'undefined' || !$settings) return;

  // Main press type
  if (mainPress && $settings.pressType !== undefined) {
    mainPress.value = String($settings.pressType);
  }

  // Dial press types
  if (dialLeftPress) {
    dialLeftPress.value = String($settings.dialLeftPressType ?? 0);
  }
  if (dialRightPress) {
    dialRightPress.value = String($settings.dialRightPressType ?? 0);
  }
  if (dialPressPress) {
    dialPressPress.value = String($settings.dialPressPressType ?? 0);
  }

  // Populate dropdowns if we have accessory data
  populateAllDropdowns();
}

/**
 * Save extra settings
 */
function saveExtraSettings() {
  initElements();
  if (typeof $settings === 'undefined' || !$settings) return;

  // Main button (uses serviceId/characteristicId for compatibility)
  const mainServiceId = mainButton?.value ? parseInt(mainButton.value) : undefined;
  $settings.serviceId = mainServiceId;
  $settings.characteristicId = mainServiceId
    ? availableButtons.find((b) => b.sId === mainServiceId)?.characteristicId
    : undefined;
  $settings.pressType = parseInt(mainPress?.value || '0') || 0;

  // Dial Left
  const leftServiceId = dialLeftButton?.value ? parseInt(dialLeftButton.value) : undefined;
  $settings.dialLeftServiceId = leftServiceId;
  $settings.dialLeftCharId = leftServiceId
    ? availableButtons.find((b) => b.sId === leftServiceId)?.characteristicId
    : undefined;
  $settings.dialLeftPressType = parseInt(dialLeftPress?.value || '0') || 0;

  // Dial Right
  const rightServiceId = dialRightButton?.value ? parseInt(dialRightButton.value) : undefined;
  $settings.dialRightServiceId = rightServiceId;
  $settings.dialRightCharId = rightServiceId
    ? availableButtons.find((b) => b.sId === rightServiceId)?.characteristicId
    : undefined;
  $settings.dialRightPressType = parseInt(dialRightPress?.value || '0') || 0;

  // Dial Press
  const pressServiceId = dialPressButton?.value ? parseInt(dialPressButton.value) : undefined;
  $settings.dialPressServiceId = pressServiceId;
  $settings.dialPressCharId = pressServiceId
    ? availableButtons.find((b) => b.sId === pressServiceId)?.characteristicId
    : undefined;
  $settings.dialPressPressType = parseInt(dialPressPress?.value || '0') || 0;
}

/**
 * Get extra settings to send to plugin
 * @returns {Record<string, unknown>}
 */
function getExtraPluginSettings() {
  initElements();

  // Main button
  const mainServiceId = mainButton?.value ? parseInt(mainButton.value) : undefined;
  const mainCharId = mainServiceId
    ? availableButtons.find((b) => b.sId === mainServiceId)?.characteristicId
    : undefined;

  // Dial Left
  const leftServiceId = dialLeftButton?.value ? parseInt(dialLeftButton.value) : undefined;
  const leftCharId = leftServiceId
    ? availableButtons.find((b) => b.sId === leftServiceId)?.characteristicId
    : undefined;

  // Dial Right
  const rightServiceId = dialRightButton?.value ? parseInt(dialRightButton.value) : undefined;
  const rightCharId = rightServiceId
    ? availableButtons.find((b) => b.sId === rightServiceId)?.characteristicId
    : undefined;

  // Dial Press
  const pressServiceId = dialPressButton?.value ? parseInt(dialPressButton.value) : undefined;
  const pressCharId = pressServiceId
    ? availableButtons.find((b) => b.sId === pressServiceId)?.characteristicId
    : undefined;

  return {
    // Main button (uses serviceId/characteristicId for plugin compatibility)
    serviceId: mainServiceId,
    characteristicId: mainCharId,
    pressType: parseInt(mainPress?.value || '0') || 0,
    // Dial Left
    dialLeftServiceId: leftServiceId,
    dialLeftCharId: leftCharId,
    dialLeftPressType: parseInt(dialLeftPress?.value || '0') || 0,
    // Dial Right
    dialRightServiceId: rightServiceId,
    dialRightCharId: rightCharId,
    dialRightPressType: parseInt(dialRightPress?.value || '0') || 0,
    // Dial Press
    dialPressServiceId: pressServiceId,
    dialPressCharId: pressCharId,
    dialPressPressType: parseInt(dialPressPress?.value || '0') || 0,
  };
}

// ============================================================
// Initialize PI
// ============================================================

const $propEvent = SprutHubPI.init({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Button',
  isServiceFn: isButtonService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'trigger',
  loadExtraSettings,
  saveExtraSettings,
  getExtraPluginSettings,
  onAccessorySelected,
}).$propEvent;
