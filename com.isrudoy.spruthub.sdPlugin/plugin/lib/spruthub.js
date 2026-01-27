/**
 * Sprut.Hub WebSocket API Client
 * @module lib/spruthub
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const { log, REQUEST_TIMEOUT, MAX_RECONNECT_ATTEMPTS } = require('./common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} SprutHubRoom
 * @property {number} id - Room ID
 * @property {string} name - Room name
 */

/**
 * @typedef {Object} SprutHubCharacteristic
 * @property {number} cId - Characteristic ID
 * @property {number} sId - Service ID
 * @property {number} aId - Accessory ID
 * @property {number|string} [type] - Characteristic type (may be at top level or in control)
 * @property {Object} [control] - Control object
 * @property {WrappedValue} [control.value] - Current value
 * @property {string} [control.name] - Characteristic name
 * @property {string|number} [control.type] - Characteristic type (Sprut.Hub format)
 */

/**
 * @typedef {Object} SprutHubService
 * @property {number} sId - Service ID
 * @property {number|string} type - Service type (13 = Lightbulb, or string like "Lightbulb")
 * @property {SprutHubCharacteristic[]} [characteristics] - Service characteristics
 */

/**
 * @typedef {Object} SprutHubAccessory
 * @property {number} id - Accessory ID
 * @property {string} name - Accessory name
 * @property {number} [room] - Room ID
 * @property {number} [roomId] - Room ID (alternative field)
 * @property {SprutHubService[]} [services] - Accessory services
 * @property {boolean} [online] - Whether accessory is online (from API)
 * @property {boolean} [reachable] - Whether accessory is reachable
 * @property {string} [status] - Accessory status
 */

/**
 * @typedef {Object} SprutHubLight
 * @property {number} id - Accessory ID
 * @property {string} name - Accessory name
 * @property {number} [roomId] - Room ID
 * @property {number} serviceId - Lightbulb service ID
 * @property {number} onCharacteristicId - On characteristic ID
 * @property {number} [brightnessCharacteristicId] - Brightness characteristic ID (if supported)
 * @property {boolean} isOn - Current on/off state
 * @property {number} [brightness] - Current brightness (0-100)
 * @property {SprutHubService[]} [services] - All services (for reference)
 */

/**
 * @typedef {Object} WrappedValue
 * @property {boolean} [boolValue]
 * @property {number} [doubleValue]
 * @property {number} [intValue]
 * @property {string} [stringValue]
 */

/**
 * @typedef {Object} StateChange
 * @property {number} accessoryId - Accessory ID
 * @property {number} serviceId - Service ID
 * @property {number} characteristicId - Characteristic ID
 * @property {unknown} value - New value
 */

/**
 * @typedef {Object} PendingRequest
 * @property {function(unknown): void} resolve
 * @property {function(Error): void} reject
 * @property {ReturnType<typeof setTimeout>} timeout
 */

/**
 * @typedef {Object} RoomListResponse
 * @property {Object} [room]
 * @property {Object} [room.list]
 * @property {SprutHubRoom[]} [room.list.rooms]
 * @property {SprutHubRoom[]} [room.rooms]
 */

/**
 * @typedef {Object} AccessoryListResponse
 * @property {Object} [accessory]
 * @property {Object} [accessory.list]
 * @property {SprutHubAccessory[]} [accessory.list.accessories]
 * @property {SprutHubAccessory[]} [accessory.accessories]
 */

/**
 * @typedef {Object} SprutHubScenario
 * @property {string} index - Scenario ID (used for running)
 * @property {string} name - Scenario display name
 * @property {string} [desc] - Description
 * @property {string} type - Type: "LOGIC", "GLOBAL", "BLOCK", etc.
 * @property {boolean} predefined - Is system/predefined scenario
 * @property {boolean} active - Is enabled
 * @property {boolean} [onStart] - Runs on startup
 * @property {number} [order] - Sort order
 */

/**
 * @typedef {Object} ScenarioListResponse
 * @property {Object} [scenario]
 * @property {Object} [scenario.list]
 * @property {SprutHubScenario[]} [scenario.list.scenarios]
 */

// ============================================================
// SprutHub Class
// ============================================================

class SprutHub {
  // ============================================================
  // Static Constants - Service Types
  // ============================================================

  /** @type {number} Lightbulb service type */
  static SERVICE_LIGHTBULB = 13;
  /** @type {number} On characteristic type */
  static CHAR_ON = 37;
  /** @type {number} Brightness characteristic type */
  static CHAR_BRIGHTNESS = 38;

  // String type names (API may return either numeric or string types)
  static SERVICE_LIGHTBULB_NAME = 'Lightbulb';
  static CHAR_ON_NAMES = ['On', 'Power', 'PowerState'];
  static CHAR_BRIGHTNESS_NAMES = ['Brightness'];

  // Service types (strings from API, some have numeric fallbacks)
  static SERVICE_TYPES = {
    LIGHTBULB: ['Lightbulb', 13],
    SWITCH: ['Switch', 49],
    OUTLET: ['Outlet', 47],
    THERMOSTAT: ['Thermostat', 43],
    COVER: ['WindowCovering', 'Window Covering', 14],
    LOCK: ['LockMechanism', 'Lock Mechanism', 45],
    TEMP_SENSOR: ['TemperatureSensor', 'Temperature Sensor', 10],
    HUMIDITY_SENSOR: ['HumiditySensor', 'Humidity Sensor', 82],
    CONTACT_SENSOR: ['ContactSensor', 'Contact Sensor', 80],
    MOTION_SENSOR: ['MotionSensor', 'Motion Sensor', 85],
    BUTTON: ['StatelessProgrammableSwitch', 'Stateless Programmable Switch', 89],
  };

  // Characteristic types (strings from API)
  static CHAR_TYPES = {
    ON: ['On', 37],
    BRIGHTNESS: ['Brightness', 38],
    CURRENT_TEMP: ['CurrentTemperature', 17],
    TARGET_TEMP: ['TargetTemperature', 53],
    CURRENT_HUMIDITY: ['CurrentRelativeHumidity', 16],
    CURRENT_POSITION: ['CurrentPosition', 108],
    TARGET_POSITION: ['TargetPosition', 117],
    LOCK_CURRENT: ['LockCurrentState', 29],
    LOCK_TARGET: ['LockTargetState', 30],
    HEATING_COOLING_CURRENT: ['CurrentHeatingCoolingState', 15],
    HEATING_COOLING_TARGET: ['TargetHeatingCoolingState', 51],
    CONTACT_STATE: ['ContactSensorState', 106],
    MOTION_DETECTED: ['MotionDetected', 34],
    STATUS_FAULT: ['StatusFault', 77],
    PROGRAMMABLE_SWITCH_EVENT: ['ProgrammableSwitchEvent', 115],
  };

  // ============================================================
  // Static Helper Methods
  // ============================================================

  /**
   * Extract primitive value from Sprut.Hub wrapped value format
   * @param {unknown} value - Wrapped value like {boolValue: true} or primitive
   * @returns {unknown} - Unwrapped primitive value
   */
  static extractValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== 'object') {
      return value;
    }
    const wrapped = /** @type {WrappedValue} */ (value);
    if ('boolValue' in wrapped) return wrapped.boolValue;
    if ('doubleValue' in wrapped) return wrapped.doubleValue;
    if ('intValue' in wrapped) return wrapped.intValue;
    if ('stringValue' in wrapped) return wrapped.stringValue;
    return value;
  }

  /**
   * Check if service is a Lightbulb service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isLightbulbService(service) {
    return (
      service.type === SprutHub.SERVICE_LIGHTBULB ||
      service.type === SprutHub.SERVICE_LIGHTBULB_NAME
    );
  }

  /**
   * Find Lightbulb service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findLightbulbService(accessory) {
    return accessory.services?.find(SprutHub.isLightbulbService);
  }

  /**
   * Get characteristic type (handles both char.type and char.control.type)
   * @param {SprutHubCharacteristic} char
   * @returns {string|number|undefined}
   */
  static getCharacteristicType(char) {
    return char.type ?? char.control?.type;
  }

  /**
   * Check if characteristic is an On characteristic
   * @param {SprutHubCharacteristic} char
   * @returns {boolean}
   */
  static isOnCharacteristic(char) {
    const type = SprutHub.getCharacteristicType(char);
    return type === SprutHub.CHAR_ON || SprutHub.CHAR_ON_NAMES.includes(String(type));
  }

  /**
   * Check if characteristic is a Brightness characteristic
   * @param {SprutHubCharacteristic} char
   * @returns {boolean}
   */
  static isBrightnessCharacteristic(char) {
    const type = SprutHub.getCharacteristicType(char);
    return (
      type === SprutHub.CHAR_BRIGHTNESS || SprutHub.CHAR_BRIGHTNESS_NAMES.includes(String(type))
    );
  }

  /**
   * Check if characteristic has boolean value (fallback for finding On)
   * @param {SprutHubCharacteristic} char
   * @returns {boolean}
   */
  static hasBooleanValue(char) {
    const value = char.control?.value;
    if (!value) return false;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'object' && 'boolValue' in value) return true;
    return false;
  }

  /**
   * Find On characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findOnCharacteristic(service) {
    // First try by type
    let char = service.characteristics?.find(SprutHub.isOnCharacteristic);
    // Fallback: find by boolean value
    if (!char) {
      char = service.characteristics?.find(SprutHub.hasBooleanValue);
    }
    return char;
  }

  /**
   * Find Brightness characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findBrightnessCharacteristic(service) {
    return service.characteristics?.find(SprutHub.isBrightnessCharacteristic);
  }

  // ============================================================
  // Static Helper Methods - Service Type Checks
  // ============================================================

  /**
   * Check if value matches any of the given types (supports strings and numbers)
   * @param {number|string} value - Service or characteristic type
   * @param {(string|number)[]} types - Array of possible type values
   * @returns {boolean}
   */
  static matchesType(value, types) {
    return types.includes(value) || types.includes(String(value)) || types.includes(Number(value));
  }

  /**
   * Check if service is a Switch service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isSwitchService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.SWITCH);
  }

  /**
   * Check if service is an Outlet service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isOutletService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.OUTLET);
  }

  /**
   * Check if service is a Thermostat service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isThermostatService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.THERMOSTAT);
  }

  /**
   * Check if service is a WindowCovering service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isCoverService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.COVER);
  }

  /**
   * Check if service is a Lock service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isLockService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.LOCK);
  }

  /**
   * Check if service is a Temperature Sensor service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isTempSensorService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.TEMP_SENSOR);
  }

  /**
   * Check if service is a Humidity Sensor service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isHumiditySensorService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.HUMIDITY_SENSOR);
  }

  /**
   * Check if service is a Contact Sensor service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isContactSensorService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.CONTACT_SENSOR);
  }

  /**
   * Check if service is a Motion Sensor service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isMotionSensorService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.MOTION_SENSOR);
  }

  /**
   * Check if service is a Button (StatelessProgrammableSwitch) service
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isButtonService(service) {
    return SprutHub.matchesType(service.type, SprutHub.SERVICE_TYPES.BUTTON);
  }

  /**
   * Check if service is any type of sensor
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isSensorService(service) {
    return (
      SprutHub.isTempSensorService(service) ||
      SprutHub.isHumiditySensorService(service) ||
      SprutHub.isContactSensorService(service) ||
      SprutHub.isMotionSensorService(service)
    );
  }

  /**
   * Get sensor type name from service
   * @param {SprutHubService} service
   * @returns {'temperature'|'humidity'|'contact'|'motion'|null}
   */
  static getSensorType(service) {
    if (SprutHub.isTempSensorService(service)) return 'temperature';
    if (SprutHub.isHumiditySensorService(service)) return 'humidity';
    if (SprutHub.isContactSensorService(service)) return 'contact';
    if (SprutHub.isMotionSensorService(service)) return 'motion';
    return null;
  }

  // ============================================================
  // Static Helper Methods - Find Services
  // ============================================================

  /**
   * Find Switch service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findSwitchService(accessory) {
    return accessory.services?.find(SprutHub.isSwitchService);
  }

  /**
   * Find Outlet service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findOutletService(accessory) {
    return accessory.services?.find(SprutHub.isOutletService);
  }

  /**
   * Find Thermostat service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findThermostatService(accessory) {
    return accessory.services?.find(SprutHub.isThermostatService);
  }

  /**
   * Find Cover service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findCoverService(accessory) {
    return accessory.services?.find(SprutHub.isCoverService);
  }

  /**
   * Find Lock service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findLockService(accessory) {
    return accessory.services?.find(SprutHub.isLockService);
  }

  /**
   * Find any sensor service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findSensorService(accessory) {
    return accessory.services?.find(SprutHub.isSensorService);
  }

  /**
   * Find Button (StatelessProgrammableSwitch) service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findButtonService(accessory) {
    return accessory.services?.find(SprutHub.isButtonService);
  }

  // ============================================================
  // Static Helper Methods - Find Characteristics
  // ============================================================

  /**
   * Find characteristic by type in service
   * @param {SprutHubService} service
   * @param {(string|number)[]} types - Characteristic type values to match
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findCharacteristicByType(service, types) {
    // Type can be at c.type (old format) or c.control.type (Sprut.Hub format)
    return service.characteristics?.find((c) => {
      const charType = c.type ?? c.control?.type;
      return charType !== undefined && SprutHub.matchesType(charType, types);
    });
  }

  /**
   * Find CurrentTemperature characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findCurrentTempCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.CURRENT_TEMP);
  }

  /**
   * Find TargetTemperature characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findTargetTempCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.TARGET_TEMP);
  }

  /**
   * Find CurrentRelativeHumidity characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findCurrentHumidityCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.CURRENT_HUMIDITY);
  }

  /**
   * Find CurrentPosition characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findCurrentPositionCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.CURRENT_POSITION);
  }

  /**
   * Find TargetPosition characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findTargetPositionCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.TARGET_POSITION);
  }

  /**
   * Find LockCurrentState characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findLockCurrentStateCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.LOCK_CURRENT);
  }

  /**
   * Find LockTargetState characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findLockTargetStateCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.LOCK_TARGET);
  }

  /**
   * Find CurrentHeatingCoolingState characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findHeatingCoolingCurrentCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.HEATING_COOLING_CURRENT);
  }

  /**
   * Find TargetHeatingCoolingState characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findHeatingCoolingTargetCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.HEATING_COOLING_TARGET);
  }

  /**
   * Find ContactSensorState characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findContactStateCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.CONTACT_STATE);
  }

  /**
   * Find MotionDetected characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findMotionDetectedCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.MOTION_DETECTED);
  }

  /**
   * Find StatusFault characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findStatusFaultCharacteristic(service) {
    return SprutHub.findCharacteristicByType(service, SprutHub.CHAR_TYPES.STATUS_FAULT);
  }

  /**
   * Find ProgrammableSwitchEvent characteristic in service (for buttons)
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findProgrammableSwitchEventCharacteristic(service) {
    return SprutHub.findCharacteristicByType(
      service,
      SprutHub.CHAR_TYPES.PROGRAMMABLE_SWITCH_EVENT
    );
  }

  /**
   * Check if service has a fault (device offline/unreachable)
   * @param {SprutHubService} service
   * @returns {boolean}
   */
  static isServiceFaulted(service) {
    const faultChar = SprutHub.findStatusFaultCharacteristic(service);
    if (!faultChar) return false;
    const value = SprutHub.extractValue(faultChar.control?.value);
    // StatusFault: 0 = No Fault, 1 = General Fault (often means offline)
    return value === 1 || value === true;
  }

  /**
   * Check if accessory is offline/unreachable
   * Checks accessory-level reachable property and all services for StatusFault
   * @param {SprutHubAccessory} accessory
   * @returns {boolean}
   */
  static isAccessoryOffline(accessory) {
    // Check accessory-level online property (from Sprut.Hub API)
    if (accessory.online === false) return true;
    // Fallback checks
    if (accessory.reachable === false) return true;
    if (accessory.status === 'offline' || accessory.status === 'unreachable') return true;

    // Check all services for StatusFault
    if (accessory.services) {
      for (const service of accessory.services) {
        if (SprutHub.isServiceFaulted(service)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Convert accessory to Light object with extracted service/characteristic info
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubLight|null} - Light object or null if not a light
   */
  static accessoryToLight(accessory) {
    const service = SprutHub.findLightbulbService(accessory);
    if (!service) return null;

    const onChar = SprutHub.findOnCharacteristic(service);
    if (!onChar) return null;

    const brightnessChar = SprutHub.findBrightnessCharacteristic(service);
    const onValue = SprutHub.extractValue(onChar.control?.value);
    const brightnessValue = brightnessChar
      ? SprutHub.extractValue(brightnessChar.control?.value)
      : undefined;

    return {
      id: accessory.id,
      name: accessory.name,
      roomId: accessory.roomId ?? accessory.room,
      serviceId: service.sId,
      onCharacteristicId: onChar.cId,
      brightnessCharacteristicId: brightnessChar?.cId,
      isOn: Boolean(onValue),
      brightness: typeof brightnessValue === 'number' ? brightnessValue : undefined,
      services: accessory.services,
    };
  }

  // ============================================================
  // Constructor
  // ============================================================

  /**
   * @param {string} host - Hub hostname
   * @param {string} token - Auth token
   * @param {string} serial - Hub serial
   */
  constructor(host, token, serial) {
    this.host = host;
    this.token = token;
    this.serial = serial;
    this.clientId = crypto.randomUUID();

    /** @type {WebSocket|null} */
    this.ws = null;

    /** @type {number} */
    this.requestId = 0;

    /** @type {Map<number, PendingRequest>} */
    this.callbacks = new Map();

    /** @type {number} */
    this.reconnectAttempts = 0;

    /** @type {boolean} */
    this.intentionalClose = false;

    /** @type {ReturnType<typeof setTimeout>|null} */
    this.reconnectTimer = null;

    /** @type {boolean} */
    this.connecting = false;

    /** @type {Object.<string, Array<function(...unknown): void>>} */
    this.listeners = {
      ready: [],
      error: [],
      close: [],
      stateChange: [],
    };
  }

  /**
   * Connect to Sprut.Hub
   * @returns {void}
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connecting) {
      log('[SprutHub] Already connecting, skipping');
      return;
    }

    this.connecting = true;
    this.intentionalClose = false;
    const url = `ws://${this.host}/spruthub`;
    log('[SprutHub] Connecting to', url);

    try {
      this.ws = new WebSocket(url, 'json-rpc');
    } catch (err) {
      log('[SprutHub] WebSocket creation error:', err);
      this.connecting = false;
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      log('[SprutHub] Connected');
      this.connecting = false;
      this.reconnectAttempts = 0;

      // Register client with required 'name' parameter
      this.send({
        server: {
          clientInfo: {
            id: this.clientId,
            type: 'CLIENT_DESKTOP',
            name: 'StreamDock Plugin',
          },
        },
      })
        .then((result) => {
          log('[SprutHub] Client registered, result:', result);
          this.emit('ready');
        })
        .catch((err) => {
          // Registration might fail but we can still try to use the connection
          log('[SprutHub] Registration response:', err);
          this.emit('ready');
        });
    });

    this.ws.on('close', () => {
      log('[SprutHub] Connection closed');
      this.connecting = false;
      this.emit('close');
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      log('[SprutHub] WebSocket error:', err);
      this.emit('error', err);
    });

    this.ws.on('message', (data) => {
      this.onMessage(data.toString());
    });
  }

  /**
   * Disconnect from Sprut.Hub
   * @returns {void}
   */
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Clear pending callbacks
    this.callbacks.forEach((cb) => {
      clearTimeout(cb.timeout);
      cb.reject(new Error('Disconnected'));
    });
    this.callbacks.clear();
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if currently connecting
   * @returns {boolean}
   */
  isConnecting() {
    return this.connecting;
  }

  /**
   * Wait for connection to be ready
   * @param {number} [timeout=10000] - Timeout in ms
   * @returns {Promise<void>}
   */
  waitForConnection(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (this.isConnected()) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        this.off('ready', onReady);
        this.off('error', onError);
        reject(new Error('Connection timeout'));
      }, timeout);

      /** @type {function(): void} */
      const onReady = () => {
        clearTimeout(timeoutId);
        this.off('error', onError);
        resolve();
      };

      /** @type {function(unknown): void} */
      const onError = (err) => {
        clearTimeout(timeoutId);
        this.off('ready', onReady);
        reject(err instanceof Error ? err : new Error('Connection error'));
      };

      this.on('ready', onReady);
      this.on('error', onError);

      // Start connection if not already connecting
      if (!this.connecting) {
        this.connect();
      }
    });
  }

  /**
   * Schedule reconnection
   * @returns {void}
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      log('[SprutHub] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    log('[SprutHub] Reconnecting in', delay, 'ms (attempt', this.reconnectAttempts, ')');

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send request to Sprut.Hub
   * @param {Object} params - Request parameters
   * @returns {Promise<unknown>}
   */
  send(params) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      const id = ++this.requestId;
      const timeout = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT);

      this.callbacks.set(id, { resolve, reject, timeout });

      const message = {
        id,
        cid: this.clientId,
        token: this.token,
        serial: this.serial,
        params,
      };

      log('[SprutHub] Sending:', JSON.stringify(message).substring(0, 200));
      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle incoming message
   * @param {string} data - Raw message data
   * @returns {void}
   */
  onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      log('[SprutHub] Invalid JSON:', data);
      return;
    }

    log('[SprutHub] Received:', JSON.stringify(msg).substring(0, 200));

    // Response to request
    if (msg.id && this.callbacks.has(msg.id)) {
      const callback = this.callbacks.get(msg.id);
      if (callback) {
        clearTimeout(callback.timeout);
        this.callbacks.delete(msg.id);
        callback.resolve(msg.result);
      }
      return;
    }

    // Event (no id, has event field)
    if (msg.event) {
      this.handleEvent(msg.event);
    }
  }

  /**
   * Handle event from Sprut.Hub
   * @param {{characteristic?: {event?: string, characteristics?: SprutHubCharacteristic[]}}} event - Event object
   * @returns {void}
   */
  handleEvent(event) {
    // Characteristic update event
    if (event.characteristic?.event === 'EVENT_UPDATE') {
      const changes = event.characteristic.characteristics || [];
      changes.forEach((/** @type {SprutHubCharacteristic} */ ch) => {
        this.emit('stateChange', {
          accessoryId: ch.aId,
          serviceId: ch.sId,
          characteristicId: ch.cId,
          value: ch.control?.value,
        });
      });
    }
  }

  /**
   * Get list of rooms
   * @returns {Promise<SprutHubRoom[]>}
   */
  async getRooms() {
    const result = /** @type {RoomListResponse} */ (await this.send({ room: { list: {} } }));
    return result?.room?.list?.rooms || result?.room?.rooms || [];
  }

  /**
   * Get list of accessories with services and characteristics
   * @returns {Promise<SprutHubAccessory[]>}
   */
  async getAccessories() {
    log('[SprutHub] Requesting accessory list...');
    const result = /** @type {AccessoryListResponse} */ (
      await this.send({
        accessory: {
          list: {},
        },
      })
    );
    log('[SprutHub] Got accessories result:', JSON.stringify(result).substring(0, 500));
    return result?.accessory?.list?.accessories || result?.accessory?.accessories || [];
  }

  /**
   * Update characteristic value
   * @param {number} aId - Accessory ID
   * @param {number} sId - Service ID
   * @param {number} cId - Characteristic ID
   * @param {unknown} value - New value
   * @returns {Promise<unknown>}
   */
  async updateCharacteristic(aId, sId, cId, value) {
    // Format value according to Sprut.Hub API expectations
    let formattedValue;
    if (typeof value === 'boolean') {
      formattedValue = { boolValue: value };
    } else if (typeof value === 'number') {
      // Use intValue for integers (lock states, cover positions, thermostat modes)
      // Use doubleValue for floats (temperature, brightness percentage)
      if (Number.isInteger(value)) {
        formattedValue = { intValue: value };
      } else {
        formattedValue = { doubleValue: value };
      }
    } else if (typeof value === 'string') {
      formattedValue = { stringValue: value };
    } else {
      formattedValue = value;
    }

    log('[SprutHub] Updating characteristic:', { aId, sId, cId, value: formattedValue });

    return this.send({
      characteristic: {
        update: {
          aId,
          sId,
          cId,
          control: { value: formattedValue },
        },
      },
    });
  }

  /**
   * Get all lights (accessories with Lightbulb service)
   * @returns {Promise<SprutHubLight[]>}
   */
  async getLights() {
    const accessories = await this.getAccessories();
    return accessories
      .map(SprutHub.accessoryToLight)
      .filter(/** @type {(l: SprutHubLight|null) => l is SprutHubLight} */ (l) => l !== null);
  }

  /**
   * Get list of scenarios
   * @param {boolean} [includeInactive=false] - Include inactive scenarios
   * @param {boolean} [includePredefined=false] - Include predefined/system scenarios
   * @returns {Promise<SprutHubScenario[]>}
   */
  async getScenarios(includeInactive = false, includePredefined = false) {
    log('[SprutHub] Requesting scenario list...');
    const result = /** @type {ScenarioListResponse} */ (
      await this.send({
        scenario: {
          list: {},
        },
      })
    );
    let scenarios = result?.scenario?.list?.scenarios || [];

    // Filter out inactive scenarios unless requested
    if (!includeInactive) {
      scenarios = scenarios.filter((s) => s.active);
    }

    // Filter out predefined/system scenarios unless requested
    if (!includePredefined) {
      scenarios = scenarios.filter((s) => !s.predefined);
    }

    log('[SprutHub] Got scenarios:', scenarios.length);
    return scenarios;
  }

  /**
   * Run a scenario by index
   * @param {string} index - Scenario index/ID
   * @returns {Promise<unknown>}
   */
  async runScenario(index) {
    log('[SprutHub] Running scenario:', index);
    return this.send({
      scenario: {
        run: { index },
      },
    });
  }

  /**
   * Set light power state
   * @param {number} accessoryId - Accessory ID
   * @param {number} serviceId - Service ID
   * @param {number} characteristicId - On characteristic ID
   * @param {boolean} on - Power state
   * @returns {Promise<unknown>}
   */
  async setLightPower(accessoryId, serviceId, characteristicId, on) {
    return this.updateCharacteristic(accessoryId, serviceId, characteristicId, on);
  }

  /**
   * Set light brightness
   * @param {number} accessoryId - Accessory ID
   * @param {number} serviceId - Service ID
   * @param {number} characteristicId - Brightness characteristic ID
   * @param {number} brightness - Brightness level (0-100)
   * @returns {Promise<unknown>}
   */
  async setLightBrightness(accessoryId, serviceId, characteristicId, brightness) {
    return this.updateCharacteristic(accessoryId, serviceId, characteristicId, brightness);
  }

  /**
   * Toggle light power state
   * @param {number} accessoryId - Accessory ID
   * @param {number} serviceId - Service ID
   * @param {number} characteristicId - On characteristic ID
   * @param {boolean} currentState - Current power state
   * @returns {Promise<unknown>}
   */
  async toggleLight(accessoryId, serviceId, characteristicId, currentState) {
    return this.setLightPower(accessoryId, serviceId, characteristicId, !currentState);
  }

  /**
   * Add event listener
   * @param {string} event - Event name
   * @param {function(...unknown): void} callback - Callback function
   * @returns {void}
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {function(...unknown): void} callback - Callback function
   * @returns {void}
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {unknown} [data] - Event data
   * @returns {void}
   */
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  }
}

// ============================================================
// Singleton Client Management
// ============================================================

/** @type {SprutHub|null} */
let client = null;

/** @type {{host: string, token: string, serial: string}|null} */
let currentSettings = null;

/**
 * Get or create client
 * @param {string} host - Hub hostname
 * @param {string} token - Auth token
 * @param {string} serial - Hub serial
 * @returns {SprutHub|null}
 */
function getClient(host, token, serial) {
  // Validate required parameters
  if (!host || !token || !serial) {
    log('[SprutHub] getClient called with missing params:', {
      host,
      token: token ? '***' : undefined,
      serial,
    });
    return null;
  }

  // Reconnect if settings changed
  if (
    client &&
    currentSettings &&
    (host !== currentSettings.host ||
      token !== currentSettings.token ||
      serial !== currentSettings.serial)
  ) {
    log('[SprutHub] Settings changed, reconnecting');
    client.disconnect();
    client = null;
  }

  if (!client) {
    currentSettings = { host, token, serial };
    client = new SprutHub(host, token, serial);
  }

  return client;
}

/**
 * Disconnect and clear client
 * @returns {void}
 */
function disconnectClient() {
  if (client) {
    client.disconnect();
    client = null;
    currentSettings = null;
  }
}

/**
 * Get current client instance (may be null)
 * @returns {SprutHub|null}
 */
function getCurrentClient() {
  return client;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Class (includes static methods and constants)
  SprutHub,
  // Singleton management
  getClient,
  disconnectClient,
  getCurrentClient,
};
