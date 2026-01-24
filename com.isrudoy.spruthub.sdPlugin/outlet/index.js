/**
 * Outlet - Property Inspector
 * Uses shared SprutHubPI library
 * @module outlet/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_OUTLET = 'Outlet';

/**
 * Check if service is an Outlet
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isOutletService(service) {
  return service.type === SERVICE_OUTLET || service.type === 71;
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
  serviceLabel: 'Outlet',
  isServiceFn: isOutletService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
}).$propEvent;
