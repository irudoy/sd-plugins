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
  | 'touchTap'
  | 'dialRotate'
  | 'dialDown'
  | 'dialUp'
  | 'sendToPlugin'
  | 'didReceiveSettings'
  | 'didReceiveGlobalSettings'
  | 'propertyInspectorDidAppear'
  | 'propertyInspectorDidDisappear'
  | 'deviceDidConnect'
  | 'deviceDidDisconnect'
  | 'applicationDidLaunch'
  | 'applicationDidTerminate'
  | 'systemDidWakeUp'
  | 'titleParametersDidChange'
  | 'stopBackground'
  | 'lockScreen'
  | 'unLockScreen';

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
// Event Payload Types (from SDK)
// ============================================================================

/**
 * Detailed payload types for all StreamDock events
 */
export namespace EventPayload {
  /**
   * Payload for didReceiveSettings - action persistent data
   */
  export type didReceiveSettings = {
    action: string;
    event: string;
    device: string;
    context: string;
    payload: {
      settings: Record<string, unknown>;
      coordinates: {
        column: number;
        row: number;
      };
    };
    isInMultiAction: boolean;
  };

  /**
   * Payload for didReceiveGlobalSettings
   */
  export type didReceiveGlobalSettings = {
    event: string;
    payload: {
      settings: Record<string, unknown>;
    };
  };

  /**
   * Payload for applicationDidLaunch
   */
  export type applicationDidLaunch = {
    event: string;
    payload: {
      application: string;
    };
  };

  /**
   * Payload for applicationDidTerminate
   */
  export type applicationDidTerminate = {
    event: string;
    payload: {
      application: string;
    };
  };

  /**
   * Payload for systemDidWakeUp
   */
  export type systemDidWakeUp = {
    event: string;
  };

  /**
   * Payload for stopBackground
   */
  export type stopBackground = {
    event: string;
    device: string;
    source?: string;
  };

  /**
   * Payload for lockScreen/unLockScreen
   */
  export type lockScreen = {
    event: string;
    device: string;
  };

  /**
   * Payload for unRegistrationScreenSaverEvent
   */
  export type unRegistrationScreenSaverEvent = {
    action: string;
    event: string;
    device: string;
    context: string;
  };

  /**
   * Payload for keyUpCord/keyDownCord - coordinate-based key events
   */
  export type keyUpCord = {
    event: string;
    device: string;
    payload: {
      coordinates: {
        x: number;
        y: number;
      };
      size: {
        width: number;
        height: number;
      };
    };
    isInMultiAction: boolean;
  };

  /**
   * Payload for sendUserInfo
   */
  export type sendUserInfo = {
    event: string;
    payload: {
      loginName: string;
      loginID: string;
      loginImageUrl: string;
    };
  };

  /**
   * Payload for keyDown/keyUp/touchTap events
   */
  export type keyDownUpTouchTap = {
    action: string;
    event: string;
    context: string;
    device: string;
    payload: {
      settings: Record<string, unknown>;
      coordinates: {
        column: number;
        row: number;
      };
      state: number;
      userDesiredState: number;
      isInMultiAction: boolean;
    };
  };

  /**
   * Payload for willAppear/willDisappear events
   */
  export type willAppearDisappear = {
    action: string;
    event: string;
    context: string;
    device: string;
    payload: {
      settings: Record<string, unknown>;
      coordinates: {
        column: number;
        row: number;
      };
      state: number;
      isInMultiAction: boolean;
    };
  };

  /**
   * Payload for titleParametersDidChange
   */
  export type titleParametersDidChange = {
    action: string;
    event: string;
    context: string;
    device: string;
    payload: {
      coordinates: {
        column: number;
        row: number;
      };
      settings: Record<string, unknown>;
      state: number;
      title: string;
      titleParameters: {
        fontFamily: string;
        fontSize: number;
        fontStyle: string;
        fontUnderline: boolean;
        showTitle: boolean;
        titleAlignment: string;
        titleColor: string;
      };
    };
  };

  /**
   * Payload for deviceDidConnect/deviceDidDisconnect
   */
  export type deviceDidConnectDisconnect = {
    event: string;
    device: string;
    deviceInfo: {
      name: string;
      type: number;
      size: {
        columns: number;
        rows: number;
      };
    };
  };

  /**
   * Payload for propertyInspectorDidAppear/propertyInspectorDidDisappear
   */
  export type propertyInspectorDidAppearDisappear = {
    action: string;
    event: string;
    context: string;
    device: string;
  };

  /**
   * Payload for sendToPlugin - message from Property Inspector
   */
  export type sendToPlugin = {
    event: string;
    action: string;
    context: string;
    payload: Record<string, unknown>;
  };

  /**
   * Payload for sendToPropertyInspector - message to Property Inspector
   */
  export type sendToPropertyInspector = {
    action: string;
    event: string;
    context: string;
    payload: Record<string, unknown>;
  };

  /**
   * Payload for dialDown/dialUp - knob press events
   */
  export type dialUpDown = {
    action: string;
    event: string;
    device: string;
    context: string;
    payload: {
      controller: 'Knob';
      isInMultiAction: boolean;
      coordinates: {
        column: number;
        row: number;
      };
      userDesiredState: number;
      settings: Record<string, unknown>;
      state: number;
    };
  };

  /**
   * Payload for dialRotate - knob rotation events
   */
  export type dialRotate = {
    action: string;
    event: string;
    device: string;
    context: string;
    payload: {
      pressed: boolean;
      coordinates: {
        column: number;
        row: number;
      };
      settings: Record<string, unknown>;
      ticks: number;
    };
  };
}

// ============================================================================
// Title Parameters
// ============================================================================

/**
 * Title parameters from titleParametersDidChange event
 */
export type TitleParameters =
  EventPayload.titleParametersDidChange['payload']['titleParameters'];

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
  device?: string;
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
// Payload Types (simplified interfaces)
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
 * Payload for dialRotate events
 */
export interface DialRotatePayload<S = Record<string, unknown>> {
  settings: S;
  coordinates: Coordinates;
  ticks: number;
  pressed: boolean;
}

/**
 * Payload for dialDown/dialUp events
 */
export interface DialUpDownPayload<S = Record<string, unknown>> {
  settings: S;
  coordinates: Coordinates;
  controller: 'Knob';
  state: number;
  userDesiredState: number;
  isInMultiAction: boolean;
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

  /**
   * Called when dial/knob is rotated (optional)
   */
  onDialRotate?: (context: string, payload: DialRotatePayload<S>) => void;

  /**
   * Called when dial/knob is pressed down (optional)
   */
  onDialDown?: (context: string, payload: DialUpDownPayload<S>) => void;

  /**
   * Called when dial/knob is released (optional)
   */
  onDialUp?: (context: string, payload: DialUpDownPayload<S>) => void;
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
    font?: string;
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

/**
 * Device info from deviceDidConnect/deviceDidDisconnect
 */
export interface DeviceInfo {
  name: string;
  type: number;
  size: {
    columns: number;
    rows: number;
  };
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

// ============================================================================
// StreamDock Namespace (SDK compatibility)
// ============================================================================

/**
 * StreamDock SDK types for compatibility with official SDK patterns
 */
export namespace StreamDock {
  /**
   * Entry arguments passed to plugin
   */
  export type Argv = [
    port: string,
    uuid: string,
    registerEvent: string,
    info: {
      application: {
        font?: string;
        language: string;
        platform: string;
        platformVersion: string;
        version: string;
      };
      plugin: {
        uuid: string;
        version: string;
      };
    },
    actionInfo?: {
      action: string;
      context: string;
      payload: {
        controller: string;
        coordinates: {
          column: number;
          row: number;
        };
        isInMultiAction: boolean;
        settings: Record<string, unknown>;
        state: number;
      };
    },
  ];

  /**
   * Generic message structure
   */
  export type Message = {
    event: string;
    action?: string;
    context?: string;
    payload?: unknown;
  };

  /**
   * Property Inspector event handlers
   */
  export type ProperMessage = {
    didReceiveSettings?(
      this: ProperMessage,
      data: EventPayload.didReceiveSettings
    ): void;
    didReceiveGlobalSettings?(
      this: ProperMessage,
      data: EventPayload.didReceiveGlobalSettings
    ): void;
    sendToPropertyInspector?(
      this: ProperMessage,
      data: EventPayload.sendToPropertyInspector
    ): void;
  };

  /**
   * Action event handlers
   */
  export type ActionMessage = {
    ActionID?: string;
    didReceiveSettings?(
      this: ActionMessage,
      data: EventPayload.didReceiveSettings
    ): void;
    keyDown?(this: ActionMessage, data: EventPayload.keyDownUpTouchTap): void;
    keyUp?(this: ActionMessage, data: EventPayload.keyDownUpTouchTap): void;
    touchTap?(this: ActionMessage, data: EventPayload.keyDownUpTouchTap): void;
    willAppear?(
      this: ActionMessage,
      data: EventPayload.willAppearDisappear
    ): void;
    willDisappear?(
      this: ActionMessage,
      data: EventPayload.willAppearDisappear
    ): void;
    titleParametersDidChange?(
      this: ActionMessage,
      data: EventPayload.titleParametersDidChange
    ): void;
    propertyInspectorDidAppear?(
      this: ActionMessage,
      data: EventPayload.propertyInspectorDidAppearDisappear
    ): void;
    propertyInspectorDidDisappear?(
      this: ActionMessage,
      data: EventPayload.propertyInspectorDidAppearDisappear
    ): void;
    sendToPlugin?(this: ActionMessage, data: EventPayload.sendToPlugin): void;
    dialDown?(this: ActionMessage, data: EventPayload.dialUpDown): void;
    dialUp?(this: ActionMessage, data: EventPayload.dialUpDown): void;
    dialRotate?(this: ActionMessage, data: EventPayload.dialRotate): void;
  };

  /**
   * Plugin-level event handlers
   */
  export type PluginMessage = {
    deviceDidConnect?(
      this: PluginMessage,
      data: EventPayload.deviceDidConnectDisconnect
    ): void;
    deviceDidDisconnect?(
      this: PluginMessage,
      data: EventPayload.deviceDidConnectDisconnect
    ): void;
    didReceiveGlobalSettings?(
      this: PluginMessage,
      data: EventPayload.didReceiveGlobalSettings
    ): void;
    applicationDidLaunch?(
      this: PluginMessage,
      data: EventPayload.applicationDidLaunch
    ): void;
    applicationDidTerminate?(
      this: PluginMessage,
      data: EventPayload.applicationDidTerminate
    ): void;
    systemDidWakeUp?(
      this: PluginMessage,
      data: EventPayload.systemDidWakeUp
    ): void;
    keyUpCord?(this: PluginMessage, data: EventPayload.keyUpCord): void;
    keyDownCord?(this: PluginMessage, data: EventPayload.keyUpCord): void;
    stopBackground?(this: PluginMessage, data: EventPayload.stopBackground): void;
    lockScreen?(this: PluginMessage, data: EventPayload.lockScreen): void;
    unLockScreen?(this: PluginMessage, data: EventPayload.lockScreen): void;
    sendUserInfo?(this: PluginMessage, data: EventPayload.sendUserInfo): void;
  };
}
