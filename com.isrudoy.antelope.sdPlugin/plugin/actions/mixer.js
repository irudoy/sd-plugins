/**
 * Mixer Action for Antelope Control Plugin
 *
 * Controls Zen Quadro mixer channels: fader, mute, solo.
 * Supports both Keypad (press) and Knob (dial rotation) controllers.
 */

const { log, MIXER_ACTION } = require('../lib/common');
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
  renderMixerKeypad,
  renderMixerKnob,
  renderConnecting,
  renderNotConnected,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} MixerSettings
 * @property {number} busId - Bus ID 0-3
 * @property {number} channelId - Channel ID 0-31
 * @property {string} pressAction - Action on press: mute, solo
 * @property {string} dialAction - Action on dial: fader, none
 * @property {number} faderStep - Fader step per tick (1, 2, 4)
 */

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_SETTINGS = {
  busId: 0,
  channelId: 1,
  pressAction: 'mute',
  dialAction: 'fader',
  faderStep: 1,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get settings with defaults
 * @param {Record<string, unknown>} [settings]
 * @returns {MixerSettings}
 */
function getSettingsWithDefaults(settings = {}) {
  return {
    busId: typeof settings.busId === 'number' ? settings.busId : DEFAULT_SETTINGS.busId,
    channelId:
      typeof settings.channelId === 'number' ? settings.channelId : DEFAULT_SETTINGS.channelId,
    pressAction: /** @type {string} */ (settings.pressAction) || DEFAULT_SETTINGS.pressAction,
    dialAction: /** @type {string} */ (settings.dialAction) || DEFAULT_SETTINGS.dialAction,
    faderStep:
      typeof settings.faderStep === 'number' ? settings.faderStep : DEFAULT_SETTINGS.faderStep,
  };
}

/**
 * Update button for all mixer action contexts
 */
function updateAllButtons() {
  const state = antelopeManager.getState();
  const contexts = getAllContexts();

  for (const [context, data] of Object.entries(contexts)) {
    if (data.action !== MIXER_ACTION) continue;

    const settings = getSettingsWithDefaults(
      /** @type {Record<string, unknown>} */ (data.settings)
    );
    const controller = data.controller || 'Keypad';

    if (!state || !antelopeManager.isConnected()) {
      const image = renderNotConnected(controller);
      setImage(context, image);
    } else {
      const channel = state.mixer[settings.busId]?.[settings.channelId];
      if (channel) {
        const image =
          controller === 'Knob'
            ? renderMixerKnob(channel, settings.busId, settings.channelId, settings)
            : renderMixerKeypad(channel, settings.busId, settings.channelId, settings);
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
  if (!data || data.action !== MIXER_ACTION) return;

  const state = antelopeManager.getState();
  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));
  const controller = data.controller || 'Keypad';

  if (!state || !antelopeManager.isConnected()) {
    const image = renderNotConnected(controller);
    setImage(context, image);
  } else {
    const channel = state.mixer[settings.busId]?.[settings.channelId];
    if (channel) {
      const image =
        controller === 'Knob'
          ? renderMixerKnob(channel, settings.busId, settings.channelId, settings)
          : renderMixerKeypad(channel, settings.busId, settings.channelId, settings);
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
  log('[Mixer] willAppear', context, controller);

  setContext(context, {
    action: MIXER_ACTION,
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
  log('[Mixer] willDisappear', context);

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
  log('[Mixer] didReceiveSettings', context, settings);

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
  log('[Mixer] keyUp', context);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (!antelopeManager.isConnected()) {
    log('[Mixer] Not connected, ignoring keyUp');
    return;
  }

  switch (settings.pressAction) {
    case 'mute':
      antelopeManager.toggleMixerMute(settings.busId, settings.channelId);
      break;

    case 'solo':
      antelopeManager.toggleMixerSolo(settings.busId, settings.channelId);
      break;

    default:
      log('[Mixer] Unknown pressAction:', settings.pressAction);
  }
}

/**
 * Handle dial rotation (Knob only)
 * @param {string} context
 * @param {number} ticks - Number of ticks rotated (positive = clockwise)
 */
function onDialRotate(context, ticks) {
  log('[Mixer] dialRotate', context, ticks);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (settings.dialAction !== 'fader') {
    return;
  }

  if (!antelopeManager.isConnected()) {
    return;
  }

  // Use optimistic update for responsive dial
  // Fader is attenuation: 0 = loud (0dB), 90 = quiet (-inf)
  // Clockwise (positive ticks) should decrease attenuation (louder)
  const delta = ticks * settings.faderStep;
  const newFader = antelopeManager.adjustFaderOptimistic(settings.busId, settings.channelId, delta);

  log(`[Mixer] Fader adjusted to: ${newFader}`);
}

/**
 * Handle dial press (Knob only)
 * @param {string} context
 */
function onDialPress(context) {
  log('[Mixer] dialPress', context);
  onKeyUp(context);
}

/**
 * Handle propertyInspectorDidAppear
 * @param {string} context
 */
function onPropertyInspectorDidAppear(context) {
  log('[Mixer] PI appeared', context);
  setCurrentPI(MIXER_ACTION, context);

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
  log('[Mixer] PI disappeared', context);
  clearCurrentPI(context);
}

/**
 * Handle sendToPlugin
 * @param {string} context
 * @param {Record<string, unknown>} payload
 */
function onSendToPlugin(context, payload) {
  log('[Mixer] sendToPlugin', payload);

  const event = payload.event;

  switch (event) {
    case 'getStatus':
      sendToPropertyInspector({
        event: 'status',
        connected: antelopeManager.isConnected(),
      });
      break;

    case 'getChannelNames':
      sendToPropertyInspector({
        event: 'channelNames',
        names: antelopeManager.getChannelNames(),
      });
      break;
  }
}

// ============================================================
// Manager Event Handlers
// ============================================================

antelopeManager.on('connected', () => {
  log('[Mixer] Manager connected');
  updateAllButtons();
});

antelopeManager.on('disconnected', () => {
  log('[Mixer] Manager disconnected');
  updateAllButtons();
});

antelopeManager.on('stateChanged', () => {
  log('[Mixer] State changed');
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
