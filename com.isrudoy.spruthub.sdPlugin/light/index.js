/**
 * Light - Property Inspector
 * Uses shared SprutHubPI library
 * @module light/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_LIGHTBULB = 13;

/**
 * Check if service is a Lightbulb
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isLightbulbService(service) {
  return service.type === SERVICE_LIGHTBULB || service.type === 'Lightbulb';
}

/**
 * Find On and Brightness characteristics in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const onChar = SprutHubPI.findOnCharacteristic(service);
  const brightnessChar = SprutHubPI.findBrightnessCharacteristic(service);
  return {
    characteristicId: onChar?.cId,
    brightnessCharId: brightnessChar?.cId,
  };
}

/** @type {HTMLSelectElement|null} */
let brightnessStepSelect = null;
/** @type {HTMLInputElement|null} */
let dialDebounceInput = null;

/**
 * Load extra settings
 */
function loadExtraSettings() {
  if (!brightnessStepSelect) {
    brightnessStepSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('brightnessStep')
    );
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    if (brightnessStepSelect && $settings.brightnessStep !== undefined) {
      brightnessStepSelect.value = String($settings.brightnessStep);
    }
    if (dialDebounceInput && $settings.dialDebounceMs !== undefined) {
      dialDebounceInput.value = String($settings.dialDebounceMs);
    }
  }
}

/**
 * Save extra settings
 */
function saveExtraSettings() {
  if (!brightnessStepSelect) {
    brightnessStepSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('brightnessStep')
    );
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.brightnessStep = parseInt(brightnessStepSelect?.value || '10', 10) || 10;
    const debounceVal = parseInt(dialDebounceInput?.value || '0', 10);
    $settings.dialDebounceMs = debounceVal >= 0 ? debounceVal : 0;
  }
}

/**
 * Get extra settings to send to plugin
 * @returns {Record<string, unknown>}
 */
function getExtraPluginSettings() {
  if (!brightnessStepSelect) {
    brightnessStepSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('brightnessStep')
    );
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  const debounceVal = parseInt(dialDebounceInput?.value || '0', 10);
  return {
    brightnessStep: parseInt(brightnessStepSelect?.value || '10', 10) || 10,
    dialDebounceMs: debounceVal >= 0 ? debounceVal : 0,
  };
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'lightSelect',
  serviceLabel: 'Lightbulb',
  isServiceFn: isLightbulbService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
  loadExtraSettings,
  saveExtraSettings,
  getExtraPluginSettings,
}).$propEvent;
