# Claude Instructions: StreamDock Plugin Development

## Project Overview

Monorepo for StreamDock plugins. Cross-platform: macOS + Windows.

| Plugin | ID | Description | Platform |
|--------|-----|-------------|----------|
| mactools | `com.isrudoy.mactools` | Drive Info, Battery Monitor, Run Script | macOS |
| unifi | `com.isrudoy.unifi` | VPN Status - Unifi Network VPN client | macOS + Windows |
| wintools | `com.isrudoy.wintools` | Battery Monitor (Razer devices) | Windows |
| spruthub | `com.isrudoy.spruthub` | Sprut.Hub smart home control (9 actions) | macOS + Windows |
| acontrol | `com.isrudoy.acontrol` | Adam Audio A-Series speaker control | macOS + Windows |
| antelope | `com.isrudoy.antelope` | Antelope Zen Quadro SC audio interface | macOS + Windows |

**Architecture:** Node.js backend + HTML/JS Property Inspector (PI)
**SDK:** StreamDock SDK (NOT Elgato Stream Deck SDK — different API, see below)

## Structure

```
sd-plugins/
├── package.json, eslint.config.mjs, tsconfig.json, .prettierrc.json
├── types/                    # streamdock.d.ts, property-inspector.d.ts
├── .github/workflows/        # ci.yml, release.yml
└── com.isrudoy.{name}.sdPlugin/
    ├── package.json, manifest.json
    ├── plugin/               # Node.js backend
    │   ├── index.js          # Entry point, WebSocket, event routing
    │   ├── lib/              # Shared modules (common, state, websocket, draw-common, ...)
    │   └── actions/          # Action handlers
    ├── {action}/index.html   # Property Inspector per action
    ├── pi-lib/               # Shared PI code (spruthub, acontrol, antelope)
    └── static/               # SDK files (not linted)
```

Special: `antelope` has `antelope/` dir — shared protocol library for plugin + CLI tool.

## Development

### Setup (macOS)
```bash
npm install
cd com.isrudoy.mactools.sdPlugin && npm install && cd ..
cd com.isrudoy.unifi.sdPlugin && npm install && cd ..
cd com.isrudoy.spruthub.sdPlugin && npm install && cd ..
cd com.isrudoy.antelope.sdPlugin && npm install && cd ..
npm run link
```

### Setup (Windows / WSL)

WSL2 → StreamDock runs on Windows with built-in Node.js (v20.8.1). Plugin dir: `%APPDATA%\HotSpot\StreamDock\plugins\`. Linking via `mklink /D` (admin).

```bash
npm install
cd com.isrudoy.wintools.sdPlugin && npm install && npm install --os=win32 --cpu=x64 && make && cd ..
npm run link:win:wintools
```

### Scripts
```bash
npm run lint / fmt / typecheck / install:all / install:all:win
npm run restart          # Restart StreamDock (macOS)
npm run link             # Link all (macOS); link:{name} for one
npm run link:win         # Link all (Windows); link:win:{name} for one
```

### Completion Checklist

Run after finishing any work:
```bash
npm run install:all && npm run fmt && npm run lint && npm run typecheck
```

**README:** If plugin features, actions, or setup instructions changed — update `README.md` and `README.ru.md`.

### Testing & Debugging
```bash
node --check com.isrudoy.{name}.sdPlugin/plugin/index.js  # Syntax check
npm run restart                                             # Restart StreamDock
cat com.isrudoy.{name}.sdPlugin/plugin/plugin.log          # Logs (if DEBUG=true)
```
Chrome DevTools: `chrome://inspect` or `http://localhost:23519/`

## CI/CD

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | PR to master, push to non-master | Lint + typecheck |
| `release.yml` | Push to master | Build + release all plugins |

**Versioning:** Single version in root `package.json`. Auto patch bump on push to master if tag exists. Manual major/minor: change version in `package.json` before push.

**Artifacts:** ZIP per plugin with `node_modules/` + platform-specific `@napi-rs/canvas` binaries.

**macOS Quarantine:** `xattr -cr ~/Library/Application\ Support/HotSpot/StreamDock/plugins/com.isrudoy.*.sdPlugin`

## StreamDock vs Elgato SDK (critical differences)

| Aspect | StreamDock SDK |
|--------|----------------|
| PI Events | `$propEvent.sendToPropertyInspector(data)` (NOT `$SD.on(...)`) |
| Send to Plugin | `$websocket.sendToPlugin(payload)` (NOT `$SD.api.sendToPlugin(...)`) |
| Settings | `$settings` proxy — auto-saves (NOT `$SD.api.setSettings(...)`) |
| Context/routing | `$uuid` (NOT `context` from actionInfo) |

PI files define: `$local = false`, `$back = false`, `$propEvent` object with `didReceiveSettings` and `sendToPropertyInspector` handlers.

SDK files in `static/`: `common.js` (jQuery-like $, $.debounce, $emit), `sd-action.js`, `css/sdpi.css`.

## Dynamic Images & Canvas

**SVG does not work!** StreamDock doesn't support SVG. Use `@napi-rs/canvas` + PNG.

`@napi-rs/canvas` (Skia) — prebuilt binaries per platform, no compilation, drop-in replacement for node-canvas. Cross-platform install from WSL: `npm install --os=win32 --cpu=x64`.

Two canvas sizes:
- **Keypad** — 144×144 px (standard button)
- **Knob** — 230×144 px (StreamDock+ touchscreen above encoder)

**SVG icons via canvas:** Skia supports SVG natively via `loadImage(Buffer.from(svgString))` — can replace manual path drawing with parametric SVG strings.

## Type Definitions (types/)

- **streamdock.d.ts** — plugin backend (WebSocket messages, settings, events)
- **property-inspector.d.ts** — PI globals (`$settings`, `$websocket`, `$propEvent`)
- Key Knob types: `AppearPayload.controller` → `'Keypad' | 'Knob'`, `ActionContext.controller`

Used via JSDoc `@type`:
```javascript
/** @type {StreamDockSettings} */
const settings = data.settings || {};
```

## mactools

| Action | UUID |
|--------|------|
| Drive Info | `com.isrudoy.mactools.driveinfo` |
| Battery Monitor | `com.isrudoy.mactools.battery` |
| Run Script | `com.isrudoy.mactools.osascript` |

**Apple Bluetooth:** `ioreg` + `system_profiler SPBluetoothDataType`.
**Razer (macOS):** native helper (`devices/razer-battery-helper`), requires Input Monitoring permission.
**macOS APFS:** `df` shows wrong values for root — use `/System/Volumes/Data` partition and remap to `/`.

## wintools

Battery Monitor for Razer wireless devices. **Features vs mactools:** dual device mode (split-view 144×144), per-device intervals (1–300s), 24-hour device cache, lightning bolt drawn as canvas path (emoji ⚡ doesn't render on Windows sans-serif).

**Native helper** (`razer-battery-helper.exe`): C, cross-compiled from WSL with MinGW. CLI: `--enumerate`, `--path "..."`.
**HID quirk:** Windows mouhid.sys blocks `GENERIC_READ|GENERIC_WRITE` on mi_00. Solution: `CreateFile` with `dwDesiredAccess=0` + `IOCTL_HID_SET/GET_FEATURE`. Target `mi_00` with `FeatureReportByteLength >= 91`. 91-byte buffers (report ID 0x00 prepended, all offsets +1 vs macOS). CRC: XOR over bytes [3..88].

## unifi

VPN Status for Unifi Network. Shows name, IP, uptime, traffic. States: Connected (green), Connecting (yellow), Disconnected (gray), Error (red).

**API:** `GET /proxy/network/api/s/default/rest/networkconf` (VPN list), `GET /proxy/network/v2/api/site/default/vpn/connections` (status). Headers: `X-API-KEY`, `Accept: application/json`.

## acontrol

Adam Audio A-Series control via OCA/AES70 over UDP port 49494. Auto-discovery via mDNS (`_oca._udp.local.`). Fallback: macOS `dns-sd` CLI when port 5353 is unavailable (e.g. held by Browser/Arc).

**Single action** `com.isrudoy.acontrol.speakers` — Keypad: Mute/DIM/Sleep/Input/Voicing. Knob: volume dial with configurable step.

**Important:** Volume/DIM only work in Ext. voicing mode (2). Pure (0) / UNR (1) use physical knob → UI shows "Vol. N/A".

**Speaker Manager:** Singleton, ref-counted (`addRef`/`removeRef`). `broadcast()` sends to all speakers. State cached (speakers are physically synced). Toggle/cycle use explicit set values to avoid sync issues.

**OCA protocol:** Binary, 10-byte header (Sync 0x3B + Version + Size + Type + Count). Types: Command (0x01), Response (0x03), Keepalive (0x04). Keepalive every ~1s.

## antelope

Antelope Zen Quadro SC control via Antelope Manager Server TCP protocol.

| Action | UUID |
|--------|------|
| Output | `com.isrudoy.antelope.output` |
| Mixer | `com.isrudoy.antelope.mixer` |

**Connection:** TCP localhost, port autodiscovery 2020-2030 (find port with cyclic reports containing `volumes`). Cyclic reports ~500ms (volumes, preamp, sync). Also: `get_mixer` (full bus state), `set_mixer` notifications, `get_mixer_links`.

**Optimistic updates:** Per-field output locks (1s) — cyclic reports use optimistic value while locked. Each field independent (e.g. device auto-mute at -inf still comes through while volume is locked). Mixer linked channel sync applies updates to both channels.

**Stereo link:** Pairs odd+even (1+2, 3+4). `get_mixer_links`: 64 entries, 16 per bus, entry p → channels 2p+1 and 2p+2 (hypothesis). Yellow "L" badge on Keypad, "LINK" on Knob.

**CLI:** `node com.isrudoy.antelope.sdPlugin/antelope/cli.js [port] [command]` — status, mixer, links, fader, link.

## spruthub

Smart home control via Sprut.Hub (HomeKit-compatible).

| Action | UUID |
|--------|------|
| Light | `com.isrudoy.spruthub.light` |
| Switch | `com.isrudoy.spruthub.switch` |
| Outlet | `com.isrudoy.spruthub.outlet` |
| Lock | `com.isrudoy.spruthub.lock` |
| Cover | `com.isrudoy.spruthub.cover` |
| Thermostat | `com.isrudoy.spruthub.thermostat` |
| Sensor | `com.isrudoy.spruthub.sensor` |
| Button | `com.isrudoy.spruthub.button` |
| Scenario | `com.isrudoy.spruthub.scenario` |

### BaseAction Pattern (base-action.js)

All actions extend `BaseAction`. Config: `actionType`, `deviceTypeName`, `drawIcon`, `initialState`, `useRoomName`, `findService`, `extractState`, `renderState`, `renderKnobState` (optional), `handleStateChange`, `handleKeyUp`.

Shared utilities: `mapBaseSettings`, `handleToggleKeyUp`, `handleOnOffStateChange`, `extractOnOffState`.

**Display name priority:** `customName` → `roomName` (only if `useRoomName: true`, e.g. lights) → `serviceName` (if differs from accessoryName) → `accessoryName`.

### Knob Support

- `willAppear` payload has `controller: 'Keypad' | 'Knob'`
- Dial: `previewDialRotate` (immediate UI) + `handleDialRotate` (debounced 150ms API call)
- State synced across all buttons for same accessory via `syncAccessoryState()`
- State cached per `${actionType}:${accessoryId}` — prevents "Connecting..." flash on page switch
- Knob layout: icon left (x=50, y=72), text right (x=95), vertically centered. Room name (gray 14px) → device name (white 20px, wraps >11 chars) → status (colored 20px).

### Action-Specific Display

**Button (Keypad):** Line 1 = `serviceName` (action name), Line 2 = `accessoryName` (device name).
**Button (Knob):** Name = `accessoryName`. Status = dial action names (e.g. "Тише / Включить / Громче") or `customStatus`. Names from `dialLeftServiceName`, `dialPressServiceName`, `dialRightServiceName`.
**Thermostat (both):** Large = current temp. Status = target temp with arrow + mode (e.g. "↑ 25.0° · Heat").

### Sprut.Hub API

WebSocket JSON-RPC over `wss://{host}/bff/`. Auth: `{method: 'auth', params: {token, serial}}`.
Methods: `getAccessories`, `getRooms`, `updateCharacteristic`.

**Service types:** Lightbulb (13), Switch, Outlet, LockMechanism, WindowCovering, Thermostat, *Sensor (4 types), StatelessProgrammableSwitch (89).
**Char values:** `boolValue`, `intValue` (modes, 0-100), `doubleValue` (temp, humidity).
**Offline:** `SprutHub.isAccessoryOffline(accessory)`.

### Spruthub PI (pi-lib/)

Two init modes: `SprutHubPI.initConnection()` (scenario only) and `SprutHubPI.initDeviceSelection({...})` (device actions with room/device/service dropdowns).

Connection panel auto-collapses if configured. Cascade reset: room → device/service, device → service. Service dropdown always visible. Service names: use `selectedOptions[0].textContent` (works even if `availableButtons` empty during restore).

### Button States

All actions: Normal, Connecting (yellow), Error (red), Not Configured (gray), Offline (gray + actual state).

## Coding Style

- **Never use `@ts-ignore`** — fix types instead
- **Avoid type casts** — acceptable only for WebSocket/API `unknown` responses
- Use `?.`, `??`, runtime type guards (`typeof x === 'string'`) over casts
- Define proper `@typedef` for unknown API structures

## Common Pitfalls

1. **Plugin Not Starting** — `node --check plugin/index.js`
2. **PI Not Receiving Data** — Check `currentPIContext` is set
3. **setImage not working** — PNG only, not SVG
4. **Razer not detected** — Requires Input Monitoring permission (macOS)
5. **DEBUG logging** — `DEBUG = true` in source for local dev. Release workflow auto-sets `false`. Never change manually.
6. **Knob shows Keypad layout** — Must implement `renderKnobState` callback
7. **didReceiveSettings stale data** — BaseAction ignores if context already has `accessoryId`
8. **Characteristic ID vs Type** — `CHAR_ON` (37) etc. are TYPE constants, not IDs. Use `settings.characteristicId` for matching in `handleStateChange`.
9. **Offline rendering** — Don't use generic `drawOfflineWithIcon()`. Each action's `renderState` handles `state.offline` with actual state + "Offline" label.

## Reference

- StreamDock SDK: https://sdk.key123.vip/en/guide/overview.html
- Reference plugins in `./reference/` (gitignored)
