# Claude Instructions: StreamDock Plugin Development

## Project Overview

Monorepo for StreamDock plugins (macOS).

| Plugin | ID | Description |
|--------|-----|-------------|
| mactools | `com.isrudoy.mactools` | Drive Info, Battery Monitor, Run Script |
| unifi | `com.isrudoy.unifi` | VPN Status - Unifi Network VPN client |
| spruthub | `com.isrudoy.spruthub` | Sprut.Hub smart home control (8 device types) |

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
    │   └── actions/          # Device actions (8 types)
    ├── light/                # Property Inspectors (one per device type)
    ├── switch/
    ├── outlet/
    ├── lock/
    ├── cover/
    ├── thermostat/
    ├── sensor/
    ├── button/
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
| Light | `com.isrudoy.spruthub.light` | Lightbulb control with brightness |
| Switch | `com.isrudoy.spruthub.switch` | Simple on/off switch |
| Outlet | `com.isrudoy.spruthub.outlet` | Power outlet on/off |
| Lock | `com.isrudoy.spruthub.lock` | Door lock control |
| Cover | `com.isrudoy.spruthub.cover` | Window covering (blinds/shades) 0-100% |
| Thermostat | `com.isrudoy.spruthub.thermostat` | Climate control with temperature |
| Sensor | `com.isrudoy.spruthub.sensor` | Read-only sensors (temp, humidity, motion, contact) |
| Button | `com.isrudoy.spruthub.button` | Trigger button events (single/double/long press) |

### Module Structure

```
plugin/
├── index.js              # Entry point, WebSocket, event routing
├── lib/
│   ├── common.js         # Constants, colors, canvas layout, logging
│   ├── state.js          # Shared state (contexts, timers)
│   ├── websocket.js      # setImage, setTitle, sendToPropertyInspector
│   └── spruthub.js       # SprutHubClient: WebSocket API, service/char helpers
└── actions/
    ├── light.js          # Lightbulb (on/off, brightness)
    ├── switch.js         # Switch (on/off)
    ├── outlet.js         # Outlet (on/off)
    ├── lock.js           # Lock (locked/unlocked)
    ├── cover.js          # Cover (position 0-100%)
    ├── thermostat.js     # Thermostat (temp, mode)
    ├── sensor.js         # Sensors (temp, humidity, motion, contact)
    └── button.js         # Button (single/double/long press)
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
- `StatelessProgrammableSwitch` — buttons (doorbell, Aqara buttons)

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

Uses `node-canvas` for dynamic button images (144x144 PNG).

**Layout constants (common.js):**
```javascript
const LAYOUT = {
  bulbY: 50,           // Icon vertical position
  bulbSize: 70,        // Icon size
  nameY: 104,          // Device name Y position
  brightnessY: 125,    // Status text Y position
  statusBarY: 138,     // Status bar Y position
  statusBarHeight: 6,  // Status bar height
};
```

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

## Reference

- StreamDock SDK: https://sdk.key123.vip/en/guide/overview.html
