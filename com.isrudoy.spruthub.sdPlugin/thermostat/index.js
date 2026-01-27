/**
 * Thermostat - Property Inspector
 * Uses shared SprutHubPI library
 * @module thermostat/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_THERMOSTAT = 'Thermostat';

/**
 * Check if service is a Thermostat
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isThermostatService(service) {
  return service.type === SERVICE_THERMOSTAT || service.type === 43;
}

/**
 * Find thermostat characteristics in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const getCharType = SprutHubPI.getCharType;

  const currentTemp = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'CurrentTemperature' || type === 17;
  });

  const targetTemp = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'TargetTemperature' || type === 53;
  });

  const currentMode = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'CurrentHeatingCoolingState' || type === 15;
  });

  const targetMode = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'TargetHeatingCoolingState' || type === 51;
  });

  return {
    currentTempCharId: currentTemp?.cId,
    targetTempCharId: targetTemp?.cId,
    currentModeCharId: currentMode?.cId,
    targetModeCharId: targetMode?.cId,
  };
}

/** @type {HTMLInputElement|null} */
let tempStepInput = null;
/** @type {HTMLInputElement|null} */
let dialDebounceInput = null;

/**
 * Load extra settings
 */
function loadExtraSettings() {
  if (!tempStepInput) {
    tempStepInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tempStep'));
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    if (tempStepInput && $settings.tempStep !== undefined) {
      tempStepInput.value = String($settings.tempStep);
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
  if (!tempStepInput) {
    tempStepInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tempStep'));
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.tempStep = parseFloat(tempStepInput?.value || '0.5') || 0.5;
    const debounceVal = parseInt(dialDebounceInput?.value || '', 10);
    // Only save if explicitly set, otherwise let action default (150) take over
    if (!isNaN(debounceVal) && debounceVal >= 0) {
      $settings.dialDebounceMs = debounceVal;
    }
  }
}

/**
 * Get extra settings to send to plugin
 * @returns {Record<string, unknown>}
 */
function getExtraPluginSettings() {
  if (!tempStepInput) {
    tempStepInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tempStep'));
  }
  if (!dialDebounceInput) {
    dialDebounceInput = /** @type {HTMLInputElement|null} */ (
      document.getElementById('dialDebounceMs')
    );
  }
  const result = {
    tempStep: parseFloat(tempStepInput?.value || '0.5') || 0.5,
  };
  const debounceVal = parseInt(dialDebounceInput?.value || '', 10);
  if (!isNaN(debounceVal) && debounceVal >= 0) {
    result.dialDebounceMs = debounceVal;
  }
  return result;
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Thermostat',
  isServiceFn: isThermostatService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'tempUp',
  loadExtraSettings,
  saveExtraSettings,
  getExtraPluginSettings,
}).$propEvent;
