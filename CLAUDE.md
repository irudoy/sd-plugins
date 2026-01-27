# Claude Instructions: StreamDock Plugin Development

## Project Overview

Monorepo for StreamDock plugins (macOS).

| Plugin | ID | Description |
|--------|-----|-------------|
| mactools | `com.isrudoy.mactools` | Drive Info, Battery Monitor, Run Script |
| unifi | `com.isrudoy.unifi` | VPN Status - Unifi Network VPN client |
| spruthub | `com.isrudoy.spruthub` | Sprut.Hub smart home control (9 actions) |

**Architecture:** Node.js backend + HTML/JS Property Inspector
**SDK:** StreamDock SDK (NOT Elgato Stream Deck SDK)

## Monorepo Structure

```
sd-plugins/
├── package.json              # Root: dev dependencies, scripts
├── eslint.config.mjs         # ESLint 9 flat config + Prettier
├── tsconfig.json             # TypeScript for JSDoc type checking
├── .prettierrc.json          # 2 spaces, single quotes, semicolons
├── .editorconfig
├── types/                    # TypeScript declarations
│   ├── streamdock.d.ts       # Plugin backend types
│   └── property-inspector.d.ts # PI globals ($settings, $websocket, etc.)
├── com.isrudoy.mactools.sdPlugin/
│   ├── package.json          # Runtime dependencies (ws, canvas)
│   ├── package-lock.json
│   ├── manifest.json
│   ├── plugin/               # Node.js backend
│   ├── driveinfo/            # Property Inspector
│   ├── battery/
│   ├── osascript/
│   └── static/               # SDK (not linted)
├── com.isrudoy.unifi.sdPlugin/
│   ├── package.json
│   ├── package-lock.json
│   ├── manifest.json
│   ├── plugin/
│   ├── vpn/
│   └── static/
└── com.isrudoy.spruthub.sdPlugin/
    ├── package.json
    ├── package-lock.json
    ├── manifest.json
    ├── plugin/               # Node.js backend
    │   ├── index.js          # Entry point, event routing
    │   ├── lib/              # Shared modules
    │   └── actions/          # Device actions (9 types)
    ├── light/                # Property Inspectors (one per action)
    ├── switch/
    ├── outlet/
    ├── lock/
    ├── cover/
    ├── thermostat/
    ├── sensor/
    ├── button/
    ├── scenario/
    └── static/               # SDK (not linted)
```

## Development

### Setup
```bash
npm install           # Install dev dependencies in root
cd com.isrudoy.mactools.sdPlugin && npm install && cd ..
cd com.isrudoy.unifi.sdPlugin && npm install && cd ..
cd com.isrudoy.spruthub.sdPlugin && npm install && cd ..
npm run link          # Symlink all plugins to StreamDock
```

### Scripts (from root)
```bash
npm run lint          # ESLint check
npm run fmt           # ESLint + Prettier fix
npm run typecheck     # TypeScript check (JSDoc)
npm run restart       # Restart StreamDock app
npm run link          # Link all plugins
npm run link:mactools # Link mactools only
npm run link:unifi    # Link unifi only
npm run link:spruthub # Link spruthub only
npm run unlink        # Remove symlinks
```

### Testing
```bash
node --check com.isrudoy.mactools.sdPlugin/plugin/index.js  # Syntax check
npm run restart                                              # Restart StreamDock
cat com.isrudoy.mactools.sdPlugin/plugin/plugin.log         # Logs (if DEBUG=true)
```

### Debugging
Plugins can be inspected using Chrome DevTools:
- Open `chrome://inspect` in Chrome/Chromium browser
- Or navigate directly to `http://localhost:23519/`
- Click "inspect" next to the plugin process to open DevTools

## mactools (com.isrudoy.mactools)

### Actions

| Action | UUID | Description |
|--------|------|-------------|
| Drive Info | `com.isrudoy.mactools.driveinfo` | Disk space monitoring with progress bar |
| Battery Monitor | `com.isrudoy.mactools.battery` | Apple Bluetooth & Razer device battery |
| Run Script | `com.isrudoy.mactools.osascript` | AppleScript / JavaScript (JXA) |

### Module Structure

```
plugin/
├── index.js              # Entry point, WebSocket, event routing
├── lib/
│   ├── common.js         # Constants, colors, logging
│   ├── state.js          # Shared state (contexts, timers, cache)
│   ├── websocket.js      # setImage, setTitle, sendToPropertyInspector
│   └── battery-drawing.js
├── actions/
│   ├── driveinfo.js
│   ├── battery.js
│   └── osascript.js
└── devices/
    ├── apple.js          # Apple Bluetooth battery
    └── razer.js          # Razer HID battery (native helper)
```

## unifi (com.isrudoy.unifi)

VPN Status action for Unifi Network VPN clients.

**Features:**
- Connects to Unifi controller via API
- Shows VPN name, IP, uptime, traffic (↓/↑)
- States: Connected (green), Connecting (yellow), Disconnected (gray), Error (red)
- Click opens VPN settings in browser

**API Endpoints:**
```
GET /proxy/network/api/s/default/rest/networkconf     # VPN list
GET /proxy/network/v2/api/site/default/vpn/connections # VPN status
Headers: X-API-KEY: <key>, Accept: application/json
```

## spruthub (com.isrudoy.spruthub)

Smart home control via Sprut.Hub controller (HomeKit-compatible).

### Actions

| Action | UUID | Description |
|--------|------|-------------|
| Light | `com.isrudoy.spruthub.light` | Lightbulb control with brightness, dial rotation |
| Switch | `com.isrudoy.spruthub.switch` | Simple on/off switch |
| Outlet | `com.isrudoy.spruthub.outlet` | Power outlet on/off |
| Lock | `com.isrudoy.spruthub.lock` | Door lock control |
| Cover | `com.isrudoy.spruthub.cover` | Window covering (blinds/shades) 0-100%, dial rotation |
| Thermostat | `com.isrudoy.spruthub.thermostat` | Climate control with temperature, dial rotation |
| Sensor | `com.isrudoy.spruthub.sensor` | Read-only sensors (temp, humidity, motion, contact) |
| Button | `com.isrudoy.spruthub.button` | Trigger button events (single/double/long press), dial actions for Knob |
| Scenario | `com.isrudoy.spruthub.scenario` | Run Sprut.Hub automation scenarios |

### Module Structure

```
plugin/
├── index.js              # Entry point, WebSocket, event routing
├── lib/
│   ├── common.js         # Constants, colors, logging
│   ├── state.js          # Shared state (contexts, timers, dial debounce)
│   ├── websocket.js      # setImage, setTitle, sendToPropertyInspector
│   ├── spruthub.js       # SprutHubClient: WebSocket API, service/char helpers
│   ├── base-action.js    # BaseAction class, shared handlers (see below)
│   └── draw-common.js    # Canvas helpers, layout constants
└── actions/
    ├── light.js          # Lightbulb (on/off, brightness, dial)
    ├── switch.js         # Switch (on/off)
    ├── outlet.js         # Outlet (on/off)
    ├── lock.js           # Lock (locked/unlocked)
    ├── cover.js          # Cover (position 0-100%, dial)
    ├── thermostat.js     # Thermostat (temp, mode, dial)
    ├── sensor.js         # Sensors (temp, humidity, motion, contact)
    ├── button.js         # Button (single/double/long press, Knob dial actions)
    └── scenario.js       # Scenario (run automation)

pi-lib/                   # Shared Property Inspector code
├── common.js             # SprutHubPI: initConnection, initDeviceSelection
└── styles.css            # Common PI styles (status messages, connection panel)

{device}/index.html       # PI for each action type (light, switch, scenario, etc.)
```

### BaseAction Pattern (base-action.js)

All actions extend `BaseAction` class which provides:
- Event handlers: `onWillAppear`, `onWillDisappear`, `onKeyUp`, `onDialRotate`, etc.
- State management: `fetchState`, `updateButton`, `syncAccessoryState`
- PI communication: `handleTestConnection`, `handleGetDevices`

**Shared utility functions:**
```javascript
const {
  BaseAction,
  SprutHubClient,
  mapBaseSettings,        // Maps common settings from PI payload
  handleToggleKeyUp,      // Standard on/off/toggle handler
  handleOnOffStateChange, // Standard state change for on/off devices
  extractOnOffState,      // Extract on/off state from service
} = require('../lib/base-action');
```

**Action configuration example (switch.js):**
```javascript
const switchAction = new BaseAction({
  actionType: SWITCH_ACTION,
  deviceTypeName: 'Switch',
  drawIcon: (ctx, x, y, size, color) => drawSwitchIcon(ctx, x, y, size, color, false),
  initialState: { on: false },
  useRoomName: false,       // Show accessory/service name (default). Set true for lights.
  findService: (accessory) => SprutHubClient.findSwitchService(accessory),
  extractState: extractOnOffState,
  renderState,              // Keypad rendering (144x144)
  renderKnobState,          // Knob rendering (230x144) - optional
  handleStateChange: handleOnOffStateChange,
  handleKeyUp: handleToggleKeyUp,
});

module.exports = switchAction.getExports();
```

**Display name logic (`getDisplayName`):**
- `customName` (if set by user)
- `roomName` (only if `useRoomName: true` in config, e.g., for lights)
- `serviceName` (if different from accessoryName, e.g., multi-switch devices)
- `accessoryName` (default fallback)

### Knob Support (StreamDock+)

StreamDock+ devices have two controller types with different canvas sizes:
- **Keypad** — standard square button (144×144 px)
- **Knob** — wide touchscreen above encoder dial (230×144 px)

The `willAppear` event payload contains `controller: 'Keypad' | 'Knob'` to detect the type.

**Dial rotation callbacks:**
- `previewDialRotate` — immediate UI update (no API call)
- `handleDialRotate` — debounced API call (150ms)

State is synced across all buttons for the same accessory via `syncAccessoryState()`.

**State caching (page switch):**
- `cacheState(actionType, accessoryId, state)` — cache state when fetched or changed
- `getCachedState(actionType, accessoryId)` — restore cached state on `willAppear`
- Prevents "Connecting..." flash when switching StreamDock pages
- Key format: `${actionType}:${accessoryId}` to avoid collisions between device types

### Action-Specific Display

**Button action (Keypad 144×144):**
- Line 1: `serviceName` — the button/action name (e.g., "Включить")
- Line 2: `accessoryName` — the device name (e.g., "Колонки")

**Button action (Knob 230×144):**
- Name: `accessoryName` — device name
- Status: dial action names (e.g., "Тише / Включить / Громче") or custom `customStatus`
- Names from `dialLeftServiceName`, `dialPressServiceName`, `dialRightServiceName`

**Thermostat action (both modes):**
- Large: current temperature
- Status: target temp with arrow + mode (e.g., "↑ 25.0° · Heat")

**Adding Knob rendering to an action:**

1. Implement `renderKnobState(ctx, state, settings)` function that draws on 230×144 canvas
2. Pass it to BaseAction config: `renderKnobState: renderKnobState`
3. BaseAction automatically chooses between Keypad/Knob rendering based on controller type

```javascript
// Example renderKnobState for light action (light.js)
function renderKnobState(settings, state, _name) {
  const { canvas, ctx } = createKnobCanvas();
  const iconColor = state.on ? COLORS.warmYellow : COLORS.gray;
  const textColor = state.on ? COLORS.white : COLORS.gray;

  // Draw icon on left side
  drawLightbulb(ctx, KNOB_LAYOUT.iconX, KNOB_LAYOUT.iconY, KNOB_LAYOUT.iconSize, iconColor);

  // Calculate vertical centering (see "Knob text layout" section)
  ctx.textAlign = 'left';
  const maxChars = 11;
  // ... word-wrap device name into line1/line2 ...
  // ... calculate startY for vertical centering ...

  // Room name (gray, small)
  ctx.fillStyle = COLORS.gray;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(roomName, KNOB_LAYOUT.nameX, startY);

  // Device name (white, larger, 1-2 lines)
  ctx.fillStyle = textColor;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(line1, KNOB_LAYOUT.nameX, name1Y);

  // Status (colored)
  ctx.fillStyle = iconColor;
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(state.on ? state.brightness + '%' : 'Off', KNOB_LAYOUT.statusX, statusY);

  return canvas.toDataURL('image/png');
}
```

### Sprut.Hub API

WebSocket JSON-RPC protocol over `wss://{host}/bff/`.

**Authentication:**
```javascript
{ jsonrpc: '2.0', method: 'auth', params: { token, serial }, id }
```

**Key methods:**
- `getAccessories` — list all accessories with services and characteristics
- `getRooms` — list rooms for device grouping
- `updateCharacteristic` — change device state

**Service types (from API):**
- `Lightbulb` / 13 — lights
- `Switch` — switches
- `Outlet` — outlets
- `LockMechanism` — locks
- `WindowCovering` — blinds/shades
- `Thermostat` — climate control
- `TemperatureSensor`, `HumiditySensor`, `ContactSensor`, `MotionSensor` — sensors
- `StatelessProgrammableSwitch` / 89 — buttons (doorbell, Aqara buttons)

**Characteristic values:**
- `boolValue` — on/off states
- `intValue` — modes, positions (0-100)
- `doubleValue` — temperature, humidity

**Offline detection:**
- API returns `online: true/false` on accessory objects
- Check via `SprutHubClient.isAccessoryOffline(accessory)`

### Button States

All actions support these visual states:
- **Normal** — device state with icon, name, status bar
- **Connecting** — yellow, "Connecting..." text
- **Error** — red background, error message
- **Not Configured** — gray, "Setup" / "Open settings"
- **Offline** — gray icon/text, "Offline" status

### Canvas Drawing

Uses `node-canvas` for dynamic button images. Two canvas sizes:
- **Keypad**: 144×144 px (square button)
- **Knob**: 230×144 px (wide touchscreen)

**draw-common.js** — shared drawing utilities:
```javascript
const {
  // Keypad (144x144)
  createButtonCanvas,    // Returns { canvas, ctx } for 144x144 canvas
  drawStatusBar,         // Bottom status bar
  drawDeviceName,        // Device name text
  drawStatusText,        // Status text (On/Off, percentage, etc.)
  drawError,             // Error state
  drawConnectingWithIcon,
  drawNotConfiguredWithIcon,
  drawOfflineWithIcon,

  // Knob (230x144)
  createKnobCanvas,      // Returns { canvas, ctx } for 230x144 canvas
  drawKnobError,
  drawKnobConnectingWithIcon,
  drawKnobNotConfiguredWithIcon,
  drawKnobOfflineWithIcon,

  // Constants
  CANVAS_SIZE,           // 144
  CANVAS_CENTER,         // 72
  LAYOUT,                // Keypad layout constants
} = require('../lib/draw-common');
```

**Keypad layout constants (common.js):**
```javascript
const LAYOUT = {
  bulbY: 50,           // Icon vertical position
  bulbSize: 70,        // Icon size
  nameY: 104,          // Device name Y position
  nameYOff: 109,       // Device name Y when off (no status text)
  brightnessY: 125,    // Status text Y position
  statusBarY: 138,     // Status bar Y position
  statusBarHeight: 6,  // Status bar height
};
```

**Knob layout constants (draw-common.js):**
```javascript
const KNOB_WIDTH = 230;
const KNOB_HEIGHT = 144;
const KNOB_LAYOUT = {
  iconX: 50,           // Icon center X (left side)
  iconY: 72,           // Icon center Y (vertical center)
  iconSize: 70,        // Icon size
  nameX: 95,           // Name/status X position (right side)
  statusX: 95,         // Status text X (same as nameX)
};
```

**Knob text layout (light/cover/button):**

Text on right side is vertically centered relative to icon (Y=72):
- Line 1: Room name (gray, 14px, bold)
- Line 2-3: Device name (white, 20px, bold, wraps if > 11 chars)
- Line 4: Status (colored, 20px, bold)

```javascript
// Vertical centering calculation in renderKnobState:
const roomH = 14;
const nameH = 20;
const statusH = 20;
const gapRoomName = 6;
const gapNameStatus = 5;
const totalHeight = roomH + gapRoomName + nameH + (line2 ? nameH : 0) + gapNameStatus + statusH;
const startY = KNOB_LAYOUT.iconY - 2 - totalHeight / 2 + roomH;  // -2px offset for visual balance
```

**Note:** Knob layout has no status bar — the wide format uses horizontal layout with icon on left, text on right.

## Critical Knowledge

### Type Definitions (types/)

Types for JSDoc annotations in JavaScript files:

- **streamdock.d.ts** — types for plugin backend (WebSocket messages, settings, events)
- **property-inspector.d.ts** — PI globals (`$settings`, `$websocket`, `$propEvent`, etc.)

Used via `@type` in JSDoc:
```javascript
/** @type {StreamDockSettings} */
const settings = data.settings || {};
```

**Key types for Knob support:**
- `AppearPayload.controller` — `'Keypad' | 'Knob'` (controller type from `willAppear`)
- `ActionContext.controller` — stored controller type for rendering decisions

### StreamDock vs Elgato SDK

| Aspect | Elgato SDK | StreamDock SDK |
|--------|------------|----------------|
| PI Events | `$SD.on('sendToPropertyInspector', ...)` | `$propEvent.sendToPropertyInspector(data)` |
| Send to Plugin | `$SD.api.sendToPlugin(context, action, payload)` | `$websocket.sendToPlugin(payload)` |
| Settings | `$SD.api.setSettings(context, settings)` | `$settings` proxy (auto-saves) |
| Context | Uses `context` from actionInfo | Uses `$uuid` for routing |

### SDK Files (static/ — not linted)

```
static/
  common.js      - jQuery-like utilities ($, $.debounce, $emit)
  sd-action.js   - StreamDock SDK for Property Inspector
  css/sdpi.css   - PI styles
```

### Property Inspector Pattern

```javascript
const $local = false;
const $back = false;

const $propEvent = {
  didReceiveSettings(data) {
    const settings = data.settings || {};
    $websocket.sendToPlugin({ event: 'getData' });
  },
  sendToPropertyInspector(data) {
    if (data.event === 'dataList') {
      // Handle data
    }
  }
};
```

### Spruthub PI Architecture (pi-lib/)

Shared code for all Property Inspectors with composable initialization:

**pi-lib/common.js** — `SprutHubPI` module:

Two initialization functions:
- `initConnection(options)` — connection settings only (for scenario PI)
- `initDeviceSelection(config)` — full PI with device/service selection

```javascript
// Connection-only PI (scenario)
const piInit = SprutHubPI.initConnection({
  onSendToPropertyInspector: handleSendToPI,  // custom event handler
});
const $propEvent = piInit.$propEvent;

// Device selection PI (light, switch, etc.)
const $propEvent = SprutHubPI.initDeviceSelection({
  deviceSelectId: 'deviceSelect',
  serviceLabel: 'Switch',
  isServiceFn: isSwitchService,
  findCharacteristicsFn: findCharacteristics,
  defaultAction: 'toggle',
  loadExtraSettings,      // optional
  saveExtraSettings,      // optional
  getExtraPluginSettings, // optional
  onAccessorySelected,    // optional
}).$propEvent;
```

**Helper functions:**
- `SprutHubPI.getConnectionSettings()` — returns `{host, token, serial}`
- `SprutHubPI.testConnection()` — test connection button handler
- `SprutHubPI.saveSettings()` — save and send settings to plugin
- `SprutHubPI.findOnCharacteristic(service)` — find On characteristic
- `SprutHubPI.findBrightnessCharacteristic(service)` — find Brightness characteristic
- `SprutHubPI.getCharType(characteristic)` — get characteristic type

**Connection settings behavior:**
- Auto-collapse on page load if already configured
- Stay open after successful test (let user collapse manually)
- Service dropdown always visible (even with single service) so user sees what's selected

**Cascade selection reset:**
- When room changes → device and service selectors reset
- When device changes → service selector resets
- All related settings (characteristicIds, serviceNames, etc.) are cleared

**Service names from dropdowns:**
- Use `selectedOptions[0].textContent` to get name from dropdown
- This works even if `availableButtons` array is empty during restore

**pi-lib/styles.css** — common styles:
- `.status-message`, `.status-success`, `.status-error`, `.status-info`
- `.connection-btn`, `.connection-status`
- `#connectionSettings` panel styling

**PI HTML structure:**
```html
<link rel="stylesheet" href="../pi-lib/styles.css">
<script src="../pi-lib/common.js"></script>
...
<div id="connectionSettingsContainer"></div>  <!-- Injected by init -->
<div class="sdpi-item">
  <div class="sdpi-item-label">Device</div>
  <select id="deviceSelect">...</select>
</div>
```

## Device Detection

### Apple Bluetooth Battery
```javascript
// Uses ioreg + system_profiler
exec('ioreg -r -k BatteryPercent | grep -E "..."');
exec('system_profiler SPBluetoothDataType');
```

### Razer Battery
Uses native helper (`plugin/devices/razer-battery-helper`) for HID communication.
**Requires:** Input Monitoring permission in System Preferences.

## Dynamic Images

**SVG does not work!** StreamDock does not support SVG. Use node-canvas + PNG:

```javascript
const { createCanvas } = require('canvas');

function drawButton() {
  const canvas = createCanvas(144, 144);
  const ctx = canvas.getContext('2d');
  // ... draw
  return canvas.toDataURL('image/png');
}
```

## macOS APFS Disk Space

`df` shows incorrect values for root. Use `/System/Volumes/Data`:

```javascript
const dataPartition = disks.find(d => d.mountpoint === '/System/Volumes/Data');
if (dataPartition) {
  rootDisk = { ...dataPartition, name: 'Macintosh HD', mountpoint: '/' };
}
```

## Dependencies

| Package | Purpose |
|---------|---------|
| ws | WebSocket for StreamDock communication |
| canvas | PNG image generation |

**Note:** canvas requires native compilation.

## Coding Style

### TypeScript/JSDoc Rules
- **Never use `@ts-ignore`** — fix the type definitions instead
- **Avoid type casts** where possible — use proper type definitions or restructure code
- **Type casts are acceptable for**:
  - WebSocket/API responses returning `unknown` (cast result to proper response typedef)
  - Event handler data where the emitter uses `unknown` type
- If API returns unknown structure, define proper types in JSDoc `@typedef`
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safe property access
- Prefer runtime type guards (`typeof x === 'string'`) over casts when validating external input

## Common Pitfalls

1. **Plugin Not Starting** — `node --check plugin/index.js`
2. **PI Not Receiving Data** — Check `currentPIContext` is set
3. **setImage not working** — Use PNG, not SVG
4. **Razer not detected** — Requires Input Monitoring permission
5. **DEBUG left enabled** — Set `DEBUG = true` in `plugin/lib/common.js` for debugging (logs to `plugin/plugin.log`), but ensure it's `false` before finishing work
6. **Knob shows Keypad layout** — Implement `renderKnobState` callback for actions that support Knob; if not provided, BaseAction falls back to Keypad rendering
7. **didReceiveSettings sends stale data** — StreamDock may send `didReceiveSettings` with outdated data after PI updates settings; BaseAction ignores this if context already has `accessoryId`
8. **Characteristic ID vs Type** — `CHAR_ON` (37), `CHAR_BRIGHTNESS` (38) etc. are TYPE constants, not actual IDs. Always use `settings.characteristicId` from PI, not type constants for matching in `handleStateChange`
9. **Offline state rendering** — Don't use generic `drawOfflineWithIcon()` for all devices. Each action's `renderState` should handle `state.offline` and show actual state + "Offline" label (see switch.js)

## Reference

- StreamDock SDK: https://sdk.key123.vip/en/guide/overview.html
