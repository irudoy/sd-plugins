/**
 * Sensor - Property Inspector
 * Uses shared SprutHubPI library
 * @module sensor/index
 */

// SDK configuration
const $local = false;
const $back = false;

// Sensor service types
const SENSOR_SERVICES = {
  TemperatureSensor: ['TemperatureSensor', 'Temperature Sensor', 10],
  HumiditySensor: ['HumiditySensor', 'Humidity Sensor', 82],
  ContactSensor: ['ContactSensor', 'Contact Sensor', 80],
  MotionSensor: ['MotionSensor', 'Motion Sensor', 85],
};

// Characteristic types for each sensor
const SENSOR_CHARACTERISTICS = {
  temperature: ['CurrentTemperature', 17],
  humidity: ['CurrentRelativeHumidity', 16],
  contact: ['ContactSensorState', 106],
  motion: ['MotionDetected', 34],
};

/**
 * Check if service is any type of sensor
 * @param {import('../pi-lib/common').PIService} service
 * @returns {boolean}
 */
function isSensorService(service) {
  for (const types of Object.values(SENSOR_SERVICES)) {
    if (types.includes(service.type)) return true;
  }
  return false;
}

/**
 * Get sensor type name from service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {string}
 */
function getSensorType(service) {
  for (const [name, types] of Object.entries(SENSOR_SERVICES)) {
    if (types.includes(service.type)) {
      if (name === 'TemperatureSensor') return 'temperature';
      if (name === 'HumiditySensor') return 'humidity';
      if (name === 'ContactSensor') return 'contact';
      if (name === 'MotionSensor') return 'motion';
    }
  }
  return 'temperature';
}

/**
 * Find sensor value characteristic in service
 * @param {import('../pi-lib/common').PIService} service
 * @returns {Record<string, number|string|undefined>}
 */
function findCharacteristics(service) {
  const sensorType = getSensorType(service);
  const charTypes = SENSOR_CHARACTERISTICS[sensorType] || SENSOR_CHARACTERISTICS.temperature;

  const valueChar = service.characteristics?.find((c) => charTypes.includes(c.type));

  return {
    valueCharId: valueChar?.cId,
    sensorType: sensorType,
  };
}

// Initialize PI with configuration
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Sensor',
  isServiceFn: isSensorService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'refresh',
}).$propEvent;
