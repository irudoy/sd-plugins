/**
 * Scenario Action for Sprut.Hub Plugin
 * Runs Sprut.Hub automation scenarios
 * @module actions/scenario
 */

const { log, SCENARIO_ACTION } = require('../lib/common');
const { getContext, setContext, deleteContext } = require('../lib/state');
const { getClient } = require('../lib/spruthub');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const {
  createButtonCanvas,
  createKnobCanvas,
  drawStatusBar,
  drawDeviceName,
  drawStatusText,
  drawError,
  drawConnectingWithIcon,
  drawNotConfiguredWithIcon,
  drawKnobError,
  drawKnobConnectingWithIcon,
  drawKnobNotConfiguredWithIcon,
  CANVAS_CENTER,
  LAYOUT,
  KNOB_LAYOUT,
  COLORS,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('@napi-rs/canvas').SKRSContext2D} CanvasContext
 */

/**
 * @typedef {Object} ScenarioSettings
 * @property {string} [host]
 * @property {string} [token]
 * @property {string} [serial]
 * @property {string} [scenarioIndex] - Scenario ID/index
 * @property {string} [scenarioName] - Scenario display name
 * @property {string} [customName] - Custom display name
 */

/**
 * @typedef {Object} ScenarioState
 * @property {boolean} [running] - Currently executing
 * @property {string} [error]
 * @property {boolean} [connecting]
 */

// ============================================================
// Icon Drawing
// ============================================================

/**
 * Draw scenario icon (play button shape)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {boolean} [running]
 * @returns {void}
 */
function drawScenarioIcon(ctx, x, y, size, color, running = false) {
  const triangleSize = size * 0.35;

  ctx.fillStyle = color;
  ctx.beginPath();

  if (running) {
    // Draw pause icon when running
    const barWidth = size * 0.12;
    const barHeight = size * 0.4;
    const gap = size * 0.1;
    ctx.fillRect(x - gap - barWidth, y - barHeight / 2, barWidth, barHeight);
    ctx.fillRect(x + gap, y - barHeight / 2, barWidth, barHeight);
  } else {
    // Draw play triangle
    ctx.moveTo(x - triangleSize * 0.4, y - triangleSize);
    ctx.lineTo(x - triangleSize * 0.4, y + triangleSize);
    ctx.lineTo(x + triangleSize * 0.8, y);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Icon draw function for common utilities (without running param)
 * @param {CanvasContext} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @returns {void}
 */
function drawScenarioIconSimple(ctx, x, y, size, color) {
  drawScenarioIcon(ctx, x, y, size, color, false);
}

// ============================================================
// State Rendering
// ============================================================

/**
 * Render scenario state to button image
 * @param {ScenarioSettings} settings
 * @param {ScenarioState} state
 * @returns {string}
 */
function renderState(settings, state) {
  const { canvas, ctx } = createButtonCanvas();
  const name = settings.customName || settings.scenarioName || 'Scenario';
  const isRunning = state.running === true;

  const iconColor = isRunning ? COLORS.warmYellow : COLORS.white;
  const statusColor = isRunning ? COLORS.warmYellow : COLORS.gray;

  // Scenario icon
  drawScenarioIcon(ctx, CANVAS_CENTER, LAYOUT.bulbY, LAYOUT.bulbSize, iconColor, isRunning);

  // Name
  drawDeviceName(ctx, name, COLORS.white);

  // Status text
  drawStatusText(ctx, isRunning ? 'Running' : 'Ready', statusColor);

  // Status bar
  drawStatusBar(ctx, statusColor);

  return canvas.toDataURL('image/png');
}

/**
 * Render scenario state to knob image (230x144, no status bar)
 * @param {ScenarioSettings} settings
 * @param {ScenarioState} state
 * @returns {string}
 */
function renderKnobState(settings, state) {
  const { canvas, ctx } = createKnobCanvas();
  const name = settings.customName || settings.scenarioName || 'Scenario';
  const isRunning = state.running === true;

  const iconColor = isRunning ? COLORS.warmYellow : COLORS.white;
  const statusColor = isRunning ? COLORS.warmYellow : COLORS.gray;

  // Draw icon on left side
  drawScenarioIcon(
    ctx,
    KNOB_LAYOUT.iconX,
    KNOB_LAYOUT.iconY,
    KNOB_LAYOUT.iconSize,
    iconColor,
    isRunning
  );

  // Device name and status - vertically centered
  ctx.fillStyle = COLORS.white;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const displayName = name || 'Scenario';
  const maxCharsPerLine = 10;
  const lineHeight = 18;
  const statusGap = 8;
  const centerY = KNOB_LAYOUT.iconY + 5;

  // Parse name into lines
  let line1 = '';
  let line2 = '';

  if (displayName.length > maxCharsPerLine) {
    const words = displayName.split(' ');
    for (const word of words) {
      if (line1.length === 0) {
        line1 = word;
      } else if ((line1 + ' ' + word).length <= maxCharsPerLine) {
        line1 += ' ' + word;
      } else {
        line2 += (line2 ? ' ' : '') + word;
      }
    }
    if (line2.length > maxCharsPerLine) {
      line2 = line2.substring(0, maxCharsPerLine - 1) + '…';
    }
  } else {
    line1 = displayName;
  }

  // Calculate total height and starting Y
  const hasLine2 = line2.length > 0;
  const totalHeight = (hasLine2 ? 2 : 1) * lineHeight + statusGap + 20;
  const startY = centerY - totalHeight / 2 + lineHeight / 2;

  // Draw name
  ctx.fillText(line1, KNOB_LAYOUT.nameX, startY);
  if (hasLine2) {
    ctx.fillText(line2, KNOB_LAYOUT.nameX, startY + lineHeight);
  }

  // Status text
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = statusColor;
  const statusY = startY + (hasLine2 ? 2 : 1) * lineHeight + statusGap;
  ctx.fillText(isRunning ? 'Running' : 'Ready', KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}

// ============================================================
// Button Update
// ============================================================

/**
 * Update button image
 * @param {string} context
 * @param {ScenarioSettings} settings
 * @param {ScenarioState} state
 */
function updateButton(context, settings, state) {
  const ctx = getContext(context);
  const isKnob = ctx?.controller === 'Knob';

  if (state.error) {
    setImage(context, isKnob ? drawKnobError(state.error) : drawError(state.error));
  } else if (state.connecting) {
    setImage(
      context,
      isKnob
        ? drawKnobConnectingWithIcon(drawScenarioIconSimple)
        : drawConnectingWithIcon(drawScenarioIconSimple)
    );
  } else if (!settings.scenarioIndex) {
    setImage(
      context,
      isKnob
        ? drawKnobNotConfiguredWithIcon(drawScenarioIconSimple)
        : drawNotConfiguredWithIcon(drawScenarioIconSimple)
    );
  } else {
    setImage(context, isKnob ? renderKnobState(settings, state) : renderState(settings, state));
  }
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle willAppear event
 * @param {string} context
 * @param {import('../../../types/streamdock').AppearPayload} payload
 */
function onWillAppear(context, payload) {
  const settings = /** @type {ScenarioSettings} */ (payload?.settings || {});
  const controller = payload?.controller;

  setContext(context, {
    action: SCENARIO_ACTION,
    settings,
    state: {},
    controller,
  });

  updateButton(context, settings, {});
}

/**
 * Handle willDisappear event
 * @param {string} context
 */
function onWillDisappear(context) {
  deleteContext(context);
}

/**
 * Handle didReceiveSettings event
 * @param {string} context
 * @param {import('../../../types/streamdock').SettingsPayload} payload
 */
function onDidReceiveSettings(context, payload) {
  const settings = /** @type {ScenarioSettings} */ (payload?.settings || {});
  const ctx = getContext(context);

  if (ctx) {
    ctx.settings = settings;
  }

  updateButton(context, settings, /** @type {ScenarioState} */ (ctx?.state || {}));
}

/**
 * Handle settings update from PI
 * @param {string} context
 * @param {Record<string, unknown>} settings
 */
function onSettingsUpdate(context, settings) {
  const scenarioSettings = /** @type {ScenarioSettings} */ (settings);
  const ctx = getContext(context);

  if (ctx) {
    ctx.settings = scenarioSettings;
  }

  updateButton(context, scenarioSettings, /** @type {ScenarioState} */ (ctx?.state || {}));
}

/**
 * Handle propertyInspectorDidAppear event
 * @param {string} _context
 */
function onPropertyInspectorDidAppear(_context) {
  // No special handling needed for scenarios
}

/**
 * Run scenario with visual feedback
 * @param {string} context
 * @param {ScenarioSettings} settings
 */
async function runScenario(context, settings) {
  const { host, token, serial, scenarioIndex } = settings;

  if (!host || !token || !serial) {
    log('[Scenario] Missing connection settings');
    return;
  }

  if (!scenarioIndex) {
    log('[Scenario] No scenario selected');
    return;
  }

  try {
    const client = getClient(host, token, serial);
    if (!client || !client.isConnected()) {
      log('[Scenario] Client not connected');
      return;
    }

    // Show running state
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = /** @type {import('../lib/state').DeviceState} */ ({ running: true });
      updateButton(context, settings, /** @type {ScenarioState} */ (ctx.state));
    }

    // Run the scenario
    log('[Scenario] Running scenario:', scenarioIndex);
    await client.runScenario(scenarioIndex);

    // Reset to ready state after brief delay
    setTimeout(() => {
      const c = getContext(context);
      if (c) {
        c.state = /** @type {import('../lib/state').DeviceState} */ ({ running: false });
        updateButton(context, settings, /** @type {ScenarioState} */ (c.state));
      }
    }, 500);
  } catch (err) {
    log('[Scenario] Error running scenario:', err);
    const ctx = getContext(context);
    if (ctx) {
      ctx.state = { error: 'Error' };
      updateButton(context, settings, /** @type {ScenarioState} */ (ctx.state));
    }
  }
}

/**
 * Handle keyUp event
 * @param {string} context
 * @param {import('../../../types/streamdock').KeyPayload} payload
 */
async function onKeyUp(context, payload) {
  const settings = /** @type {ScenarioSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  await runScenario(context, settings);
}

/**
 * Handle dial rotation
 * @param {string} context
 * @param {import('../../../types/streamdock').DialRotatePayload} payload
 */
async function onDialRotate(context, payload) {
  // Each tick runs the scenario
  const settings = /** @type {ScenarioSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );

  const ticks = payload?.ticks || 0;
  if (ticks === 0) return;

  // Run once per rotation event (not per tick, as scenarios may take time)
  await runScenario(context, settings);
}

/**
 * Handle dial press
 * @param {string} context
 * @param {import('../../../types/streamdock').DialUpDownPayload} payload
 */
async function onDialDown(context, payload) {
  const settings = /** @type {ScenarioSettings} */ (
    payload?.settings || getContext(context)?.settings || {}
  );
  await runScenario(context, settings);
}

/**
 * Fetch scenarios from Sprut.Hub (async helper)
 * @param {string} host
 * @param {string} token
 * @param {string} serial
 */
async function fetchScenarios(host, token, serial) {
  try {
    const client = getClient(host, token, serial);
    if (!client) {
      sendToPropertyInspector({
        event: 'connectionStatus',
        status: 'error',
        message: 'Failed to create client',
      });
      return;
    }

    // Connect if not connected
    if (!client.isConnected()) {
      sendToPropertyInspector({
        event: 'connectionStatus',
        status: 'connecting',
      });
      client.connect();
      await client.waitForConnection();
    }

    // Get scenarios
    const scenarios = await client.getScenarios(false, false);
    sendToPropertyInspector({
      event: 'scenarioList',
      scenarios,
    });
  } catch (err) {
    log('[Scenario] Error getting scenarios:', err);
    sendToPropertyInspector({
      event: 'connectionStatus',
      status: 'error',
      message: err instanceof Error ? err.message : 'Connection error',
    });
  }
}

/**
 * Test connection to Sprut.Hub (async helper)
 * @param {string} host
 * @param {string} token
 * @param {string} serial
 */
async function testConnectionAsync(host, token, serial) {
  try {
    const client = getClient(host, token, serial);
    if (!client) {
      sendToPropertyInspector({
        event: 'connectionStatus',
        status: 'error',
        message: 'Failed to create client',
      });
      return;
    }

    sendToPropertyInspector({
      event: 'connectionStatus',
      status: 'connecting',
    });

    client.connect();
    await client.waitForConnection();

    sendToPropertyInspector({
      event: 'connectionStatus',
      status: 'success',
      message: 'Connected',
    });
  } catch (err) {
    sendToPropertyInspector({
      event: 'connectionStatus',
      status: 'error',
      message: err instanceof Error ? err.message : 'Connection failed',
    });
  }
}

/**
 * Handle sendToPlugin from Property Inspector
 * @param {string} _context
 * @param {Record<string, unknown>} payload
 * @returns {boolean} Whether the event was handled
 */
function onSendToPlugin(_context, payload) {
  const event = payload?.event;

  if (event === 'getScenarios') {
    const { host, token, serial } = /** @type {ScenarioSettings} */ (payload);

    if (!host || !token || !serial) {
      sendToPropertyInspector({
        event: 'connectionStatus',
        status: 'error',
        message: 'Missing connection settings',
      });
      return true;
    }

    // Fire and forget - the async function handles errors internally
    fetchScenarios(host, token, serial);
    return true;
  } else if (event === 'testConnection') {
    const { host, token, serial } = /** @type {ScenarioSettings} */ (payload);

    if (!host || !token || !serial) {
      sendToPropertyInspector({
        event: 'connectionStatus',
        status: 'error',
        message: 'Missing settings',
      });
      return true;
    }

    // Fire and forget - the async function handles errors internally
    testConnectionAsync(host, token, serial);
    return true;
  }

  return false;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  onWillAppear,
  onWillDisappear,
  onDidReceiveSettings,
  onSettingsUpdate,
  onPropertyInspectorDidAppear,
  onKeyUp,
  onDialRotate,
  onDialDown,
  onSendToPlugin,
};
