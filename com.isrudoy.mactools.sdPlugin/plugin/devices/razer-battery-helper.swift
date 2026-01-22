#!/usr/bin/env swift

/**
 * Razer Battery Helper - IOKit-based battery query (non-blocking)
 *
 * Usage:
 *   razer-battery-helper --enumerate              List available Razer devices
 *   razer-battery-helper --path "DevSrvsID:xxx"   Query battery for device
 *
 * Compile: swiftc -O -o razer-battery-helper razer-battery-helper.swift
 */

import Foundation
import IOKit
import IOKit.hid

// Supported Razer devices
let RAZER_VID: Int32 = 0x1532
let SUPPORTED_DEVICES: [(name: String, pids: [Int32], txId: UInt8)] = [
    ("Viper V3 Pro", [0x00C0, 0x00C1], 0x1f)
]

struct BatteryResult: Codable {
    var battery: Int?
    var charging: Bool
    var error: String?
    var sleeping: Bool?
}

struct DeviceInfo: Codable {
    var name: String
    var pid: Int
    var path: String
    var isWired: Bool
}

struct EnumerateResult: Codable {
    var devices: [DeviceInfo]
}

func outputJSON<T: Codable>(_ result: T) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

// Parse arguments
var devicePath: String? = nil
var delayMs: UInt32 = 15
var enumerate = false

let args = CommandLine.arguments
for i in 0..<args.count {
    if args[i] == "--path" && i + 1 < args.count {
        devicePath = args[i + 1]
    }
    if args[i] == "--delay" && i + 1 < args.count {
        if let delay = UInt32(args[i + 1]) {
            delayMs = delay
        }
    }
    if args[i] == "--enumerate" {
        enumerate = true
    }
}

// Enumerate mode
if enumerate {
    var devices: [DeviceInfo] = []

    let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
    IOHIDManagerSetDeviceMatching(manager, [kIOHIDVendorIDKey as String: RAZER_VID] as CFDictionary)
    IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))

    if let deviceSet = IOHIDManagerCopyDevices(manager), let hidDevices = deviceSet as? Set<IOHIDDevice> {
        for hidDevice in hidDevices {
            guard let productId = IOHIDDeviceGetProperty(hidDevice, kIOHIDProductIDKey as CFString) as? Int32,
                  let usagePage = IOHIDDeviceGetProperty(hidDevice, kIOHIDPrimaryUsagePageKey as CFString) as? Int,
                  let usage = IOHIDDeviceGetProperty(hidDevice, kIOHIDPrimaryUsageKey as CFString) as? Int else {
                continue
            }

            // Mouse devices (usage=2) - same path as usage=1 which supports feature reports
            guard usagePage == 1 && usage == 2 else { continue }

            // Check if supported device
            for supported in SUPPORTED_DEVICES {
                if supported.pids.contains(productId) {
                    // Get registry entry ID for path
                    let service = IOHIDDeviceGetService(hidDevice)
                    var entryId: UInt64 = 0
                    IORegistryEntryGetRegistryEntryID(service, &entryId)

                    devices.append(DeviceInfo(
                        name: supported.name,
                        pid: Int(productId),
                        path: "DevSrvsID:\(entryId)",
                        isWired: productId == 0x00C0
                    ))
                    break
                }
            }
        }
    }

    IOHIDManagerClose(manager, IOOptionBits(kIOHIDOptionsTypeNone))
    outputJSON(EnumerateResult(devices: devices))
    exit(0)
}

// Battery query mode
guard let path = devicePath else {
    outputJSON(BatteryResult(battery: nil, charging: false, error: "no_path"))
    exit(0)
}

// Parse DevSrvsID from path
guard path.hasPrefix("DevSrvsID:"),
      let entryId = UInt64(path.replacingOccurrences(of: "DevSrvsID:", with: "")) else {
    outputJSON(BatteryResult(battery: nil, charging: false, error: "invalid_path"))
    exit(0)
}

// Razer constants
let TRANSACTION_ID: UInt8 = 0x1f
let PACKET_SIZE = 90  // Important: 90 bytes, not 91!

// Find the IORegistryEntry by ID
let matchDict = IORegistryEntryIDMatching(entryId)
let entry = IOServiceGetMatchingService(kIOMainPortDefault, matchDict)

guard entry != 0 else {
    outputJSON(BatteryResult(battery: nil, charging: false, error: "no_device"))
    exit(0)
}

// Create IOHIDDevice from the registry entry (like hidapi does)
guard let device = IOHIDDeviceCreate(kCFAllocatorDefault, entry) else {
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: "create_failed"))
    exit(0)
}

// Open the device
let openResult = IOHIDDeviceOpen(device, IOOptionBits(kIOHIDOptionsTypeNone))
guard openResult == kIOReturnSuccess else {
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: "open_failed"))
    exit(0)
}

let delayUs = delayMs * 1000

// Build request packet
func buildRequest(commandClass: UInt8, commandId: UInt8) -> [UInt8] {
    var request = [UInt8](repeating: 0, count: PACKET_SIZE)
    request[1] = TRANSACTION_ID
    request[5] = 0x02
    request[6] = commandClass
    request[7] = commandId

    var crc: UInt8 = 0
    for i in 2..<88 {
        crc ^= request[i]
    }
    request[88] = crc

    return request
}

func sendCommand(commandClass: UInt8, commandId: UInt8) -> [UInt8]? {
    var request = buildRequest(commandClass: commandClass, commandId: commandId)

    let sendResult = IOHIDDeviceSetReport(device, kIOHIDReportTypeFeature, 0, &request, PACKET_SIZE)
    guard sendResult == kIOReturnSuccess else {
        return nil
    }

    usleep(delayUs)

    var response = [UInt8](repeating: 0, count: PACKET_SIZE)
    var len = PACKET_SIZE

    let getResult = IOHIDDeviceGetReport(device, kIOHIDReportTypeFeature, 0, &response, &len)
    guard getResult == kIOReturnSuccess else {
        return nil
    }

    return response
}

// Query battery
guard let batteryResponse = sendCommand(commandClass: 0x07, commandId: 0x80) else {
    IOHIDDeviceClose(device, IOOptionBits(kIOHIDOptionsTypeNone))
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: "query_failed"))
    exit(0)
}

let status = batteryResponse[0]

// Handle status
switch status {
case 2:
    // Success
    let batteryRaw = batteryResponse[9]
    let battery = Int(round(Double(batteryRaw) / 255.0 * 100.0))

    // Query charging status
    var isCharging = false
    if let chargingResponse = sendCommand(commandClass: 0x07, commandId: 0x84) {
        if chargingResponse[0] == 2 {
            isCharging = chargingResponse[9] == 1
        }
    }

    IOHIDDeviceClose(device, IOOptionBits(kIOHIDOptionsTypeNone))
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: battery, charging: isCharging, error: nil))

case 4:
    // Sleeping
    IOHIDDeviceClose(device, IOOptionBits(kIOHIDOptionsTypeNone))
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: nil, sleeping: true))

case 3, 5:
    // Not supported
    IOHIDDeviceClose(device, IOOptionBits(kIOHIDOptionsTypeNone))
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: "not_supported"))

default:
    IOHIDDeviceClose(device, IOOptionBits(kIOHIDOptionsTypeNone))
    IOObjectRelease(entry)
    outputJSON(BatteryResult(battery: nil, charging: false, error: "status_\(status)"))
}
