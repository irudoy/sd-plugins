/**
 * Switch - Property Inspector
 * Uses shared SprutHubPI library
 * @module switch/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_SWITCH = 'Switch';

/**
 * Check if service is a Switch
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isSwitchService(service) {
  return service.type === SERVICE_SWITCH || service.type === 49;
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

// Initialize PI with configuration
const $propEvent = SprutHubPI.init({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Switch',
  isServiceFn: isSwitchService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
}).$propEvent;
