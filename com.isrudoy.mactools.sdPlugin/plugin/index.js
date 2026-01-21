/**
 * Mac Tools Plugin for StreamDock
 * Drive Info Action - Node.js implementation
 */

const { execSync, exec } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Configuration
const DEBUG = false;  // Set to true for debug logging

// File-based logging
const logFile = path.join(__dirname, 'plugin.log');
function log(...args) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
    try {
        fs.appendFileSync(logFile, message);
    } catch (e) {
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

/**
 * Connect to StreamDock application
 */
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, info) {
    log('[MacTools] Starting with port:', port, 'uuid:', uuid);

    websocket = new WebSocket(`ws://127.0.0.1:${port}`);

    websocket.on('open', () => {
        log('[MacTools] WebSocket connected');
        websocket.send(JSON.stringify({
            event: registerEvent,
            uuid: uuid
        }));
    });

    websocket.on('message', (data) => {
        const message = JSON.parse(data.toString());
        handleMessage(message);
    });

    websocket.on('error', (error) => {
        log('[MacTools] WebSocket error:', error);
    });

    websocket.on('close', () => {
        log('[MacTools] WebSocket closed');
    });
}

/**
 * Handle incoming messages from StreamDock
 */
function handleMessage(message) {
    const { event, action, context, payload } = message;
    log('[MacTools] Received event:', event, 'context:', context);

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
 * Get disk information using df command
 */
function getDiskInfo() {
    try {
        const output = execSync('df -Pk', { encoding: 'utf8' });
        const lines = output.trim().split('\n').slice(1);

        const disks = lines
            .filter(line => line.startsWith('/dev/'))
            .map(line => {
                const parts = line.split(/\s+/);
                const mountpoint = parts.slice(5).join(' ');
                const name = mountpoint.split('/').pop() || 'Macintosh HD';

                return {
                    device: parts[0],
                    total: parseInt(parts[1]) * 1024,
                    used: parseInt(parts[2]) * 1024,
                    free: parseInt(parts[3]) * 1024,
                    percent: parseInt(parts[4]),
                    mountpoint: mountpoint,
                    name: name === '' ? 'Macintosh HD' : name,
                    displayName: `${name || 'Macintosh HD'} (${mountpoint})`
                };
            });

        // On macOS with APFS, prefer Data partition for Macintosh HD
        const dataPartition = disks.find(d => d.mountpoint === '/System/Volumes/Data');

        // Build final disk list with proper APFS handling
        const systemVolumePrefixes = [
            '/System/Volumes/VM',
            '/System/Volumes/Preboot',
            '/System/Volumes/Update',
            '/System/Volumes/xarts',
            '/System/Volumes/iSCPreboot',
            '/System/Volumes/Hardware',
            '/System/Volumes/Data'  // Will be merged with root
        ];

        return disks
            .filter(d => !systemVolumePrefixes.some(prefix => d.mountpoint.startsWith(prefix)))
            .map(d => {
                // Replace root partition with Data partition info
                if (d.mountpoint === '/' && dataPartition) {
                    return {
                        ...dataPartition,
                        name: 'Macintosh HD',
                        displayName: 'Macintosh HD (/)',
                        mountpoint: '/'
                    };
                }
                return d;
            });
    } catch (error) {
        log('[MacTools] Error getting disk info:', error);
        return [];
    }
}

/**
 * Draw button image using Canvas (PNG)
 */
function drawButton(diskInfo, settings = {}) {
    try {
        const showLabel = settings.showLabel !== false;
        const invertBar = settings.invertBar === true;
        const lowThreshold = parseInt(settings.lowThreshold) || 20;
        const criticalThreshold = parseInt(settings.criticalThreshold) || 10;
        const lowColor = settings.lowColor || '#FFFF00';
        const criticalColor = settings.criticalColor || '#FF0000';

        const freePercent = 100 - diskInfo.percent;
        const displayPercent = invertBar ? freePercent : diskInfo.percent;

        let barColor = '#4CAF50';
        if (freePercent <= criticalThreshold) {
            barColor = criticalColor;
        } else if (freePercent <= lowThreshold) {
            barColor = lowColor;
        }

        // Create canvas
        const canvas = createCanvas(144, 144);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 144, 144);

        // Disk name (if enabled)
        if (showLabel) {
            let displayName = diskInfo.name;
            if (displayName.length > 12) {
                displayName = displayName.substring(0, 11) + '...';
            }
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(displayName, 72, 28);
        }

        // Free space (main number)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        const freeGB = (diskInfo.free / (1024 * 1024 * 1024)).toFixed(1);
        ctx.fillText(`${freeGB} GB`, 72, 62);

        // Subtitle
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '19px sans-serif';
        ctx.textAlign = 'center';
        const totalGB = (diskInfo.total / (1024 * 1024 * 1024)).toFixed(0);
        ctx.fillText(`${diskInfo.percent}% of ${totalGB} GB`, 72, 88);

        // Progress bar background
        const barX = 8;
        const barY = 110;
        const barWidth = 128;
        const barHeight = 16;
        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 4);
        ctx.fill();

        // Progress bar fill
        const fillWidth = barWidth * (displayPercent / 100);
        if (fillWidth > 0) {
            ctx.fillStyle = barColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, fillWidth, barHeight, 4);
            ctx.fill();
        }

        return canvas.toDataURL('image/png');
    } catch (error) {
        log('[MacTools] Error drawing button:', error);
        return null;
    }
}

/**
 * Draw "not available" button
 */
function drawNotAvailable(diskName) {
    try {
        const canvas = createCanvas(144, 144);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 144, 144);

        // Disk name
        let displayName = diskName || 'Disk';
        if (displayName.length > 12) {
            displayName = displayName.substring(0, 11) + '...';
        }
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(displayName, 72, 28);

        // Not available message
        ctx.fillStyle = '#666666';
        ctx.font = '18px sans-serif';
        ctx.fillText('Not', 72, 60);
        ctx.fillText('Available', 72, 82);

        // Empty progress bar
        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.roundRect(8, 110, 128, 16, 4);
        ctx.fill();

        return canvas.toDataURL('image/png');
    } catch (error) {
        log('[MacTools] Error drawing not available:', error);
        return null;
    }
}

/**
 * Update button image for a context
 */
function updateButton(context, settings = {}) {
    const disks = getDiskInfo();

    if (disks.length === 0) {
        setTitle(context, 'No disks');
        return;
    }

    const contextData = contexts[context] || {};
    const displayMode = settings.displayMode || '0';
    const selectedDrive = settings.selectedDrive;

    let diskToShow;

    if (displayMode === '1') {
        // All drives mode - rotate through available disks
        const currentIndex = contextData.currentDiskIndex || 0;
        diskToShow = disks[currentIndex % disks.length];
        contextData.currentDiskIndex = (currentIndex + 1) % disks.length;
    } else {
        // Single drive mode - show selected or "not available"
        diskToShow = disks.find(d => d.name === selectedDrive || d.mountpoint === selectedDrive);

        if (!diskToShow && selectedDrive) {
            // Selected disk not found - show "not available"
            contexts[context] = contextData;
            const imageData = drawNotAvailable(selectedDrive);
            setImage(context, imageData);
            return;
        }

        // Fallback to first disk only if nothing selected
        if (!diskToShow) {
            diskToShow = disks[0];
        }
    }

    contexts[context] = contextData;

    const imageData = drawButton(diskToShow, settings);
    setImage(context, imageData);
}

/**
 * Start update timer for a context
 */
function startTimer(context, settings = {}) {
    stopTimer(context);

    const displayMode = settings.displayMode || '0';
    const rotationSpeed = parseInt(settings.rotationSpeed) || 5;
    const updateInterval = parseInt(settings.updateInterval) || 5;
    const interval = displayMode === '1' ? rotationSpeed * 1000 : updateInterval * 1000;

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
    updateButton(context, settings);
    startTimer(context, settings);
}

/**
 * Event: Action disappeared from the Stream Deck
 */
function onWillDisappear(action, context, payload) {
    stopTimer(context);
    delete contexts[context];
}

/**
 * Event: Key pressed
 */
function onKeyDown(action, context, payload) {
    // No action on key down
}

/**
 * Event: Key released
 */
function onKeyUp(action, context, payload) {
    const settings = payload?.settings || contexts[context]?.settings || {};
    const selectedDrive = settings.selectedDrive;

    const disks = getDiskInfo();
    const disk = disks.find(d => d.name === selectedDrive || d.mountpoint === selectedDrive) || disks[0];

    if (disk) {
        exec(`open "${disk.mountpoint}"`, (error) => {
            if (error) {
                log('[MacTools] Error opening disk:', error.message);
            }
        });
    }
}

/**
 * Event: Settings received from Property Inspector
 */
function onSendToPlugin(action, context, payload) {
    // Store action if not already stored
    if (!contexts[context]) {
        contexts[context] = { action };
    } else if (!contexts[context].action) {
        contexts[context].action = action;
    }

    if (payload && payload.event === 'getDisks') {
        // Property Inspector requesting disk list
        currentPIAction = action;
        currentPIContext = context;

        const disks = getDiskInfo();
        sendToPropertyInspector({
            event: 'diskList',
            disks: disks.map(d => ({ name: d.name, displayName: d.displayName, mountpoint: d.mountpoint }))
        });
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
 * Event: Property Inspector appeared
 */
function onPropertyInspectorDidAppear(action, context, payload) {
    currentPIAction = action;
    currentPIContext = context;

    if (!contexts[context]) {
        contexts[context] = { action };
    } else if (!contexts[context].action) {
        contexts[context].action = action;
    }

    const disks = getDiskInfo();
    sendToPropertyInspector({
        event: 'diskList',
        disks: disks.map(d => ({ name: d.name, displayName: d.displayName, mountpoint: d.mountpoint }))
    });
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
        log('[MacTools] setImage called with null imageData');
        return;
    }
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            event: 'setImage',
            context: context,
            payload: {
                image: imageData,
                target: 0
            }
        }));
    }
}

/**
 * Send setTitle to StreamDock
 */
function setTitle(context, title) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            event: 'setTitle',
            context: context,
            payload: {
                title: title,
                target: 0
            }
        }));
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
        websocket.send(JSON.stringify({
            event: 'sendToPropertyInspector',
            action: currentPIAction,
            context: currentPIContext,
            payload: payload
        }));
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
