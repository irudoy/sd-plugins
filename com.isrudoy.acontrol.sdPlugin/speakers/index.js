/**
 * Speakers Property Inspector
 * Configuration for Adam Audio speaker control.
 */

const $local = false;

const $back = false;

/**
 * Update UI visibility based on settings
 */
function updateVisibility() {
  const dialAction = document.getElementById('dialAction');
  const volumeStepRow = document.getElementById('volumeStepRow');

  // Show volume step only when dial action is 'volume'
  if (volumeStepRow && dialAction) {
    volumeStepRow.style.display = dialAction.value === 'volume' ? '' : 'none';
  }
}

// Initialize PI with event handlers
const piInit = AControlPI.init({
  onStatusUpdate: function () {
    // Status updated, no additional action needed
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

// Add change listeners to update visibility
document.addEventListener('DOMContentLoaded', function () {
  const dialAction = document.getElementById('dialAction');

  if (dialAction) {
    dialAction.addEventListener('change', updateVisibility);
  }

  // Initial visibility update
  updateVisibility();
});
