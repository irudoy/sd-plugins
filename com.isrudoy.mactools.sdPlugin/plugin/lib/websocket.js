/**
 * WebSocket communication for Mac Tools Plugin
 */

const WebSocket = require('ws');
const { log } = require('./common');
const { getCurrentPI } = require('./state');

// ============================================================
// WebSocket Instance
// ============================================================

let websocket = null;

// ============================================================
// WebSocket Functions
// ============================================================

function getWebSocket() {
  return websocket;
}

function initWebSocket(port, uuid, registerEvent, onMessage) {
  log('[MacTools] Starting with port:', port, 'uuid:', uuid);

  websocket = new WebSocket(`ws://127.0.0.1:${port}`);

  websocket.on('open', () => {
    log('[MacTools] WebSocket connected');
    websocket.send(
      JSON.stringify({
        event: registerEvent,
        uuid: uuid,
      })
    );
  });

  websocket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    if (onMessage) {
      onMessage(message);
    }
  });

  websocket.on('error', (error) => {
    log('[MacTools] WebSocket error:', error);
  });

  websocket.on('close', () => {
    log('[MacTools] WebSocket closed');
  });

  return websocket;
}

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

function clearImage(context) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'setImage',
        context: context,
        payload: { image: null, target: 0 },
      })
    );
  }
}

function setTitle(context, title) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'setTitle',
        context: context,
        payload: { title: title, target: 0 },
      })
    );
  }
}

function sendToPropertyInspector(payload) {
  const { action, context } = getCurrentPI();
  if (!context || !action) return;

  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: 'sendToPropertyInspector',
        action: action,
        context: context,
        payload: payload,
      })
    );
  }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  getWebSocket,
  initWebSocket,
  setImage,
  clearImage,
  setTitle,
  sendToPropertyInspector,
};
