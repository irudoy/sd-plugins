# Plan: Create `com.isrudoy.wintools.sdPlugin` Plugin

## Context

The mactools plugin provides battery monitoring for Apple Bluetooth and Razer devices on macOS, using a Swift native helper for Razer HID communication. We need a Windows equivalent — a new **wintools** plugin with a Battery Monitor action, starting with Razer mouse battery support. The Razer HID protocol is identical across platforms (90-byte packets, command class 0x07), but the native helper needs to be rewritten in C using Windows HID API. Later we'll add Corsair K83 Wireless and 3Dconnexion SpaceMouse Wireless support.

## Approach

Create a new Windows-only plugin by:
1. Writing a C native helper for Razer battery (cross-compiled from WSL with MinGW)
2. Copying and adapting JS modules from mactools (removing Apple device support, switching to @napi-rs/canvas)
3. Copying and adapting the Battery Monitor PI (removing Apple device references)

The JS wrapper (`razer.js`) and its CLI interface (`--enumerate`, `--path`, JSON output) stay identical — only the native binary changes from Swift to C.

## File Structure

```
com.isrudoy.wintools.sdPlugin/
├── package.json
├── manifest.json
├── plugin/
│   ├── index.js              # Entry point (simplified — battery action only)
│   ├── lib/
│   │   ├── common.js         # Constants, colors, logging
│   │   ├── state.js          # Shared state (contexts, timers, device cache)
│   │   ├── websocket.js      # WebSocket communication
│   │   └── battery-drawing.js # Canvas drawing (from mactools, @napi-rs/canvas)
│   ├── actions/
│   │   └── battery.js        # Battery Monitor action (Razer only, no Apple)
│   └── devices/
│       ├── razer.js           # JS wrapper (from mactools, .exe path)
│       └── razer-battery-helper.c  # C source (new)
├── battery/
│   ├── index.html            # Property Inspector (adapted, no Apple groups)
│   └── index.js              # PI logic (adapted, no Apple references)
└── static/                   # SDK + icons (copy from mactools)
```

## Steps

### 1. Create C native helper (`razer-battery-helper.c`)

Port the Swift helper to C using Windows HID API. Same CLI interface and JSON output.

**Key Windows HID differences from macOS IOKit:**
- Use `SetupDiGetClassDevs` + `SetupDiEnumDeviceInterfaces` for enumeration
- Use `HidD_GetAttributes` to match VID/PID
- Use `HidD_SetFeature` / `HidD_GetFeature` for HID reports
- **91-byte buffers** on Windows (report ID 0x00 prepended as first byte, all data offsets +1 vs macOS)
- Device path: Windows device instance path string (not `DevSrvsID:xxx`)

**Enumerate mode** (`--enumerate`):
- Find all HID devices with VID `0x1532`
- Filter by supported PIDs and usage page 1 / usage 2
- Output JSON: `{"devices": [{"name": "Viper V3 Pro", "pid": 193, "path": "\\\\?\\hid#...", "isWired": false}]}`

**Battery query mode** (`--path "\\?\hid#..."`):
- Open device by path with `CreateFile`
- Send 91-byte feature report (byte[0]=0x00 report ID, byte[2]=txId, byte[6]=0x02, byte[7]=0x07, byte[8]=0x80, CRC at byte[89])
- Sleep 15ms, read response via `HidD_GetFeature`
- Parse response: status at byte[1], battery at byte[10]
- If success (status=2): query charging (cmd 0x84), output `{"battery": N, "charging": bool}`
- If sleeping (status=4): output `{"sleeping": true}`
- If error: output `{"error": "reason"}`

**Compile from WSL:**
```bash
x86_64-w64-mingw32-gcc -O2 -o razer-battery-helper.exe razer-battery-helper.c -lsetupapi -lhid
```

### 2. Create `manifest.json`

Windows-only manifest with single Battery Monitor action:
- `CodePathWin: "plugin/index.js"` (no `CodePathMac`)
- `OS: [{"Platform": "windows", "MinimumVersion": "7"}]`
- `Nodejs: {"Version": "20"}`
- `Software: {"MinimumVersion": "3.10.188.226"}`
- Action UUID: `com.isrudoy.wintools.battery`
- Controllers: `["Keypad", "Information"]`
- Plugin name: "Win Tools", Category: "Win Tools"

### 3. Create `package.json`

```json
{
  "name": "com.isrudoy.wintools",
  "version": "1.0.0",
  "description": "Windows system utilities for StreamDock",
  "main": "plugin/index.js",
  "dependencies": {
    "@napi-rs/canvas": "0.1.93",
    "ws": "8.14.2"
  },
  "optionalDependencies": {
    "@napi-rs/canvas-win32-x64-msvc": "0.1.93"
  }
}
```

### 4. Copy and adapt JS modules from mactools

**From mactools, adapt:**
- `plugin/lib/common.js` — change action UUIDs to `com.isrudoy.wintools.*`, remove `DRIVEINFO_ACTION`, `OSASCRIPT_ACTION`
- `plugin/lib/state.js` — remove `apple` from device cache, keep `razer` only
- `plugin/lib/websocket.js` — change log prefix from `[MacTools]` to `[WinTools]`
- `plugin/lib/battery-drawing.js` — change `require('canvas')` to `require('@napi-rs/canvas')`, rest identical
- `plugin/actions/battery.js` — remove all Apple device logic (`getAppleDevices`, `getAppleBattery`), keep only Razer
- `plugin/devices/razer.js` — change `HELPER_PATH` to use `.exe` extension, rest identical
- `plugin/index.js` — simplified entry point (battery action only, no driveinfo/osascript routing)

### 5. Copy and adapt Property Inspector

**From mactools `battery/`:**
- `battery/index.html` — remove Apple-specific styles/messages, update heading to "Win Tools"
- `battery/index.js` — remove Apple device grouping logic, remove `device-type-apple` class, simplify device list

### 6. Copy static assets

Copy `static/` directory from mactools (SDK files: `common.js`, `sd-action.js`, `css/sdpi.css`).
Copy battery icon images. Create/reuse plugin icon and category icon.

### 7. Update root `package.json`

Add scripts:
- `"link:win:wintools": "cmd.exe /c scripts\\link-win.cmd com.isrudoy.wintools"`

### 8. Create link wrapper script

`scripts/link-win-wintools.cmd`:
```cmd
@echo off
call "%~dp0link-win.cmd" com.isrudoy.wintools
```

### 9. Install dependencies and compile

```bash
cd com.isrudoy.wintools.sdPlugin
npm install
npm install --os=win32 --cpu=x64
x86_64-w64-mingw32-gcc -O2 -o plugin/devices/razer-battery-helper.exe plugin/devices/razer-battery-helper.c -lsetupapi -lhid
```

## Verification

1. `node --check com.isrudoy.wintools.sdPlugin/plugin/index.js` — syntax check
2. `npm run lint` — ESLint passes
3. `npm run typecheck` — TypeScript/JSDoc passes
4. Cross-compile C helper successfully
5. Link plugin on Windows: `npm run link:win:wintools`
6. Restart StreamDock, verify plugin appears
7. Add Battery Monitor button, verify Razer device detected and battery shown
