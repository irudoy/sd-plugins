/**
 * Speakers Action for A Control Plugin
 *
 * Universal action for controlling Adam Audio A-Series speakers.
 * Supports both Keypad (press) and Knob (dial rotation) controllers.
 */

const { log, SPEAKERS_ACTION } = require('../lib/common');
const {
  setContext,
  getContext,
  deleteContext,
  getAllContexts,
  setCurrentPI,
  clearCurrentPI,
  addDialTicks,
  clearDialDebounce,
} = require('../lib/state');
const { setImage, sendToPropertyInspector } = require('../lib/websocket');
const { speakerManager } = require('../lib/speaker-manager');
const {
  renderKeypadState,
  renderKnobState,
  renderConnecting,
  renderNotConfigured,
} = require('../lib/draw-common');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} SpeakersSettings
 * @property {string} pressAction - Action on press: mute, dim, sleep, input, voicing, input_rca, input_xlr, voicing_pure, voicing_unr, voicing_ext
 * @property {string} dialAction - Action on dial: volume, none
 * @property {number} volumeStep - Volume step in 0.5dB units (1, 2, 4)
 * @property {number} dimLevel - DIM reduction in dB (-10, -20, -30)
 */

/**
 * @typedef {import('../lib/state').SpeakerState} SpeakerState
 */

// ============================================================
// Default Settings
// ============================================================

const DEFAULT_SETTINGS = {
  pressAction: 'mute',
  dialAction: 'volume',
  volumeStep: 2, // 1dB per tick (2 * 0.5dB)
  dimLevel: -20,
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get settings with defaults
 * @param {Record<string, unknown>} [settings]
 * @returns {SpeakersSettings}
 */
function getSettingsWithDefaults(settings = {}) {
  return {
    pressAction: /** @type {string} */ (settings.pressAction) || DEFAULT_SETTINGS.pressAction,
    dialAction: /** @type {string} */ (settings.dialAction) || DEFAULT_SETTINGS.dialAction,
    volumeStep: /** @type {number} */ (settings.volumeStep) || DEFAULT_SETTINGS.volumeStep,
    dimLevel: /** @type {number} */ (settings.dimLevel) || DEFAULT_SETTINGS.dimLevel,
  };
}

/**
 * Update button for all contexts
 */
function updateAllButtons() {
  const state = speakerManager.getState();
  const contexts = getAllContexts();
  const contextCount = Object.keys(contexts).length;

  log(
    `[Speakers] updateAllButtons: ${contextCount} contexts, connected=${speakerManager.isConnected()}, state=${!!state}`
  );

  for (const [context, data] of Object.entries(contexts)) {
    if (data.action !== SPEAKERS_ACTION) continue;

    const settings = getSettingsWithDefaults(
      /** @type {Record<string, unknown>} */ (data.settings)
    );

    if (!state || !speakerManager.isConnected()) {
      log(`[Speakers] Rendering not configured for ${context}`);
      const image = renderNotConfigured(data.controller || 'Keypad', settings);
      setImage(context, image);
    } else {
      log(`[Speakers] Rendering state for ${context}: muted=${state.muted}, level=${state.level}`);
      const image =
        data.controller === 'Knob'
          ? renderKnobState(state, settings)
          : renderKeypadState(state, settings);
      setImage(context, image);
    }
  }
}

/**
 * Update single button
 * @param {string} context
 */
function updateButton(context) {
  const data = getContext(context);
  if (!data || data.action !== SPEAKERS_ACTION) return;

  const state = speakerManager.getState();
  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (!state || !speakerManager.isConnected()) {
    const image = renderNotConfigured(data.controller || 'Keypad', settings);
    setImage(context, image);
  } else {
    const image =
      data.controller === 'Knob'
        ? renderKnobState(state, settings)
        : renderKeypadState(state, settings);
    setImage(context, image);
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
  log('[Speakers] willAppear', context, controller);

  // Store context data
  setContext(context, {
    action: SPEAKERS_ACTION,
    settings,
    controller,
  });

  // Add reference to speaker manager
  speakerManager.addRef();

  // If already connected with state, show it immediately (no "Connecting" flash)
  if (speakerManager.isConnected() && speakerManager.getState()) {
    updateButton(context);
  } else {
    // Show connecting state only when truly connecting
    const image = renderConnecting(controller, settings);
    setImage(context, image);
  }
}

/**
 * Handle willDisappear event
 * @param {string} context
 */
function onWillDisappear(context) {
  log('[Speakers] willDisappear', context);

  clearDialDebounce(context);
  deleteContext(context);
  clearCurrentPI(context);

  // Remove reference from speaker manager
  speakerManager.removeRef();
}

/**
 * Handle didReceiveSettings event
 * @param {string} context
 * @param {Record<string, unknown>} settings
 */
function onDidReceiveSettings(context, settings) {
  log('[Speakers] didReceiveSettings', context, settings);

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
async function onKeyUp(context) {
  log('[Speakers] keyUp', context);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (!speakerManager.isConnected()) {
    log('[Speakers] Not connected, ignoring keyUp');
    return;
  }

  try {
    switch (settings.pressAction) {
      case 'mute':
        await speakerManager.toggleMute();
        break;

      case 'dim':
        // Convert dB to level units (each unit = 0.5dB)
        await speakerManager.toggleDim(settings.dimLevel * 2);
        break;

      case 'sleep':
        await speakerManager.toggleSleep();
        break;

      case 'input':
        await speakerManager.cycleInput();
        break;

      case 'input_rca':
        await speakerManager.setInput(0);
        break;

      case 'input_xlr':
        await speakerManager.setInput(1);
        break;

      case 'voicing':
        await speakerManager.cycleVoicing();
        break;

      case 'voicing_pure':
        await speakerManager.setVoicing(0);
        break;

      case 'voicing_unr':
        await speakerManager.setVoicing(1);
        break;

      case 'voicing_ext':
        await speakerManager.setVoicing(2);
        break;

      default:
        log('[Speakers] Unknown pressAction:', settings.pressAction);
    }
  } catch (err) {
    log('[Speakers] keyUp error:', err);
  }
}

/**
 * Handle dial rotation (Knob only)
 * @param {string} context
 * @param {number} ticks - Number of ticks rotated (positive = clockwise)
 */
function onDialRotate(context, ticks) {
  log('[Speakers] dialRotate', context, ticks);

  const data = getContext(context);
  if (!data) return;

  const settings = getSettingsWithDefaults(/** @type {Record<string, unknown>} */ (data.settings));

  if (settings.dialAction !== 'volume') {
    return;
  }

  if (!speakerManager.isConnected()) {
    return;
  }

  // Optimistic UI update immediately
  const delta = ticks * settings.volumeStep;
  const newLevel = speakerManager.adjustLevelOptimistic(delta);
  log(`[Speakers] Optimistic level: ${newLevel}`);

  // Debounce the actual API call
  addDialTicks(
    context,
    ticks,
    async () => {
      try {
        // Send current level to speakers (state is already updated optimistically)
        const currentLevel = speakerManager.getState()?.level ?? 0;
        await speakerManager.setLevel(currentLevel);
      } catch (err) {
        log('[Speakers] setLevel error:', err);
        // On error, re-fetch actual state from speaker
        await speakerManager.fetchState();
      }
    },
    150
  );
}

/**
 * Handle dial press (Knob only)
 * @param {string} context
 */
async function onDialPress(context) {
  log('[Speakers] dialPress', context);
  // Dial press acts the same as keyUp
  await onKeyUp(context);
}

/**
 * Handle propertyInspectorDidAppear
 * @param {string} context
 */
function onPropertyInspectorDidAppear(context) {
  log('[Speakers] PI appeared', context);
  setCurrentPI(SPEAKERS_ACTION, context);

  // Send current state to PI
  const speakerNames = speakerManager.getSpeakerNames();
  sendToPropertyInspector({
    event: 'speakerStatus',
    connected: speakerManager.isConnected(),
    speakers: speakerNames,
  });
}

/**
 * Handle propertyInspectorDidDisappear
 * @param {string} context
 */
function onPropertyInspectorDidDisappear(context) {
  log('[Speakers] PI disappeared', context);
  clearCurrentPI(context);
}

/**
 * Handle sendToPlugin
 * @param {string} context
 * @param {Record<string, unknown>} payload
 */
async function onSendToPlugin(context, payload) {
  log('[Speakers] sendToPlugin', payload);

  const event = payload.event;

  switch (event) {
    case 'getStatus':
      sendToPropertyInspector({
        event: 'speakerStatus',
        connected: speakerManager.isConnected(),
        speakers: speakerManager.getSpeakerNames(),
      });
      break;

    case 'refreshDiscovery':
      sendToPropertyInspector({
        event: 'speakerStatus',
        connected: false,
        speakers: [],
        discovering: true,
      });

      await speakerManager.startDiscovery();

      sendToPropertyInspector({
        event: 'speakerStatus',
        connected: speakerManager.isConnected(),
        speakers: speakerManager.getSpeakerNames(),
      });
      break;

    case 'blinkLED':
      if (speakerManager.isConnected()) {
        try {
          await speakerManager.blinkLED();
        } catch (err) {
          log('[Speakers] blinkLED error:', err);
        }
      }
      break;
  }
}

// ============================================================
// Speaker Manager Event Handlers
// ============================================================

speakerManager.on('connected', () => {
  log('[Speakers] Manager connected');
  updateAllButtons();
});

speakerManager.on('disconnected', () => {
  log('[Speakers] Manager disconnected');
  updateAllButtons();
});

speakerManager.on('stateChanged', () => {
  log('[Speakers] State changed');
  updateAllButtons();
});

speakerManager.on('discovered', (speakers) => {
  log('[Speakers] Discovered speakers:', speakers);
  // Send update to PI if open
  sendToPropertyInspector({
    event: 'speakerStatus',
    connected: speakerManager.isConnected(),
    speakers: speakerManager.getSpeakerNames(),
  });
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
