/**
 * mDNS Discovery for Adam Audio A-Series speakers
 *
 * Discovers speakers advertising _oca._udp.local. service.
 * Speaker names follow pattern: ASeries-XXXXXX
 *
 * Primary: multicast-dns library (cross-platform)
 * Fallback: macOS dns-sd CLI via system mDNSResponder (when port 5353 is unavailable)
 */

/** @type {typeof import('multicast-dns')} */
const mdns = require('multicast-dns');
const { execFile } = require('child_process');
const os = require('os');
const dns = require('dns');
const { log } = require('./common');

const OCA_SERVICE = '_oca._udp.local';
const DISCOVERY_TIMEOUT = 3000; // 3 seconds

/**
 * Get all external IPv4 interface addresses for multicast
 * @returns {string[]}
 */
function getMulticastInterfaces() {
  const interfaces = os.networkInterfaces();
  /** @type {string[]} */
  const result = [];
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push(addr.address);
      }
    }
  }
  return result;
}

/**
 * @typedef {Object} Speaker
 * @property {string} name - Speaker name (e.g., "ASeries-ABC123")
 * @property {string} ip - IP address
 * @property {number} port - Port number (usually 49494)
 */

/**
 * Discover speakers using multicast-dns library (cross-platform)
 * Returns null if port 5353 is unavailable (signals caller to try fallback)
 * @param {number} timeout
 * @returns {Promise<Speaker[] | null>}
 */
function discoverWithMdns(timeout) {
  return /** @type {Promise<Speaker[] | null>} */ (
    new Promise((resolve) => {
      /** @type {Map<string, Speaker>} */
      const speakers = new Map();

      /** @type {Map<string, {name: string, port: number}>} */
      const pendingSRV = new Map();

      let bindFailed = false;

      // Query on all non-internal interfaces to handle virtual adapters (WSL, Docker, etc.)
      const ifaces = getMulticastInterfaces();
      /** @type {ReturnType<typeof mdns>[]} */
      const clients =
        ifaces.length > 0 ? ifaces.map((iface) => mdns({ interface: iface })) : [mdns()];

      log('[mDNS] Discovery on interfaces:', ifaces.join(', ') || 'default');

      const destroyAll = () => {
        for (const c of clients) c.destroy();
      };

      const _timeoutId = setTimeout(() => {
        destroyAll();
        if (bindFailed && speakers.size === 0) {
          resolve(null); // signal to try fallback
        } else {
          resolve(Array.from(speakers.values()));
        }
      }, timeout);

      /** @param {import('multicast-dns').ResponsePacket} response */
      const handleResponse = (response) => {
        // Process PTR records (service instances)
        for (const answer of response.answers) {
          if (answer.type === 'PTR' && answer.name === OCA_SERVICE) {
            const instanceName = /** @type {string} */ (answer.data);
            // Instance name format: ASeries-XXXXXX._oca._udp.local
            if (instanceName && instanceName.startsWith('ASeries-')) {
              // Extract short name
              const shortName = instanceName.replace('._oca._udp.local', '');
              if (!pendingSRV.has(instanceName)) {
                pendingSRV.set(instanceName, { name: shortName, port: 49494 });
              }
            }
          }
        }

        // Process SRV records (service details)
        for (const answer of response.answers.concat(response.additionals || [])) {
          if (answer.type === 'SRV') {
            const instanceName = answer.name;
            const pending = pendingSRV.get(instanceName);
            if (pending) {
              const srvData = /** @type {{port?: number}} */ (answer.data);
              pending.port = srvData?.port || 49494;
            }
          }

          // Process A records (IP addresses)
          if (answer.type === 'A') {
            const hostname = answer.name;
            const ip = /** @type {string} */ (answer.data);

            // Check if this A record matches any pending SRV
            for (const [instanceName, info] of pendingSRV) {
              // Match by hostname or instance name
              if (
                instanceName.includes(hostname.replace('.local', '')) ||
                hostname.includes(info.name)
              ) {
                speakers.set(info.name, {
                  name: info.name,
                  ip: ip,
                  port: info.port,
                });
              }
            }

            // Also check if the hostname looks like an Adam speaker
            if (hostname.startsWith('ASeries-')) {
              const name = hostname.replace('.local', '');
              if (!speakers.has(name)) {
                speakers.set(name, {
                  name: name,
                  ip: ip,
                  port: 49494,
                });
              }
            }
          }
        }
      };

      for (const client of clients) {
        client.on('response', handleResponse);
        client.on('error', (/** @type {Error} */ err) => {
          if (err.message.includes('EADDRINUSE')) {
            bindFailed = true;
          }
          log('[mDNS] Error:', err.message);
        });
        client.query({ questions: [{ name: OCA_SERVICE, type: 'PTR' }] });
      }
    })
  );
}

/**
 * Discover speakers using macOS dns-sd CLI (fallback)
 * Uses system mDNSResponder which always has access to port 5353
 * @param {number} timeout
 * @returns {Promise<Speaker[]>}
 */
function discoverWithDnsSd(timeout) {
  return new Promise((resolve) => {
    log('[mDNS] Falling back to dns-sd CLI');
    /** @type {Set<string>} */
    const names = new Set();

    const proc = execFile('dns-sd', ['-B', '_oca._udp', '.'], { timeout: timeout + 500 });

    proc.stdout?.on('data', (/** @type {string} */ data) => {
      // Parse lines like: " 1:07:41.718  Add  3  15 local.  _oca._udp.  ASeries-4821e5"
      for (const line of data.split('\n')) {
        const match = line.match(/\bAdd\b.*\b(ASeries-\w+)/);
        if (match) names.add(match[1]);
      }
    });

    setTimeout(async () => {
      proc.kill();
      if (names.size === 0) {
        resolve([]);
        return;
      }

      // Resolve hostnames to IPs
      /** @type {Speaker[]} */
      const speakers = [];
      for (const name of names) {
        try {
          const { address } = await dns.promises.lookup(`${name}.local`);
          speakers.push({ name, ip: address, port: 49494 });
        } catch {
          log(`[mDNS] Failed to resolve ${name}.local`);
        }
      }
      resolve(speakers);
    }, timeout);
  });
}

/**
 * Discover Adam Audio speakers on the network
 * @param {number} [timeout=DISCOVERY_TIMEOUT] - Discovery timeout in ms
 * @returns {Promise<Speaker[]>} List of discovered speakers
 */
async function discoverSpeakers(timeout = DISCOVERY_TIMEOUT) {
  // Try multicast-dns first (cross-platform)
  const result = await discoverWithMdns(timeout);

  // If multicast-dns failed or found nothing on macOS, try dns-sd CLI fallback.
  // multicast-dns may bind successfully via SO_REUSEPORT but receive no responses
  // when another process (e.g. Arc browser) holds port 5353.
  if ((result === null || result.length === 0) && process.platform === 'darwin') {
    return discoverWithDnsSd(timeout);
  }

  return result || [];
}

module.exports = {
  discoverSpeakers,
  DISCOVERY_TIMEOUT,
};
