/**
 * OCA/AES70 Protocol Implementation for Adam Audio A-Series speakers
 *
 * Binary protocol with 10-byte header over UDP (port 49494)
 *
 * Header format:
 * - Sync byte (1): 0x3B
 * - Protocol version (2): 0x0001
 * - Message size (4): total PDU size including header
 * - PDU type (1): Command (0x01), Response (0x03), Keepalive (0x04)
 * - Message count (2): number of messages in PDU
 */

const OCA_PORT = 49494;
const OCA_SYNC_BYTE = 0x3b;
const OCA_PROTOCOL_VERSION = 1;

// PDU Types
const PDU_TYPE = {
  COMMAND: 0x01,
  COMMAND_RRQ: 0x02, // Command requiring response
  RESPONSE: 0x03,
  KEEPALIVE: 0x04,
};

// Adam Audio specific object numbers (from pacontrol Python reference)
// Method format: { get: {level, index}, set: {level, index} }
const OCA_OBJECTS = {
  MUTE: {
    // 33619989 = 0x02010015 (NOT 0x02010005 as in PROTOCOL.md - typo)
    // GET returns stale data — OCA set doesn't update the readable register
    oNo: 0x02010015,
    set: { level: 4, index: 2 },
  },
  INPUT: {
    oNo: 0x0101000b,
    get: { level: 4, index: 1 },
    set: { level: 4, index: 2 },
  },
  LEVEL: {
    oNo: 0x01010002,
    get: { level: 5, index: 1 },
    set: { level: 5, index: 2 },
  },
  VOICING: {
    oNo: 0x03010069,
    get: { level: 4, index: 1 },
    set: { level: 4, index: 2 },
  },
  SLEEP: {
    // 50528364 = 0x0303006c (from Python reference)
    oNo: 0x0303006c,
    get: { level: 4, index: 1 },
    set: { level: 4, index: 2 },
  },
  LED: {
    // 50593804 = 0x0304000c (from Python reference)
    oNo: 0x0304000c,
    set: { level: 5, index: 2 },
  },
};

let handleCounter = 0;

/**
 * Generate unique handle for command tracking
 * @returns {number}
 */
function nextHandle() {
  handleCounter = (handleCounter + 1) & 0xffffffff;
  return handleCounter;
}

/**
 * Encode OCA header (10 bytes)
 * @param {number} messageSize - Total PDU size including header
 * @param {number} pduType - PDU type (Command, Response, Keepalive)
 * @param {number} messageCount - Number of messages in PDU
 * @returns {Buffer}
 */
function encodeHeader(messageSize, pduType, messageCount) {
  const header = Buffer.alloc(10);
  let offset = 0;

  // Sync byte
  header.writeUInt8(OCA_SYNC_BYTE, offset++);

  // Protocol version (2 bytes, big-endian)
  header.writeUInt16BE(OCA_PROTOCOL_VERSION, offset);
  offset += 2;

  // Message size (4 bytes, big-endian)
  header.writeUInt32BE(messageSize, offset);
  offset += 4;

  // PDU type (1 byte)
  header.writeUInt8(pduType, offset++);

  // Message count (2 bytes, big-endian)
  header.writeUInt16BE(messageCount, offset);

  return header;
}

/**
 * Encode OCA command message
 * Format: !IIIHHB + params (19 bytes header + params)
 *
 * @param {number} oNo - Object number (target)
 * @param {number} methodLevel - Method definition level
 * @param {number} methodIndex - Method index
 * @param {Buffer} [params] - Optional parameters buffer
 * @param {number} [paramCount] - Number of parameters (default: 1 if params provided, 0 otherwise)
 * @returns {{buffer: Buffer, handle: number}}
 */
function encodeCommand(oNo, methodLevel, methodIndex, params = Buffer.alloc(0), paramCount) {
  const handle = nextHandle();

  // Determine parameter count
  const pCount = paramCount !== undefined ? paramCount : params.length > 0 ? 1 : 0;

  // Command body size: 4 (size) + 4 (handle) + 4 (oNo) + 2 (level) + 2 (index) + 1 (paramCount) + params
  const commandBodySize = 4 + 4 + 4 + 2 + 2 + 1 + params.length;

  // Total packet size: header (10) + commandBodySize
  // Message size = bytes after sync byte = totalSize - 1
  const totalSize = 10 + commandBodySize;
  const messageSize = totalSize - 1;

  const body = Buffer.alloc(commandBodySize);
  let offset = 0;

  // Command size (4 bytes) - encoded length of PDU
  body.writeUInt32BE(commandBodySize, offset);
  offset += 4;

  // Handle (4 bytes) - request ID for matching responses
  body.writeUInt32BE(handle, offset);
  offset += 4;

  // Target object number (4 bytes)
  body.writeUInt32BE(oNo, offset);
  offset += 4;

  // Method level (2 bytes)
  body.writeUInt16BE(methodLevel, offset);
  offset += 2;

  // Method index (2 bytes)
  body.writeUInt16BE(methodIndex, offset);
  offset += 2;

  // Parameter count (1 byte)
  body.writeUInt8(pCount, offset);
  offset += 1;

  // Parameters
  if (params.length > 0) {
    params.copy(body, offset);
  }

  const header = encodeHeader(messageSize, PDU_TYPE.COMMAND, 1);
  const buffer = Buffer.concat([header, body]);

  return { buffer, handle };
}

/**
 * Encode OCA keepalive message
 * @param {number} heartbeatTime - Heartbeat timeout in seconds (OcaUint16)
 * @returns {Buffer}
 */
function encodeKeepalive(heartbeatTime = 3) {
  // Keepalive PDU: header (10) + heartbeat time (2) = 12 bytes total
  // Message size = bytes after sync byte = 11
  const messageSize = 11;
  const header = encodeHeader(messageSize, PDU_TYPE.KEEPALIVE, 1);

  const body = Buffer.alloc(2);
  body.writeUInt16BE(heartbeatTime, 0);

  return Buffer.concat([header, body]);
}

/**
 * Decode OCA response
 * @param {Buffer} buffer - Response buffer
 * @returns {{type: number, handle?: number, status?: number, paramCount?: number, params?: Buffer} | null}
 */
function decodeResponse(buffer) {
  if (buffer.length < 10) {
    return null;
  }

  let offset = 0;

  // Sync byte
  const sync = buffer.readUInt8(offset++);
  if (sync !== OCA_SYNC_BYTE) {
    return null;
  }

  // Protocol version (not used currently, but required for parsing)
  const _version = buffer.readUInt16BE(offset);
  offset += 2;

  // Message size
  const messageSize = buffer.readUInt32BE(offset);
  offset += 4;

  // PDU type
  const pduType = buffer.readUInt8(offset++);

  // Message count (not used currently, but required for parsing)
  const _messageCount = buffer.readUInt16BE(offset);
  offset += 2;

  if (pduType === PDU_TYPE.KEEPALIVE) {
    return { type: PDU_TYPE.KEEPALIVE };
  }

  if (pduType !== PDU_TYPE.RESPONSE) {
    return { type: pduType };
  }

  if (buffer.length < messageSize) {
    return null;
  }

  // Response body
  // Response size (4 bytes)
  const responseSize = buffer.readUInt32BE(offset);
  offset += 4;

  // Handle (4 bytes)
  const handle = buffer.readUInt32BE(offset);
  offset += 4;

  // Status (1 byte)
  const status = buffer.readUInt8(offset++);

  // Parameters count (1 byte)
  const paramCount = buffer.readUInt8(offset++);

  // Remaining bytes are parameters
  const paramsLength = responseSize - 10;
  const params =
    paramsLength > 0 ? buffer.subarray(offset, offset + paramsLength) : Buffer.alloc(0);

  return {
    type: PDU_TYPE.RESPONSE,
    handle,
    status,
    paramCount,
    params,
  };
}

// OCA data type encoders

/**
 * Encode OcaUint8 (1 byte)
 * @param {number} value
 * @returns {Buffer}
 */
function encodeUint8(value) {
  const buf = Buffer.alloc(1);
  buf.writeUInt8(value, 0);
  return buf;
}

/**
 * Encode OcaInt8 (1 byte, signed)
 * @param {number} value
 * @returns {Buffer}
 */
function encodeInt8(value) {
  const buf = Buffer.alloc(1);
  buf.writeInt8(value, 0);
  return buf;
}

/**
 * Encode OcaUint16 (2 bytes, big-endian)
 * @param {number} value
 * @returns {Buffer}
 */
function encodeUint16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

/**
 * Encode OcaInt16 (2 bytes, signed, big-endian)
 * @param {number} value
 * @returns {Buffer}
 */
function encodeInt16(value) {
  const buf = Buffer.alloc(2);
  buf.writeInt16BE(value, 0);
  return buf;
}

/**
 * Encode OcaFloat32 (4 bytes, big-endian IEEE 754)
 * @param {number} value
 * @returns {Buffer}
 */
function encodeFloat32(value) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(value, 0);
  return buf;
}

// OCA data type decoders

/**
 * Decode OcaUint8 (1 byte)
 * @param {Buffer} buffer
 * @param {number} [offset=0]
 * @returns {number}
 */
function decodeUint8(buffer, offset = 0) {
  return buffer.readUInt8(offset);
}

/**
 * Decode OcaInt8 (1 byte, signed)
 * @param {Buffer} buffer
 * @param {number} [offset=0]
 * @returns {number}
 */
function decodeInt8(buffer, offset = 0) {
  return buffer.readInt8(offset);
}

/**
 * Decode OcaUint16 (2 bytes, big-endian)
 * @param {Buffer} buffer
 * @param {number} [offset=0]
 * @returns {number}
 */
function decodeUint16(buffer, offset = 0) {
  return buffer.readUInt16BE(offset);
}

/**
 * Decode OcaFloat32 (4 bytes, big-endian IEEE 754)
 * @param {Buffer} buffer
 * @param {number} [offset=0]
 * @returns {number}
 */
function decodeFloat32(buffer, offset = 0) {
  return buffer.readFloatBE(offset);
}

module.exports = {
  OCA_PORT,
  OCA_SYNC_BYTE,
  PDU_TYPE,
  OCA_OBJECTS,
  encodeHeader,
  encodeCommand,
  encodeKeepalive,
  decodeResponse,
  encodeUint8,
  encodeInt8,
  encodeUint16,
  encodeInt16,
  encodeFloat32,
  decodeUint8,
  decodeInt8,
  decodeUint16,
  decodeFloat32,
  nextHandle,
};
