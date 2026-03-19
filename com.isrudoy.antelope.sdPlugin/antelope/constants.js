/**
 * Antelope Zen Quadro SC Device Constants
 * @module antelope/constants
 */

const HOST = '127.0.0.1';
const PORT_RANGE = [2020, 2030];

// Output names
const OUTPUTS = ['mon', 'hp1', 'hp2', 'line'];
const OUTPUT_NAMES = ['Monitor', 'HP1', 'HP2', 'Line Out'];
const BUS_NAMES = ['Monitor/HP1', 'Headphones 2', 'Line Out'];
const NUM_BUSES = 3;

// Clock & sample rate
const CLOCK_SOURCES = ['internal', 'spdif', 'adat', 'wordclock'];
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000];

// Preamp
const PRE_TYPES = ['MIC', 'LINE'];

// Peripheral ID → short name (from get_routing responses)
/** @type {Record<number, string>} */
const PERIPH_NAMES = {
  0: 'PRE',
  1: 'USB1',
  2: 'USB2',
  3: 'ADAT',
  4: 'SPDIF',
  5: 'AFX',
  6: 'LP-HP1',
  7: 'LP-HP2',
  8: 'MIX3',
  9: 'MIX4',
  10: 'MUTE',
  11: 'OSC',
  12: 'EMU',
};

// Routing banks
const MIXER_ROUTING_BANK_BASE = 8;
const AFX_INPUT_BANK = 7;
const AFX_PERIPH = 5;

// Persistence group names → peripheral IDs
/** @type {Record<string, number>} */
const GROUP_TO_PERIPH = {
  'PREAMP': 0,
  'USB 1 PLAY': 1,
  'USB 2 PLAY': 2,
  'ADAT IN': 3,
  'SPDIF IN': 4,
  'AFX OUT': 5,
  'LOOPBACK HP1': 6,
  'LOOPBACK HP2': 7,
  'MIXER_OUT2': 8,
  'MIXER_OUT3': 9,
  'MUTE': 10,
  'OSCILLATOR': 11,
  'EMU MIC': 12,
};

module.exports = {
  HOST,
  PORT_RANGE,
  OUTPUTS,
  OUTPUT_NAMES,
  BUS_NAMES,
  NUM_BUSES,
  CLOCK_SOURCES,
  SAMPLE_RATES,
  PRE_TYPES,
  PERIPH_NAMES,
  MIXER_ROUTING_BANK_BASE,
  AFX_INPUT_BANK,
  AFX_PERIPH,
  GROUP_TO_PERIPH,
};
