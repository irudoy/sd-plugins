/**
 * Output Action for Antelope Control Plugin
 *
 * Controls Zen Quadro outputs: volume, mute, DIM.
 * Supports both Keypad (press) and Knob (dial rotation) controllers.
 */

const { log, OUTPUT_ACTION } = require('../lib/common');
const {
  setContext,
  getContext,
  deleteContext,
  getAllContexts,
  setCurrentPI,
  clearCurrentPI,
} = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const { antelopeManager } = require('../lib/antelope-manager');
const {
  renderOutputKeypad,
  renderOutputKnob,
  renderConnecting,
  renderNotConnected,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} OutputSettings
 * @property {number} outputId - Output ID 0-5
 * @property {string} pressAction - Action on press: mute, dim
 * @property {string} dialAction - Action on dial: volume, none
 * @property {number} volumeStep - Volume step per tick (1, 5, 10)
 */

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_SETTINGS = {
  outputId: 0,
  pressAction: 'mute',
  dialAction: 'volume',
  volumeStep: 5,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get settings with defaults
 * @param {Record<string, unknown>} [settings]
 * @returns {OutputSettings}
 */
function getSettingsWithDefaults(settings = {}) {
  return {
    outputId: typeof settings.outputId === 'number' ? settings.outputId : DEFAULT_SETTINGS.outputId,
    pressAction: /** @type {string} */ (settings.pressAction) || DEFAULT_SETTINGS.pressAction,
    dialAction: /** @type {string} */ (settings.dialAction) || DEFAULT_SETTINGS.dialAction,
    volumeStep:
      typeof settings.volumeStep === 'number' ? settings.volumeStep : DEFAULT_SETTINGS.volumeStep,
  };
}

/**
 * Update button for all output action contexts
 */
function updateAllButtons() {
  const state = antelopeManager.getState();
  const contexts = getAllContexts();

  for (const [context, data] of Object.entries(contexts)) {
    if (data.action !== OUTPUT_ACTION) continue;

    const settings = getSettingsWithDefaults(
      /** @type {Record<string, unknown>} */ (data.settings)
    );
    const controller = data.controller || 'Keypad';

    if (!state || !antelopeManager.isConnected()) {
      const image = renderNotConnected(controller);
      setImage(context, image);
    } else {
      const output = state.outputs[settings.outputId];
      if (output) {
        const image =
          controller === 'Knob'
            ? renderOutputKnob(output, settings.outputId, settings)
            : renderOutputKeypad(output, settings.outputId, settings);
        setImage(context, image);
      }
    }
  }
}

/**
 * Update single button
 * @param {string} context
 */
function updateButton(context) {
  const data = getContext(context);
  if (!data || data.action !== OUTPUT_ACTION) return;

  const state = antelopeManager.getState();
  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));
  const controller = data.controller || 'Keypad';

  if (!state || !antelopeManager.isConnected()) {
    const image = renderNotConnected(controller);
    setImage(context, image);
  } else {
    const output = state.outputs[settings.outputId];
    if (output) {
      const image =
        controller === 'Knob'
          ? renderOutputKnob(output, settings.outputId, settings)
          : renderOutputKeypad(output, settings.outputId, settings);
      setImage(context, image);
    }
  }
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle willAppear event
 * @param {string} context
 * @param {Record<string, unknown>} settings
 * @param {'Keypad' | 'Knob'} controller
 */
function onWillAppear(context, settings, controller) {
  log('[Output] willAppear', context, controller);

  setContext(context, {
    action: OUTPUT_ACTION,
    settings,
    controller,
  });

  antelopeManager.addRef();

  if (antelopeManager.isConnected() && antelopeManager.getState()) {
    updateButton(context);
  } else {
    const image = renderConnecting(controller);
    setImage(context, image);
  }
}

/**
 * Handle willDisappear event
 * @param {string} context
 */
function onWillDisappear(context) {
  log('[Output] willDisappear', context);

  deleteContext(context);
  clearCurrentPI(context);
  antelopeManager.removeRef();
}

/**
 * Handle didReceiveSettings event
 * @param {string} context
 * @param {Record<string, unknown>} settings
 */
function onDidReceiveSettings(context, settings) {
  log('[Output] didReceiveSettings', context, settings);

  const data = getContext(context);
  if (data) {
    data.settings = settings;
    updateButton(context);
  }
}

/**
 * Handle keyUp event (press/click)
 * @param {string} context
 */
function onKeyUp(context) {
  log('[Output] keyUp', context);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (!antelopeManager.isConnected()) {
    log('[Output] Not connected, ignoring keyUp');
    return;
  }

  switch (settings.pressAction) {
    case 'mute':
      antelopeManager.toggleMute(settings.outputId);
      break;

    case 'dim':
      antelopeManager.toggleDim(settings.outputId);
      break;

    default:
      log('[Output] Unknown pressAction:', settings.pressAction);
  }
}

/**
 * Handle dial rotation (Knob only)
 * @param {string} context
 * @param {number} ticks - Number of ticks rotated (positive = clockwise)
 */
function onDialRotate(context, ticks) {
  log('[Output] dialRotate', context, ticks);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (settings.dialAction !== 'volume') {
    return;
  }

  if (!antelopeManager.isConnected()) {
    return;
  }

  // Use optimistic update for responsive dial
  // Volume is attenuation: 0 = 0dB (loud), 96 = -inf (silent)
  // Positive delta (clockwise) should decrease attenuation (louder)
  const delta = ticks * settings.volumeStep;
  const newVolume = antelopeManager.adjustVolumeOptimistic(settings.outputId, delta);

  log(`[Output] Volume adjusted to: ${newVolume}`);
}

/**
 * Handle dial press (Knob only)
 * @param {string} context
 */
function onDialPress(context) {
  log('[Output] dialPress', context);
  onKeyUp(context);
}

/**
 * Handle propertyInspectorDidAppear
 * @param {string} context
 */
function onPropertyInspectorDidAppear(context) {
  log('[Output] PI appeared', context);
  setCurrentPI(OUTPUT_ACTION, context);

  sendToPropertyInspector({
    event: 'status',
    connected: antelopeManager.isConnected(),
  });
}

/**
 * Handle propertyInspectorDidDisappear
 * @param {string} context
 */
function onPropertyInspectorDidDisappear(context) {
  log('[Output] PI disappeared', context);
  clearCurrentPI(context);
}

/**
 * Handle sendToPlugin
 * @param {string} context
 * @param {Record<string, unknown>} payload
 */
function onSendToPlugin(context, payload) {
  log('[Output] sendToPlugin', payload);

  const event = payload.event;

  switch (event) {
    case 'getStatus':
      sendToPropertyInspector({
        event: 'status',
        connected: antelopeManager.isConnected(),
      });
      break;
  }
}

// ============================================================
// Manager Event Handlers
// ============================================================

antelopeManager.on('connected', () => {
  log('[Output] Manager connected');
  updateAllButtons();
});

antelopeManager.on('disconnected', () => {
  log('[Output] Manager disconnected');
  updateAllButtons();
});

antelopeManager.on('stateChanged', () => {
  log('[Output] State changed');
  updateAllButtons();
});

// ============================================================
// Exports
// ============================================================

module.exports = {
  onWillAppear,
  onWillDisappear,
  onDidReceiveSettings,
  onKeyUp,
  onDialRotate,
  onDialPress,
  onPropertyInspectorDidAppear,
  onPropertyInspectorDidDisappear,
  onSendToPlugin,
};
