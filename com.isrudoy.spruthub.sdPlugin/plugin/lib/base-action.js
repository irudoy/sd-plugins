/**
 * Base Action Class for Sprut.Hub Plugin
 * Provides common functionality for all device action types
 * @module lib/base-action
 */

const { log } = require('./common');
const {
  contexts,
  setContext,
  getContext,
  deleteContext,
  stopTimer,
  addDialTicks,
  clearDialDebounce,
  markAccessoryUpdated,
  clearUpdateTimestamp,
} = require('./state');
const { setImage, sendToPropertyInspector } = require('./websocket');
const { SprutHub, getClient, disconnectClient, getCurrentClient } = require('./spruthub');
const {
  drawError,
  drawConnectingWithIcon,
  drawNotConfiguredWithIcon,
  drawOfflineWithIcon,
  drawKnobError,
  drawKnobConnectingWithIcon,
  drawKnobNotConfiguredWithIcon,
  drawKnobOfflineWithIcon,
} = require('./draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').AppearPayload} AppearPayload
 * @typedef {import('../../../types/streamdock').KeyPayload} KeyPayload
 * @typedef {import('../../../types/streamdock').SettingsPayload} SettingsPayload
 * @typedef {import('../../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * Base settings with common properties - actions extend with their own properties
 * @typedef {Object} BaseSettings
 * @property {string} [host] - Hub hostname
 * @property {string} [token] - Auth token
 * @property {string} [serial] - Hub serial
 * @property {number} [accessoryId] - Selected accessory ID
 * @property {string} [accessoryName] - Accessory display name
 * @property {number} [serviceId] - Service ID (sId)
 * @property {string} [serviceName] - Service display name
 * @property {number} [characteristicId] - Main characteristic ID (cId)
 * @property {string} [customName] - Custom display name
 * @property {string} [action] - Action type (toggle, on, off, etc.)
 * @property {number} [currentPositionCharId] - Cover current position char ID
 * @property {number} [targetPositionCharId] - Cover target position char ID
 * @property {number} [currentStateCharId] - Lock current state char ID
 * @property {number} [currentTempCharId] - Thermostat current temp char ID
 * @property {number} [targetTempCharId] - Thermostat target temp char ID
 * @property {number} [currentModeCharId] - Thermostat current mode char ID
 * @property {number} [targetModeCharId] - Thermostat target mode char ID
 * @property {number} [tempStep] - Temperature step (thermostats)
 * @property {string} [sensorType] - Sensor type (temperature, humidity, motion, contact)
 * @property {number} [pressType] - Button press type (0=single, 1=double, 2=long)
 */

/**
 * Base state with common properties - actions extend this with their own properties
 * @typedef {Object} BaseState
 * @property {string} [error] - Error message
 * @property {boolean} [connecting] - Whether connecting to hub
 * @property {boolean} [offline] - Whether device is offline
 * @property {boolean} [on] - On/off state (lights, switches, outlets)
 * @property {number} [brightness] - Brightness level (lights)
 * @property {boolean} [locked] - Lock state (locks)
 * @property {number} [position] - Position 0-100 (covers)
 * @property {number} [targetPosition] - Target position (covers)
 * @property {number} [currentTemp] - Current temperature (thermostats, sensors)
 * @property {number} [targetTemp] - Target temperature (thermostats)
 * @property {number} [currentMode] - Current mode (thermostats)
 * @property {number} [targetMode] - Target mode (thermostats)
 * @property {number|boolean} [value] - Sensor value (sensors)
 * @property {string} [sensorType] - Sensor type (sensors)
 * @property {boolean} [ready] - Ready state (buttons)
 * @property {boolean} [pressed] - Pressed state (buttons)
 */

/**
 * Icon drawing function signature
 * @callback IconDrawFn
 * @param {CanvasContext} ctx - Canvas context
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Fill color
 * @returns {void}
 */

/**
 * @typedef {import('./spruthub').SprutHubAccessory} SprutHubAccessory
 * @typedef {import('./spruthub').SprutHubService} SprutHubService
 */

/**
 * Service finder function
 * @callback FindServiceFn
 * @param {SprutHubAccessory} accessory - Accessory object
 * @returns {SprutHubService|undefined} - Service or undefined
 */

/**
 * State extractor function - extracts device state from accessory/service
 * @callback ExtractStateFn
 * @param {SprutHubAccessory} accessory - Accessory object
 * @param {SprutHubService} service - Service object
 * @param {BaseSettings} settings - Current settings
 * @returns {BaseState} - Device state
 */

/**
 * State renderer function - renders state to canvas image
 * @callback RenderStateFn
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} state - Current state
 * @param {string} displayName - Device display name
 * @returns {string} - Base64 PNG data URL
 */

/**
 * Key handler function - handles key press
 * @callback KeyHandlerFn
 * @param {SprutHub} client - Connected client
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} state - Current state
 * @returns {Promise<BaseState|null>} - New state or null for no change
 */

/**
 * Dial rotation handler function - handles dial rotation
 * @callback DialHandlerFn
 * @param {SprutHub} client - Connected client
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} state - Current state
 * @param {{ticks: number}} payload - Dial payload with ticks
 * @returns {Promise<BaseState|null>} - New state or null for no change
 */

/**
 * Preview dial rotation function - calculates new state without API call
 * @callback PreviewDialFn
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} state - Current state
 * @param {{ticks: number}} payload - Dial payload with ticks
 * @returns {BaseState|null} - New state or null for no change
 */

/**
 * State change handler - processes incoming state changes
 * @callback StateChangeHandlerFn
 * @param {BaseState} state - Current state
 * @param {BaseSettings} settings - Current settings
 * @param {number} characteristicId - Changed characteristic ID
 * @param {unknown} value - New value
 * @returns {BaseState} - Updated state
 */

/**
 * Settings mapper function - maps PI payload to settings
 * @callback SettingsMapperFn
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {BaseSettings} - Mapped settings
 */

/**
 * Knob state renderer function - renders state to wide knob image (200x100)
 * @callback RenderKnobStateFn
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} state - Current state
 * @param {string} displayName - Device display name
 * @returns {string} - Base64 PNG data URL
 */

/**
 * Action configuration
 * @typedef {Object} ActionConfig
 * @property {string} actionType - Action UUID (e.g., 'com.isrudoy.spruthub.light')
 * @property {string} deviceTypeName - Display name for device type (e.g., 'Light', 'Switch')
 * @property {IconDrawFn} drawIcon - Function to draw the device icon
 * @property {FindServiceFn} findService - Function to find the service in accessory
 * @property {ExtractStateFn} extractState - Function to extract state from accessory
 * @property {RenderStateFn} renderState - Function to render state to button image (144x144)
 * @property {RenderKnobStateFn} [renderKnobState] - Function to render state to knob image (200x100)
 * @property {KeyHandlerFn} handleKeyUp - Function to handle key press
 * @property {StateChangeHandlerFn} [handleStateChange] - Function to handle state changes
 * @property {SettingsMapperFn} [mapSettings] - Function to map PI payload to settings
 * @property {BaseState} initialState - Initial state object
 * @property {DialHandlerFn} [handleDialRotate] - Function to handle dial rotation (knob)
 * @property {PreviewDialFn} [previewDialRotate] - Function to preview dial rotation (UI only, no API)
 */

// ============================================================
// Utility Functions
// ============================================================

/**
 * Map base settings from PI payload
 * @param {SendToPluginPayload} payload - PI payload
 * @returns {BaseSettings}
 */
function mapBaseSettings(payload) {
  return {
    host: typeof payload.host === 'string' ? payload.host : undefined,
    token: typeof payload.token === 'string' ? payload.token : undefined,
    serial: typeof payload.serial === 'string' ? payload.serial : undefined,
    accessoryId: typeof payload.accessoryId === 'number' ? payload.accessoryId : undefined,
    accessoryName: typeof payload.accessoryName === 'string' ? payload.accessoryName : undefined,
    serviceId: typeof payload.serviceId === 'number' ? payload.serviceId : undefined,
    serviceName: typeof payload.serviceName === 'string' ? payload.serviceName : undefined,
    characteristicId:
      typeof payload.characteristicId === 'number' ? payload.characteristicId : undefined,
    customName: typeof payload.customName === 'string' ? payload.customName : undefined,
    action: typeof payload.action === 'string' ? payload.action : undefined,
  };
}

/**
 * Standard toggle key up handler for on/off devices (light, switch, outlet)
 * Handles 'on', 'off', and 'toggle' actions
 * @param {SprutHub} client - Connected client
 * @param {BaseSettings} settings - Current settings
 * @param {BaseState} currentState - Current state
 * @returns {Promise<BaseState|null>} - New state or null
 */
async function handleToggleKeyUp(client, settings, currentState) {
  const { accessoryId, serviceId, characteristicId, action } = settings;
  if (accessoryId == null || serviceId == null || characteristicId == null) return null;

  let newValue;
  if (action === 'on') {
    newValue = true;
  } else if (action === 'off') {
    newValue = false;
  } else {
    newValue = !currentState.on;
  }

  await client.updateCharacteristic(accessoryId, serviceId, characteristicId, newValue);

  return { ...currentState, on: newValue };
}

/**
 * Standard state change handler for simple on/off devices (switch, outlet)
 * @param {BaseState} state - Current state
 * @param {BaseSettings} settings - Current settings
 * @param {number} characteristicId - Changed characteristic ID
 * @param {unknown} value - New value
 * @returns {BaseState} - Updated state
 */
function handleOnOffStateChange(state, settings, characteristicId, value) {
  if (settings.characteristicId === characteristicId || characteristicId === SprutHub.CHAR_ON) {
    return { ...state, on: Boolean(value) };
  }
  return state;
}

/**
 * Standard state extractor for simple on/off devices (switch, outlet)
 * @param {SprutHubAccessory} _accessory - Accessory object (unused)
 * @param {SprutHubService} service - Service object
 * @param {BaseSettings} _settings - Settings (unused)
 * @returns {BaseState} - Extracted state
 */
function extractOnOffState(_accessory, service, _settings) {
  const onChar = SprutHub.findOnCharacteristic(service);
  const onValue = SprutHub.extractValue(onChar?.control?.value);
  return { on: Boolean(onValue) };
}

// ============================================================
// BaseAction Class
// ============================================================

/**
 * Base action class that provides common functionality for all actions
 */
class BaseAction {
  /**
   * @param {ActionConfig} config
   */
  constructor(config) {
    this.actionType = config.actionType;
    this.deviceTypeName = config.deviceTypeName;
    this.drawIcon = config.drawIcon;
    this.findService = config.findService;
    this.extractState = config.extractState;
    this.renderState = config.renderState;
    this.renderKnobStateFn = config.renderKnobState;
    this.handleKeyUpFn = config.handleKeyUp;
    this.handleStateChangeFn = config.handleStateChange;
    this.mapSettingsFn = config.mapSettings;
    this.initialState = config.initialState;
    this.handleDialRotateFn = config.handleDialRotate;
    this.previewDialRotateFn = config.previewDialRotate;

    /** @type {boolean} */
    this.stateListenerSetup = false;

    /** @type {SprutHub|null} */
    this.listenerClient = null;

    // Bind methods to preserve 'this' context
    this.onWillAppear = this.onWillAppear.bind(this);
    this.onWillDisappear = this.onWillDisappear.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onSendToPlugin = this.onSendToPlugin.bind(this);
    this.onSettingsUpdate = this.onSettingsUpdate.bind(this);
    this.onDidReceiveSettings = this.onDidReceiveSettings.bind(this);
    this.onPropertyInspectorDidAppear = this.onPropertyInspectorDidAppear.bind(this);
    this.onDialRotate = this.onDialRotate.bind(this);
    this.onDialDown = this.onDialDown.bind(this);
  }

  /**
   * Get tag for logging
   * @returns {string}
   */
  get logTag() {
    return `[${this.deviceTypeName}]`;
  }

  /**
   * Setup state change listener
   * @returns {void}
   */
  setupStateListener() {
    const client = getCurrentClient();
    if (!client) return;

    if (this.listenerClient !== client) {
      this.stateListenerSetup = false;
      this.listenerClient = client;
    }

    if (this.stateListenerSetup) return;

    client.on('stateChange', (change) => {
      const { accessoryId, characteristicId, value } =
        /** @type {import('./spruthub').StateChange} */ (change);

      const actualValue = SprutHub.extractValue(value);

      Object.entries(contexts).forEach(([context, data]) => {
        if (data.action !== this.actionType) return;

        /** @type {BaseSettings} */
        const settings = /** @type {BaseSettings} */ (data.settings || {});
        if (settings.accessoryId === accessoryId) {
          // Skip state updates if we recently made a change (optimistic UI)
          if (wasRecentlyUpdated(context)) {
            log(this.logTag, 'Skipping stateChange (optimistic UI cooldown)');
            return;
          }

          if (!data.state) {
            data.state = { ...this.initialState };
          }

          // Use custom state change handler if provided
          if (this.handleStateChangeFn) {
            data.state = this.handleStateChangeFn(
              data.state,
              settings,
              characteristicId,
              actualValue
            );
          }

          this.updateButton(context, settings, data.state);
        }
      });
    });

    this.stateListenerSetup = true;
  }

  /**
   * Sync state to all buttons for the same accessory
   * @param {string} sourceContext - Context that initiated the change
   * @param {BaseSettings} settings - Settings with accessoryId
   * @param {BaseState} newState - New state to sync
   * @returns {void}
   */
  syncAccessoryState(sourceContext, settings, newState) {
    if (!settings.accessoryId) return;

    // Mark all contexts for this accessory as recently updated
    markAccessoryUpdated(settings.accessoryId);

    // Update state and button for all OTHER contexts with the same accessory
    Object.entries(contexts).forEach(([ctx, data]) => {
      if (ctx === sourceContext) return; // Skip source, already updated
      if (data.action !== this.actionType) return; // Only same action type

      const ctxSettings = /** @type {BaseSettings} */ (data.settings || {});
      if (ctxSettings.accessoryId === settings.accessoryId) {
        // Merge relevant state properties
        if (data.state) {
          Object.assign(data.state, newState);
        } else {
          data.state = { ...newState };
        }
        this.updateButton(ctx, ctxSettings, data.state);
      }
    });
  }

  /**
   * Get display name for button
   * @param {BaseSettings} settings
   * @returns {string}
   */
  getDisplayName(settings) {
    if (settings.customName) {
      return settings.customName;
    }
    if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
      return settings.serviceName;
    }
    return settings.accessoryName || this.deviceTypeName;
  }

  /**
   * Check if settings are configured
   * @param {BaseSettings} settings
   * @returns {boolean}
   */
  isConfigured(settings) {
    return Boolean(settings.host && settings.token && settings.serial && settings.accessoryId);
  }

  /**
   * Update button image
   * @param {string} context - Action context
   * @param {BaseSettings} settings - Settings
   * @param {BaseState} [state] - Current state
   * @returns {void}
   */
  updateButton(context, settings, state) {
    const ctx = getContext(context);
    const isKnob = ctx?.controller === 'Knob';
    let imageData;

    if (isKnob) {
      // Knob layout (200x100, no status bar)
      if (state?.error) {
        imageData = drawKnobError(state.error);
      } else if (state?.connecting) {
        imageData = drawKnobConnectingWithIcon(this.drawIcon);
      } else if (!this.isConfigured(settings)) {
        imageData = drawKnobNotConfiguredWithIcon(this.drawIcon);
      } else if (state?.offline) {
        imageData = drawKnobOfflineWithIcon(this.drawIcon, this.getDisplayName(settings));
      } else if (this.renderKnobStateFn) {
        imageData = this.renderKnobStateFn(
          settings,
          state || this.initialState,
          this.getDisplayName(settings)
        );
      } else {
        // Fallback to regular render if no knob-specific renderer
        imageData = this.renderState(
          settings,
          state || this.initialState,
          this.getDisplayName(settings)
        );
      }
    } else {
      // Keypad layout (144x144 with status bar)
      if (state?.error) {
        imageData = drawError(state.error);
      } else if (state?.connecting) {
        imageData = drawConnectingWithIcon(this.drawIcon);
      } else if (!this.isConfigured(settings)) {
        imageData = drawNotConfiguredWithIcon(this.drawIcon);
      } else if (state?.offline) {
        imageData = drawOfflineWithIcon(this.drawIcon, this.getDisplayName(settings));
      } else {
        imageData = this.renderState(
          settings,
          state || this.initialState,
          this.getDisplayName(settings)
        );
      }
    }

    setImage(context, imageData);
  }

  /**
   * Fetch current device state from hub
   * @param {BaseSettings} settings - Settings
   * @returns {Promise<BaseState>}
   */
  async fetchState(settings) {
    const { host, token, serial, accessoryId, serviceId } = settings;

    if (!host || !token || !serial || !accessoryId) {
      return { ...this.initialState, error: 'Not configured' };
    }

    try {
      const client = getClient(host, token, serial);

      if (!client) {
        return { ...this.initialState, error: 'Missing connection parameters' };
      }

      await client.waitForConnection();

      this.setupStateListener();

      const accessories = await client.getAccessories();
      const accessory = accessories.find((a) => a.id === accessoryId);

      if (!accessory) {
        return { ...this.initialState, error: `${this.deviceTypeName} not found` };
      }

      const service = serviceId
        ? accessory.services?.find((s) => s.sId === serviceId)
        : this.findService(accessory);

      if (!service) {
        return { ...this.initialState, error: `No ${this.deviceTypeName.toLowerCase()} service` };
      }

      const isOffline = SprutHub.isAccessoryOffline(accessory);

      const state = this.extractState(accessory, service, settings);
      return { ...state, offline: isOffline };
    } catch (err) {
      log(this.logTag, 'Error fetching state:', err);
      return { ...this.initialState, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  /**
   * Handle willAppear event
   * @param {string} context - Action context
   * @param {AppearPayload} payload - Event payload
   * @returns {void}
   */
  onWillAppear(context, payload) {
    /** @type {BaseSettings} */
    const settings = /** @type {BaseSettings} */ (payload?.settings || {});
    /** @type {'Keypad' | 'Knob'} */
    const controller = payload?.controller || 'Keypad';
    setContext(context, {
      settings,
      action: this.actionType,
      state: { ...this.initialState, connecting: true },
      controller,
    });

    this.updateButton(context, settings, { ...this.initialState, connecting: true });

    this.fetchState(settings).then((state) => {
      const ctx = getContext(context);
      if (ctx) {
        ctx.state = state;
        this.updateButton(context, settings, state);
      }
    });
  }

  /**
   * Handle willDisappear event
   * @param {string} context - Action context
   * @returns {void}
   */
  onWillDisappear(context) {
    stopTimer(context);
    clearDialDebounce(context);
    clearUpdateTimestamp(context);
    deleteContext(context);

    if (Object.keys(contexts).length === 0) {
      disconnectClient();
      this.stateListenerSetup = false;
      this.listenerClient = null;
    }
  }

  /**
   * Handle keyUp event
   * @param {string} context - Action context
   * @param {KeyPayload} payload - Event payload
   * @returns {Promise<void>}
   */
  async onKeyUp(context, payload) {
    /** @type {BaseSettings} */
    const settings = /** @type {BaseSettings} */ (
      payload?.settings || getContext(context)?.settings || {}
    );

    if (!this.isConfigured(settings)) {
      log(this.logTag, 'onKeyUp: missing required settings');
      return;
    }

    if (!settings.serviceId) {
      log(this.logTag, 'onKeyUp: missing serviceId');
      return;
    }

    try {
      if (!settings.host || !settings.token || !settings.serial) return;
      const client = getClient(settings.host, settings.token, settings.serial);
      if (!client || !client.isConnected()) {
        log(this.logTag, 'onKeyUp: client not connected');
        return;
      }

      const ctx = getContext(context);
      const currentState = ctx?.state || { ...this.initialState };

      const newState = await this.handleKeyUpFn(client, settings, currentState);

      if (newState && ctx) {
        ctx.state = newState;
        this.updateButton(context, settings, newState);
        this.syncAccessoryState(context, settings, newState); // Sync to other buttons
      }
    } catch (err) {
      log(this.logTag, 'Error in keyUp:', err);
    }
  }

  /**
   * Handle dialRotate event (knob) with debounced API calls
   * UI updates immediately (preview), API call is debounced
   * @param {string} context - Action context
   * @param {KeyPayload & {ticks?: number}} payload - Event payload with ticks
   * @returns {void}
   */
  onDialRotate(context, payload) {
    if (!this.handleDialRotateFn) return;

    /** @type {BaseSettings} */
    const settings = /** @type {BaseSettings} */ (
      payload?.settings || getContext(context)?.settings || {}
    );

    if (!this.isConfigured(settings)) {
      return;
    }

    if (!settings.host || !settings.token || !settings.serial) return;
    if (payload.ticks == null) return;

    const ctx = getContext(context);
    if (!ctx) return;

    // Update UI immediately (preview) using previewDialRotate if available
    if (this.previewDialRotateFn) {
      const currentState = ctx.state || { ...this.initialState };
      const previewState = this.previewDialRotateFn(settings, currentState, {
        ticks: payload.ticks,
      });
      if (previewState) {
        ctx.state = previewState;
        this.updateButton(context, settings, previewState);
        this.syncAccessoryState(context, settings, previewState); // Sync to other buttons
      }
    }

    // Accumulate ticks and debounce API call
    addDialTicks(
      context,
      payload.ticks,
      async (totalTicks) => {
        try {
          const client = getClient(
            settings.host || '',
            settings.token || '',
            settings.serial || ''
          );
          if (!client || !client.isConnected()) {
            log(this.logTag, 'onDialRotate: client not connected');
            return;
          }

          const currentCtx = getContext(context);
          const currentState = currentCtx?.state || { ...this.initialState };

          log(this.logTag, 'onDialRotate: sending to hub, ticks:', totalTicks);

          // Send accumulated change to hub
          await this.handleDialRotateFn?.(client, settings, currentState, {
            ticks: totalTicks,
          });

          // Extend cooldown after API call (state already synced by preview)
          if (settings.accessoryId) {
            markAccessoryUpdated(settings.accessoryId);
          }
        } catch (err) {
          log(this.logTag, 'Error in dialRotate:', err);
        }
      },
      150 // 150ms debounce for API calls
    );
  }

  /**
   * Handle dialDown event (knob press) - defaults to keyUp behavior
   * @param {string} context - Action context
   * @param {KeyPayload} payload - Event payload
   * @returns {Promise<void>}
   */
  async onDialDown(context, payload) {
    return this.onKeyUp(context, payload);
  }

  /**
   * Handle sendToPlugin event from PI
   * @param {string} context - Action context
   * @param {SendToPluginPayload} payload - PI payload
   * @returns {boolean} - Whether event was handled
   */
  onSendToPlugin(context, payload) {
    if (!payload) return false;

    const host = typeof payload.host === 'string' ? payload.host : '';
    const token = typeof payload.token === 'string' ? payload.token : '';
    const serial = typeof payload.serial === 'string' ? payload.serial : '';

    if (payload.event) {
      switch (payload.event) {
        case 'testConnection':
          this.handleTestConnection(host, token, serial);
          return true;
        case 'getDevices':
          this.handleGetDevices(host, token, serial);
          return true;
      }
    }

    // Handle settings update from PI
    if (payload.accessoryId && payload.serviceId) {
      this.handleSettingsFromPI(context, payload);
      return true;
    }

    return false;
  }

  /**
   * Handle settings update from PI
   * @param {string} context - Action context
   * @param {SendToPluginPayload} payload - Settings from PI
   * @returns {void}
   */
  handleSettingsFromPI(context, payload) {
    /** @type {BaseSettings} */
    const settings = this.mapSettingsFn
      ? this.mapSettingsFn(payload)
      : this.defaultMapSettings(payload);

    log(this.logTag, 'Received settings from PI:', settings.accessoryName);

    // Always reset state and fetch fresh when receiving settings from PI
    const connectingState = { ...this.initialState, connecting: true };

    const ctx = getContext(context);
    if (ctx) {
      ctx.settings = settings;
      ctx.state = connectingState;
    } else {
      setContext(context, { settings, state: connectingState });
    }

    this.updateButton(context, settings, connectingState);

    const fetchAccessoryId = settings.accessoryId;
    const fetchServiceId = settings.serviceId;

    this.fetchState(settings).then((state) => {
      const c = getContext(context);
      // Only update if device hasn't changed while fetching
      const currentSettings = /** @type {BaseSettings} */ (c?.settings || {});
      if (
        c &&
        currentSettings.accessoryId === fetchAccessoryId &&
        currentSettings.serviceId === fetchServiceId
      ) {
        c.state = state;
        this.updateButton(context, currentSettings, state);
      }
    });
  }

  /**
   * Default settings mapper
   * @param {SendToPluginPayload} payload - PI payload
   * @returns {BaseSettings}
   */
  defaultMapSettings(payload) {
    return mapBaseSettings(payload);
  }

  /**
   * Handle test connection request from PI
   * @param {string} host
   * @param {string} token
   * @param {string} serial
   * @returns {Promise<void>}
   */
  async handleTestConnection(host, token, serial) {
    log(this.logTag, 'handleTestConnection:', { host, token: token ? '***' : undefined, serial });

    try {
      const client = getClient(host, token, serial);

      if (!client) {
        sendToPropertyInspector({
          event: 'testResult',
          success: false,
          error: 'Missing connection parameters',
        });
        return;
      }

      await client.waitForConnection();

      const [rooms, accessories] = await Promise.all([client.getRooms(), client.getAccessories()]);

      log(this.logTag, 'Got rooms:', rooms.length, 'accessories:', accessories.length);

      const devices = accessories.filter((a) => {
        const hasService = this.findService(a) !== undefined;
        if (hasService) {
          log(this.logTag, `Found ${this.deviceTypeName.toLowerCase()}:`, a.name, a.id);
        }
        return hasService;
      });

      log(this.logTag, `Filtered ${this.deviceTypeName.toLowerCase()}s:`, devices.length);

      sendToPropertyInspector({
        event: 'testResult',
        success: true,
        rooms,
        devices,
      });

      log(this.logTag, 'Sent testResult to PI');
    } catch (err) {
      log(this.logTag, 'testConnection error:', err);
      sendToPropertyInspector({
        event: 'testResult',
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle get devices request from PI
   * @param {string} host
   * @param {string} token
   * @param {string} serial
   * @returns {Promise<void>}
   */
  async handleGetDevices(host, token, serial) {
    log(this.logTag, 'handleGetDevices:', { host, token: token ? '***' : undefined, serial });

    try {
      const client = getClient(host, token, serial);

      if (!client) {
        sendToPropertyInspector({
          event: 'error',
          message: 'Missing connection parameters',
        });
        return;
      }

      await client.waitForConnection();

      const [rooms, accessories] = await Promise.all([client.getRooms(), client.getAccessories()]);

      const devices = accessories.filter((a) => this.findService(a) !== undefined);

      log(
        this.logTag,
        'handleGetDevices: found',
        rooms.length,
        'rooms,',
        devices.length,
        `${this.deviceTypeName.toLowerCase()}s`
      );

      sendToPropertyInspector({
        event: 'deviceList',
        rooms,
        devices,
      });

      log(this.logTag, 'Sent deviceList to PI');
    } catch (err) {
      sendToPropertyInspector({
        event: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle settings update
   * @param {string} context - Action context
   * @param {BaseSettings} settings - New settings
   * @returns {void}
   */
  onSettingsUpdate(context, settings) {
    let ctx = getContext(context);
    const oldSettings = /** @type {BaseSettings|undefined} */ (ctx?.settings);

    // Check if device changed BEFORE updating settings
    const deviceChanged =
      !oldSettings ||
      oldSettings.accessoryId !== settings.accessoryId ||
      oldSettings.serviceId !== settings.serviceId;

    // Store settings
    if (ctx) {
      ctx.settings = settings;
    } else {
      setContext(context, { settings, action: this.actionType });
      ctx = getContext(context);
    }

    // If device didn't change, just update button with existing state
    if (!deviceChanged && ctx?.state) {
      this.updateButton(context, settings, ctx.state);
      return;
    }

    // Device changed - reset state and fetch fresh
    const connectingState = { ...this.initialState, connecting: true };
    if (ctx) {
      ctx.state = connectingState;
    }

    this.updateButton(context, settings, connectingState);

    const fetchAccessoryId = settings.accessoryId;
    const fetchServiceId = settings.serviceId;

    this.fetchState(settings).then((state) => {
      const c = getContext(context);
      const currentSettings = /** @type {BaseSettings} */ (c?.settings || {});
      // Only update if device hasn't changed while fetching
      if (
        c &&
        currentSettings.accessoryId === fetchAccessoryId &&
        currentSettings.serviceId === fetchServiceId
      ) {
        c.state = state;
        this.updateButton(context, currentSettings, state);
      }
    });
  }

  /**
   * Handle didReceiveSettings event
   * @param {string} context - Action context
   * @param {SettingsPayload} payload - Settings payload
   * @returns {void}
   */
  onDidReceiveSettings(context, payload) {
    /** @type {BaseSettings} */
    const settings = /** @type {BaseSettings} */ (payload?.settings || {});

    const ctx = getContext(context);
    const currentSettings = /** @type {BaseSettings|undefined} */ (ctx?.settings);

    // If we already have settings with an accessoryId, ignore didReceiveSettings
    // Settings should only come from:
    // 1. willAppear (initial load)
    // 2. sendToPlugin from PI (user changes)
    // didReceiveSettings from StreamDock can be stale and cause conflicts
    if (currentSettings?.accessoryId) {
      return;
    }

    this.onSettingsUpdate(context, settings);
  }

  /**
   * Handle propertyInspectorDidAppear event
   * @param {string} context - Action context
   * @returns {void}
   */
  onPropertyInspectorDidAppear(context) {
    const ctx = getContext(context);
    /** @type {BaseSettings} */
    const settings = /** @type {BaseSettings} */ (ctx?.settings || {});

    if (settings.host && settings.token && settings.serial) {
      this.handleGetDevices(settings.host, settings.token, settings.serial);
    }
  }

  /**
   * Get exports for module.exports
   * @returns {object}
   */
  getExports() {
    return {
      onWillAppear: this.onWillAppear,
      onWillDisappear: this.onWillDisappear,
      onKeyUp: this.onKeyUp,
      onSendToPlugin: this.onSendToPlugin,
      onSettingsUpdate: this.onSettingsUpdate,
      onDidReceiveSettings: this.onDidReceiveSettings,
      onPropertyInspectorDidAppear: this.onPropertyInspectorDidAppear,
      onDialRotate: this.onDialRotate,
      onDialDown: this.onDialDown,
    };
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  BaseAction,
  SprutHub,
  mapBaseSettings,
  handleToggleKeyUp,
  handleOnOffStateChange,
  extractOnOffState,
};
