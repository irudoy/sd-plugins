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
 * Find On characteristic in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const onChar = SprutHubPI.findOnCharacteristic(service);
  return {
    characteristicId: onChar?.cId,
  };
}

/** @type {HTMLSelectElement|null} */
let brightnessStepSelect = null;

/**
 * Load extra settings (brightnessStep)
 */
function loadExtraSettings() {
  if (!brightnessStepSelect) {
    brightnessStepSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('brightnessStep')
    );
  }
  if (
    brightnessStepSelect &&
    typeof $settings !== 'undefined' &&
    $settings?.brightnessStep !== undefined
  ) {
    brightnessStepSelect.value = String($settings.brightnessStep);
  }
}

/**
 * Save extra settings (brightnessStep)
 */
function saveExtraSettings() {
  if (!brightnessStepSelect) {
    brightnessStepSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('brightnessStep')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.brightnessStep = parseInt(brightnessStepSelect?.value || '10', 10) || 10;
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
  return {
    brightnessStep: parseInt(brightnessStepSelect?.value || '10', 10) || 10,
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
