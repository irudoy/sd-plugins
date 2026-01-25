/**
 * Scenario - Property Inspector
 * Uses shared SprutHubPI library for connection settings
 * @module scenario/index
 */

/* global document, window, $settings, $websocket, SprutHubPI */

// SDK configuration (required by sd-action.js)
// eslint-disable-next-line no-unused-vars
const $local = false;
// eslint-disable-next-line no-unused-vars
const $back = false;

/** @type {HTMLSelectElement|null} */
let scenarioSelect = null;

/** @type {HTMLInputElement|null} */
let customName = null;

/** @type {Array<{index: string, name: string, desc?: string}>} */
let scenarios = [];

/** @type {ReturnType<typeof SprutHubPI.initConnection>|null} */
let piInit = null;

// ============================================================
// Scenario Selection
// ============================================================

/**
 * Handle scenario selection
 */
function selectScenario() {
  saveScenarioSettings();
}

/**
 * Save scenario-specific settings
 */
function saveScenarioSettings() {
  if (typeof $settings === 'undefined' || !$settings) return;

  $settings.customName = customName?.value || '';

  // Save scenario selection
  const selectedIndex = scenarioSelect?.value || '';
  $settings.scenarioIndex = selectedIndex || undefined;

  // Find scenario name
  if (selectedIndex) {
    const scenario = scenarios.find((s) => s.index === selectedIndex);
    $settings.scenarioName = scenario?.name;
  } else {
    $settings.scenarioName = undefined;
  }
}

/**
 * Load scenario-specific settings
 */
function loadScenarioSettings() {
  if (typeof $settings === 'undefined' || !$settings) return;

  if (customName) customName.value = /** @type {string} */ ($settings.customName) || '';

  // Restore scenario selection if we have scenarios loaded
  if (scenarioSelect && $settings.scenarioIndex) {
    scenarioSelect.value = /** @type {string} */ ($settings.scenarioIndex);
  }
}

/**
 * Populate scenario dropdown
 * @param {Array<{index: string, name: string, desc?: string}>} list
 */
function populateScenarios(list) {
  scenarios = list;

  if (!scenarioSelect) return;

  scenarioSelect.innerHTML = '<option value="">-- Select Scenario --</option>';

  list.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario.index;
    option.textContent = scenario.name || `Scenario ${scenario.index}`;
    if (scenario.desc) {
      option.title = scenario.desc;
    }
    scenarioSelect?.appendChild(option);
  });

  // Restore saved selection
  if (typeof $settings !== 'undefined' && $settings?.scenarioIndex) {
    scenarioSelect.value = /** @type {string} */ ($settings.scenarioIndex);
  }
}

/**
 * Request scenarios from plugin
 */
function loadScenarios() {
  const conn = SprutHubPI.getConnectionSettings();

  if (!conn?.host || !conn?.token || !conn?.serial) {
    return;
  }

  $websocket?.sendToPlugin({
    event: 'getScenarios',
    host: conn.host,
    token: conn.token,
    serial: conn.serial,
  });
}

// Expose globally for HTML onclick
/** @type {Window & {selectScenario?: typeof selectScenario, loadScenarios?: typeof loadScenarios}} */
const win = /** @type {*} */ (window);
win.selectScenario = selectScenario;
win.loadScenarios = loadScenarios;

/**
 * Handle custom sendToPropertyInspector events
 * @param {Record<string, unknown>} data
 * @returns {boolean}
 */
function handleSendToPI(data) {
  if (data.event === 'scenarioList') {
    const list = /** @type {Array<{index: string, name: string, desc?: string}>} */ (
      data.scenarios || []
    );
    populateScenarios(list);
    return true;
  }
  return false;
}

// ============================================================
// Initialization
// ============================================================

// Initialize connection settings using shared library
piInit = SprutHubPI.initConnection({
  onSendToPropertyInspector: handleSendToPI,
});

// Wrap $propEvent to add scenario-specific handling
const basePropEvent = piInit.$propEvent;

// eslint-disable-next-line no-unused-vars
const $propEvent = {
  /**
   * @param {{ settings: Record<string, unknown> }} data
   */
  didReceiveSettings(data) {
    basePropEvent.didReceiveSettings(data);
    loadScenarioSettings();
  },

  /**
   * @param {{ settings: {host?: string, token?: string, serial?: string} }} data
   */
  didReceiveGlobalSettings(data) {
    basePropEvent.didReceiveGlobalSettings(data);
    // Auto-load scenarios when we have connection settings
    const conn = SprutHubPI.getConnectionSettings();
    if (conn?.host && conn?.token && conn?.serial) {
      loadScenarios();
    }
  },

  /**
   * @param {Record<string, unknown>} data
   */
  sendToPropertyInspector(data) {
    basePropEvent.sendToPropertyInspector(data);
  },
};

// Initialize DOM on load
document.addEventListener('DOMContentLoaded', () => {
  scenarioSelect = /** @type {HTMLSelectElement} */ (document.getElementById('scenarioSelect'));
  customName = /** @type {HTMLInputElement} */ (document.getElementById('customName'));
});
