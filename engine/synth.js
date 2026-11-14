// Synthetic one-capture recordings with a known echo time. Used by the tests and by the
// app's "simulated room" samples. Deterministic (seeded). Not a model of a real room:
// white background noise plus exponentially decaying noise bursts at the clap times.
import { BANDS, sosfilt, octaveBand } from './echo-engine.js';

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * T60: seconds (all bands) or { 500: s, 1000: s, 2000: s } (band-limited bursts).
 * gate: { from, to, gain } multiplies the signal after each clap (AGC or adaptive suppression).
 * speech: { from, to, levelDb } adds a speech-like modulated noise (for the speech margin).
 */
export function synthRecording({ fs = 48000, dur = 32, claps = [12, 15, 18, 21], T60 = 0.6, amp = 0.3, noiseDb = -70,
  seed = 1, gate = null, clip = false, speech = null, second = null } = {}) {
  const r = rng(seed);
  const n = Math.round(dur * fs);
  const x = new Float64Array(n);
  const na = Math.pow(10, noiseDb / 20);
  for (let i = 0; i < n; i++) x[i] = gauss(r) * na;
  for (const tc of claps) {
    const i0 = Math.round(tc * fs);
    const len = Math.min(n - i0, Math.round(2.5 * fs));
    if (len <= 0) continue;
    if (typeof T60 === 'number') {
      for (let k = 0; k < len; k++) x[i0 + k] += amp * gauss(r) * Math.exp(-6.9078 * (k / fs) / T60);
      if (second) { // a second, slower decay at a lower level: a double-slope room
        const g = amp * Math.pow(10, second.levelDb / 20);
        for (let k = 0; k < len; k++) x[i0 + k] += g * gauss(r) * Math.exp(-6.9078 * (k / fs) / second.T60);
      }
    } else {
      for (const fc of BANDS) {
        const burst = new Float64Array(len);
        for (let k = 0; k < len; k++) burst[k] = gauss(r);
        const bp = sosfilt(octaveBand(fc, fs), burst);
        for (let k = 0; k < len; k++) x[i0 + k] += amp * 3 * bp[k] * Math.exp(-6.9078 * (k / fs) / T60[fc]);
      }
    }
    if (gate) {
      const a = i0 + Math.round(gate.from * fs), b = Math.min(n, i0 + Math.round(gate.to * fs));
      for (let i = a; i < b; i++) x[i] *= gate.gain;
    }
  }
  if (speech) {
    const a = Math.round(speech.from * fs), b = Math.min(n, Math.round(speech.to * fs));
    const g = Math.pow(10, speech.levelDb / 20);
    for (let i = a; i < b; i++) {
      const t = (i - a) / fs;
      const syl = Math.max(0, Math.sin(2 * Math.PI * 4 * t)); // about 4 syllables per second
      x[i] += g * syl * gauss(r);
    }
  }
  if (clip) for (let i = 0; i < n; i++) x[i] = Math.max(-1, Math.min(32767 / 32768, x[i]));
  return { fs, x };
}
