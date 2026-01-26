/**
 * Button Action for Sprut.Hub Plugin
 * Controls StatelessProgrammableSwitch devices (doorbell buttons, Aqara buttons, etc.)
 * Uses BaseAction for common functionality
 * @module actions/button
 */

const { log, BUTTON_ACTION } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings } = require('../lib/base-action');
const { getContext } = require('../lib/state');
const { getClient } = require('../lib/spruthub');
const {
  createButtonCanvas,
  createKnobCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_LAYOUT,
  COLORS,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('canvas').CanvasRenderingContext2D} CanvasContext
 */

/**
 * @typedef {Object} ButtonSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [characteristicId]
 * @property {string} [customName]
 * @property {string} [customStatus] - Custom status text for knob display
 * @property {number} [pressType] - 0=single, 1=double, 2=long
 * @property {number} [dialLeftServiceId] - Service ID for dial left action
 * @property {string} [dialLeftServiceName] - Service name for dial left action
 * @property {number} [dialLeftCharId] - Characteristic ID for dial left action
 * @property {number} [dialLeftPressType] - 0=single, 1=double, 2=long
 * @property {number} [dialRightServiceId] - Service ID for dial right action
 * @property {string} [dialRightServiceName] - Service name for dial right action
 * @property {number} [dialRightCharId] - Characteristic ID for dial right action
 * @property {number} [dialRightPressType] - 0=single, 1=double, 2=long
 * @property {number} [dialPressServiceId] - Service ID for dial press action
 * @property {string} [dialPressServiceName] - Service name for dial press action
 * @property {number} [dialPressCharId] - Characteristic ID for dial press action
 * @property {number} [dialPressPressType] - 0=single, 1=double, 2=long
 */

/**
 * @typedef {Object} ButtonState
 * @property {boolean} ready
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 * @property {boolean} [pressed]
 */

// Press type constants
const PRESS_SINGLE = 0;
const PRESS_DOUBLE = 1;
const PRESS_LONG = 2;

// Press type names (kept for potential future use)
/** @type {Record<number, string>} */
const _PRESS_NAMES = {
  [PRESS_SINGLE]: 'Single',
  [PRESS_DOUBLE]: 'Double',
  [PRESS_LONG]: 'Long',
};

/**
 * Build dial actions status string for knob display
 * Shows configured button names separated by /
 * @param {ButtonSettings} settings
 * @returns {string}
 */
function buildDialActionsStatus(settings) {
  const parts = [];

  // Left action
  if (settings.dialLeftServiceId && settings.dialLeftCharId) {
    parts.push(settings.dialLeftServiceName || 'Left');
  }

  // Press action
  if (settings.dialPressServiceId && settings.dialPressCharId) {
    parts.push(settings.dialPressServiceName || 'Press');
  }

  // Right action
  if (settings.dialRightServiceId && settings.dialRightCharId) {
    parts.push(settings.dialRightServiceName || 'Right');
  }

  return parts.length > 0 ? parts.join(' / ') : 'Not configured';
}

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw button icon (circular button shape)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [pressed]
 * @returns {void}
 */
function drawButtonIcon(ctx, x, y, size, color, pressed = false) {
  const outerRadius = size * 0.35;
  const innerRadius = size * 0.25;

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle (filled when pressed)
  if (pressed) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render button state to button image
 * @param {ButtonSettings} settings
 * @param {ButtonState} state
 * @param {string} _name
 * @returns {string}
 */
function renderState(settings, state, _name) {
  const { canvas, ctx } = createButtonCanvas();
  const isPressed = state.pressed === true;

  const iconColor = isPressed ? COLORS.warmYellow : COLORS.white;
  const statusColor = isPressed ? COLORS.warmYellow : COLORS.gray;

  // Button icon
  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, iconColor, isPressed);

  // Action name - button/service name (line 1)
  const actionName = settings.serviceName || 'Button';
  drawDeviceName(ctx, actionName, COLORS.white);

  // Device name (line 2)
  const deviceName = settings.accessoryName || '';
  drawStatusText(ctx, deviceName, statusColor);

  // Status bar
  drawStatusBar(ctx, statusColor);

  return canvas.toDataURL('image/png');
}

/**
 * Render button state to knob image (230x144, no status bar)
 * @param {ButtonSettings} settings
 * @param {ButtonState} state
 * @param {string} _name
 * @returns {string}
 */
function renderKnobState(settings, state, _name) {
  const { canvas, ctx } = createKnobCanvas();
  const isPressed = state.pressed === true;

  const iconColor = isPressed ? COLORS.warmYellow : COLORS.white;
  const statusColor = isPressed ? COLORS.warmYellow : COLORS.gray;

  // Build status text: custom > dial actions
  const statusText = settings.customStatus || buildDialActionsStatus(settings);

  // Draw icon on left side
  drawButtonIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY,
    KNOB_LAYOUT.iconSize,
    iconColor,
    isPressed
  );

  // Room + Device name (2 lines) + status - centered relative to icon (Y=72)
  ctx.textAlign = 'left';
  const maxChars = 11;

  // Parse device name into lines
  const deviceName = settings.accessoryName || 'Button';
  let line1 = '';
  let line2 = '';
  if (deviceName.length > maxChars) {
    const words = deviceName.split(' ');
    for (const word of words) {
      if (line1.length === 0) {
        line1 = word;
      } else if ((line1 + ' ' + word).length <= maxChars) {
        line1 += ' ' + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }
    if (line2.length > maxChars) {
      line2 = line2.substring(0, maxChars - 1) + '…';
    }
  } else {
    line1 = deviceName;
  }

  // Calculate total height and center vertically around icon (Y=71)
  const roomH = 14;
  const nameH = 20;
  const statusH = 20;
  const gapRoomName = 6;
  const gapNameStatus = 5;
  const totalHeight = roomH + gapRoomName + nameH + (line2 ? nameH : 0) + gapNameStatus + statusH;
  const startY = KNOB_LAYOUT.iconY - 2 - totalHeight / 2 + roomH;

  // Room name
  let roomName = settings.roomName || '';
  if (roomName.length > maxChars) {
    roomName = roomName.substring(0, maxChars - 1) + '…';
  }
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(roomName, KNOB_LAYOUT.nameX, startY);

  // Device name
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 20px sans-serif';
  const name1Y = startY + gapRoomName + nameH;
  ctx.fillText(line1, KNOB_LAYOUT.nameX, name1Y);
  if (line2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, name1Y + nameH);
  }

  // Status
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = statusColor;
  const maxStatusChars = 11;
  const truncatedStatus =
    statusText.length > maxStatusChars
      ? statusText.substring(0, maxStatusChars - 1) + '…'
      : statusText;
  const statusY = name1Y + (line2 ? nameH : 0) + gapNameStatus + statusH;
  ctx.fillText(truncatedStatus, KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const buttonAction = new BaseAction({
  actionType: BUTTON_ACTION,
  deviceTypeName: 'Button',
  drawIcon: (ctx, x, y, size, color) => drawButtonIcon(ctx, x, y, size, color, false),
  initialState: { ready: false },

  findService: (accessory) => SprutHub.findButtonService(accessory),

  extractState: () => {
    // Buttons don't have readable state, just ready status
    return { ready: true };
  },

  renderState,
  renderKnobState,

  // Buttons don't have state changes to listen to
  handleStateChange: (state) => state,

  // Default handleKeyUp is overridden below
  handleKeyUp: async () => null,

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    pressType: typeof payload.pressType === 'number' ? payload.pressType : PRESS_SINGLE,
    customStatus: typeof payload.customStatus === 'string' ? payload.customStatus : undefined,
    // Dial Left
    dialLeftServiceId:
      typeof payload.dialLeftServiceId === 'number' ? payload.dialLeftServiceId : undefined,
    dialLeftServiceName:
      typeof payload.dialLeftServiceName === 'string' ? payload.dialLeftServiceName : undefined,
    dialLeftCharId: typeof payload.dialLeftCharId === 'number' ? payload.dialLeftCharId : undefined,
    dialLeftPressType:
      typeof payload.dialLeftPressType === 'number' ? payload.dialLeftPressType : PRESS_SINGLE,
    // Dial Right
    dialRightServiceId:
      typeof payload.dialRightServiceId === 'number' ? payload.dialRightServiceId : undefined,
    dialRightServiceName:
      typeof payload.dialRightServiceName === 'string' ? payload.dialRightServiceName : undefined,
    dialRightCharId:
      typeof payload.dialRightCharId === 'number' ? payload.dialRightCharId : undefined,
    dialRightPressType:
      typeof payload.dialRightPressType === 'number' ? payload.dialRightPressType : PRESS_SINGLE,
    // Dial Press
    dialPressServiceId:
      typeof payload.dialPressServiceId === 'number' ? payload.dialPressServiceId : undefined,
    dialPressServiceName:
      typeof payload.dialPressServiceName === 'string' ? payload.dialPressServiceName : undefined,
    dialPressCharId:
      typeof payload.dialPressCharId === 'number' ? payload.dialPressCharId : undefined,
    dialPressPressType:
      typeof payload.dialPressPressType === 'number' ? payload.dialPressPressType : PRESS_SINGLE,
  }),
});

// ============================================================
// Shared Button Press Logic
// ============================================================

/**
 * Trigger a button press event with visual feedback
 * @param {string} context - Action context
 * @param {ButtonSettings} settings - Button settings
 * @param {number} serviceId - Service ID to trigger
 * @param {number} characteristicId - Characteristic ID to trigger
 * @param {number} eventType - Press type (0=single, 1=double, 2=long)
 * @returns {Promise<boolean>} - True if successful
 */
async function triggerButtonPress(context, settings, serviceId, characteristicId, eventType) {
  const { host, token, serial, accessoryId } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Button] triggerButtonPress: missing required settings');
    return false;
  }

  if (!serviceId || !characteristicId) {
    log('[Button] triggerButtonPress: missing serviceId or characteristicId');
    return false;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Button] triggerButtonPress: client not connected');
      return false;
    }

    // Show pressed state for visual feedback
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = { ...ctx.state, pressed: true };
      buttonAction.updateButton(context, settings, /** @type {ButtonState} */ (ctx.state));
    }

    // Send the button press event
    log('[Button] Triggering button press:', {
      accessoryId,
      serviceId,
      characteristicId,
      eventType,
    });
    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, eventType);

    // Reset to ready state after brief delay
    setTimeout(() => {
      const c = getContext(context);
      if (c) {
        c.state = { ...c.state, pressed: false };
        buttonAction.updateButton(context, settings, /** @type {ButtonState} */ (c.state));
      }
    }, 300);

    return true;
  } catch (err) {
    log('[Button] Error triggering button:', err);
    return false;
  }
}

// ============================================================
// Custom onKeyUp - Trigger button with visual feedback
// ============================================================

/**
 * Custom keyUp handler with pressed state feedback
 * @param {string} context - Action context
 * @param {import('../../../types/streamdock').KeyPayload} payload - Event payload
 * @returns {Promise<void>}
 */
async function onKeyUp(context, payload) {
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  const { serviceId, characteristicId } = settings;
  const eventType = settings.pressType ?? PRESS_SINGLE;

  if (!serviceId || !characteristicId) {
    log('[Button] onKeyUp: missing serviceId or characteristicId');
    return;
  }

  await triggerButtonPress(context, settings, serviceId, characteristicId, eventType);
}

// ============================================================
// Dial Handlers
// ============================================================

/**
 * Handle dial rotation - each tick triggers configured button
 * @param {string} context - Action context
 * @param {import('../../../types/streamdock').DialRotatePayload} payload - Dial payload
 * @returns {Promise<void>}
 */
async function onDialRotate(context, payload) {
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );

  const ticks = payload?.ticks || 0;
  if (ticks === 0) return;

  // Get the right dial action settings based on direction
  const isRight = ticks > 0;
  const serviceId = isRight ? settings.dialRightServiceId : settings.dialLeftServiceId;
  const charId = isRight ? settings.dialRightCharId : settings.dialLeftCharId;
  const pressType = isRight ? settings.dialRightPressType : settings.dialLeftPressType;

  // Skip if dial action not configured
  if (!serviceId || !charId) return;

  const eventType = pressType ?? PRESS_SINGLE;

  // Each tick triggers one event
  const tickCount = Math.abs(ticks);
  for (let i = 0; i < tickCount; i++) {
    await triggerButtonPress(context, settings, serviceId, charId, eventType);
  }
}

/**
 * Handle dial press - triggers configured button
 * @param {string} context - Action context
 * @param {import('../../../types/streamdock').DialUpDownPayload} payload - Dial payload
 * @returns {Promise<void>}
 */
async function onDialDown(context, payload) {
  /** @type {ButtonSettings} */
  const settings = /** @type {ButtonSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );

  const { dialPressServiceId, dialPressCharId, dialPressPressType } = settings;

  // Skip if dial press not configured
  if (!dialPressServiceId || !dialPressCharId) return;

  const eventType = dialPressPressType ?? PRESS_SINGLE;
  await triggerButtonPress(context, settings, dialPressServiceId, dialPressCharId, eventType);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  ...buttonAction.getExports(),
  onKeyUp, // Override with pressed feedback behavior
  onDialRotate,
  onDialDown,
};
