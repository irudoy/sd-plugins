/**
 * Canvas drawing utilities for A Control Plugin
 * @module lib/draw-common
 */

const { createCanvas } = require('@napi-rs/canvas');
const {
  CANVAS_SIZE,
  CANVAS_CENTER,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  KNOB_LAYOUT,
  LAYOUT,
  COLORS,
  VOICING_LABELS,
  INPUT_LABELS,
} = require('./common');

// ============================================================
// Canvas Creation
// ============================================================

/**
 * Create a Keypad canvas (144x144)
 * @returns {{canvas: import('@napi-rs/canvas').Canvas, ctx: import('@napi-rs/canvas').SKRSContext2D}}
 */
function createButtonCanvas() {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  return { canvas, ctx };
}

/**
 * Create a Knob canvas (230x144)
 * @returns {{canvas: import('@napi-rs/canvas').Canvas, ctx: import('@napi-rs/canvas').SKRSContext2D}}
 */
function createKnobCanvas() {
  const canvas = createCanvas(KNOB_WIDTH, KNOB_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, KNOB_WIDTH, KNOB_HEIGHT);
  return { canvas, ctx };
}

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw speaker icon
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 * @param {boolean} [muted=false] - Whether to draw mute indicator
 */
function drawSpeakerIcon(ctx, x, y, size, color, muted = false) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Speaker body
  ctx.fillStyle = color;
  ctx.beginPath();
  // Main cabinet rectangle
  ctx.roundRect(-15, -25, 30, 50, 4);
  ctx.fill();

  // Speaker cone (circle)
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.arc(0, 5, 10, 0, Math.PI * 2);
  ctx.fill();

  // Inner cone
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 5, 5, 0, Math.PI * 2);
  ctx.fill();

  // Tweeter (small circle at top)
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.arc(0, -12, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -12, 2, 0, Math.PI * 2);
  ctx.fill();

  // Sound waves (when not muted)
  if (!muted) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // First wave
    ctx.beginPath();
    ctx.arc(20, 0, 8, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();

    // Second wave
    ctx.beginPath();
    ctx.arc(20, 0, 16, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  }

  // Mute indicator (X over speaker)
  if (muted) {
    ctx.strokeStyle = COLORS.muted;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, -20);
    ctx.lineTo(20, 20);
    ctx.moveTo(20, -20);
    ctx.lineTo(-20, 20);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw moon icon (for Sleep)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawMoonIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = color;
  ctx.beginPath();
  // Main moon arc
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();

  // Cut out for crescent
  ctx.fillStyle = COLORS.background;
  ctx.beginPath();
  ctx.arc(12, -8, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw RCA connector icon (single circular plug)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawRcaIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;

  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.stroke();

  // Center pin
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw XLR connector icon (three pins)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawXlrIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;

  // Connector body (circle)
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();

  // Three pins in triangle arrangement
  ctx.beginPath();
  ctx.arc(0, -10, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-9, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(9, 8, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw Pure voicing icon (three straight horizontal lines)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawVoicingPureIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Three straight horizontal lines (flat response)
  const lineY = [-15, 0, 15];
  for (const ly of lineY) {
    ctx.beginPath();
    ctx.moveTo(-22, ly);
    ctx.lineTo(22, ly);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw UNR voicing icon (three wavy horizontal lines)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawVoicingUnrIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Three wavy horizontal lines (dynamic response)
  const lineY = [-15, 0, 15];
  for (const ly of lineY) {
    ctx.beginPath();
    ctx.moveTo(-22, ly);
    ctx.bezierCurveTo(-10, ly - 6, 10, ly + 6, 22, ly);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw Ext voicing icon (three lines with slider knobs)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 */
function drawVoicingExtIcon(ctx, x, y, size, color) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  // Three horizontal lines with slider knobs (adjustable)
  const lineY = [-15, 0, 15];
  const knobX = [8, -10, 5]; // Different positions

  for (let i = 0; i < 3; i++) {
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(-22, lineY[i]);
    ctx.lineTo(22, lineY[i]);
    ctx.stroke();

    // Slider knob
    ctx.beginPath();
    ctx.arc(knobX[i], lineY[i], 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw DIM icon (speaker with reduced/faded waves)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} size - Icon size
 * @param {string} color - Icon color
 * @param {boolean} [dimmed=false] - Whether DIM is active
 */
function drawDimIcon(ctx, x, y, size, color, dimmed = false) {
  const scale = size / 70;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // Speaker body (shifted left)
  ctx.beginPath();
  ctx.moveTo(-22, -8);
  ctx.lineTo(-10, -8);
  ctx.lineTo(0, -18);
  ctx.lineTo(0, 18);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-22, 8);
  ctx.closePath();
  ctx.fill();

  if (dimmed) {
    // When dimmed: single small wave, faded
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(8, 0, 10, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  } else {
    // When not dimmed: two waves
    ctx.beginPath();
    ctx.arc(8, 0, 10, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(8, 0, 18, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================
// Status Bar Drawing
// ============================================================

/**
 * Draw status bar at bottom of keypad button
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} color - Bar color
 * @param {number} [fillPercent=100] - Fill percentage (0-100)
 */
function drawStatusBar(ctx, color, fillPercent = 100) {
  const barWidth = CANVAS_SIZE - 20;
  const barX = 10;

  // Background bar
  ctx.fillStyle = COLORS.gray;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(barX, LAYOUT.statusBarY, barWidth, LAYOUT.statusBarHeight);
  ctx.globalAlpha = 1;

  // Filled portion
  if (fillPercent > 0) {
    ctx.fillStyle = color;
    const filledWidth = (barWidth * Math.min(100, Math.max(0, fillPercent))) / 100;
    ctx.fillRect(barX, LAYOUT.statusBarY, filledWidth, LAYOUT.statusBarHeight);
  }
}

/**
 * Draw volume level bar (-40 to +12 dB)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} level - Level in dB
 * @param {string} color - Bar color
 */
function drawLevelBar(ctx, level, color) {
  // Convert -40..+12 to 0..100%
  const percent = ((level + 40) / 52) * 100;
  drawStatusBar(ctx, color, percent);
}

// ============================================================
// Text Drawing
// ============================================================

/**
 * Draw text centered
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {string} font
 */
function drawCenteredText(ctx, text, x, y, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/**
 * Draw device name text
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} name
 * @param {string} color
 */
function drawDeviceName(ctx, name, color) {
  drawCenteredText(ctx, name, CANVAS_CENTER, LAYOUT.nameY, color, 'bold 16px sans-serif');
}

/**
 * Draw status text (below name)
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} text
 * @param {string} color
 */
function drawStatusText(ctx, text, color) {
  drawCenteredText(ctx, text, CANVAS_CENTER, LAYOUT.statusY, color, 'bold 14px sans-serif');
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Format level for display
 * @param {number} level - Level in integer units (-40 to +12, each unit = 0.5dB)
 * @returns {string}
 */
function formatLevel(level) {
  // Convert level units to dB: level * 0.5
  // -40 → -20dB, 0 → 0dB, +12 → +6dB
  const dB = level * 0.5;
  if (dB >= 0) {
    return `+${dB.toFixed(1)} dB`;
  }
  return `${dB.toFixed(1)} dB`;
}

/** @type {Record<string, string>} */
const ACTION_LABELS = {
  mute: 'Mute',
  dim: 'DIM',
  sleep: 'Sleep',
  input: 'Input',
  input_rca: 'RCA',
  input_xlr: 'XLR',
  voicing: 'Voicing',
  voicing_pure: 'Pure',
  voicing_unr: 'UNR',
  voicing_ext: 'Ext.',
};

/**
 * Check if volume control is available via OCA protocol
 * Volume only works in Ext. voicing (ADV/SoundID mode).
 * In Pure/UNR voicing (Backplate mode), volume is controlled by physical knob.
 * @param {import('./state').SpeakerState} state
 * @returns {boolean}
 */
function isVolumeAvailable(state) {
  return state.voicing === 2; // 2 = Ext. mode (ADV/SoundID)
}

/**
 * Draw icon based on action type
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {string} pressAction
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {import('./state').SpeakerState} state
 */
function drawActionIcon(ctx, pressAction, x, y, size, color, state) {
  switch (pressAction) {
    case 'mute':
      drawSpeakerIcon(ctx, x, y, size, color, state.muted);
      break;
    case 'dim':
      drawDimIcon(ctx, x, y, size, color, state.dimmed);
      break;
    case 'sleep':
      drawMoonIcon(ctx, x, y, size, color);
      break;
    case 'input':
      // Cycle: show current input
      if (state.input === 1) {
        drawXlrIcon(ctx, x, y, size, color);
      } else {
        drawRcaIcon(ctx, x, y, size, color);
      }
      break;
    case 'input_rca':
      drawRcaIcon(ctx, x, y, size, color);
      break;
    case 'input_xlr':
      drawXlrIcon(ctx, x, y, size, color);
      break;
    case 'voicing':
      // Cycle: show current voicing
      if (state.voicing === 2) {
        drawVoicingExtIcon(ctx, x, y, size, color);
      } else if (state.voicing === 1) {
        drawVoicingUnrIcon(ctx, x, y, size, color);
      } else {
        drawVoicingPureIcon(ctx, x, y, size, color);
      }
      break;
    case 'voicing_pure':
      drawVoicingPureIcon(ctx, x, y, size, color);
      break;
    case 'voicing_unr':
      drawVoicingUnrIcon(ctx, x, y, size, color);
      break;
    case 'voicing_ext':
      drawVoicingExtIcon(ctx, x, y, size, color);
      break;
    default:
      drawSpeakerIcon(ctx, x, y, size, color, state.muted);
  }
}

/**
 * Get status text based on action and state
 * @param {string} pressAction
 * @param {import('./state').SpeakerState} state
 * @returns {string}
 */
function getActionStatus(pressAction, state) {
  switch (pressAction) {
    case 'mute':
      return state.muted ? 'Muted' : formatLevel(state.level);
    case 'dim':
      // DIM only works in Advanced mode (Ext. voicing)
      if (!isVolumeAvailable(state)) {
        return 'N/A (Backplate)';
      }
      return state.dimmed ? 'DIM On' : formatLevel(state.level);
    case 'sleep':
      return state.sleeping ? 'Sleeping' : 'Awake';
    case 'input':
    case 'input_rca':
    case 'input_xlr':
      return INPUT_LABELS[state.input] || 'RCA';
    case 'voicing':
    case 'voicing_pure':
    case 'voicing_unr':
    case 'voicing_ext':
      return VOICING_LABELS[state.voicing] || 'Pure';
    default:
      return formatLevel(state.level);
  }
}

/**
 * Render speaker state on Keypad (144x144)
 * @param {import('./state').SpeakerState} state
 * @param {Record<string, unknown>} [settings] - Action settings
 * @returns {string} Base64 PNG data URL
 */
function renderKeypadState(state, settings = {}) {
  const { canvas, ctx } = createButtonCanvas();
  const pressAction = /** @type {string} */ (settings.pressAction) || 'mute';

  // Check if action is unavailable (DIM in Backplate mode)
  const isDimUnavailable = pressAction === 'dim' && !isVolumeAvailable(state);

  // Determine colors based on state
  let iconColor = COLORS.active;
  let textColor = COLORS.white;

  if (state.connecting) {
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  } else if (state.error) {
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  } else if (isDimUnavailable) {
    // DIM unavailable in Backplate mode - gray out
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  } else if (state.muted) {
    iconColor = COLORS.muted;
    textColor = COLORS.gray;
  } else if (state.dimmed) {
    iconColor = COLORS.dim;
  } else if (state.sleeping) {
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  }

  // Draw action-specific icon
  drawActionIcon(ctx, pressAction, CANVAS_CENTER, LAYOUT.iconY, LAYOUT.iconSize, iconColor, state);

  // Draw action name
  const actionLabel = ACTION_LABELS[pressAction] || 'Mute';
  drawDeviceName(ctx, actionLabel, textColor);

  // Draw status based on action
  const statusText = state.connecting
    ? 'Connecting...'
    : state.error
      ? ''
      : getActionStatus(pressAction, state);
  if (statusText) {
    drawStatusText(ctx, statusText, iconColor);
  }

  // Draw level bar (skip if DIM unavailable)
  if (!state.connecting && !state.error && !isDimUnavailable) {
    drawLevelBar(ctx, state.level, iconColor);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Render speaker state on Knob (230x144)
 * @param {import('./state').SpeakerState} state
 * @param {Record<string, unknown>} settings - Action settings
 * @returns {string} Base64 PNG data URL
 */
function renderKnobState(state, settings) {
  const { canvas, ctx } = createKnobCanvas();

  // Check if volume is unavailable (Ext. voicing mode)
  const volumeUnavailable = !isVolumeAvailable(state);

  // Determine colors based on state
  let iconColor = COLORS.active;
  let textColor = COLORS.white;

  if (state.connecting) {
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  } else if (state.error) {
    iconColor = COLORS.gray;
    textColor = COLORS.gray;
  } else if (state.muted) {
    iconColor = COLORS.muted;
    textColor = COLORS.gray;
  } else if (state.dimmed) {
    iconColor = COLORS.dim;
  }

  // Always draw speaker icon for Knob (main function is volume control)
  drawSpeakerIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY,
    KNOB_LAYOUT.iconSize,
    iconColor,
    state.muted
  );

  // Text on right side
  ctx.textAlign = 'left';

  // Line 1: Voicing/Input
  const infoText = `${VOICING_LABELS[state.voicing] || 'Pure'} | ${INPUT_LABELS[state.input] || 'RCA'}`;
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(infoText, KNOB_LAYOUT.nameX, 45);

  // Line 2: Volume level (or Muted / N/A)
  ctx.fillStyle = textColor;
  ctx.font = 'bold 24px sans-serif';
  if (state.connecting) {
    ctx.fillText('Connecting...', KNOB_LAYOUT.nameX, 75);
  } else if (state.error) {
    ctx.fillText('No speakers', KNOB_LAYOUT.nameX, 75);
  } else if (state.muted) {
    ctx.fillStyle = iconColor;
    ctx.fillText('Muted', KNOB_LAYOUT.nameX, 75);
  } else if (volumeUnavailable) {
    ctx.fillStyle = COLORS.gray;
    ctx.fillText('Vol. N/A', KNOB_LAYOUT.nameX, 75);
  } else {
    ctx.fillText(formatLevel(state.level), KNOB_LAYOUT.nameX, 75);
  }

  // Line 3: Status (DIM/action hint)
  ctx.fillStyle = iconColor;
  ctx.font = 'bold 16px sans-serif';
  if (state.muted) {
    // Show level when muted as secondary info
    ctx.fillStyle = COLORS.gray;
    ctx.fillText(formatLevel(state.level), KNOB_LAYOUT.statusX, 105);
  } else if (state.dimmed) {
    ctx.fillText('DIM active', KNOB_LAYOUT.statusX, 105);
  } else if (volumeUnavailable && settings.dialAction === 'volume') {
    ctx.fillStyle = COLORS.gray;
    ctx.fillText('Backplate mode', KNOB_LAYOUT.statusX, 105);
  } else if (settings.dialAction === 'volume') {
    ctx.fillText('Rotate for volume', KNOB_LAYOUT.statusX, 105);
  }

  return canvas.toDataURL('image/png');
}

/**
 * Render connecting state
 * @param {'Keypad' | 'Knob'} controller
 * @param {Record<string, unknown>} [settings] - Action settings
 * @returns {string} Base64 PNG data URL
 */
function renderConnecting(controller, settings = {}) {
  const connectingState = {
    muted: false,
    level: 0,
    voicing: 0,
    input: 0,
    sleeping: false,
    dimmed: false,
    connecting: true,
  };

  if (controller === 'Knob') {
    return renderKnobState(connectingState, settings);
  }

  return renderKeypadState(connectingState, settings);
}

/**
 * Render not configured state
 * @param {'Keypad' | 'Knob'} controller
 * @param {Record<string, unknown>} [settings] - Action settings
 * @returns {string} Base64 PNG data URL
 */
function renderNotConfigured(controller, settings = {}) {
  const pressAction = /** @type {string} */ (settings.pressAction) || 'mute';
  const notConfiguredState = {
    muted: false,
    level: 0,
    voicing: 0,
    input: 0,
    sleeping: false,
    dimmed: false,
  };

  if (controller === 'Knob') {
    const { canvas, ctx } = createKnobCanvas();
    drawActionIcon(
      ctx,
      pressAction,
      KNOB_LAYOUT.iconX,
      KNOB_LAYOUT.iconY,
      KNOB_LAYOUT.iconSize,
      COLORS.gray,
      notConfiguredState
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.gray;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('No speakers', KNOB_LAYOUT.nameX, 65);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Searching...', KNOB_LAYOUT.nameX, 90);

    return canvas.toDataURL('image/png');
  }

  const { canvas, ctx } = createButtonCanvas();
  drawActionIcon(
    ctx,
    pressAction,
    CANVAS_CENTER,
    LAYOUT.iconY,
    LAYOUT.iconSize,
    COLORS.gray,
    notConfiguredState
  );
  drawDeviceName(ctx, 'No speakers', COLORS.gray);
  drawStatusText(ctx, 'Searching...', COLORS.gray);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  createButtonCanvas,
  createKnobCanvas,
  drawSpeakerIcon,
  drawStatusBar,
  drawLevelBar,
  drawCenteredText,
  drawDeviceName,
  drawStatusText,
  formatLevel,
  renderKeypadState,
  renderKnobState,
  renderConnecting,
  renderNotConfigured,
  COLORS,
  LAYOUT,
  KNOB_LAYOUT,
  CANVAS_SIZE,
  CANVAS_CENTER,
  KNOB_WIDTH,
  KNOB_HEIGHT,
};
