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
 * @property {number|string} type - Characteristic type (37 = On, or string like "On")
 * @property {Object} [control] - Control object
 * @property {WrappedValue} [control.value] - Current value
 * @property {string} [control.name] - Characteristic name
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

// ============================================================
// SprutHubClient Class
// ============================================================

class SprutHubClient {
  // ============================================================
  // Static Constants
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
      service.type === SprutHubClient.SERVICE_LIGHTBULB ||
      service.type === SprutHubClient.SERVICE_LIGHTBULB_NAME
    );
  }

  /**
   * Find Lightbulb service in accessory
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubService|undefined}
   */
  static findLightbulbService(accessory) {
    return accessory.services?.find(SprutHubClient.isLightbulbService);
  }

  /**
   * Check if characteristic is an On characteristic
   * @param {SprutHubCharacteristic} char
   * @returns {boolean}
   */
  static isOnCharacteristic(char) {
    return (
      char.type === SprutHubClient.CHAR_ON ||
      SprutHubClient.CHAR_ON_NAMES.includes(String(char.type))
    );
  }

  /**
   * Check if characteristic is a Brightness characteristic
   * @param {SprutHubCharacteristic} char
   * @returns {boolean}
   */
  static isBrightnessCharacteristic(char) {
    return (
      char.type === SprutHubClient.CHAR_BRIGHTNESS ||
      SprutHubClient.CHAR_BRIGHTNESS_NAMES.includes(String(char.type))
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
    let char = service.characteristics?.find(SprutHubClient.isOnCharacteristic);
    // Fallback: find by boolean value
    if (!char) {
      char = service.characteristics?.find(SprutHubClient.hasBooleanValue);
    }
    return char;
  }

  /**
   * Find Brightness characteristic in service
   * @param {SprutHubService} service
   * @returns {SprutHubCharacteristic|undefined}
   */
  static findBrightnessCharacteristic(service) {
    return service.characteristics?.find(SprutHubClient.isBrightnessCharacteristic);
  }

  /**
   * Convert accessory to Light object with extracted service/characteristic info
   * @param {SprutHubAccessory} accessory
   * @returns {SprutHubLight|null} - Light object or null if not a light
   */
  static accessoryToLight(accessory) {
    const service = SprutHubClient.findLightbulbService(accessory);
    if (!service) return null;

    const onChar = SprutHubClient.findOnCharacteristic(service);
    if (!onChar) return null;

    const brightnessChar = SprutHubClient.findBrightnessCharacteristic(service);
    const onValue = SprutHubClient.extractValue(onChar.control?.value);
    const brightnessValue = brightnessChar
      ? SprutHubClient.extractValue(brightnessChar.control?.value)
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
      formattedValue = { doubleValue: value };
    } else if (typeof value === 'string') {
      formattedValue = { stringValue: value };
    } else {
      formattedValue = value;
    }

    log('[SprutHub] Updating characteristic:', { aId, sId, cId, value: formattedValue });

    // Try flat structure without characteristics array
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
      .map(SprutHubClient.accessoryToLight)
      .filter(/** @type {(l: SprutHubLight|null) => l is SprutHubLight} */ (l) => l !== null);
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

/** @type {SprutHubClient|null} */
let client = null;

/** @type {{host: string, token: string, serial: string}|null} */
let currentSettings = null;

/**
 * Get or create client
 * @param {string} host - Hub hostname
 * @param {string} token - Auth token
 * @param {string} serial - Hub serial
 * @returns {SprutHubClient|null}
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
    client = new SprutHubClient(host, token, serial);
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
 * @returns {SprutHubClient|null}
 */
function getCurrentClient() {
  return client;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Class (includes static methods and constants)
  SprutHubClient,
  // Singleton management
  getClient,
  disconnectClient,
  getCurrentClient,
};
