/**
 * Button - Property Inspector
 * Uses shared SprutHubPI library
 * @module button/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type for Button (StatelessProgrammableSwitch)
const SERVICE_BUTTON = 'StatelessProgrammableSwitch';

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

/** @type {HTMLSelectElement|null} */
let pressTypeSelect = null;

/**
 * Load extra settings (pressType)
 */
function loadExtraSettings() {
  if (!pressTypeSelect) {
    pressTypeSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('pressTypeSelect')
    );
  }
  if (pressTypeSelect && typeof $settings !== 'undefined' && $settings?.pressType !== undefined) {
    pressTypeSelect.value = String($settings.pressType);
  }
}

/**
 * Save extra settings (pressType)
 */
function saveExtraSettings() {
  if (!pressTypeSelect) {
    pressTypeSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('pressTypeSelect')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.pressType = parseInt(pressTypeSelect?.value || '0') || 0;
  }
}

/**
 * Get extra settings to send to plugin
 * @returns {Record<string, unknown>}
 */
function getExtraPluginSettings() {
  if (!pressTypeSelect) {
    pressTypeSelect = /** @type {HTMLSelectElement|null} */ (
      document.getElementById('pressTypeSelect')
    );
  }
  return {
    pressType: parseInt(pressTypeSelect?.value || '0') || 0,
  };
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.init({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Button',
  isServiceFn: isButtonService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'trigger',
  loadExtraSettings,
  saveExtraSettings,
  getExtraPluginSettings,
}).$propEvent;
