/**
 * Unifi Network Plugin for StreamDock
 * VPN Status Action - Node.js implementation
 * @module plugin/index
 */

const { exec } = require('child_process');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../types/streamdock').StreamDockMessage} StreamDockMessage
 * @typedef {import('../../types/streamdock').AppearPayload} AppearPayload
 * @typedef {import('../../types/streamdock').KeyPayload} KeyPayload
 * @typedef {import('../../types/streamdock').SettingsPayload} SettingsPayload
 * @typedef {import('../../types/streamdock').SendToPluginPayload} SendToPluginPayload
 */

/**
 * Unifi VPN settings
 * @typedef {Object} UnifiSettings
 * @property {string} [controllerUrl] - Unifi controller URL
 * @property {string} [apiKey] - API key
 * @property {string} [selectedVpn] - Selected VPN ID
 * @property {number|string} [updateInterval] - Update interval in seconds
 */

/**
 * VPN client from Unifi API
 * @typedef {Object} VpnClient
 * @property {string} id - VPN ID
 * @property {string} name - VPN name
 * @property {string} networkId - Network config ID
 * @property {boolean} enabled - Whether VPN is enabled
 */

/**
 * VPN connection status from Unifi API
 * @typedef {Object} VpnConnection
 * @property {string} [network_id] - Network ID
 * @property {string} [networkId] - Alternative network ID field
 * @property {string} [id] - Connection ID
 * @property {string} [status] - Connection status (CONNECTED, CONNECTING, etc.)
 * @property {boolean} [connected] - Connection state
 * @property {string} [remote_ip] - Remote IP address
 * @property {string} [ip] - Alternative IP field
 * @property {string} [local_ip] - Local IP address
 * @property {number} [assoc_time] - Connection start timestamp
 * @property {number} [rx_rate_bps] - RX rate in bytes/second
 * @property {number} [tx_rate_bps] - TX rate in bytes/second
 * @property {number} [rx_bytes_r] - Alternative RX rate
 * @property {number} [tx_bytes_r] - Alternative TX rate
 * @property {number} [rx_rate] - Legacy RX rate field
 * @property {number} [tx_rate] - Legacy TX rate field
 * @property {string} [error_reason] - Error reason (e.g. AUTHENTICATION_FAILURE)
 */

/**
 * Unifi network config API response
 * @typedef {Object} NetworkConfigResponse
 * @property {Array<{_id: string, name?: string, purpose?: string, enabled?: boolean}>} [data]
 */

/**
 * Unifi VPN connections API response
 * @typedef {Object} VpnConnectionsResponse
 * @property {VpnConnection[]} [connections]
 * @property {VpnConnection[]} [data]
 */

/**
 * Combined VPN info
 * @typedef {Object} VpnInfo
 * @property {VpnClient[]} vpns - List of VPN clients
 * @property {VpnConnection[]} status - Connection statuses
 * @property {string} [error] - Error message if any
 */

/**
 * Context data
 * @typedef {Object} ContextData
 * @property {UnifiSettings} [settings] - Action settings
 * @property {string} [action] - Action UUID
 */

// ============================================================
// Configuration
// ============================================================

/** @type {boolean} */
const DEBUG = false;

/** @type {string} */
const logFile = path.join(__dirname, 'plugin.log');

/**
 * Log messages to file (when DEBUG is true)
 * @param {...unknown} args - Values to log
 * @returns {void}
 */
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

/** @type {import('ws').WebSocket|null} */
let websocket = null;

/** @type {Record<string, ContextData>} */
const contexts = {};

/** @type {Record<string, ReturnType<typeof setInterval>>} */
const timers = {};

/** @type {string|null} */
let currentPIAction = null;

/** @type {string|null} */
let currentPIContext = null;

/** @type {Record<string, {vpn: VpnClient, status: VpnConnection | undefined, settings: UnifiSettings}>} */
const vpnStatusCache = {};

/**
 * Connect to StreamDock application
 * @param {string} port - WebSocket port
 * @param {string} uuid - Plugin UUID
 * @param {string} registerEvent - Registration event
 * @param {string} [_info] - Application info (unused)
 * @returns {void}
 */
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info) {
  log('[Unifi] Starting with port:', port, 'uuid:', uuid);

  websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  websocket.on('open', () => {
    log('[Unifi] WebSocket connected');
    if (!websocket) return;
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
 * @param {StreamDockMessage} message - Incoming message
 * @returns {void}
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
 * @param {string} controllerUrl - Controller URL
 * @param {string} apiKey - API key
 * @param {string} endpoint - API endpoint
 * @returns {Promise<unknown>}
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
          const statusCode = res.statusCode ?? 0;
          log('[Unifi] Response status:', statusCode);
          if (statusCode >= 200 && statusCode < 300) {
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
 * @param {string} controllerUrl - Controller URL
 * @param {string} apiKey - API key
 * @returns {Promise<VpnClient[]>}
 */
async function fetchVpnList(controllerUrl, apiKey) {
  try {
    const response = /** @type {NetworkConfigResponse} */ (
      await unifiRequest(controllerUrl, apiKey, '/proxy/network/api/s/default/rest/networkconf')
    );

    log('[Unifi] Network config response:', JSON.stringify(response).substring(0, 500));

    // Filter VPN clients
    const vpnClients = (response.data || [])
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
 * @param {string} controllerUrl - Controller URL
 * @param {string} apiKey - API key
 * @returns {Promise<VpnConnection[]>}
 */
async function fetchVpnStatus(controllerUrl, apiKey) {
  try {
    const response = /** @type {VpnConnectionsResponse} */ (
      await unifiRequest(
        controllerUrl,
        apiKey,
        '/proxy/network/v2/api/site/default/vpn/connections'
      )
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
 * @param {UnifiSettings} settings - Plugin settings
 * @returns {Promise<VpnInfo>}
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
 * @param {VpnConnection[]} statusList - List of VPN statuses
 * @param {string} networkId - Network ID to find
 * @returns {VpnConnection|undefined}
 */
function findVpnStatus(statusList, networkId) {
  return statusList.find(
    (s) => s.network_id === networkId || s.networkId === networkId || s.id === networkId
  );
}

/**
 * Format bytes to human readable
 * @param {number} bytes - Bytes per second
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B/s';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB/s';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
}

/**
 * Format uptime from timestamp
 * @param {number|undefined} assocTime - Association timestamp
 * @returns {string}
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
 * @param {string} vpnName - VPN name
 * @param {VpnConnection} [status] - Connection status
 * @returns {string} Base64 PNG data URL
 */
function drawConnected(vpnName, status) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = '#000000';
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
 * @param {string} vpnName
 */
function drawConnecting(vpnName) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = '#000000';
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
 * @param {string} vpnName
 */
function drawDisconnected(vpnName) {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');

  // Black background
  ctx.fillStyle = '#000000';
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
 * @param {string} message
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
 * @param {string} context
 * @param {UnifiSettings} settings
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
    const isError =
      vpnState === 'CONNECTION_FAILED' || vpnState === 'CONNECTION_ERROR' || vpnState === 'ERROR';

    if (isConnected) {
      imageData = drawConnected(vpn.name, vpnStatus);
    } else if (isConnecting) {
      imageData = drawConnecting(vpn.name);
    } else if (isError) {
      const errorMsg = vpnStatus?.error_reason || 'Connection Failed';
      imageData = drawError(errorMsg.replace(/_/g, ' '));
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
 * @param {string} context
 * @param {UnifiSettings} settings
 */
function startTimer(context, settings = {}) {
  stopTimer(context);

  const updateInterval = parseInt(String(settings.updateInterval)) || 10;
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
 * @param {string} context
 */
function stopTimer(context) {
  if (timers[context]) {
    clearInterval(timers[context]);
    delete timers[context];
  }
}

/**
 * Event: Action appeared on the Stream Deck
 * @param {string} action
 * @param {string} context
 * @param {AppearPayload} payload
 */
function onWillAppear(action, context, payload) {
  const settings = payload?.settings || {};
  contexts[context] = { settings, action };
  startTimer(context, settings);
}

/**
 * Event: Action disappeared from the Stream Deck
 * @param {string} _action
 * @param {string} context
 * @param {AppearPayload} _payload
 */
function onWillDisappear(_action, context, _payload) {
  stopTimer(context);
  delete contexts[context];
  delete vpnStatusCache[context];
}

/**
 * Event: Key pressed
 * @param {string} _action
 * @param {string} _context
 * @param {KeyPayload} _payload
 */
function onKeyDown(_action, _context, _payload) {
  // No action on key down
}

/**
 * Event: Key released - Open VPN settings in browser
 * @param {string} action
 * @param {string} context
 * @param {KeyPayload} payload
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
 * @param {string} action
 * @param {string} context
 * @param {SendToPluginPayload} payload
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
    await testConnection(
      /** @type {string} */ (payload.controllerUrl),
      /** @type {string} */ (payload.apiKey)
    );
    return;
  }

  // Settings update
  /** @type {UnifiSettings} */
  const settings = /** @type {UnifiSettings} */ (payload);
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
 * @param {UnifiSettings} settings
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
 * @param {string} controllerUrl
 * @param {string} apiKey
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
 * @param {string} action
 * @param {string} context
 * @param {Record<string, unknown>} _payload
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
 * @param {string} action
 * @param {string} context
 * @param {SettingsPayload} payload
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
 * @param {string} context
 * @param {string} imageData
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
 * @param {Record<string, unknown>} payload
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
