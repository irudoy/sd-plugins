/**
 * StreamDock SDK Type Definitions
 * @description Core types for StreamDock plugin development
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Events received from StreamDock
 */
export type StreamDockIncomingEvent =
  | 'willAppear'
  | 'willDisappear'
  | 'keyUp'
  | 'keyDown'
  | 'dialRotate'
  | 'dialDown'
  | 'sendToPlugin'
  | 'didReceiveSettings'
  | 'didReceiveGlobalSettings'
  | 'propertyInspectorDidAppear'
  | 'propertyInspectorDidDisappear'
  | 'applicationDidLaunch'
  | 'applicationDidTerminate'
  | 'systemDidWakeUp'
  | 'titleParametersDidChange';

/**
 * Events sent to StreamDock
 */
export type StreamDockOutgoingEvent =
  | 'setImage'
  | 'setTitle'
  | 'setState'
  | 'showAlert'
  | 'showOk'
  | 'setSettings'
  | 'setGlobalSettings'
  | 'getSettings'
  | 'getGlobalSettings'
  | 'openUrl'
  | 'logMessage'
  | 'sendToPropertyInspector';

// ============================================================================
// Message Types
// ============================================================================

/**
 * Base message from StreamDock
 */
export interface StreamDockMessage<T = unknown> {
  event: StreamDockIncomingEvent;
  action: string;
  context: string;
  payload: T;
}

/**
 * Outgoing message to StreamDock
 */
export interface StreamDockOutMessage<T = unknown> {
  event: StreamDockOutgoingEvent;
  context: string;
  payload: T;
}

// ============================================================================
// Payload Types
// ============================================================================

/**
 * Coordinates on StreamDock device
 */
export interface Coordinates {
  column: number;
  row: number;
}

/**
 * Payload for willAppear/willDisappear events
 */
export interface AppearPayload<S = Record<string, unknown>> {
  settings: S;
  coordinates: Coordinates;
  state?: number;
  isInMultiAction?: boolean;
}

/**
 * Payload for didReceiveSettings
 */
export interface SettingsPayload<S = Record<string, unknown>> {
  settings: S;
  coordinates?: Coordinates;
}

/**
 * Payload for keyUp/keyDown events
 */
export interface KeyPayload<S = Record<string, unknown>> {
  settings: S;
  coordinates: Coordinates;
  state?: number;
  userDesiredState?: number;
  isInMultiAction?: boolean;
}

/**
 * Payload for sendToPlugin (from Property Inspector)
 */
export interface SendToPluginPayload {
  event?: string;
  [key: string]: unknown;
}

/**
 * Payload for setImage
 */
export interface SetImagePayload {
  image: string | null;
  target?: 0 | 1 | 2;
  state?: number;
}

/**
 * Payload for setTitle
 */
export interface SetTitlePayload {
  title: string;
  target?: 0 | 1 | 2;
  state?: number;
}

// ============================================================================
// Action Handler Interface
// ============================================================================

/**
 * Standard action handler interface
 * Each action module should implement these handlers
 */
export interface ActionHandlers<S = Record<string, unknown>> {
  /**
   * Called when action appears on StreamDock
   */
  onWillAppear: (context: string, payload: AppearPayload<S>) => void;

  /**
   * Called when action disappears from StreamDock
   */
  onWillDisappear: (context: string) => void;

  /**
   * Called when key is released
   */
  onKeyUp: (context: string, payload: KeyPayload<S>) => void;

  /**
   * Called when Property Inspector sends data
   * @returns true if handled, false otherwise
   */
  onSendToPlugin: (context: string, payload: SendToPluginPayload) => boolean;

  /**
   * Called when Property Inspector appears
   */
  onPropertyInspectorDidAppear: (context: string) => void;

  /**
   * Called when settings are received
   */
  onDidReceiveSettings: (context: string, payload: SettingsPayload<S>) => void;

  /**
   * Called when settings are updated (convenience handler)
   */
  onSettingsUpdate: (context: string, settings: S) => void;
}

// ============================================================================
// Context Data
// ============================================================================

/**
 * Base context data stored for each action instance
 */
export interface BaseContextData<S = Record<string, unknown>> {
  settings: S;
  action: string;
}

// ============================================================================
// Plugin Info
// ============================================================================

/**
 * Application info passed to connectElgatoStreamDeckSocket
 */
export interface ApplicationInfo {
  application: {
    language: string;
    platform: string;
    platformVersion: string;
    version: string;
  };
  plugin: {
    uuid: string;
    version: string;
  };
  devicePixelRatio: number;
  colors: {
    buttonPressedBackgroundColor: string;
    buttonPressedBorderColor: string;
    buttonPressedTextColor: string;
    disabledColor: string;
    highlightColor: string;
    mouseDownColor: string;
  };
  devices: Array<{
    id: string;
    name: string;
    size: { columns: number; rows: number };
    type: number;
  }>;
}

// ============================================================================
// WebSocket Helper Types
// ============================================================================

/**
 * Registration message sent to StreamDock on connect
 */
export interface RegisterMessage {
  event: string;
  uuid: string;
}
