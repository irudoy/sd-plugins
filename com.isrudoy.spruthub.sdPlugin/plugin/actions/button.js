/**
 * Button Action for Sprut.Hub Plugin
 * Controls StatelessProgrammableSwitch devices (doorbell buttons, Aqara buttons, etc.)
 * Uses BaseAction for common functionality
 * @module actions/button
 */

const { log, BUTTON_ACTION, COLORS } = require('../lib/common');
const { BaseAction, SprutHubClient } = require('../lib/base-action');
const { getContext } = require('../lib/state');
const { getClient } = require('../lib/spruthub');
const {
  createButtonCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  CANVAS_CENTER,
  LAYOUT,
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
 * @property {number} [pressType] - 0=single, 1=double, 2=long
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

// Press type names
/** @type {Record<number, string>} */
const PRESS_NAMES = {
  [PRESS_SINGLE]: 'Single',
  [PRESS_DOUBLE]: 'Double',
  [PRESS_LONG]: 'Long',
};

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

/**
 * Get display name
 * @param {ButtonSettings} settings
 * @returns {string}
 */
function getDisplayName(settings) {
  if (settings.customName) return settings.customName;
  if (settings.serviceName && settings.serviceName !== settings.accessoryName) {
    return settings.serviceName;
  }
  return settings.accessoryName || 'Button';
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render button state to button image
 * @param {ButtonSettings} settings
 * @param {ButtonState} state
 * @returns {string}
 */
function renderState(settings, state) {
  const { canvas, ctx } = createButtonCanvas();
  const name = getDisplayName(settings);
  const pressType = settings.pressType ?? PRESS_SINGLE;
  const pressName = PRESS_NAMES[pressType] || 'Single';
  const isPressed = state.pressed === true;

  const iconColor = isPressed ? COLORS.warmYellow : COLORS.white;
  const statusColor = isPressed ? COLORS.warmYellow : COLORS.gray;

  // Button icon
  drawButtonIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, iconColor, isPressed);

  // Name
  drawDeviceName(ctx, name, COLORS.white);

  // Press type
  drawStatusText(ctx, pressName, statusColor);

  // Status bar
  drawStatusBar(ctx, statusColor);

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

  findService: (accessory) => SprutHubClient.findButtonService(accessory),

  extractState: () => {
    // Buttons don't have readable state, just ready status
    return { ready: true };
  },

  renderState,

  // Buttons don't have state changes to listen to
  handleStateChange: (state) => state,

  // Default handleKeyUp is overridden below
  handleKeyUp: async () => null,

  mapSettings: (payload) => ({
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
    pressType: typeof payload.pressType === 'number' ? payload.pressType : PRESS_SINGLE,
  }),
});

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
  const { host, token, serial, accessoryId, serviceId, characteristicId, pressType } = settings;

  if (!host || !token || !serial || !accessoryId) {
    log('[Button] onKeyUp: missing required settings');
    return;
  }

  if (!serviceId || !characteristicId) {
    log('[Button] onKeyUp: missing serviceId or characteristicId');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Button] onKeyUp: client not connected');
      return;
    }

    // Show pressed state for visual feedback
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = { ...ctx.state, pressed: true };
      buttonAction.updateButton(context, settings, /** @type {ButtonState} */ (ctx.state));
    }

    // Send the button press event
    const eventValue = pressType ?? PRESS_SINGLE;
    log('[Button] Triggering button press:', {
      accessoryId,
      serviceId,
      characteristicId,
      eventValue,
    });
    await client.updateCharacteristic(accessoryId, serviceId, characteristicId, eventValue);

    // Reset to ready state after brief delay
    setTimeout(() => {
      const c = getContext(context);
      if (c) {
        c.state = { ...c.state, pressed: false };
        buttonAction.updateButton(context, settings, /** @type {ButtonState} */ (c.state));
      }
    }, 300);
  } catch (err) {
    log('[Button] Error triggering button:', err);
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  ...buttonAction.getExports(),
  onKeyUp, // Override with pressed feedback behavior
};
