/**
 * Lock - Property Inspector
 * Uses shared SprutHubPI library
 * @module lock/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_LOCK = 'LockMechanism';

/**
 * Check if service is a Lock
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isLockService(service) {
  return service.type === SERVICE_LOCK || service.type === 'Lock Mechanism' || service.type === 45;
}

/**
 * Find lock characteristics in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const getCharType = SprutHubPI.getCharType;

  const currentState = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'LockCurrentState' || type === 29;
  });

  const targetState = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'LockTargetState' || type === 30;
  });

  return {
    characteristicId: targetState?.cId,
    currentStateCharId: currentState?.cId,
  };
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Lock',
  isServiceFn: isLockService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
}).$propEvent;
