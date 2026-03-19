/**
 * WebSocket communication for Antelope Control Plugin
 * @module lib/websocket
 */

const WebSocket = require('ws');
const { log } = require('./common');
const { getCurrentPI } = require('./state');

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {import('../../../types/streamdock').StreamDockMessage} StreamDockMessage
 */

/**
 * @callback MessageHandler
 * @param {StreamDockMessage} message - Incoming message
 * @returns {void}
 */

// ============================================================
// WebSocket Instance
// ============================================================

/** @type {import('ws').WebSocket|null} */
let websocket = null;

// ============================================================
// WebSocket Functions
// ============================================================

/**
 * Get WebSocket instance
 * @returns {import('ws').WebSocket|null}
 */
function getWebSocket() {
  return websocket;
}

/**
 * Initialize WebSocket connection to StreamDock
 * @param {string|number} port - WebSocket port
 * @param {string} uuid - Plugin UUID
 * @param {string} registerEvent - Registration event name
 * @param {MessageHandler} onMessage - Message handler callback
 * @returns {import('ws').WebSocket}
 */
function initWebSocket(port, uuid, registerEvent, onMessage) {
  log('[Antelope] Starting with port:', port, 'uuid:', uuid);

  websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  websocket.on('open', () => {
    log('[Antelope] WebSocket connected');
    if (!websocket) return;
    websocket.send(
      JSON.stringify({
        event: registerEvent,
        uuid: uuid,
      })
    );
  });

  websocket.on('message', (/** @type {Buffer} */ data) => {
    /** @type {StreamDockMessage} */
    const message = JSON.parse(data.toString());
    if (onMessage) {
      onMessage(message);
    }
  });

  websocket.on('error', (/** @type {Error} */ error) => {
    log('[Antelope] WebSocket error:', error);
  });

  websocket.on('close', () => {
    log('[Antelope] WebSocket closed');
  });

  return websocket;
}

/**
 * Send setImage to StreamDock
 * @param {string} context - Action context
 * @param {string|null} imageData - Base64 PNG data URL or null
 */
function setImage(context, imageData) {
  if (!imageData) return;
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'setImage',
        context: context,
        payload: { image: imageData, target: 0 },
      })
    );
  }
}

/**
 * Send data to Property Inspector
 * @param {Record<string, unknown>} payload - Data to send
 */
function sendToPropertyInspector(payload) {
  const { action, context } = getCurrentPI();
  log('[WebSocket] sendToPropertyInspector called, action:', action, 'context:', context);

  if (!context || !action) {
    log('[WebSocket] No current PI, skipping sendToPropertyInspector');
    return;
  }

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    log('[WebSocket] Sending to PI:', JSON.stringify(payload));
    websocket.send(
      JSON.stringify({
        event: 'sendToPropertyInspector',
        action: action,
        context: context,
        payload: payload,
      })
    );
  } else {
    log('[WebSocket] WebSocket not open, cannot send to PI');
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getWebSocket,
  initWebSocket,
  setImage,
  sendToPropertyInspector,
};
