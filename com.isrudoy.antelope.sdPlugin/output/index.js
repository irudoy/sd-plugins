/**
 * Output Property Inspector
 * Configuration for Antelope output control.
 */

const $local = false;
const $back = false;

/**
 * Update UI visibility based on settings
 */
function updateVisibility() {
  const dialAction = document.getElementById('dialAction');
  const volumeStepRow = document.getElementById('volumeStepRow');

  if (volumeStepRow && dialAction) {
    volumeStepRow.style.display = dialAction.value === 'volume' ? '' : 'none';
  }
}

// Initialize PI with event handlers
const piInit = AntelopePI.init({
  onStatusUpdate: function () {
    // Status updated
  },
});

// Export $propEvent for StreamDock SDK
const $propEvent = {
  didReceiveSettings: function (data) {
    piInit.$propEvent.didReceiveSettings(data);
    updateVisibility();
  },
  sendToPropertyInspector: function (data) {
    piInit.$propEvent.sendToPropertyInspector(data);
  },
};

// Add change listeners
document.addEventListener('DOMContentLoaded', function () {
  const dialAction = document.getElementById('dialAction');

  if (dialAction) {
    dialAction.addEventListener('change', updateVisibility);
  }

  updateVisibility();
});
