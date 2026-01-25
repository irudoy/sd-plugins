/**
 * StreamDock Property Inspector Type Definitions
 * Globals provided by static/common.js and static/sd-action.js
 *
 * Note: $local, $back, $dom, $propEvent are defined by each PI file
 * using `const`, so they are not declared here to avoid conflicts.
 */

// ============================================================================
// SDK Globals (from sd-action.js)
// ============================================================================

/**
 * WebSocket connection to StreamDock
 * Extended with helper methods for plugin communication
 */
declare var $websocket: StreamDockWebSocket | undefined;

/**
 * Action UUID (context identifier)
 */
declare var $uuid: string;

/**
 * Action type identifier
 */
declare var $action: string;

/**
 * Action context (same as $uuid in most cases)
 */
declare var $context: string;

/**
 * Controller type: 'Keypad' for buttons, 'Encoder' or 'Knob' for dials/knobs
 */
declare var $controller: string;

/**
 * Settings proxy - auto-saves on property assignment
 */
declare var $settings: Record<string, unknown> | undefined;

/**
 * Language code for localization
 */
declare var $lang: string | undefined;

/**
 * File ID for uploads
 */
declare var $FileID: string;

// ============================================================================
// WebSocket Extensions
// ============================================================================

interface StreamDockWebSocket extends WebSocket {
  /**
   * Send payload to plugin backend
   */
  sendToPlugin(payload: Record<string, unknown>): void;

  /**
   * Set action state
   */
  setState(state: number): void;

  /**
   * Set button image from URL
   */
  setImage(url: string): void;

  /**
   * Open URL in default browser
   */
  openUrl(url: string): void;

  /**
   * Save settings (debounced)
   */
  saveData(payload: Record<string, unknown>): void;
}

// ============================================================================
// DOM Selector (from common.js)
// ============================================================================

/**
 * Extended HTMLElement with SDK helper methods
 * Includes common input properties for convenience
 */
interface DOMElementWithMethods extends HTMLElement {
  /**
   * Add event listener
   */
  on(event: string, callback: (event: Event) => void): void;

  /**
   * Get/set attribute
   */
  attr(name: string, value?: string): this;

  // Common input element properties (for convenience, may not exist on all elements)
  value: string;
  checked: boolean;
  disabled: boolean;
  innerHTML: string;
}

interface DollarFunction {
  /**
   * Select single element
   * @throws if element not found
   */
  (selector: string): DOMElementWithMethods;

  /**
   * Select all matching elements
   */
  (selector: string, isAll: true): DOMElementWithMethods[];

  /**
   * Throttle function execution
   */
  throttle<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T;

  /**
   * Debounce function execution
   */
  debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): T;
}

declare const $: DollarFunction;

// ============================================================================
// Event System (from common.js)
// ============================================================================

interface EventEmitter {
  /**
   * Subscribe to event
   */
  on(name: string, callback: (data: unknown) => void): void;

  /**
   * Emit event with data
   */
  send(name: string, data: unknown): void;
}

declare const $emit: EventEmitter;

// ============================================================================
// Property Inspector Event Handlers
// ============================================================================

/**
 * Settings payload from didReceiveSettings
 */
interface PISettingsPayload {
  settings: Record<string, unknown>;
  coordinates?: { column: number; row: number };
}

/**
 * Global settings payload
 */
interface PIGlobalSettingsPayload {
  settings: Record<string, unknown>;
}

/**
 * Event handlers object - implement in your PI
 */
interface PropEventHandlers {
  /**
   * Called when settings are received from StreamDock
   */
  didReceiveSettings?(payload: PISettingsPayload): void;

  /**
   * Called when global settings are received
   */
  didReceiveGlobalSettings?(payload: PIGlobalSettingsPayload): void;

  /**
   * Called when plugin sends data to Property Inspector
   */
  sendToPropertyInspector?(payload: Record<string, unknown>): void;
}

// ============================================================================
// DOM Cache Pattern (type only, each PI defines its own $dom)
// ============================================================================

/**
 * Common pattern for caching DOM elements
 * Usage: const $dom = { main: $('.sdpi-wrapper'), ... }
 */
interface DOMCache {
  main: DOMElementWithMethods;
  [key: string]: DOMElementWithMethods | null;
}

// ============================================================================
// Sprut.Hub Property Inspector Types (from pi-lib/common.js)
// ============================================================================

/**
 * Room object from Sprut.Hub API
 */
interface PIRoom {
  id: number;
  name: string;
}

/**
 * Characteristic control object
 */
interface PICharacteristicControl {
  value?: unknown;
  type?: string | number;
}

/**
 * Characteristic object from Sprut.Hub API
 */
interface PICharacteristic {
  cId: number;
  type: number | string;
  control?: PICharacteristicControl;
}

/**
 * Service object from Sprut.Hub API
 */
interface PIService {
  sId: number;
  name?: string;
  type: number | string;
  characteristics?: PICharacteristic[];
}

/**
 * Accessory object from Sprut.Hub API
 */
interface PIAccessory {
  id: number;
  name: string;
  roomId?: number;
  services?: PIService[];
}

/**
 * Configuration for SprutHubPI.init()
 */
interface PIConfig {
  deviceSelectId: string;
  serviceLabel: string;
  isServiceFn: (service: PIService) => boolean;
  findCharacteristicsFn: (service: PIService) => Record<string, number | undefined>;
  defaultAction: string;
  loadExtraSettings?: () => void;
  saveExtraSettings?: () => void;
  getExtraPluginSettings?: () => Record<string, unknown>;
}

/**
 * Result of SprutHubPI.init()
 */
interface PIInitResult {
  $propEvent: PropEventHandlers;
}

/**
 * SprutHubPI global object (from pi-lib/common.js)
 */
interface SprutHubPIInterface {
  /**
   * Initialize Property Inspector with configuration
   */
  init(config: PIConfig): PIInitResult;

  /**
   * Called when accessory is selected in dropdown
   */
  selectAccessory(): void;

  /**
   * Called when service is selected in dropdown
   */
  selectService(): void;

  /**
   * Filter devices by room
   */
  filterDevices(): void;

  /**
   * Test connection to Sprut.Hub
   */
  testConnection(): void;

  /**
   * Refresh device list from Sprut.Hub
   */
  refreshDevices(): void;

  /**
   * Toggle connection settings panel visibility
   */
  toggleConnectionSettings(): void;

  /**
   * Save current settings
   */
  saveSettings(): void;

  /**
   * Get characteristic type (handles both c.type and c.control.type)
   */
  getCharType(c: PICharacteristic): string | number | undefined;

  /**
   * Check if characteristic value is boolean
   */
  isBooleanCharacteristic(c: PICharacteristic): boolean;

  /**
   * Find On characteristic in service
   */
  findOnCharacteristic(service: PIService): PICharacteristic | undefined;

  /**
   * DOM element cache
   */
  readonly $dom: Record<string, HTMLElement | null>;

  /**
   * Current settings (may be null)
   */
  readonly $settings: Record<string, unknown> | null;
}

/**
 * Global SprutHubPI object
 */
declare var SprutHubPI: SprutHubPIInterface;
