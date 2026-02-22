/**
 * razer-battery-helper.c
 * Windows HID helper for Razer wireless device battery level.
 *
 * Usage:
 *   razer-battery-helper.exe --enumerate
 *   razer-battery-helper.exe --path "\\?\hid#..."
 *
 * Output: JSON to stdout
 *   --enumerate: {"devices": [{"name": "Viper V3 Pro", "pid": 193, "path": "...", "isWired": false}]}
 *   --path:      {"battery": 85, "charging": false}
 *              | {"sleeping": true}
 *              | {"error": "reason"}
 *
 * Compile from WSL:
 *   x86_64-w64-mingw32-gcc -O2 -o razer-battery-helper.exe razer-battery-helper.c -lsetupapi -lhid
 */

/* Force ANSI API — DevicePath stays char[], avoids breakage if UNICODE is set */
#undef UNICODE
#undef _UNICODE
#include <windows.h>
#include <winioctl.h>
#include <setupapi.h>
#include <hidsdi.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>

/* IOCTL codes for HID feature reports (from hidclass.h).
 * Both use FILE_ANY_ACCESS — no specific rights required on the handle.
 * This lets us send/receive feature reports on devices locked by the OS
 * mouse driver (mouhid.sys), which blocks GENERIC_WRITE access. */
#ifndef IOCTL_HID_SET_FEATURE
#define IOCTL_HID_SET_FEATURE \
    CTL_CODE(FILE_DEVICE_KEYBOARD, 100, METHOD_IN_DIRECT, FILE_ANY_ACCESS)
#endif
#ifndef IOCTL_HID_GET_FEATURE
#define IOCTL_HID_GET_FEATURE \
    CTL_CODE(FILE_DEVICE_KEYBOARD, 100, METHOD_OUT_DIRECT, FILE_ANY_ACCESS)
#endif

static BOOL hid_set_feature(HANDLE h, void *buf, DWORD len) {
    DWORD bytesReturned;
    return DeviceIoControl(h, IOCTL_HID_SET_FEATURE, buf, len,
                           NULL, 0, &bytesReturned, NULL);
}

static BOOL hid_get_feature(HANDLE h, void *buf, DWORD len) {
    DWORD bytesReturned;
    return DeviceIoControl(h, IOCTL_HID_GET_FEATURE, NULL, 0,
                           buf, len, &bytesReturned, NULL);
}

/* ============================================================
 * Razer Device Table
 * ============================================================ */

typedef struct {
    const char *name;
    uint16_t pid;
    uint8_t transactionId;
    int isWired;
} RazerDevice;

static const RazerDevice RAZER_DEVICES[] = {
    { "Viper V3 Pro", 0x00c0, 0x1f, 1 },  /* wired */
    { "Viper V3 Pro", 0x00c1, 0x1f, 0 },  /* wireless dongle */
};

#define RAZER_VID      0x1532
#define DEVICE_COUNT   (sizeof(RAZER_DEVICES) / sizeof(RAZER_DEVICES[0]))

/* ============================================================
 * HID Report Protocol
 * On Windows: 91-byte buffer (1 byte report ID 0x00 prefix + 90 bytes data)
 * All data offsets are +1 compared to macOS (no report ID on macOS)
 * ============================================================ */

#define REPORT_SIZE    91
#define DATA_OFFSET    1   /* byte[0] = report ID (0x00), data starts at byte[1] */

/* Compute XOR checksum over bytes[DATA_OFFSET+2 .. DATA_OFFSET+87].
 * Matches macOS: XOR of request[2..87] (txId at [1] is excluded). */
static uint8_t razer_checksum(const uint8_t *buf) {
    uint8_t crc = 0;
    for (int i = DATA_OFFSET + 2; i < DATA_OFFSET + 88; i++) {
        crc ^= buf[i];
    }
    return crc;
}


/* ============================================================
 * Enumerate Razer HID devices
 * ============================================================ */

/* Returns device entry for pid, or NULL if not supported */
static const RazerDevice *find_device(uint16_t pid) {
    for (size_t i = 0; i < DEVICE_COUNT; i++) {
        if (RAZER_DEVICES[i].pid == pid) return &RAZER_DEVICES[i];
    }
    return NULL;
}

static void enumerate_devices(void) {
    GUID hidGuid;
    HidD_GetHidGuid(&hidGuid);

    HDEVINFO devInfo = SetupDiGetClassDevs(&hidGuid, NULL, NULL,
                                           DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (devInfo == INVALID_HANDLE_VALUE) {
        printf("{\"devices\": []}\n");
        return;
    }

    SP_DEVICE_INTERFACE_DATA ifaceData;
    ifaceData.cbSize = sizeof(SP_DEVICE_INTERFACE_DATA);

    printf("{\"devices\": [");
    int firstDevice = 1;
    DWORD idx = 0;

    /* Track seen PIDs to avoid duplicate entries from multiple HID interfaces
     * (e.g., mouse movement interface + control interface for same device) */
    uint16_t seenPids[64];
    int seenCount = 0;

    while (SetupDiEnumDeviceInterfaces(devInfo, NULL, &hidGuid, idx++, &ifaceData)) {
        /* Get required buffer size */
        DWORD requiredSize = 0;
        SetupDiGetDeviceInterfaceDetail(devInfo, &ifaceData, NULL, 0, &requiredSize, NULL);
        if (requiredSize == 0) continue;

        PSP_DEVICE_INTERFACE_DETAIL_DATA detail =
            (PSP_DEVICE_INTERFACE_DETAIL_DATA)malloc(requiredSize);
        if (!detail) continue;
        detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA);

        if (!SetupDiGetDeviceInterfaceDetail(devInfo, &ifaceData, detail,
                                              requiredSize, NULL, NULL)) {
            free(detail);
            continue;
        }

        /* Open with dwDesiredAccess=0. GENERIC_READ|GENERIC_WRITE fails for
         * interfaces locked by the OS mouse driver (mouhid.sys). With access=0
         * we can still read attributes and preparsed data, and use
         * IOCTL_HID_SET/GET_FEATURE (FILE_ANY_ACCESS — no rights required). */
        HANDLE hDev = CreateFile(detail->DevicePath,
                                  0,
                                  FILE_SHARE_READ | FILE_SHARE_WRITE,
                                  NULL, OPEN_EXISTING, 0, NULL);
        if (hDev == INVALID_HANDLE_VALUE) {
            free(detail);
            continue;
        }

        HIDD_ATTRIBUTES attrs;
        attrs.Size = sizeof(HIDD_ATTRIBUTES);
        if (!HidD_GetAttributes(hDev, &attrs)) {
            CloseHandle(hDev);
            free(detail);
            continue;
        }

        const RazerDevice *dev = find_device(attrs.ProductID);
        if (attrs.VendorID != RAZER_VID || !dev) {
            CloseHandle(hDev);
            free(detail);
            continue;
        }

        /* Skip if we already found an interface for this PID */
        int alreadySeen = 0;
        for (int i = 0; i < seenCount; i++) {
            if (seenPids[i] == attrs.ProductID) { alreadySeen = 1; break; }
        }
        if (alreadySeen) {
            CloseHandle(hDev);
            free(detail);
            continue;
        }

        /* Filter: only the top-level collection that owns the 91-byte feature
         * report reports FeatureReportByteLength >= REPORT_SIZE. Sub-collections
         * (consumer control, system control) report 0. */
        PHIDP_PREPARSED_DATA preparsed = NULL;
        int hasFeatureReport = 0;
        if (HidD_GetPreparsedData(hDev, &preparsed) && preparsed) {
            HIDP_CAPS caps;
            if (HidP_GetCaps(preparsed, &caps) == HIDP_STATUS_SUCCESS) {
                hasFeatureReport = (caps.FeatureReportByteLength >= REPORT_SIZE);
            }
            HidD_FreePreparsedData(preparsed);
        }
        CloseHandle(hDev);

        if (!hasFeatureReport) {
            free(detail);
            continue;
        }

        /* Record this PID so we don't emit duplicate entries */
        if (seenCount < 64) seenPids[seenCount++] = attrs.ProductID;

        /* Escape path for JSON (backslashes and quotes need escaping).
         * Reserve 3 bytes: 2 for a two-char escape sequence + 1 for '\0'. */
        char escapedPath[2048];
        int ei = 0;
        for (int ci = 0; detail->DevicePath[ci] && ei < (int)sizeof(escapedPath) - 3; ci++) {
            char c = detail->DevicePath[ci];
            if (c == '\\') {
                escapedPath[ei++] = '\\';
                escapedPath[ei++] = '\\';
            } else if (c == '"') {
                escapedPath[ei++] = '\\';
                escapedPath[ei++] = '"';
            } else {
                escapedPath[ei++] = c;
            }
        }
        escapedPath[ei] = '\0';

        if (!firstDevice) printf(", ");
        firstDevice = 0;

        printf("{\"name\": \"%s\", \"pid\": %d, \"path\": \"%s\", \"isWired\": %s}",
               dev->name,
               (int)attrs.ProductID,
               escapedPath,
               dev->isWired ? "true" : "false");

        free(detail);
    }

    SetupDiDestroyDeviceInfoList(devInfo);
    printf("]}\n");
}

/* ============================================================
 * Query battery for device at given path
 * ============================================================ */

static void query_battery(const char *devicePath) {
    uint8_t txId = 0x1f;

    /* Open with dwDesiredAccess=0. The mouse driver (mouhid.sys) blocks
     * GENERIC_WRITE on this interface. IOCTL_HID_SET/GET_FEATURE use
     * FILE_ANY_ACCESS so they work with any handle — no write rights needed. */
    HANDLE hDev = CreateFile(devicePath,
                              0,
                              FILE_SHARE_READ | FILE_SHARE_WRITE,
                              NULL, OPEN_EXISTING, 0, NULL);
    if (hDev == INVALID_HANDLE_VALUE) {
        printf("{\"error\": \"open_failed\"}\n");
        return;
    }

    /* Get transactionId from device PID */
    HIDD_ATTRIBUTES attrs;
    attrs.Size = sizeof(HIDD_ATTRIBUTES);
    if (HidD_GetAttributes(hDev, &attrs)) {
        const RazerDevice *dev = find_device(attrs.ProductID);
        if (dev) txId = dev->transactionId;
    }

    /* Build battery query: class=0x07, id=0x80 */
    uint8_t report[REPORT_SIZE];
    memset(report, 0, REPORT_SIZE);
    report[DATA_OFFSET + 1] = txId;
    report[DATA_OFFSET + 5] = 0x02;
    report[DATA_OFFSET + 6] = 0x07;
    report[DATA_OFFSET + 7] = 0x80;
    report[DATA_OFFSET + 88] = razer_checksum(report);

    if (!hid_set_feature(hDev, report, REPORT_SIZE)) {
        CloseHandle(hDev);
        printf("{\"error\": \"set_feature_failed\"}\n");
        return;
    }

    Sleep(15);

    uint8_t response[REPORT_SIZE];
    memset(response, 0, REPORT_SIZE);

    if (!hid_get_feature(hDev, response, REPORT_SIZE)) {
        CloseHandle(hDev);
        printf("{\"error\": \"get_feature_failed\"}\n");
        return;
    }

    uint8_t status = response[DATA_OFFSET + 0];

    /* status=4 means device is sleeping */
    if (status == 4) {
        CloseHandle(hDev);
        printf("{\"sleeping\": true}\n");
        return;
    }

    /* status=2 means success */
    if (status != 2) {
        CloseHandle(hDev);
        printf("{\"error\": \"bad_status_%d\"}\n", (int)status);
        return;
    }

    /* Battery level is at response[DATA_OFFSET + 9] (value 0-255, map to 0-100%) */
    int batteryRaw = response[DATA_OFFSET + 9];
    int batteryPct = (batteryRaw * 100 + 127) / 255;  /* +127 for rounding, matches macOS round() */

    /* Query charging status: class=0x07, id=0x84 */
    memset(report, 0, REPORT_SIZE);
    report[DATA_OFFSET + 1] = txId;
    report[DATA_OFFSET + 5] = 0x02;
    report[DATA_OFFSET + 6] = 0x07;
    report[DATA_OFFSET + 7] = 0x84;
    report[DATA_OFFSET + 88] = razer_checksum(report);

    int isCharging = 0;
    if (hid_set_feature(hDev, report, REPORT_SIZE)) {
        Sleep(15);
        memset(response, 0, REPORT_SIZE);
        if (hid_get_feature(hDev, response, REPORT_SIZE)) {
            if (response[DATA_OFFSET + 0] == 2) {
                isCharging = response[DATA_OFFSET + 9] ? 1 : 0;
            }
        }
    }

    CloseHandle(hDev);
    printf("{\"battery\": %d, \"charging\": %s}\n",
           batteryPct, isCharging ? "true" : "false");
}

/* ============================================================
 * Debug: dump all Razer HID interfaces with diagnostics
 * ============================================================ */

static void debug_enumerate(void) {
    GUID hidGuid;
    HidD_GetHidGuid(&hidGuid);

    HDEVINFO devInfo = SetupDiGetClassDevs(&hidGuid, NULL, NULL,
                                           DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (devInfo == INVALID_HANDLE_VALUE) {
        fprintf(stderr, "SetupDiGetClassDevs failed\n");
        return;
    }

    SP_DEVICE_INTERFACE_DATA ifaceData;
    ifaceData.cbSize = sizeof(SP_DEVICE_INTERFACE_DATA);
    DWORD idx = 0;
    int found = 0;

    while (SetupDiEnumDeviceInterfaces(devInfo, NULL, &hidGuid, idx++, &ifaceData)) {
        DWORD requiredSize = 0;
        SetupDiGetDeviceInterfaceDetail(devInfo, &ifaceData, NULL, 0, &requiredSize, NULL);
        if (requiredSize == 0) continue;

        PSP_DEVICE_INTERFACE_DETAIL_DATA detail =
            (PSP_DEVICE_INTERFACE_DETAIL_DATA)malloc(requiredSize);
        if (!detail) continue;
        detail->cbSize = sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA);

        if (!SetupDiGetDeviceInterfaceDetail(devInfo, &ifaceData, detail,
                                              requiredSize, NULL, NULL)) {
            free(detail);
            continue;
        }

        /* Open with no rights to check VID/PID */
        HANDLE h0 = CreateFile(detail->DevicePath, 0,
                                FILE_SHARE_READ | FILE_SHARE_WRITE,
                                NULL, OPEN_EXISTING, 0, NULL);
        if (h0 == INVALID_HANDLE_VALUE) {
            free(detail);
            continue;
        }

        HIDD_ATTRIBUTES attrs;
        attrs.Size = sizeof(HIDD_ATTRIBUTES);
        if (!HidD_GetAttributes(h0, &attrs) || attrs.VendorID != RAZER_VID) {
            CloseHandle(h0);
            free(detail);
            continue;
        }
        const RazerDevice *dev = find_device(attrs.ProductID);

        /* Get usage page/usage and feature report length */
        USHORT usagePage = 0, usage = 0;
        USHORT featureLen = 0;
        PHIDP_PREPARSED_DATA preparsed = NULL;
        if (HidD_GetPreparsedData(h0, &preparsed) && preparsed) {
            HIDP_CAPS caps;
            if (HidP_GetCaps(preparsed, &caps) == HIDP_STATUS_SUCCESS) {
                usagePage = caps.UsagePage;
                usage = caps.Usage;
                featureLen = caps.FeatureReportByteLength;
            }
            HidD_FreePreparsedData(preparsed);
        }

        /* Try IOCTL_HID_SET_FEATURE via access=0 handle (the working approach) */
        uint8_t probe[REPORT_SIZE];
        memset(probe, 0, REPORT_SIZE);
        probe[DATA_OFFSET + 1] = dev ? dev->transactionId : 0x1f;
        probe[DATA_OFFSET + 5] = 0x02;
        probe[DATA_OFFSET + 6] = 0x07;
        probe[DATA_OFFSET + 7] = 0x80;
        probe[DATA_OFFSET + 88] = razer_checksum(probe);
        int canSetFeature = hid_set_feature(h0, probe, REPORT_SIZE) ? 1 : 0;
        CloseHandle(h0);

        found++;
        fprintf(stderr, "--- Razer interface #%d ---\n", found);
        fprintf(stderr, "  PID:         0x%04X (%s)\n",
                attrs.ProductID,
                dev ? dev->name : "unsupported");
        fprintf(stderr, "  Path:        %s\n", detail->DevicePath);
        fprintf(stderr, "  UsagePage:   0x%04X  Usage: 0x%04X\n", usagePage, usage);
        fprintf(stderr, "  FeatureLen:  %d bytes\n", featureLen);
        fprintf(stderr, "  SetFeature:  %s\n", canSetFeature ? "YES" : "NO");

        free(detail);
    }

    if (!found) fprintf(stderr, "No Razer HID interfaces found\n");
    SetupDiDestroyDeviceInfoList(devInfo);
}

/* ============================================================
 * Main
 * ============================================================ */

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s --enumerate | --path \"<device-path>\" | --debug\n", argv[0]);
        return 1;
    }

    if (strcmp(argv[1], "--enumerate") == 0) {
        enumerate_devices();
        return 0;
    }

    if (strcmp(argv[1], "--path") == 0 && argc >= 3) {
        query_battery(argv[2]);
        return 0;
    }

    if (strcmp(argv[1], "--debug") == 0) {
        debug_enumerate();
        return 0;
    }

    fprintf(stderr, "Unknown argument: %s\n", argv[1]);
    return 1;
}
