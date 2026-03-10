/**
 * mDNS Discovery for Adam Audio A-Series speakers
 *
 * Discovers speakers advertising _oca._udp.local. service.
 * Speaker names follow pattern: ASeries-XXXXXX
 */

/** @type {typeof import('multicast-dns')} */
const mdns = require('multicast-dns');

const OCA_SERVICE = '_oca._udp.local';
const DISCOVERY_TIMEOUT = 3000; // 3 seconds

/**
 * @typedef {Object} Speaker
 * @property {string} name - Speaker name (e.g., "ASeries-ABC123")
 * @property {string} ip - IP address
 * @property {number} port - Port number (usually 49494)
 */

/**
 * Discover Adam Audio speakers on the network
 * @param {number} [timeout=DISCOVERY_TIMEOUT] - Discovery timeout in ms
 * @returns {Promise<Speaker[]>} List of discovered speakers
 */
async function discoverSpeakers(timeout = DISCOVERY_TIMEOUT) {
  return new Promise((resolve) => {
    /** @type {Map<string, Speaker>} */
    const speakers = new Map();

    /** @type {Map<string, {name: string, port: number}>} */
    const pendingSRV = new Map();

    const client = mdns();

    const timeoutId = setTimeout(() => {
      client.destroy();
      resolve(Array.from(speakers.values()));
    }, timeout);

    client.on('response', (response) => {
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
    });

    client.on('error', () => {
      clearTimeout(timeoutId);
      client.destroy();
      resolve(Array.from(speakers.values()));
    });

    // Send mDNS query for OCA service
    client.query({
      questions: [
        {
          name: OCA_SERVICE,
          type: 'PTR',
        },
      ],
    });
  });
}

/**
 * @typedef {Object} MdnsBrowser
 * @property {() => void} start - Start the browser
 * @property {() => void} stop - Stop the browser
 * @property {() => Speaker[]} getSpeakers - Get list of discovered speakers
 * @property {(event: string, listener: Function) => void} on - Add event listener
 * @property {(event: string, ...args: unknown[]) => void} emit - Emit event
 */

/**
 * Create a continuous mDNS browser that emits events when speakers are found/lost
 * @returns {MdnsBrowser} Browser with start(), stop() methods and 'found'/'lost' events
 */
function createBrowser() {
  const { EventEmitter } = require('events');
  /** @type {MdnsBrowser & import('events').EventEmitter} */
  const browser = /** @type {MdnsBrowser & import('events').EventEmitter} */ (new EventEmitter());

  /** @type {Map<string, Speaker>} */
  const knownSpeakers = new Map();

  /** @type {ReturnType<typeof mdns> | null} */
  let client = null;

  /** @type {ReturnType<typeof setInterval> | null} */
  let pollInterval = null;

  browser.start = () => {
    if (client) {
      return;
    }

    client = mdns();

    client.on('response', (response) => {
      // Process responses similar to discoverSpeakers
      for (const answer of response.answers.concat(response.additionals || [])) {
        if (answer.type === 'A' && answer.name.startsWith('ASeries-')) {
          const name = answer.name.replace('.local', '');
          const ip = /** @type {string} */ (answer.data);

          if (!knownSpeakers.has(name)) {
            const speaker = { name, ip, port: 49494 };
            knownSpeakers.set(name, speaker);
            browser.emit('found', speaker);
          }
        }
      }
    });

    client.on('error', () => {
      // Silently handle errors
    });

    // Send initial query
    client.query({
      questions: [{ name: OCA_SERVICE, type: 'PTR' }],
    });

    // Periodically re-query to find new speakers
    pollInterval = setInterval(() => {
      if (client) {
        client.query({
          questions: [{ name: OCA_SERVICE, type: 'PTR' }],
        });
      }
    }, 30000); // Every 30 seconds
  };

  browser.stop = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (client) {
      client.destroy();
      client = null;
    }
    knownSpeakers.clear();
  };

  browser.getSpeakers = () => Array.from(knownSpeakers.values());

  return browser;
}

module.exports = {
  discoverSpeakers,
  createBrowser,
  DISCOVERY_TIMEOUT,
};
