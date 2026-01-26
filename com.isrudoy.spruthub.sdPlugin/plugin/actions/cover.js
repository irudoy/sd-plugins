/**
 * Cover (WindowCovering) Action for Sprut.Hub Plugin
 * Uses BaseAction for common functionality
 * @module actions/cover
 */

const { COVER_ACTION } = require('../lib/common');
const { BaseAction, SprutHub, mapBaseSettings } = require('../lib/base-action');
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
 * @typedef {Object} CoverSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {number} [accessoryId]
 * @property {string} [accessoryName]
 * @property {number} [serviceId]
 * @property {string} [serviceName]
 * @property {number} [targetPositionCharId] - TargetPosition characteristic ID
 * @property {number} [currentPositionCharId] - CurrentPosition characteristic ID
 * @property {string} [customName]
 * @property {string} [action] - toggle | open | close
 */

/**
 * @typedef {Object} CoverState
 * @property {number} position - Current position (0-100)
 * @property {number} [targetPosition]
 * @property {string} [error]
 * @property {boolean} [connecting]
 * @property {boolean} [offline]
 */

// Cover colors
const COVER_COLORS = {
  open: '#4CAF50',
  partial: COLORS.warmYellow,
  closed: COLORS.gray,
};

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw cover/blinds icon
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {number} [position] - Cover position (0-100)
 * @returns {void}
 */
function drawCoverIcon(ctx, x, y, size, color, position = 50) {
  const width = size * 0.6;
  const height = size * 0.5;
  const numSlats = 5;
  const slatHeight = height / numSlats;
  const openSlats = Math.round((position / 100) * numSlats);

  // Window frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - width / 2, y - height / 2, width, height);

  // Slats (from top, closed slats are visible)
  ctx.fillStyle = color;
  for (let i = 0; i < numSlats - openSlats; i++) {
    const slatY = y - height / 2 + i * slatHeight;
    ctx.fillRect(x - width / 2 + 2, slatY + 2, width - 4, slatHeight - 2);
  }

  // Top bar (valance)
  ctx.fillStyle = color;
  ctx.fillRect(x - width / 2 - 4, y - height / 2 - 8, width + 8, 10);
}

/**
 * Get color based on position
 * @param {number} position
 * @returns {string}
 */
function getPositionColor(position) {
  if (position >= 95) return COVER_COLORS.open;
  if (position <= 5) return COVER_COLORS.closed;
  return COVER_COLORS.partial;
}

/**
 * Get position text
 * @param {number} position
 * @param {number} [targetPosition]
 * @returns {string}
 */
function getPositionText(position, targetPosition) {
  if (targetPosition !== undefined && Math.abs(position - targetPosition) > 2) {
    if (targetPosition > position) return 'Closing...';
    return 'Opening...';
  }
  if (position >= 95) return 'Open';
  if (position <= 5) return 'Closed';
  return `${position}%`;
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render cover state to button image
 * @param {CoverSettings} settings
 * @param {CoverState} state
 * @param {string} name
 * @returns {string}
 */
function renderState(settings, state, name) {
  const { canvas, ctx } = createButtonCanvas();
  const position = state.position ?? 0;
  const color = getPositionColor(position);

  drawCoverIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, color, position);
  drawDeviceName(ctx, name, position <= 5 ? COLORS.gray : COLORS.white);
  drawStatusText(ctx, getPositionText(position, state.targetPosition), color);
  drawStatusBar(ctx, color);

  return canvas.toDataURL('image/png');
}

/**
 * Render cover state to knob image (230x144, no status bar)
 * @param {CoverSettings} settings
 * @param {CoverState} state
 * @param {string} _name
 * @returns {string}
 */
function renderKnobState(settings, state, _name) {
  const { canvas, ctx } = createKnobCanvas();
  const position = state.position ?? 0;
  const color = getPositionColor(position);
  const textColor = position <= 5 ? COLORS.gray : COLORS.white;

  // Draw icon on left side
  drawCoverIcon(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, color, position);

  // Room + Device name (2 lines) + status - centered relative to icon (Y=72)
  ctx.textAlign = 'left';
  const maxChars = 11;

  // Parse device name into lines
  const deviceName = settings.accessoryName || 'Cover';
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
  ctx.fillStyle = textColor;
  ctx.font = 'bold 20px sans-serif';
  const name1Y = startY + gapRoomName + nameH;
  ctx.fillText(line1, KNOB_LAYOUT.nameX, name1Y);
  if (line2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, name1Y + nameH);
  }

  // Status
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = color;
  const statusY = name1Y + (line2 ? nameH : 0) + gapNameStatus + statusH;
  ctx.fillText(getPositionText(position, state.targetPosition), KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Action Configuration
// ============================================================

const coverAction = new BaseAction({
  actionType: COVER_ACTION,
  deviceTypeName: 'Cover',
  drawIcon: (ctx, x, y, size, color) => drawCoverIcon(ctx, x, y, size, color, 50),
  initialState: { position: 0 },

  findService: (accessory) => SprutHub.findCoverService(accessory),

  extractState: (_accessory, service, _settings) => {
    const currentPositionChar = SprutHub.findCurrentPositionCharacteristic(service);
    const targetPositionChar = SprutHub.findTargetPositionCharacteristic(service);
    const currentValue = SprutHub.extractValue(currentPositionChar?.control?.value);
    const targetValue = SprutHub.extractValue(targetPositionChar?.control?.value);

    return {
      position: Number(currentValue) || 0,
      targetPosition: Number(targetValue) || 0,
    };
  },

  renderState,
  renderKnobState,

  handleStateChange: (state, settings, characteristicId, value) => {
    const newState = { ...state };
    if (settings.currentPositionCharId === characteristicId) {
      newState.position = Number(value) || 0;
    } else if (settings.targetPositionCharId === characteristicId) {
      newState.targetPosition = Number(value) || 0;
    }
    return newState;
  },

  handleKeyUp: async (client, settings, currentState) => {
    const { accessoryId, serviceId, targetPositionCharId, action } = settings;
    if (accessoryId == null || serviceId == null || targetPositionCharId == null) return null;

    let newPosition;
    if (action === 'open') {
      newPosition = 100;
    } else if (action === 'close') {
      newPosition = 0;
    } else {
      newPosition = (currentState.position ?? 0) > 50 ? 0 : 100;
    }

    await client.updateCharacteristic(accessoryId, serviceId, targetPositionCharId, newPosition);

    return { ...currentState, position: newPosition, targetPosition: newPosition };
  },

  /**
   * Preview dial rotation (UI only, no API call)
   * @param {CoverSettings} _settings
   * @param {CoverState} currentState
   * @param {{ticks: number}} payload
   * @returns {CoverState|null}
   */
  previewDialRotate: (_settings, currentState, payload) => {
    const step = 10;
    const delta = payload.ticks > 0 ? step : -step;
    const newPosition = Math.max(0, Math.min(100, (currentState.position ?? 0) + delta));
    return { ...currentState, position: newPosition, targetPosition: newPosition };
  },

  /**
   * Handle dial rotation for position control (sends to hub)
   * @param {import('../lib/spruthub').SprutHub} client
   * @param {CoverSettings} settings
   * @param {CoverState} currentState
   * @param {{ticks: number}} _payload
   * @returns {Promise<CoverState|null>}
   */
  handleDialRotate: async (client, settings, currentState, _payload) => {
    const { accessoryId, serviceId, targetPositionCharId } = settings;
    if (accessoryId == null || serviceId == null || targetPositionCharId == null) return null;

    // State already updated by preview, just send current value to hub
    const position = currentState.position ?? 0;

    await client.updateCharacteristic(accessoryId, serviceId, targetPositionCharId, position);

    return currentState;
  },

  mapSettings: (payload) => ({
    ...mapBaseSettings(payload),
    targetPositionCharId:
      typeof payload.targetPositionCharId === 'number' ? payload.targetPositionCharId : undefined,
    currentPositionCharId:
      typeof payload.currentPositionCharId === 'number' ? payload.currentPositionCharId : undefined,
  }),
});

// ============================================================
// Exports
// ============================================================

module.exports = coverAction.getExports();
