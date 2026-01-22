/**
 * Unifi Network Plugin for StreamDock
 * VPN Status Action - Node.js implementation
 */

const { exec } = require('child_process');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Configuration
const DEBUG = false; // Set to true for debug logging

// File-based logging
const logFile = path.join(__dirname, 'plugin.log');
function log(...args) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  try {
    fs.appendFileSync(logFile, message);
  } catch {
    // Ignore write errors
  }
}

let websocket = null;

// Store for action contexts
const contexts = {};
const timers = {};

// Current Property Inspector context (SDK pattern)
let currentPIAction = null;
let currentPIContext = null;

// VPN status cache
const vpnStatusCache = {};

/**
 * Connect to StreamDock application
 */
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info) {
  log('[Unifi] Starting with port:', port, 'uuid:', uuid);

  websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  websocket.on('open', () => {
    log('[Unifi] WebSocket connected');
    websocket.send(
      JSON.stringify({
        event: registerEvent,
        uuid: uuid,
      })
    );
  });

  websocket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    handleMessage(message);
  });

  websocket.on('error', (error) => {
    log('[Unifi] WebSocket error:', error);
  });

  websocket.on('close', () => {
    log('[Unifi] WebSocket closed');
  });
}

/**
 * Handle incoming messages from StreamDock
 */
function handleMessage(message) {
  const { event, action, context, payload } = message;
  log('[Unifi] Received event:', event, 'context:', context);

  switch (event) {
    case 'willAppear':
      onWillAppear(action, context, payload);
      break;
    case 'willDisappear':
      onWillDisappear(action, context, payload);
      break;
    case 'keyUp':
      onKeyUp(action, context, payload);
      break;
    case 'keyDown':
      onKeyDown(action, context, payload);
      break;
    case 'sendToPlugin':
      onSendToPlugin(action, context, payload);
      break;
    case 'didReceiveSettings':
      onDidReceiveSettings(action, context, payload);
      break;
    case 'propertyInspectorDidAppear':
      onPropertyInspectorDidAppear(action, context, payload);
      break;
    case 'propertyInspectorDidDisappear':
      if (currentPIContext === context) {
        currentPIContext = null;
        currentPIAction = null;
      }
      break;
  }
}

/**
 * Make HTTPS request to Unifi API
 */
function unifiRequest(controllerUrl, apiKey, endpoint) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(endpoint, controllerUrl);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
        },
        rejectUnauthorized: false, // Allow self-signed certs
      };

      log('[Unifi] Request:', options.hostname, options.path);

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          log('[Unifi] Response status:', res.statusCode);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (error) => {
        log('[Unifi] Request error:', error.message);
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get list of VPN clients from Unifi controller
 */
async function fetchVpnList(controllerUrl, apiKey) {
  try {
    const response = await unifiRequest(
      controllerUrl,
      apiKey,
      '/proxy/network/api/s/default/rest/networkconf'
    );

    log('[Unifi] Network config response:', JSON.stringify(response).substring(0, 500));

    // Filter VPN clients
    const vpnClients = (response.data || response || [])
      .filter((network) => network.purpose === 'vpn-client')
      .map((vpn) => ({
        id: vpn._id,
        name: vpn.name || 'Unnamed VPN',
        networkId: vpn._id,
        enabled: vpn.enabled !== false,
      }));

    log('[Unifi] Found VPN clients:', vpnClients.length);
    return vpnClients;
  } catch (error) {
    log('[Unifi] Error fetching VPN list:', error.message);
    throw error;
  }
}

/**
 * Get VPN connection status
 */
async function fetchVpnStatus(controllerUrl, apiKey) {
  try {
    const response = await unifiRequest(
      controllerUrl,
      apiKey,
      '/proxy/network/v2/api/site/default/vpn/connections'
    );

    log('[Unifi] VPN status response:', JSON.stringify(response).substring(0, 500));

    // API returns {connections: [...]}
    return response.connections || response.data || [];
  } catch (error) {
    log('[Unifi] Error fetching VPN status:', error.message);
    throw error;
  }
}

/**
 * Get combined VPN info (list + status)
 */
async function getVpnInfo(settings) {
  const { controllerUrl, apiKey } = settings;

  if (!controllerUrl || !apiKey) {
    return { vpns: [], status: [] };
  }

  try {
    const [vpns, status] = await Promise.all([
      fetchVpnList(controllerUrl, apiKey),
      fetchVpnStatus(controllerUrl, apiKey),
    ]);

    return { vpns, status };
  } catch (error) {
    log('[Unifi] Error getting VPN info:', error.message);
    return { vpns: [], status: [], error: error.message };
  }
}

/**
 * Find VPN status by network ID
 */
function findVpnStatus(statusList, networkId) {
  return statusList.find(
    (s) => s.network_id === networkId || s.networkId === networkId || s.id === networkId
  );
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB/s';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
}

/**
 * Format uptime from timestamp
 */
function formatUptime(assocTime) {
  if (!assocTime) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - assocTime;

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  return `${days}d ${hours}h`;
}

/**
 * Draw VPN button - Connected state
 */
function drawConnected(vpnName, status) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Dark green background
  ctx.fillStyle = '#1a3d1a';
  ctx.fillRect(0, 0, 144, 144);

  // VPN name (top)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  let displayName = vpnName || 'VPN';
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '...';
  }
  ctx.fillText(displayName, 72, 22);

  // IP address
  const ip = status?.remote_ip || status?.ip || status?.local_ip || '';
  if (ip) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(ip, 72, 48);
  }

  // Uptime
  const uptime = formatUptime(status?.assoc_time);
  if (uptime) {
    ctx.fillStyle = '#4CAF50';
    ctx.font = '16px sans-serif';
    ctx.fillText(uptime, 72, 72);
  }

  // Traffic stats (API returns rx_rate_bps / tx_rate_bps in bytes per second)
  const rxBytes = status?.rx_rate_bps ?? status?.rx_bytes_r ?? status?.rx_rate ?? 0;
  const txBytes = status?.tx_rate_bps ?? status?.tx_bytes_r ?? status?.tx_rate ?? 0;

  ctx.fillStyle = '#AAAAAA';
  ctx.font = '15px sans-serif';
  ctx.fillText(`↓ ${formatBytes(rxBytes)}`, 72, 100);
  ctx.fillText(`↑ ${formatBytes(txBytes)}`, 72, 120);

  // Status indicator line at bottom
  ctx.fillStyle = '#4CAF50';
  ctx.fillRect(0, 138, 144, 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw VPN button - Connecting state
 */
function drawConnecting(vpnName) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Dark yellow/orange background
  ctx.fillStyle = '#3d3d1a';
  ctx.fillRect(0, 0, 144, 144);

  // VPN name (top)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  let displayName = vpnName || 'VPN';
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '...';
  }
  ctx.fillText(displayName, 72, 24);

  // "Connecting..." (center)
  ctx.fillStyle = '#FFC107';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Connecting...', 72, 70);

  // Status indicator line at bottom
  ctx.fillStyle = '#FFC107';
  ctx.fillRect(0, 138, 144, 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw VPN button - Disconnected state
 */
function drawDisconnected(vpnName) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Dark gray background
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 144, 144);

  // VPN name (top)
  ctx.fillStyle = '#888888';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  let displayName = vpnName || 'VPN';
  if (displayName.length > 14) {
    displayName = displayName.substring(0, 13) + '...';
  }
  ctx.fillText(displayName, 72, 24);

  // "Offline" (center)
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('Offline', 72, 70);

  // Status indicator line at bottom
  ctx.fillStyle = '#444444';
  ctx.fillRect(0, 138, 144, 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw VPN button - Error state
 */
function drawError(message) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Dark red background
  ctx.fillStyle = '#3d1a1a';
  ctx.fillRect(0, 0, 144, 144);

  // "Error" (center)
  ctx.fillStyle = '#F44336';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Error', 72, 60);

  // Error message
  if (message) {
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '12px sans-serif';
    // Wrap text
    const words = message.split(' ');
    let line = '';
    let y = 85;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > 130) {
        ctx.fillText(line.trim(), 72, y);
        line = word + ' ';
        y += 15;
        if (y > 130) break;
      } else {
        line = testLine;
      }
    }
    if (line && y <= 130) {
      ctx.fillText(line.trim(), 72, y);
    }
  }

  // Status indicator line at bottom
  ctx.fillStyle = '#F44336';
  ctx.fillRect(0, 138, 144, 6);

  return canvas.toDataURL('image/png');
}

/**
 * Draw VPN button - Not configured state
 */
function drawNotConfigured() {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Standard background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 144, 144);

  // "Setup" (center)
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Setup', 72, 60);

  // Subtitle
  ctx.fillStyle = '#888888';
  ctx.font = '14px sans-serif';
  ctx.fillText('Open settings', 72, 85);

  return canvas.toDataURL('image/png');
}

/**
 * Update button for a context
 */
async function updateButton(context, settings = {}) {
  const { controllerUrl, apiKey, selectedVpn } = settings;

  // Not configured
  if (!controllerUrl || !apiKey) {
    const imageData = drawNotConfigured();
    setImage(context, imageData);
    return;
  }

  // No VPN selected
  if (!selectedVpn) {
    const imageData = drawNotConfigured();
    setImage(context, imageData);
    return;
  }

  try {
    const { vpns, status, error } = await getVpnInfo(settings);

    if (error) {
      const imageData = drawError(error);
      setImage(context, imageData);
      return;
    }

    // Find selected VPN
    const vpn = vpns.find((v) => v.id === selectedVpn);
    if (!vpn) {
      const imageData = drawError('VPN not found');
      setImage(context, imageData);
      return;
    }

    // Find VPN status
    const vpnStatus = findVpnStatus(status, vpn.networkId);

    // Cache for quick access
    vpnStatusCache[context] = { vpn, status: vpnStatus, settings };

    // Draw appropriate state
    let imageData;
    const vpnState = vpnStatus?.status?.toUpperCase();
    const isConnected = vpnState === 'CONNECTED' || vpnStatus?.connected === true;
    const isConnecting = vpnState === 'CONNECTING' || vpnState === 'RECONNECTING';

    if (isConnected) {
      imageData = drawConnected(vpn.name, vpnStatus);
    } else if (isConnecting) {
      imageData = drawConnecting(vpn.name);
    } else {
      imageData = drawDisconnected(vpn.name);
    }

    setImage(context, imageData);
  } catch (error) {
    log('[Unifi] Error updating button:', error.message);
    const imageData = drawError(error.message);
    setImage(context, imageData);
  }
}

/**
 * Start update timer for a context
 */
function startTimer(context, settings = {}) {
  stopTimer(context);

  const updateInterval = parseInt(settings.updateInterval) || 10;
  const interval = updateInterval * 1000;

  // Initial update
  updateButton(context, settings);

  timers[context] = setInterval(() => {
    const currentSettings = contexts[context]?.settings || settings;
    updateButton(context, currentSettings);
  }, interval);
}

/**
 * Stop update timer for a context
 */
function stopTimer(context) {
  if (timers[context]) {
    clearInterval(timers[context]);
    delete timers[context];
  }
}

/**
 * Event: Action appeared on the Stream Deck
 */
function onWillAppear(action, context, payload) {
  const settings = payload?.settings || {};
  contexts[context] = { settings, action };
  startTimer(context, settings);
}

/**
 * Event: Action disappeared from the Stream Deck
 */
function onWillDisappear(_action, context, _payload) {
  stopTimer(context);
  delete contexts[context];
  delete vpnStatusCache[context];
}

/**
 * Event: Key pressed
 */
function onKeyDown(_action, _context, _payload) {
  // No action on key down
}

/**
 * Event: Key released - Open VPN settings in browser
 */
function onKeyUp(action, context, payload) {
  const settings = payload?.settings || contexts[context]?.settings || {};
  const controllerUrl = settings.controllerUrl;
  const selectedVpn = settings.selectedVpn;

  if (controllerUrl && selectedVpn) {
    // Open VPN client settings page
    const vpnUrl = `${controllerUrl}/network/default/settings/vpn/client/form/${selectedVpn}`;
    exec(`open "${vpnUrl}"`, (error) => {
      if (error) {
        log('[Unifi] Error opening URL:', error.message);
      }
    });
  } else if (controllerUrl) {
    // Fallback to controller main page
    exec(`open "${controllerUrl}"`, (error) => {
      if (error) {
        log('[Unifi] Error opening URL:', error.message);
      }
    });
  }
}

/**
 * Event: Message from Property Inspector
 */
async function onSendToPlugin(action, context, payload) {
  // Store action if not already stored
  if (!contexts[context]) {
    contexts[context] = { action };
  } else if (!contexts[context].action) {
    contexts[context].action = action;
  }

  currentPIAction = action;
  currentPIContext = context;

  if (payload && payload.event === 'getVpnList') {
    // Property Inspector requesting VPN list
    const settings = contexts[context]?.settings || {};
    await sendVpnList(settings);
    return;
  }

  if (payload && payload.event === 'testConnection') {
    // Test connection with provided credentials
    await testConnection(payload.controllerUrl, payload.apiKey);
    return;
  }

  // Settings update
  const settings = payload;
  if (contexts[context]) {
    contexts[context].settings = settings;
  } else {
    contexts[context] = { settings, action };
  }

  updateButton(context, settings);
  startTimer(context, settings);
}

/**
 * Send VPN list to Property Inspector
 */
async function sendVpnList(settings) {
  try {
    const { vpns, error } = await getVpnInfo(settings);

    if (error) {
      sendToPropertyInspector({
        event: 'error',
        message: error,
      });
      return;
    }

    sendToPropertyInspector({
      event: 'vpnList',
      vpns: vpns,
    });
  } catch (error) {
    sendToPropertyInspector({
      event: 'error',
      message: error.message,
    });
  }
}

/**
 * Test connection from Property Inspector
 */
async function testConnection(controllerUrl, apiKey) {
  try {
    const vpns = await fetchVpnList(controllerUrl, apiKey);

    sendToPropertyInspector({
      event: 'testResult',
      success: true,
      vpns: vpns,
    });
  } catch (error) {
    sendToPropertyInspector({
      event: 'testResult',
      success: false,
      error: error.message,
    });
  }
}

/**
 * Event: Property Inspector appeared
 */
async function onPropertyInspectorDidAppear(action, context, _payload) {
  currentPIAction = action;
  currentPIContext = context;

  if (!contexts[context]) {
    contexts[context] = { action };
  } else if (!contexts[context].action) {
    contexts[context].action = action;
  }

  // Send VPN list if we have settings
  const settings = contexts[context]?.settings || {};
  if (settings.controllerUrl && settings.apiKey) {
    await sendVpnList(settings);
  }
}

/**
 * Event: Settings received
 */
function onDidReceiveSettings(action, context, payload) {
  const settings = payload?.settings || {};
  if (contexts[context]) {
    contexts[context].settings = settings;
    if (!contexts[context].action) {
      contexts[context].action = action;
    }
  } else {
    contexts[context] = { settings, action };
  }

  updateButton(context, settings);
  startTimer(context, settings);
}

/**
 * Send setImage to StreamDock
 */
function setImage(context, imageData) {
  if (!imageData) {
    log('[Unifi] setImage called with null imageData');
    return;
  }
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'setImage',
        context: context,
        payload: {
          image: imageData,
          target: 0,
        },
      })
    );
  }
}

/**
 * Send to Property Inspector (SDK pattern)
 */
function sendToPropertyInspector(payload) {
  if (!currentPIContext || !currentPIAction) {
    return;
  }

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'sendToPropertyInspector',
        action: currentPIAction,
        context: currentPIContext,
        payload: payload,
      })
    );
  }
}

// Export for StreamDock
module.exports = { connectElgatoStreamDeckSocket };

// Parse command line arguments and start
if (process.argv.length > 2) {
  const args = process.argv.slice(2);
  let port, uuid, registerEvent, info;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-port':
        port = args[++i];
        break;
      case '-pluginUUID':
        uuid = args[++i];
        break;
      case '-registerEvent':
        registerEvent = args[++i];
        break;
      case '-info':
        info = args[++i];
        break;
    }
  }

  if (port && uuid && registerEvent) {
    connectElgatoStreamDeckSocket(port, uuid, registerEvent, info);
  }
}
