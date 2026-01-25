/**
 * Cover (WindowCovering) - Property Inspector
 * Uses shared SprutHubPI library
 * @module cover/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Service type constant
const SERVICE_COVER = 'WindowCovering';

/**
 * Check if service is a Cover (WindowCovering)
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isCoverService(service) {
  return (
    service.type === SERVICE_COVER || service.type === 'Window Covering' || service.type === 14
  );
}

/**
 * Find position characteristics in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|undefined>}
 */
function findCharacteristics(service) {
  const getCharType = SprutHubPI.getCharType;

  const currentPosition = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'CurrentPosition' || type === 108;
  });

  const targetPosition = service.characteristics?.find((c) => {
    const type = getCharType(c);
    return type === 'TargetPosition' || type === 117;
  });

  return {
    currentPositionCharId: currentPosition?.cId,
    targetPositionCharId: targetPosition?.cId,
  };
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Cover',
  isServiceFn: isCoverService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
}).$propEvent;
