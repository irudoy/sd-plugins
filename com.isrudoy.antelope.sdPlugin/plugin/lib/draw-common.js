/**
 * Canvas drawing utilities for Antelope Control Plugin
 * @module lib/draw-common
 */

const { createCanvas } = require('@napi-rs/canvas');
const {
  CANVAS_SIZE,
  CANVAS_CENTER,
  KNOB_WIDTH,
  KNOB_HEIGHT,
  LAYOUT,
  KNOB_LAYOUT,
  COLORS,
  OUTPUT_SHORT,
  volumeToDB,
  faderToDB,
} = require('./common');
const { antelopeManager } = require('./antelope-manager');

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
// Arc Drawing
// ============================================================

/**
 * Draw volume arc indicator
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Arc radius
 * @param {number} percent - Fill percentage 0-100
 * @param {string} color - Arc color
 * @param {number} [lineWidth=8] - Line width
 */
function drawVolumeArc(ctx, cx, cy, radius, percent, color, lineWidth = 8) {
  const startAngle = 0.75 * Math.PI; // 135 degrees (bottom-left)
  const totalArc = 1.5 * Math.PI; // 270 degrees sweep
  const endAngle = startAngle + totalArc * (percent / 100);

  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Background arc (gray track)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, startAngle + totalArc);
  ctx.strokeStyle = COLORS.darkGray;
  ctx.stroke();

  // Value arc (colored)
  if (percent > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

// ============================================================
// Text Drawing
// ============================================================

/**
 * Draw centered text
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

// ============================================================
// Output Action Rendering
// ============================================================

/**
 * Render output state on Keypad (144x144) with circular arc
 * @param {import('../../antelope/antelope').OutputState} output - Output state
 * @param {number} outputId - Output ID 0-5
 * @param {Record<string, unknown>} [_settings] - Action settings (unused)
 * @returns {string} Base64 PNG data URL
 */
function renderOutputKeypad(output, outputId, _settings = {}) {
  const { canvas, ctx } = createButtonCanvas();

  // Calculate volume percentage (volume is attenuation: 0=loud, 96=quiet/-inf)
  // So we invert: 0 attenuation = 100%, 96 attenuation = 0%
  const volumePercent = Math.max(0, (96 - output.volume) / 96) * 100;

  // Determine colors based on state
  let arcColor = COLORS.green;
  let textColor = COLORS.white;
  let statusText = '';

  if (output.mute) {
    arcColor = COLORS.darkGray;
    textColor = COLORS.red;
    statusText = 'MUTE';
  } else if (output.dim) {
    arcColor = COLORS.orange;
    textColor = COLORS.orange;
    statusText = 'DIM';
  }

  // Draw volume arc
  drawVolumeArc(ctx, CANVAS_CENTER, LAYOUT.arcCenterY, LAYOUT.arcRadius, volumePercent, arcColor);

  // Draw dB value in center of arc
  const dbText = volumeToDB(output.volume);
  drawCenteredText(ctx, dbText, CANVAS_CENTER, LAYOUT.dbY, textColor, 'bold 18px sans-serif');

  // Draw status text (MUTE/DIM) below dB
  if (statusText) {
    drawCenteredText(
      ctx,
      statusText,
      CANVAS_CENTER,
      LAYOUT.statusY,
      textColor,
      'bold 14px sans-serif'
    );
  }

  // Draw output name at bottom
  const outputName = OUTPUT_SHORT[outputId] || `OUT${outputId}`;
  drawCenteredText(
    ctx,
    outputName,
    CANVAS_CENTER,
    LAYOUT.nameY,
    COLORS.gray,
    'bold 16px sans-serif'
  );

  return canvas.toDataURL('image/png');
}

/**
 * Render output state on Knob (230x144) with circular arc
 * @param {import('../../antelope/antelope').OutputState} output - Output state
 * @param {number} outputId - Output ID 0-5
 * @param {Record<string, unknown>} [_settings] - Action settings (unused)
 * @returns {string} Base64 PNG data URL
 */
function renderOutputKnob(output, outputId, _settings = {}) {
  const { canvas, ctx } = createKnobCanvas();

  // Calculate volume percentage (volume is attenuation: 0=loud, 96=quiet/-inf)
  // So we invert: 0 attenuation = 100%, 96 attenuation = 0%
  const volumePercent = Math.max(0, (96 - output.volume) / 96) * 100;

  // Determine colors based on state
  let arcColor = COLORS.green;
  let textColor = COLORS.white;
  let statusText = '';

  if (output.mute) {
    arcColor = COLORS.darkGray;
    textColor = COLORS.red;
    statusText = 'MUTE';
  } else if (output.dim) {
    arcColor = COLORS.orange;
    textColor = COLORS.orange;
    statusText = 'DIM';
  }

  // Draw volume arc on left side
  drawVolumeArc(
    ctx,
    KNOB_LAYOUT.arcCenterX,
    KNOB_LAYOUT.arcCenterY,
    KNOB_LAYOUT.arcRadius,
    volumePercent,
    arcColor,
    KNOB_LAYOUT.arcWidth
  );

  // Draw dB value inside arc
  const dbText = volumeToDB(output.volume);
  drawCenteredText(
    ctx,
    dbText,
    KNOB_LAYOUT.arcCenterX,
    KNOB_LAYOUT.arcCenterY,
    textColor,
    'bold 14px sans-serif'
  );

  // Text on right side
  ctx.textAlign = 'left';

  // Output name (larger)
  const outputName = OUTPUT_SHORT[outputId] || `OUT${outputId}`;
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(outputName, KNOB_LAYOUT.nameX, KNOB_LAYOUT.nameY);

  // Status or additional info
  if (statusText) {
    ctx.fillStyle = textColor;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(statusText, KNOB_LAYOUT.statusX, KNOB_LAYOUT.statusY);
  }

  return canvas.toDataURL('image/png');
}

// ============================================================
// Mixer Action Rendering
// ============================================================

/**
 * Draw fader bar
 * @param {import('@napi-rs/canvas').SKRSContext2D} ctx
 * @param {number} x - Left position
 * @param {number} y - Top position
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} percent - Fill percentage 0-100
 * @param {string} color - Fill color
 */
function drawFaderBar(ctx, x, y, width, height, percent, color) {
  // Background
  ctx.fillStyle = COLORS.darkGray;
  ctx.fillRect(x, y, width, height);

  // Filled portion
  if (percent > 0) {
    const filledWidth = (width * percent) / 100;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, filledWidth, height);
  }
}

/**
 * Render mixer channel on Keypad (144x144)
 * @param {import('../../antelope/antelope').MixerChannelState} channel - Channel state
 * @param {number} busId - Bus ID 0-3
 * @param {number} channelId - Channel ID 0-31
 * @param {Record<string, unknown>} [_settings] - Action settings (unused)
 * @returns {string} Base64 PNG data URL
 */
function renderMixerKeypad(channel, busId, channelId, _settings = {}) {
  const { canvas, ctx } = createButtonCanvas();

  // Calculate fader percentage (fader: 0=0dB loud, 60=-60dB quiet)
  // 0 = 100%, 60 = 0%
  const faderPercent = Math.max(0, Math.min(100, (1 - channel.level / 60) * 100));

  // Determine colors
  let barColor = COLORS.blue;
  let textColor = COLORS.white;

  if (channel.mute) {
    barColor = COLORS.red;
    textColor = COLORS.red;
  } else if (channel.solo) {
    barColor = COLORS.gold;
    textColor = COLORS.gold;
  }

  // Draw vertical fader representation
  const faderWidth = 20;
  const faderHeight = 70;
  const faderX = CANVAS_CENTER - faderWidth / 2;
  const faderY = 25;

  // Background track
  ctx.fillStyle = COLORS.darkGray;
  ctx.fillRect(faderX, faderY, faderWidth, faderHeight);

  // Filled portion (from bottom)
  const filledHeight = (faderHeight * faderPercent) / 100;
  ctx.fillStyle = barColor;
  ctx.fillRect(faderX, faderY + faderHeight - filledHeight, faderWidth, filledHeight);

  // Fader knob
  const knobY = faderY + faderHeight - filledHeight - 3;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(faderX - 3, knobY, faderWidth + 6, 6);

  // Mute/Solo/Link badges
  if (channel.mute) {
    ctx.fillStyle = COLORS.red;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('M', faderX + faderWidth + 8, faderY + 12);
  }
  if (channel.solo) {
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('S', faderX + faderWidth + 8, faderY + 28);
  }
  if (channel.link) {
    ctx.fillStyle = COLORS.yellow;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('L', faderX - 16, faderY + 12);
  }

  // Channel name (from persistence or default)
  const names = antelopeManager.getChannelNames();
  const channelName = names[channelId] || `Ch ${channelId + 1}`;
  drawCenteredText(ctx, channelName, CANVAS_CENTER, 108, COLORS.gray, 'bold 12px sans-serif');

  // dB value
  const dbText = faderToDB(channel.level);
  drawCenteredText(ctx, dbText, CANVAS_CENTER, 124, textColor, 'bold 14px sans-serif');

  // Bottom bar
  drawFaderBar(ctx, 10, 138, CANVAS_SIZE - 20, 4, faderPercent, barColor);

  return canvas.toDataURL('image/png');
}

/**
 * Render mixer channel on Knob (230x144)
 * @param {import('../../antelope/antelope').MixerChannelState} channel - Channel state
 * @param {number} busId - Bus ID 0-3
 * @param {number} channelId - Channel ID 0-31
 * @param {Record<string, unknown>} [_settings] - Action settings (unused)
 * @returns {string} Base64 PNG data URL
 */
function renderMixerKnob(channel, busId, channelId, _settings = {}) {
  const { canvas, ctx } = createKnobCanvas();

  // Calculate fader percentage (fader: 0=0dB loud, 60=-60dB quiet)
  const faderPercent = Math.max(0, Math.min(100, (1 - channel.level / 60) * 100));

  // Determine colors
  let barColor = COLORS.blue;
  let textColor = COLORS.white;

  if (channel.mute) {
    barColor = COLORS.red;
    textColor = COLORS.red;
  } else if (channel.solo) {
    barColor = COLORS.gold;
    textColor = COLORS.gold;
  }

  // Draw vertical fader on left side
  const faderWidth = 24;
  const faderHeight = 100;
  const faderX = 30;
  const faderY = 22;

  // Background track
  ctx.fillStyle = COLORS.darkGray;
  ctx.fillRect(faderX, faderY, faderWidth, faderHeight);

  // Filled portion
  const filledHeight = (faderHeight * faderPercent) / 100;
  ctx.fillStyle = barColor;
  ctx.fillRect(faderX, faderY + faderHeight - filledHeight, faderWidth, filledHeight);

  // Fader knob
  const knobY = faderY + faderHeight - filledHeight - 4;
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(faderX - 4, knobY, faderWidth + 8, 8);

  // Text on right side
  ctx.textAlign = 'left';

  // Channel name (from persistence or default)
  const names = antelopeManager.getChannelNames();
  const channelName = names[channelId] || `Ch ${channelId + 1}`;
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(channelName, 85, 45);

  // dB value
  const dbText = faderToDB(channel.level);
  ctx.fillStyle = textColor;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(dbText, 85, 75);

  // Status
  const statusParts = [];
  if (channel.mute) statusParts.push('MUTE');
  if (channel.solo) statusParts.push('SOLO');
  if (statusParts.length) {
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(statusParts.join(' + '), 85, 105);
  }

  // Link indicator
  if (channel.link) {
    ctx.fillStyle = COLORS.yellow;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LINK', 85, statusParts.length ? 125 : 105);
  }

  return canvas.toDataURL('image/png');
}

// ============================================================
// State Rendering (Connecting, Not Configured, Error)
// ============================================================

/**
 * Render connecting state
 * @param {'Keypad' | 'Knob'} controller - Controller type
 * @returns {string} Base64 PNG data URL
 */
function renderConnecting(controller) {
  if (controller === 'Knob') {
    const { canvas, ctx } = createKnobCanvas();

    // Draw gray arc
    drawVolumeArc(
      ctx,
      KNOB_LAYOUT.arcCenterX,
      KNOB_LAYOUT.arcCenterY,
      KNOB_LAYOUT.arcRadius,
      0,
      COLORS.darkGray,
      KNOB_LAYOUT.arcWidth
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.yellow;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Connecting...', KNOB_LAYOUT.nameX, KNOB_LAYOUT.nameY);

    ctx.fillStyle = COLORS.gray;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Antelope Manager', KNOB_LAYOUT.nameX, KNOB_LAYOUT.statusY);

    return canvas.toDataURL('image/png');
  }

  const { canvas, ctx } = createButtonCanvas();

  // Draw gray arc
  drawVolumeArc(ctx, CANVAS_CENTER, LAYOUT.arcCenterY, LAYOUT.arcRadius, 0, COLORS.darkGray);

  drawCenteredText(ctx, '...', CANVAS_CENTER, LAYOUT.dbY, COLORS.yellow, 'bold 20px sans-serif');
  drawCenteredText(
    ctx,
    'Connecting',
    CANVAS_CENTER,
    LAYOUT.nameY,
    COLORS.gray,
    'bold 14px sans-serif'
  );

  return canvas.toDataURL('image/png');
}

/**
 * Render not connected state
 * @param {'Keypad' | 'Knob'} controller - Controller type
 * @returns {string} Base64 PNG data URL
 */
function renderNotConnected(controller) {
  if (controller === 'Knob') {
    const { canvas, ctx } = createKnobCanvas();

    // Draw gray arc
    drawVolumeArc(
      ctx,
      KNOB_LAYOUT.arcCenterX,
      KNOB_LAYOUT.arcCenterY,
      KNOB_LAYOUT.arcRadius,
      0,
      COLORS.darkGray,
      KNOB_LAYOUT.arcWidth
    );

    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.gray;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('Not Connected', KNOB_LAYOUT.nameX, KNOB_LAYOUT.nameY);

    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('Start Antelope Manager', KNOB_LAYOUT.nameX, KNOB_LAYOUT.statusY);

    return canvas.toDataURL('image/png');
  }

  const { canvas, ctx } = createButtonCanvas();

  // Draw gray arc
  drawVolumeArc(ctx, CANVAS_CENTER, LAYOUT.arcCenterY, LAYOUT.arcRadius, 0, COLORS.darkGray);

  drawCenteredText(ctx, '--', CANVAS_CENTER, LAYOUT.dbY, COLORS.gray, 'bold 20px sans-serif');
  drawCenteredText(
    ctx,
    'No Device',
    CANVAS_CENTER,
    LAYOUT.nameY,
    COLORS.gray,
    'bold 14px sans-serif'
  );

  return canvas.toDataURL('image/png');
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  createButtonCanvas,
  createKnobCanvas,
  drawVolumeArc,
  drawCenteredText,
  drawFaderBar,
  renderOutputKeypad,
  renderOutputKnob,
  renderMixerKeypad,
  renderMixerKnob,

  renderConnecting,
  renderNotConnected,
  COLORS,
  LAYOUT,
  KNOB_LAYOUT,
  CANVAS_SIZE,
  CANVAS_CENTER,
  KNOB_WIDTH,
  KNOB_HEIGHT,
};
