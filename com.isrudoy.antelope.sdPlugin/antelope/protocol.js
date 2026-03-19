/**
 * Antelope Manager Server Wire Protocol
 *
 * Wire format: [4 bytes BE total_length][JSON payload]
 * Command format: ["command", [positional_args], {kwargs}]
 *
 * @module antelope/protocol
 */

// ============================================================
// Type Definitions
// ============================================================

/**
 * @typedef {Object} CyclicReportContents
 * @property {number} current_preset - Current preset index (0-7)
 * @property {number} power_on - Power state
 * @property {number} sync_source - Clock source
 * @property {number} sync_freq_hi - Sample rate high byte
 * @property {number} sync_freq_mid - Sample rate mid byte
 * @property {number} sync_freq_low - Sample rate low byte
 * @property {boolean} [device_updated] - Device settings changed
 * @property {Array<{volume: number, mute: number, dim_on: number, mono: number, trim: number}>} volumes - Output states
 * @property {number[]} preamp_gains - Preamp gain values
 * @property {Array<{type: number, phantom: number, hpf: number, phase_inv: number, zero_cross: number}>} preamps - Preamp states
 * @property {number[]} peaks_preamp - Preamp peak meters
 */

/**
 * @typedef {Object} CyclicReport
 * @property {'cyclic'} type
 * @property {number} protocol_version
 * @property {{cmd: number, seq: number, ext2: number, ext3: number}} header
 * @property {CyclicReportContents} contents
 */

/**
 * @typedef {Object} Notification
 * @property {'notification'} type
 * @property {number} protocol_version
 * @property {unknown} contents
 */

/**
 * @typedef {Object} GetResponse
 * @property {'single'} type
 * @property {number} protocol_version
 * @property {{cmd: number, seq: number, ext2: number, ext3: number}} header
 * @property {unknown} contents
 */

// ============================================================
// Protocol Functions
// ============================================================

/**
 * Encode command to wire format
 * @param {string} command - Command name
 * @param {unknown[]} [args] - Positional arguments
 * @param {Record<string, unknown>} [kwargs] - Keyword arguments
 * @returns {Buffer} Encoded packet
 */
function encodeCommand(command, args = [], kwargs = {}) {
  const payload = JSON.stringify([command, args, kwargs]);
  const payloadBuf = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(4 + payloadBuf.length, 0);
  return Buffer.concat([header, payloadBuf]);
}

/**
 * Extract complete packet from buffer
 * @param {Buffer} buffer - Input buffer
 * @returns {{packet: Buffer|null, remaining: Buffer}} Extracted packet and remaining buffer
 */
function extractPacket(buffer) {
  if (buffer.length < 4) {
    return { packet: null, remaining: buffer };
  }

  const totalLength = buffer.readUInt32BE(0);

  if (totalLength < 4 || totalLength > 1024 * 1024) {
    return { packet: null, remaining: buffer.subarray(1) };
  }

  if (buffer.length < totalLength) {
    return { packet: null, remaining: buffer };
  }

  return {
    packet: buffer.subarray(0, totalLength),
    remaining: buffer.subarray(totalLength),
  };
}

/**
 * Parse packet payload as JSON
 * @param {Buffer} packet - Raw packet with 4-byte length header
 * @returns {unknown} Parsed JSON data
 */
function parsePacket(packet) {
  const payload = packet.subarray(4).toString('utf8');
  return JSON.parse(payload);
}

/**
 * Check if parsed data is a cyclic report
 * @param {unknown} data
 * @returns {data is CyclicReport}
 */
function isCyclicReport(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    'type' in data &&
    data.type === 'cyclic' &&
    'contents' in data
  );
}

/**
 * Check if parsed data is a notification
 * @param {unknown} data
 * @returns {data is Notification}
 */
function isNotification(data) {
  return (
    data !== null && typeof data === 'object' && 'type' in data && data.type === 'notification'
  );
}

/**
 * Check if parsed data is a response to a GET command
 * @param {unknown} data
 * @returns {data is GetResponse}
 */
function isGetResponse(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    'type' in data &&
    data.type === 'single' &&
    'contents' in data
  );
}

module.exports = {
  encodeCommand,
  extractPacket,
  parsePacket,
  isCyclicReport,
  isNotification,
  isGetResponse,
};
