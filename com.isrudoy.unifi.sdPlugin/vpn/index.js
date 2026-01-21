/**
 * VPN Status - Property Inspector
 * Using StreamDock SDK pattern
 */

// SDK configuration
const $local = false;  // No localization
const $back = false;   // Auto-show UI when settings received

// DOM elements cache
const $dom = {
    main: $('.sdpi-wrapper'),
    controllerUrl: $('#controllerUrl'),
    apiKey: $('#apiKey'),
    selectedVpn: $('#selectedVpn'),
    updateInterval: $('#updateInterval'),
    updateIntervalLabel: $('#updateIntervalLabel'),
    testButton: $('#testButton'),
    statusMessage: $('#statusMessage')
};

// VPN list storage
let vpnList = [];

/**
 * StreamDock event handlers - SDK pattern
 */
const $propEvent = {
    /**
     * Called when settings are received from StreamDock
     */
    didReceiveSettings(data) {
        const settings = data.settings || {};
        loadSettings(settings);

        // If we have credentials, request VPN list
        if (settings.controllerUrl && settings.apiKey) {
            $websocket.sendToPlugin({ event: 'getVpnList' });
        }
    },

    /**
     * Called when plugin sends data to PI
     */
    sendToPropertyInspector(data) {
        if (!data) return;

        switch (data.event) {
            case 'vpnList':
                vpnList = data.vpns || [];
                populateVpnList();
                showStatus('Found ' + vpnList.length + ' VPN client(s)', 'success');
                break;

            case 'testResult':
                if (data.success) {
                    showStatus('Connection successful!', 'success');
                    vpnList = data.vpns || [];
                    populateVpnList();
                } else {
                    showStatus('Error: ' + (data.error || 'Unknown error'), 'error');
                }
                enableTestButton();
                break;

            case 'error':
                showStatus('Error: ' + (data.message || 'Unknown error'), 'error');
                break;
        }

        if (data.settings) {
            loadSettings(data.settings);
        }
    },

    didReceiveGlobalSettings(data) {
        // Global settings received
    }
};

/**
 * Populate VPN dropdown with list from plugin
 */
function populateVpnList() {
    const select = $dom.selectedVpn;
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Select VPN --</option>';

    if (vpnList.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No VPN clients found';
        option.disabled = true;
        select.appendChild(option);
        return;
    }

    vpnList.forEach(vpn => {
        const option = document.createElement('option');
        option.value = vpn.id;
        option.textContent = vpn.name;
        select.appendChild(option);
    });

    // Restore previous selection if exists
    if (currentValue && vpnList.some(v => v.id === currentValue)) {
        select.value = currentValue;
    } else if (typeof $settings !== 'undefined' && $settings && $settings.selectedVpn) {
        select.value = $settings.selectedVpn;
    }
}

/**
 * Load settings into UI
 */
function loadSettings(settings) {
    if (settings.controllerUrl !== undefined && $dom.controllerUrl) {
        $dom.controllerUrl.value = settings.controllerUrl;
    }

    if (settings.apiKey !== undefined && $dom.apiKey) {
        $dom.apiKey.value = settings.apiKey;
    }

    if (settings.selectedVpn !== undefined && $dom.selectedVpn) {
        $dom.selectedVpn.value = settings.selectedVpn;
    }

    if (settings.updateInterval !== undefined && $dom.updateInterval) {
        $dom.updateInterval.value = settings.updateInterval;
        updateIntervalLabel();
    }
}

/**
 * Save settings to StreamDock
 */
function saveSettings() {
    if (typeof $settings === 'undefined' || !$settings) {
        return;
    }

    // Update settings via proxy (auto-saves)
    $settings.controllerUrl = $dom.controllerUrl?.value?.trim() || '';
    $settings.apiKey = $dom.apiKey?.value || '';
    $settings.selectedVpn = $dom.selectedVpn?.value || '';
    $settings.updateInterval = parseInt($dom.updateInterval?.value) || 10;

    // Also send to plugin for immediate update
    if (typeof $websocket === 'undefined' || !$websocket) {
        return;
    }
    $websocket.sendToPlugin({
        controllerUrl: $settings.controllerUrl,
        apiKey: $settings.apiKey,
        selectedVpn: $settings.selectedVpn,
        updateInterval: $settings.updateInterval
    });
}

/**
 * Test connection to Unifi controller
 */
function testConnection() {
    const controllerUrl = $dom.controllerUrl?.value?.trim();
    const apiKey = $dom.apiKey?.value;

    if (!controllerUrl) {
        showStatus('Please enter Controller URL', 'error');
        return;
    }

    if (!apiKey) {
        showStatus('Please enter API Key', 'error');
        return;
    }

    showStatus('Testing connection...', 'info');
    disableTestButton();

    if (typeof $websocket === 'undefined' || !$websocket) {
        showStatus('WebSocket not connected', 'error');
        enableTestButton();
        return;
    }

    $websocket.sendToPlugin({
        event: 'testConnection',
        controllerUrl: controllerUrl,
        apiKey: apiKey
    });

    // Timeout for test
    setTimeout(() => {
        if ($dom.testButton?.disabled) {
            showStatus('Connection timeout', 'error');
            enableTestButton();
        }
    }, 15000);
}

/**
 * Refresh VPN list from plugin
 */
function refreshVpnList() {
    if (typeof $websocket === 'undefined' || !$websocket) {
        return;
    }
    showStatus('Refreshing VPN list...', 'info');
    $websocket.sendToPlugin({ event: 'getVpnList' });
}

/**
 * Show status message
 */
function showStatus(message, type) {
    if (!$dom.statusMessage) return;

    $dom.statusMessage.textContent = message;
    $dom.statusMessage.className = 'status-message status-' + type;
    $dom.statusMessage.style.display = 'block';

    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            if ($dom.statusMessage.textContent === message) {
                $dom.statusMessage.style.display = 'none';
            }
        }, 5000);
    }
}

/**
 * Disable test button during test
 */
function disableTestButton() {
    if ($dom.testButton) {
        $dom.testButton.disabled = true;
        $dom.testButton.textContent = 'Testing...';
    }
}

/**
 * Enable test button after test
 */
function enableTestButton() {
    if ($dom.testButton) {
        $dom.testButton.disabled = false;
        $dom.testButton.textContent = 'Test Connection';
    }
}

/**
 * Update interval label
 */
function updateIntervalLabel() {
    const interval = $dom.updateInterval?.value || '10';
    if ($dom.updateIntervalLabel) {
        $dom.updateIntervalLabel.textContent = interval + ' sec';
    }
}

/**
 * Set update interval from clickable spans
 */
function setUpdateInterval(value) {
    if ($dom.updateInterval) {
        $dom.updateInterval.value = value;
        updateIntervalLabel();
        saveSettings();
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    updateIntervalLabel();
});
