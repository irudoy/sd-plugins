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

/**
 * Load extra settings (tempStep)
 */
function loadExtraSettings() {
  if (!tempStepInput) {
    tempStepInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tempStep'));
  }
  if (tempStepInput && typeof $settings !== 'undefined' && $settings?.tempStep !== undefined) {
    tempStepInput.value = String($settings.tempStep);
  }
}

/**
 * Save extra settings (tempStep)
 */
function saveExtraSettings() {
  if (!tempStepInput) {
    tempStepInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tempStep'));
  }
  if (typeof $settings !== 'undefined' && $settings) {
    $settings.tempStep = parseFloat(tempStepInput?.value || '0.5') || 0.5;
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
  return {
    tempStep: parseFloat(tempStepInput?.value || '0.5') || 0.5,
  };
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
