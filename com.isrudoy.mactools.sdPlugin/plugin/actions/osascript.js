/**
 * OSA Script action for Mac Tools Plugin
 * Runs AppleScript and JavaScript for Automation (JXA) scripts
 */

const { exec } = require('child_process');
const { createCanvas } = require('canvas');
const { log, CANVAS_SIZE, OSASCRIPT_ACTION } = require('../lib/common');
const { contexts, setContext, stopTimer } = require('../lib/state');
const { setImage, clearImage } = require('../lib/websocket');

// ============================================================
// Script Execution
// ============================================================

function runScript(language, scriptText, callback) {
    const langArg = language === 'JavaScript' ? '-l JavaScript' : '';
    const cmd = `osascript ${langArg} -`;

    log('[OSAScript] Running script:', language);

    const child = exec(cmd, { timeout: 30000 }, callback);
    child.stdin.write(scriptText);
    child.stdin.end();
}

// ============================================================
// Feedback Drawing
// ============================================================

function drawSuccessFeedback() {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(40, 75);
    ctx.lineTo(62, 97);
    ctx.lineTo(104, 55);
    ctx.stroke();

    return canvas.toDataURL('image/png');
}

function drawErrorFeedback() {
    const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2e1a1a';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.strokeStyle = '#F44336';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(48, 48);
    ctx.lineTo(96, 96);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(96, 48);
    ctx.lineTo(48, 96);
    ctx.stroke();

    return canvas.toDataURL('image/png');
}

// ============================================================
// Feedback Functions
// ============================================================

function showOk(context) {
    const feedbackImage = drawSuccessFeedback();
    setImage(context, feedbackImage);

    setTimeout(() => {
        clearImage(context);
    }, 500);
}

function showAlert(context) {
    const feedbackImage = drawErrorFeedback();
    setImage(context, feedbackImage);

    setTimeout(() => {
        clearImage(context);
    }, 800);
}

// ============================================================
// Event Handlers
// ============================================================

function onWillAppear(context, payload) {
    const settings = payload?.settings || {};
    setContext(context, { settings, action: OSASCRIPT_ACTION });
}

function onWillDisappear(context) {
    // Nothing to clean up for osascript
}

function onKeyUp(context, payload) {
    const contextData = contexts[context];
    if (!contextData) {
        log('[OSAScript] No context data for:', context);
        return;
    }

    const settings = contextData.settings || {};
    const language = settings.language || 'AppleScript';
    const scriptText = settings.scriptText || '';

    if (!scriptText.trim()) {
        log('[OSAScript] No script to run');
        showAlert(context);
        return;
    }

    runScript(language, scriptText, (error, stdout, stderr) => {
        if (error) {
            log('[OSAScript] Script error:', error.message);
            showAlert(context);
        } else {
            log('[OSAScript] Script output:', stdout);
            showOk(context);
        }
    });
}

function onSendToPlugin(context, payload) {
    if (contexts[context]) {
        if (payload.language !== undefined) {
            contexts[context].settings.language = payload.language;
        }
        if (payload.scriptText !== undefined) {
            contexts[context].settings.scriptText = payload.scriptText;
        }
    }
    return false;
}

function onPropertyInspectorDidAppear(context) {
    // Nothing to send to PI
}

function onDidReceiveSettings(context, payload) {
    onSettingsUpdate(context, payload?.settings || {});
}

function onSettingsUpdate(context, settings) {
    if (contexts[context]) {
        contexts[context].settings = settings;
    } else {
        setContext(context, { settings, action: OSASCRIPT_ACTION });
    }
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    runScript,
    showOk,
    showAlert,
    onWillAppear,
    onWillDisappear,
    onKeyUp,
    onSendToPlugin,
    onPropertyInspectorDidAppear,
    onDidReceiveSettings,
    onSettingsUpdate
};
