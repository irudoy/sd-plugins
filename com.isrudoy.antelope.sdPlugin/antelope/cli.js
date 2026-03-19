#!/usr/bin/env node

const { AntelopeClient, discoverPort } = require('./antelope');
const {
  HOST,
  OUTPUTS,
  OUTPUT_NAMES,
  BUS_NAMES,
  NUM_BUSES,
  CLOCK_SOURCES,
  SAMPLE_RATES,
  PRE_TYPES,
  PERIPH_NAMES,
} = require('./constants');

// ============================================================
// Formatting helpers
// ============================================================

/** @param {number} level */
function fmtLevel(level) {
  if (level >= 96) return '  -Inf';
  if (level === 0) return '  0 dB';
  return `${String(-level).padStart(4)} dB`;
}

/** @param {number} pan */
function fmtPan(pan) {
  if (pan < 28) return `L${32 - pan}`;
  if (pan > 36) return `R${pan - 32}`;
  return 'C';
}

// ============================================================
// CLI Interface
// ============================================================

async function main() {
  const readline = require('readline');
  const client = new AntelopeClient();

  const args = process.argv.slice(2);
  let portOverride = null;
  let oneshot = null;

  if (args.length > 0 && /^\d+$/.test(args[0])) {
    portOverride = parseInt(args[0]);
    if (args.length > 1) oneshot = args.slice(1).join(' ');
  } else if (args.length > 0) {
    oneshot = args.join(' ');
  }

  let port;
  if (portOverride) {
    port = portOverride;
  } else {
    port = await discoverPort();
    if (!port) {
      console.error('Antelope Manager Server not found on ports 2020-2030');
      console.error('Usage: cli.js [port] [command]');
      process.exit(1);
    }
  }

  try {
    await client.connect(port);
    if (!oneshot) console.log(`Connected to Antelope Manager Server at ${HOST}:${port}`);
  } catch (err) {
    console.error('Connection failed:', /** @type {Error} */ (err).message);
    process.exit(1);
  }

  /** @type {import('./protocol').CyclicReportContents|null} */
  let lastStatus = null;
  client.onCyclic = (contents) => {
    lastStatus = contents;
  };

  client.onNotification = (contents) => {
    if (Array.isArray(contents) && contents[0] === 'set_mixer') {
      const [, nArgs, kwargs] = contents;
      console.log(
        `\n  [notification] set_mixer bus=${nArgs[0]} ch=${nArgs[1]} level=${kwargs.level} pan=${kwargs.pan} mute=${kwargs.mute} solo=${kwargs.solo}`
      );
    }
  };

  let currentBus = 0;

  /** @param {string|undefined} arg */
  function parseOutput(arg) {
    if (!arg) return 0;
    const lower = arg.toLowerCase();
    const idx = OUTPUTS.indexOf(lower);
    if (idx >= 0) return idx;
    const num = parseInt(arg);
    if (!isNaN(num) && num >= 0 && num <= 5) return num;
    return 0;
  }

  /**
   * @param {string|undefined} arg
   * @param {boolean} [defaultVal]
   */
  function parseOnOff(arg, defaultVal = true) {
    if (!arg) return defaultVal;
    const lower = arg.toLowerCase();
    if (lower === 'off' || lower === '0' || lower === 'false') return false;
    return true;
  }

  function showHelp() {
    console.log(`
=== OUTPUTS (mon, hp1, hp2, line) ===
  vol [output] <0-127>     Set volume (0 = 0dB, 127 = -127dB)
  mute [output] [on|off]   Mute output
  dim [output] [on|off]    Dim output (-20dB)

=== PREAMPS (1-4) ===
  gain <1-4> <-10..65>     Set preamp gain (dB)
  phantom <1-4> [on|off]   48V phantom power
  phase <1-4> [on|off]     Phase invert
  input <1-4> [mic|line]   Input type

=== MIXER (bus 0-2, ch 1-16) ===
  fader <1-16> <0-90>      Set channel fader (0=0dB, 90=-90dB, 96+=-Inf)
  pan <1-16> <0-63>        Set pan (0=L, 32=C, 63=R)
  solo <1-16> [on|off]     Solo channel
  ch-mute <1-16> [on|off]  Mute channel
  link <1-16> [on|off]     Stereo link
  links                    Show mixer link state (raw + per-channel)
  bus <0-2>                Select mixer bus
  mixer [bus]              Show mixer state
  get-mixer                Refresh mixer + routing from device
  (ch0=system, ch1-6=AFX, ch7+=other sources)

=== AFX ===
  bypass <type> <id> [on|off]   Bypass effect

=== GLOBAL ===
  clock [internal|spdif|adat|wc]   Set clock source
  rate [44100|48000|88200|96000|176400|192000]   Set sample rate
  preset save <1-8>        Save to preset
  preset load <1-8>        Load preset

=== OTHER ===
  status                   Show current status
  dump                     Dump raw cyclic data
  raw <json>               Send raw command
  help                     Show this help
  quit                     Exit
`);
  }

  /** @param {string} line */
  function handleCommand(line) {
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    switch (cmd) {
      case 'vol':
      case 'volume': {
        let outputId = 0;
        let vol;
        if (parts.length >= 3) {
          outputId = parseOutput(parts[1]);
          vol = parseInt(parts[2]);
        } else {
          vol = parseInt(parts[1]);
        }
        if (vol >= 0 && vol <= 255) {
          client.setVolume(outputId, vol);
          console.log(`${OUTPUT_NAMES[outputId]} volume: -${vol} dB`);
        } else {
          console.log('Usage: vol [output] <0-255>');
        }
        break;
      }

      case 'mute': {
        let outputId = 0;
        let state;
        if (
          parts.length >= 3 ||
          (parts[1] && !['on', 'off', '0', '1'].includes(parts[1]?.toLowerCase()))
        ) {
          outputId = parseOutput(parts[1]);
          state = parseOnOff(parts[2]);
        } else {
          state = parseOnOff(parts[1]);
        }
        client.setMute(outputId, state);
        console.log(`${OUTPUT_NAMES[outputId]} mute: ${state ? 'ON' : 'OFF'}`);
        break;
      }

      case 'dim': {
        let outputId = 0;
        let state;
        if (
          parts.length >= 3 ||
          (parts[1] && !['on', 'off', '0', '1'].includes(parts[1]?.toLowerCase()))
        ) {
          outputId = parseOutput(parts[1]);
          state = parseOnOff(parts[2]);
        } else {
          state = parseOnOff(parts[1]);
        }
        client.setDim(outputId, state);
        console.log(`${OUTPUT_NAMES[outputId]} dim: ${state ? 'ON' : 'OFF'}`);
        break;
      }

      case 'gain': {
        const ch = parseInt(parts[1]) - 1;
        const db = parseInt(parts[2]);
        if (ch >= 0 && ch <= 3 && db >= -10 && db <= 65) {
          client.setPreGain(ch, db);
          console.log(`Preamp ${ch + 1} gain: ${db} dB`);
        } else {
          console.log('Usage: gain <1-4> <-10..65>');
        }
        break;
      }

      case 'phantom':
      case '48v': {
        const ch = parseInt(parts[1]) - 1;
        if (ch >= 0 && ch <= 3) {
          const on = parseOnOff(parts[2]);
          client.setPrePhantom(ch, on);
          console.log(`Preamp ${ch + 1} 48V: ${on ? 'ON' : 'OFF'}`);
        } else {
          console.log('Usage: phantom <1-4> [on|off]');
        }
        break;
      }

      case 'phase': {
        const ch = parseInt(parts[1]) - 1;
        if (ch >= 0 && ch <= 3) {
          const on = parseOnOff(parts[2]);
          client.setPrePhase(ch, on);
          console.log(`Preamp ${ch + 1} phase invert: ${on ? 'ON' : 'OFF'}`);
        } else {
          console.log('Usage: phase <1-4> [on|off]');
        }
        break;
      }

      case 'input': {
        const ch = parseInt(parts[1]) - 1;
        const typeArg = parts[2]?.toLowerCase();
        if (ch >= 0 && ch <= 3) {
          const type = typeArg === 'line' ? 1 : 0;
          client.setPreType(ch, type);
          console.log(`Preamp ${ch + 1} input: ${PRE_TYPES[type]}`);
        } else {
          console.log('Usage: input <1-4> [mic|line]');
        }
        break;
      }

      case 'bus': {
        const busId = parseInt(parts[1]);
        if (busId >= 0 && busId < NUM_BUSES) {
          currentBus = busId;
          console.log(`Mixer bus: ${currentBus} (${BUS_NAMES[currentBus]})`);
        } else {
          console.log(`Usage: bus <0-${NUM_BUSES - 1}>`);
        }
        break;
      }

      case 'fader': {
        const ch = parseInt(parts[1]);
        const level = parseInt(parts[2]);
        if (ch >= 1 && ch <= 16 && ch < client.mixerSize && level >= 0 && level <= 90) {
          client.setMixerFader(currentBus, ch, level);
          console.log(
            `Bus ${currentBus} ${client.getChannelSourceName(currentBus, ch)} fader: ${fmtLevel(level).trim()}`
          );
        } else {
          console.log('Usage: fader <1-16> <0-90> (0=0dB, 90=-inf)');
        }
        break;
      }

      case 'pan': {
        const ch = parseInt(parts[1]);
        const pan = parseInt(parts[2]);
        if (ch >= 1 && ch <= 16 && ch < client.mixerSize && pan >= 0 && pan <= 63) {
          client.setMixerPan(currentBus, ch, pan);
          console.log(
            `Bus ${currentBus} ${client.getChannelSourceName(currentBus, ch)} pan: ${fmtPan(pan)} (${pan})`
          );
        } else {
          console.log('Usage: pan <1-16> <0-63> (0=L, 32=C, 63=R)');
        }
        break;
      }

      case 'solo': {
        const ch = parseInt(parts[1]);
        if (ch >= 1 && ch <= 16 && ch < client.mixerSize) {
          const on = parseOnOff(parts[2]);
          client.setMixerSolo(currentBus, ch, on);
          console.log(
            `Bus ${currentBus} ${client.getChannelSourceName(currentBus, ch)} solo: ${on ? 'ON' : 'OFF'}`
          );
        } else {
          console.log('Usage: solo <1-16> [on|off]');
        }
        break;
      }

      case 'ch-mute':
      case 'chmute': {
        const ch = parseInt(parts[1]);
        if (ch >= 1 && ch <= 16 && ch < client.mixerSize) {
          const on = parseOnOff(parts[2]);
          client.setMixerMute(currentBus, ch, on);
          console.log(
            `Bus ${currentBus} ${client.getChannelSourceName(currentBus, ch)} mute: ${on ? 'ON' : 'OFF'}`
          );
        } else {
          console.log('Usage: ch-mute <1-16> [on|off]');
        }
        break;
      }

      case 'link': {
        const ch = parseInt(parts[1]);
        if (ch >= 1 && ch <= 16 && ch < client.mixerSize) {
          const on = parseOnOff(parts[2]);
          client.setStereoLink(currentBus, ch, on);
          console.log(
            `Bus ${currentBus} ${client.getChannelSourceName(currentBus, ch)} stereo link: ${on ? 'ON' : 'OFF'}`
          );
        } else {
          console.log('Usage: link <1-16> [on|off]');
        }
        break;
      }

      case 'links': {
        if (!client.mixerLinks.length) {
          console.log('No link data. Requesting...');
          client.requestMixerLinks();
          break;
        }
        console.log(`\n--- RAW MIXER LINKS (${client.mixerLinks.length} entries) ---`);
        for (let i = 0; i < client.mixerLinks.length; i++) {
          const l = client.mixerLinks[i]?.linked;
          if (l) console.log(`  [${String(i).padStart(2)}] linked=${l}`);
        }
        console.log('\n--- PER-CHANNEL LINK STATE ---');
        for (let b = 0; b < NUM_BUSES; b++) {
          if (!client.mixer?.[b]) continue;
          const linked = [];
          for (let i = 1; i < client.mixerSize; i++) {
            if (client.mixer[b][i]?.link) {
              const partner = client.getLinkedPartner(b, i);
              linked.push(`  Ch ${i}${partner ? ` <-> Ch ${partner}` : ''}`);
            }
          }
          if (linked.length) {
            console.log(`  Bus ${b} (${BUS_NAMES[b]}):`);
            linked.forEach((l) => console.log(l));
          }
        }
        console.log('');
        break;
      }

      case 'mixer': {
        const busArg = parts[1] !== undefined ? parseInt(parts[1]) : NaN;
        const busId = isNaN(busArg) ? currentBus : busArg;
        if (!client.mixer) {
          console.log('Mixer state not loaded. Run: get-mixer');
          break;
        }
        if (busId < 0 || busId >= NUM_BUSES) {
          console.log(`Invalid bus. Use 0-${NUM_BUSES - 1}`);
          break;
        }
        console.log(`\n--- MIXER: Bus ${busId} (${BUS_NAMES[busId]}) ---`);
        console.log('  Ch  Source       Level    Pan   Mute  Solo  Link');
        for (let i = 1; i <= 16 && i < client.mixerSize; i++) {
          const ch = client.mixer[busId][i];
          const src = client.getChannelSourceName(busId, i).padEnd(11);
          const level = fmtLevel(ch.level);
          const pan = fmtPan(ch.pan).padEnd(4);
          const mute = ch.mute ? 'MUTE' : '    ';
          const solo = ch.solo ? 'SOLO' : '    ';
          const link = ch.link ? 'LINK' : '';
          console.log(
            `  ${String(i).padStart(2)}  ${src} ${level}  ${pan}  ${mute}  ${solo}  ${link}`
          );
        }
        console.log('');
        break;
      }

      case 'get-mixer': {
        client.requestAllMixers();
        client.requestRouting();
        console.log('Requested mixer state + routing for all buses');
        break;
      }

      case 'routing': {
        const bankId = parts[1] !== undefined ? parseInt(parts[1]) : null;
        if (bankId !== null) {
          const entries = client.routing[bankId];
          if (!entries) {
            console.log(`No routing data for bank ${bankId}`);
            break;
          }
          console.log(`\n--- ROUTING BANK ${bankId} (${entries.length} entries) ---`);
          for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.periph === 10 && i > 20) continue;
            const name = PERIPH_NAMES[e.periph] ?? `P${e.periph}`;
            console.log(`  [${String(i).padStart(2)}] ${name} ${e.ch}`);
          }
          console.log('');
        } else {
          const banks = Object.keys(client.routing)
            .map(Number)
            .sort((a, b) => a - b);
          for (const b of banks) {
            const entries = client.routing[b];
            const nonMute = entries.filter((e) => e.periph !== 10);
            const summary = nonMute
              .slice(0, 8)
              .map((e) => {
                const name = PERIPH_NAMES[e.periph] ?? `P${e.periph}`;
                return `${name}${e.ch}`;
              })
              .join(' ');
            console.log(
              `  Bank ${String(b).padStart(2)}: ${entries.length} entries, ${nonMute.length} non-mute: ${summary}...`
            );
          }
        }
        break;
      }

      case 'bypass': {
        const type = parseInt(parts[1]);
        const id = parseInt(parts[2]);
        const on = parseOnOff(parts[3]);
        if (!isNaN(type) && !isNaN(id)) {
          client.setAfxBypass(type, id, on ? 1 : 0);
          console.log(`AFX bypass type=${type} id=${id}: ${on ? 'ON' : 'OFF'}`);
        } else {
          console.log('Usage: bypass <type> <id> [on|off]');
        }
        break;
      }

      case 'clock': {
        const srcArg = parts[1]?.toLowerCase();
        const srcIdx = CLOCK_SOURCES.indexOf(srcArg);
        if (srcArg === 'wc') {
          client.setClockSource(3);
          console.log('Clock source: Word Clock');
        } else if (srcIdx >= 0) {
          client.setClockSource(srcIdx);
          console.log(`Clock source: ${CLOCK_SOURCES[srcIdx]}`);
        } else {
          console.log('Usage: clock [internal|spdif|adat|wc]');
        }
        break;
      }

      case 'rate':
      case 'samplerate': {
        const rateArg = parseInt(parts[1]);
        const rateIdx = SAMPLE_RATES.indexOf(rateArg);
        if (rateIdx >= 0) {
          client.setSampleRate(rateIdx);
          console.log(`Sample rate: ${rateArg} Hz`);
        } else {
          console.log('Usage: rate [44100|48000|88200|96000|176400|192000]');
        }
        break;
      }

      case 'preset': {
        const action = parts[1]?.toLowerCase();
        const idx = parseInt(parts[2]) - 1;
        if (idx >= 0 && idx <= 7) {
          if (action === 'save') {
            client.presetSave(idx);
            console.log(`Saved to preset ${idx + 1}`);
          } else if (action === 'load' || action === 'recall') {
            client.presetRecall(idx);
            console.log(`Loaded preset ${idx + 1}`);
          } else {
            console.log('Usage: preset [save|load] <1-8>');
          }
        } else {
          console.log('Usage: preset [save|load] <1-8>');
        }
        break;
      }

      case 'status': {
        if (lastStatus) {
          console.log('\n--- OUTPUTS ---');
          lastStatus.volumes?.forEach((v, i) => {
            if (i >= OUTPUT_NAMES.length) return;
            const flags = [v.mute ? 'MUTE' : '', v.dim_on ? 'DIM' : '', v.mono ? 'MONO' : '']
              .filter(Boolean)
              .join(' ');
            console.log(`  ${OUTPUT_NAMES[i].padEnd(8)} ${fmtLevel(v.volume)}  ${flags}`);
          });

          console.log('\n--- PREAMPS ---');
          const status = lastStatus;
          status.preamps?.forEach((p, i) => {
            const gain = status.preamp_gains?.[i] || 0;
            const flags = [p.phantom ? '48V' : '', p.hpf ? 'HPF' : '', p.phase_inv ? 'PHASE' : '']
              .filter(Boolean)
              .join(' ');
            const typeStr = PRE_TYPES[p.type] || `type=${p.type}`;
            console.log(
              `  ${i + 1}: ${String(gain).padStart(3)} dB  ${typeStr.padEnd(4)}  ${flags}`
            );
          });

          const sr =
            (lastStatus.sync_freq_hi << 16) +
            (lastStatus.sync_freq_mid << 8) +
            lastStatus.sync_freq_low;
          console.log(`\n--- GLOBAL ---`);
          console.log(`  Sample rate: ${sr} Hz`);
          console.log(
            `  Clock source: ${CLOCK_SOURCES[lastStatus.sync_source] || lastStatus.sync_source}`
          );
          console.log(`  Preset: ${lastStatus.current_preset + 1}`);
          console.log('');
        } else {
          console.log('No status received yet (wait a moment)');
        }
        break;
      }

      case 'dump': {
        if (lastStatus) {
          console.log(JSON.stringify(lastStatus, null, 2));
        } else {
          console.log('No data yet');
        }
        break;
      }

      case 'raw': {
        try {
          const json = parts.slice(1).join(' ');
          const [rcmd, rargs, rkwargs] = JSON.parse(json);
          client.send(rcmd, rargs, rkwargs || {});
          console.log('Sent:', json);
        } catch {
          console.log('Usage: raw ["command", [args], {kwargs}]');
        }
        break;
      }

      case 'help':
      case '?':
        showHelp();
        break;

      case 'quit':
      case 'exit':
      case 'q':
        client.close();
        process.exit(0);
        break;

      case '':
        break;

      default:
        console.log(`Unknown command: ${cmd}. Type 'help' for commands.`);
    }
  }

  // Oneshot mode
  if (oneshot) {
    if (oneshot.startsWith('routing')) {
      client.requestAllRouting();
      await client.waitForRouting(13);
    } else {
      await client.waitForData();
    }
    handleCommand(oneshot);
    client.close();
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'antelope> ',
  });

  showHelp();
  rl.prompt();

  rl.on('line', (line) => {
    handleCommand(line);
    rl.prompt();
  });

  rl.on('close', () => {
    client.close();
    process.exit(0);
  });
}

main();
