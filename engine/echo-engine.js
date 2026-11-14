// Echo Check+ engine core. No dependencies. ES module for browsers and Node.
//
// Input: one mono recording (Float64Array or Float32Array, -1..1) made with the
// one-capture protocol: quiet, 4 claps from the front about 3 s apart, quiet, reading.
// Output: per-clap, per-band decay data (500 / 1000 / 2000 Hz octave bands), trust
// signals and a verdict against ANSI/ASA S12.60 using the 3-band average.
//
// Method (mirrors tools/analyze_device_test.py, the Python reference):
//   Butterworth octave bands (order 3 band-pass, bilinear transform with pre-warping);
//   clap detection on a 200 Hz high-passed 5 ms envelope; pre-clap and post-decay floors
//   from 20 ms frames; clean decay = 10 ms peak level minus pre-clap floor;
//   Lundeby-lite truncation with noise subtraction and tail compensation;
//   Schroeder backward integration; T20 (-5..-25 dB), T30 (-5..-35 dB), EDT (0..-10 dB).
// The thresholds in DEFAULTS are starting points from ECHO_CHECK_V2_REVIEW.md and the
// expert replies (README section 2b). Tune them on device-test recordings, not by guess.

export const BANDS = [500, 1000, 2000];

export const DEFAULTS = {
  clapWindowS: [9.0, 29.5],   // where claps are searched (protocol: claps at about 10-25 s)
  quietWindowS: [25.0, 29.5], // background for the speech margin
  speechWindowS: [30.0, 41.0],
  maxClaps: 4,
  cleanFullDb: 37,            // full-confidence T20 (Hak et al. 2012: 37 dB keeps T20 within 5 %; ISO 3382-2 asks 35)
  cleanMinDb: 30,             // below this a clap does not count (Incomplete). 30-37 dB = lower confidence (audiology professor: 30 dB may be enough)
  minClapsPerBand: 2,
  tooCloseFraction: 0.15,     // "Too close to call" when within +/-15 % of the limit
  floorDropRedDb: 6,          // post-decay floor this far below the pre-clap floor ...
  floorDropBands: 2,          // ... in this many bands = noise-suppression signature
  floorRiseAmberDb: 3,
  clipRunRed: 3,              // consecutive samples at >= 0.999 full scale
  spreadAmber: 0.10,          // clap-to-clap spread of the 3-band T20
  t30RatioOk: [0.85, 1.15],
  edtRatioOk: [0.75, 1.25],
  speechGuidelineDb: 15,
  // Steady noise suppression makes the background look quieter, so the speech margin reads
  // too high (Friday device test: +37 dB raw, +66 dB with Chrome noise suppression). A margin
  // above this is treated as a sign of filtering. Starting point from 1 device; tune it.
  speechSuspiciousDb: 55,
};

// ---------- small numeric helpers ----------

const cx = (re, im = 0) => ({ re, im });
const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};
const cscale = (a, k) => cx(a.re * k, a.im * k);
const cabs = (a) => Math.hypot(a.re, a.im);
const csqrt = (a) => {
  const r = cabs(a);
  return cx(Math.sqrt(Math.max(0, (r + a.re) / 2)), (a.im < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - a.re) / 2)));
};

export const db = (v) => 10 * Math.log10(Math.max(v, 1e-20));

function median(arr) {
  const s = Float64Array.from(arr).sort();
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function linfit(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}

// ---------- Butterworth design (second-order sections) ----------

function protoPoles(order) {
  const p = [];
  for (let k = 1; k <= order; k++) {
    const th = Math.PI * (2 * k + order - 1) / (2 * order);
    p.push(cx(Math.cos(th), Math.sin(th)));
  }
  return p;
}

const bilinear = (s, fs2) => cdiv(cadd(cx(fs2), s), csub(cx(fs2), s));

// Group digital poles into conjugate pairs or real pairs -> denominators [1, a1, a2].
function pairPoles(zp) {
  const eps = 1e-12;
  const upper = zp.filter((p) => p.im > eps);
  const real = zp.filter((p) => Math.abs(p.im) <= eps).map((p) => p.re).sort((a, b) => a - b);
  const dens = upper.map((p) => [1, -2 * p.re, p.re * p.re + p.im * p.im]);
  for (let i = 0; i + 1 < real.length; i += 2) dens.push([1, -(real[i] + real[i + 1]), real[i] * real[i + 1]]);
  if (real.length % 2) throw new Error('odd number of real poles is not supported');
  return dens;
}

function sectionResponse(sections, omega) {
  const z1 = cx(Math.cos(-omega), Math.sin(-omega));
  const z2 = cmul(z1, z1);
  let h = cx(1);
  for (const { b, a } of sections) {
    const num = cadd(cadd(cx(b[0]), cscale(z1, b[1])), cscale(z2, b[2]));
    const den = cadd(cadd(cx(a[0]), cscale(z1, a[1])), cscale(z2, a[2]));
    h = cmul(h, cdiv(num, den));
  }
  return h;
}

/** Magnitude response |H(f)| of a section cascade. */
export function magnitude(sections, f, fs) {
  return cabs(sectionResponse(sections, 2 * Math.PI * f / fs));
}

/** Butterworth band-pass, `order` per side (scipy butter(order, [lo, hi], 'bandpass')). */
export function designBandpass(lo, hi, fs, order = 3) {
  const fs2 = 2 * fs;
  const wl = fs2 * Math.tan(Math.PI * lo / fs);
  const wh = fs2 * Math.tan(Math.PI * hi / fs);
  const w0 = Math.sqrt(wl * wh), bw = wh - wl;
  const ap = [];
  for (const p of protoPoles(order)) {
    const t = cscale(p, bw / 2);
    const d = csqrt(csub(cmul(t, t), cx(w0 * w0)));
    ap.push(cadd(t, d), csub(t, d));
  }
  const dens = pairPoles(ap.map((s) => bilinear(s, fs2)));
  const sections = dens.map((a) => ({ b: [1, 0, -1], a })); // zeros at z = 1 and z = -1
  const fc = (fs / Math.PI) * Math.atan(w0 / fs2);          // digital image of the analog centre
  const g = 1 / magnitude(sections, fc, fs);
  sections[0].b = sections[0].b.map((v) => v * g);
  return sections;
}

/** Butterworth high-pass of even order (scipy butter(order, fc, 'hp')). */
export function designHighpass(fc, fs, order = 4) {
  if (order % 2) throw new Error('even order only');
  const fs2 = 2 * fs;
  const wc = fs2 * Math.tan(Math.PI * fc / fs);
  const ap = protoPoles(order).map((p) => cdiv(cx(wc), p));
  const dens = pairPoles(ap.map((s) => bilinear(s, fs2)));
  const sections = dens.map((a) => ({ b: [1, -2, 1], a }));
  const g = 1 / magnitude(sections, fs / 2 - 1e-9, fs);
  sections[0].b = sections[0].b.map((v) => v * g);
  return sections;
}

/** Filter with a cascade of second-order sections (direct form II transposed). */
export function sosfilt(sections, x) {
  const y = Float64Array.from(x);
  for (const { b, a } of sections) {
    let z1 = 0, z2 = 0;
    for (let i = 0; i < y.length; i++) {
      const xi = y[i];
      const yi = b[0] * xi + z1;
      z1 = b[1] * xi - a[1] * yi + z2;
      z2 = b[2] * xi - a[2] * yi;
      y[i] = yi;
    }
  }
  return y;
}

export const octaveBand = (fc, fs) => designBandpass(fc / Math.SQRT2, fc * Math.SQRT2, fs, 3);

// ---------- envelopes and floors ----------

function square(x) {
  const e = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) e[i] = x[i] * x[i];
  return e;
}

/** Centred moving mean of n samples (same alignment as the Python reference). */
export function movavg(e, nIn) {
  const n = Math.max(1, Math.trunc(nIn));
  const L = e.length;
  const out = new Float64Array(L);
  if (L < n) { out.fill(e.reduce((s, v) => s + v, 0) / Math.max(1, L)); return out; }
  const m = new Float64Array(L - n + 1);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += e[i];
  m[0] = acc / n;
  for (let i = 1; i < m.length; i++) { acc += e[i + n - 1] - e[i - 1]; m[i] = acc / n; }
  const padL = Math.floor(n / 2);
  out.fill(m[0], 0, padL);
  out.set(m, padL);
  out.fill(m[m.length - 1], padL + m.length);
  return out;
}

/** Robust mean energy of 20 ms frames in [a, b); frames more than 6 dB over the median are dropped. */
export function floorEstimate(e, fs, aIn, bIn) {
  const a = Math.max(0, Math.trunc(aIn)), b = Math.min(e.length, Math.trunc(bIn));
  const n = Math.trunc(0.02 * fs);
  const k = Math.floor((b - a) / n);
  if (k < 3) return null;
  const fr = new Float64Array(k);
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = a + j * n; i < a + (j + 1) * n; i++) s += e[i];
    fr[j] = s / n;
  }
  const lim = median(fr) * Math.pow(10, 0.6);
  let s = 0, c = 0;
  for (const v of fr) if (v <= lim) { s += v; c++; }
  return s / c;
}

// ---------- clap detection ----------

function findPeaks(L, height, distance) {
  const cand = [];
  for (let i = 1; i < L.length - 1; i++) {
    if (L[i] > L[i - 1] && L[i] >= L[i + 1] && L[i] >= height) {
      let j = i;
      while (j + 1 < L.length && L[j + 1] === L[i]) j++;
      if (j + 1 >= L.length || L[j + 1] < L[i]) cand.push(Math.floor((i + j) / 2));
      i = j;
    }
  }
  cand.sort((p, q) => L[q] - L[p]);
  const kept = [];
  for (const p of cand) if (kept.every((k) => Math.abs(k - p) >= distance)) kept.push(p);
  return kept.sort((p, q) => p - q);
}

/** Returns sample indices of impulsive events (claps) inside the clap window. */
export function detectClaps(x, fs, [t0, t1] = DEFAULTS.clapWindowS) {
  const y = sosfilt(designHighpass(200, fs, 4), x);
  const L = movavg(square(y), 0.005 * fs);
  const hop = Math.trunc(0.001 * fs);
  const nf = Math.ceil(L.length / hop);
  const Lf = new Float64Array(nf);
  for (let j = 0; j < nf; j++) Lf[j] = db(L[j * hop]);
  const base = median(Lf.subarray(Math.trunc(t0 * 1000), Math.trunc(t1 * 1000)));
  const claps = [];
  for (const p of findPeaks(Lf, base + 25, 1000)) {
    const t = p / 1000;
    if (t < t0 || t > t1) continue;
    if (Lf[p] - Lf[Math.max(0, p - 20)] < 15) continue; // impulsive: >= 15 dB rise in 20 ms
    const a = Math.trunc((t - 0.01) * fs), b = Math.trunc((t + 0.01) * fs);
    let best = a;
    for (let i = a; i < b; i++) if (Math.abs(y[i]) > Math.abs(y[best])) best = i;
    claps.push(best);
  }
  return { claps, baseDb: base };
}

function clipRun(x, i, fs) {
  const a = Math.max(0, i - Math.trunc(0.02 * fs)), b = Math.min(x.length, i + Math.trunc(0.05 * fs));
  let best = 0, run = 0;
  for (let k = a; k < b; k++) { run = Math.abs(x[k]) >= 0.999 ? run + 1 : 0; if (run > best) best = run; }
  return best;
}

// ---------- decay analysis ----------

/** Lundeby-lite + Schroeder on band energy e from peak index ip to end, noise energy N. */
export function decayAnalysis(e, fs, ip, end, N) {
  const env = movavg(e, 0.02 * fs);
  const len = end - ip;
  if (len < Math.trunc(0.1 * fs)) return { note: 'window too short' };
  const seg = new Float64Array(len);
  for (let i = 0; i < len; i++) seg[i] = db(env[ip + i]);
  const Lpk = seg[0], Nd = db(N);
  const iHi = seg.findIndex((v) => v <= Lpk - 5);
  if (iHi < 0) return { note: 'no decay found' };
  let iLo = -1;
  for (let i = iHi + 1; i < len; i++) if (seg[i] <= Nd + 10) { iLo = i; break; }
  if (iLo < 0) iLo = len - 1;
  if (iLo - iHi < Math.trunc(0.02 * fs)) return { note: 'range too small for Lundeby fit' };
  const tx = [], ty = [];
  for (let i = iHi; i < iLo; i++) { tx.push(i / fs); ty.push(seg[i]); }
  const { slope, intercept } = linfit(tx, ty);
  if (!(slope < 0)) return { note: 'non-decaying envelope' };
  // Tried Fri 23:00: a late-decay fit (Nd+25..Nd+5 dB) for the crosspoint. It did not reduce
  // Incomplete results on the MIT IR survey and raised the max error (11 % -> 20 %), so it was reverted.
  const tc = (Nd - intercept) / slope;
  const ic = Math.min(len, Math.max(Math.trunc(0.05 * fs), Math.trunc(tc * fs)));
  const tau = -10 / (slope * Math.LN10); // energy time constant (s)
  const tail = N * tau * fs;            // energy after the truncation point
  const edc = new Float64Array(ic);
  let acc = tail;
  for (let i = ic - 1; i >= 0; i--) { acc += e[ip + i] - N; edc[i] = Math.max(acc, 1e-30); }
  const edb = new Float64Array(ic);
  let minDb = Infinity;
  for (let i = 0; i < ic; i++) { edb[i] = db(edc[i] / edc[0]); if (edb[i] < minDb) minDb = edb[i]; }

  const fit = (hi, lo) => {
    if (minDb > lo) return [null, null];
    const xs = [], ys = [];
    for (let i = 0; i < ic; i++) if (edb[i] <= hi && edb[i] >= lo) { xs.push(i / fs); ys.push(edb[i]); }
    if (xs.length < Math.trunc(0.01 * fs)) return [null, null];
    const f = linfit(xs, ys);
    return [f.slope < 0 ? -60 / f.slope : null, f.r];
  };
  const [T20, r20] = fit(-5, -25);
  const [T30] = fit(-5, -35);
  let EDT = null;
  if (minDb <= -10) {
    const xs = [], ys = [];
    for (let i = 0; i < ic; i++) if (edb[i] >= -10) { xs.push(i / fs); ys.push(edb[i]); }
    const f = linfit(xs, ys);
    EDT = f.slope < 0 ? -60 / f.slope : null;
  }
  return { T20, r20, T30, EDT, edcBottomDb: minDb, truncS: ic / fs, lundebyT: -60 / slope };
}

/**
 * Analyse one recording. Returns clap times, per-clap per-band data and the speech margin.
 * x: mono samples in -1..1. fs: sample rate in Hz.
 */
export function analyse(x, fs, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { claps, baseDb } = detectClaps(x, fs, o.clapWindowS);
  const bands = {};
  for (const fc of BANDS) bands[fc] = square(sosfilt(octaveBand(fc, fs), x));
  const env10 = {};
  for (const fc of BANDS) env10[fc] = movavg(bands[fc], 0.01 * fs);

  const out = { fs, durationS: x.length / fs, clapTimesS: claps.map((i) => i / fs), baseDb, claps: [] };
  claps.forEach((i0, k) => {
    const prev = k ? claps[k - 1] : null;
    const next = k + 1 < claps.length ? claps[k + 1] : null;
    let preA = i0 - Math.trunc(1.0 * fs);
    if (prev !== null) preA = Math.max(preA, prev + Math.trunc(1.2 * fs));
    const preB = i0 - Math.trunc(0.05 * fs);
    const postA = i0 + Math.trunc(1.0 * fs);
    let postB = i0 + Math.trunc(2.5 * fs);
    if (next !== null) postB = Math.min(postB, next - Math.trunc(0.1 * fs));
    const end = Math.min(i0 + Math.trunc(2.5 * fs), next !== null ? next - Math.trunc(0.05 * fs) : x.length);
    const clap = { t: i0 / fs, clipRun: clipRun(x, i0, fs), bands: {} };
    for (const fc of BANDS) {
      const e = bands[fc], ev = env10[fc];
      const wa = i0 - Math.trunc(0.005 * fs), wb = i0 + Math.trunc(0.03 * fs);
      let ip = wa;
      for (let i = wa; i < wb; i++) if (ev[i] > ev[ip]) ip = i;
      const Npre = floorEstimate(e, fs, preA, preB);
      const Npost = floorEstimate(e, fs, postA, postB);
      const pk = db(ev[ip]);
      const d = Npre ? decayAnalysis(e, fs, ip, end, Npre) : { note: 'no pre-clap floor' };
      clap.bands[fc] = {
        peakDb: pk,
        floorPreDb: Npre ? db(Npre) : null,
        floorPostDb: Npost ? db(Npost) : null,
        floorResidDb: Npre && Npost ? db(Npost) - db(Npre) : null,
        cleanDecayDb: Npre ? pk - db(Npre) : null,
        ...d,
      };
    }
    out.claps.push(clap);
  });

  // Speech margin: active speech frames (> quiet + 10 dB) against the quiet background, 300 Hz-4 kHz.
  const sp = square(sosfilt(designBandpass(300, 4000, fs, 3), x));
  const q = floorEstimate(sp, fs, o.quietWindowS[0] * fs, o.quietWindowS[1] * fs);
  const n = Math.trunc(0.02 * fs);
  const a = Math.trunc(o.speechWindowS[0] * fs), b = Math.min(sp.length, Math.trunc(o.speechWindowS[1] * fs));
  let s = 0, c = 0, total = 0;
  for (let j = a; j + n <= b; j += n) {
    let f = 0;
    for (let i = j; i < j + n; i++) f += sp[i];
    f /= n; total++;
    if (q && f > q * 10) { s += f; c++; }
  }
  out.speechMarginDb = q && c ? db(s / c) - db(q) : null;
  out.speechActiveFraction = total ? c / total : 0;
  return out;
}

// ---------- verdict ----------

export const FT3_PER_M3 = 35.3147;

/** S12.60 reverberation limit (s) for a room volume in cubic feet; null when not covered. */
export function limitFor(volumeFt3) {
  if (!(volumeFt3 > 0)) return null;
  if (volumeFt3 <= 10000) return 0.6;
  if (volumeFt3 <= 20000) return 0.7;
  return null;
}

/** Verdict from a 3-band average T20 and a limit. */
export function decide(avgT20, limit, frac = DEFAULTS.tooCloseFraction) {
  const ratio = avgT20 / limit;
  if (ratio > 1 + frac) return 'Likely over the limit';
  if (ratio >= 1 - frac) return 'Too close to call';
  return 'Under the limit (weak evidence)';
}

const PROCESSING_FLAGS = ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation'];

/**
 * Trust signals and verdict.
 * ctx.volumeFt3: room volume. ctx.reported: MediaTrackSettings from getSettings() (or null).
 */
export function assess(result, ctx = {}, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const red = [], amber = [];
  // Always shown, never changes the badge: the page cannot read operating-system processing.
  const notes = ['Operating-system processing cannot be read by the page; check the settings list'];
  const claps = result.claps.slice(0, o.maxClaps);

  // Browser-reported processing.
  const rep = ctx.reported || null;
  if (rep) {
    const on = PROCESSING_FLAGS.filter((f) => rep[f] === true);
    if (on.length) red.push(`The browser reports processing on: ${on.join(', ')}`);
    const unknown = PROCESSING_FLAGS.filter((f) => rep[f] === undefined);
    if (unknown.length) amber.push(`Processing state unknown for: ${unknown.join(', ')}`);
  } else {
    amber.push('Processing state unknown (the browser did not report settings)');
  }
  // Platform warnings from the caller (e.g. iOS and Android: a page cannot turn off voice processing).
  for (const m of ctx.extraAmber || []) amber.push(m);

  // Per-clap signals.
  const usable = [];
  claps.forEach((c, k) => {
    const label = `Clap ${k + 1}`;
    const bs = BANDS.map((fc) => c.bands[fc]);
    if (c.clipRun >= o.clipRunRed) { c.trust = 'red'; red.push(`${label}: clipped. Clap a little softer`); return; }
    const drops = bs.filter((b) => b.floorResidDb !== null && b.floorResidDb <= -o.floorDropRedDb).length;
    if (drops >= o.floorDropBands) { c.trust = 'red'; c.reason = 'noise suppression signature'; return; }
    c.trust = 'green';
    if (bs.some((b) => b.floorResidDb !== null && b.floorResidDb >= o.floorRiseAmberDb)) {
      c.trust = 'amber'; amber.push(`${label}: noise changed after the clap; repeat if possible`);
    }
    usable.push(c);
  });

  // Decay shape, judged on medians across claps: one clap's EDT is too noisy to judge alone
  // (it flagged perfect synthetic decays). A bend is amber only: real rooms can double-slope.
  for (const fc of BANDS) {
    const pick = (k) => usable.map((c) => c.bands[fc]).filter((b) => b.T20 && b[k] && b.cleanDecayDb >= o.cleanMinDb).map((b) => [b.T20, b[k]]);
    const bent = (k, [lo, hi]) => {
      const p = pick(k);
      if (p.length < 2) return false;
      const r = median(p.map((q) => q[1])) / median(p.map((q) => q[0]));
      return r < lo || r > hi;
    };
    // Information only: it fired on 11 of 14 real ACE rooms with processing off (browser test, Fri 22:50),
    // so it carries no trust information and must not change the badge.
    if (bent('T30', o.t30RatioOk) || bent('EDT', o.edtRatioOk)) notes.push(`The decay bends in the ${fc} Hz band. Real rooms with absorbent ceilings and hard walls often do this`);
  }
  if (result.speechMarginDb !== null && result.speechMarginDb > o.speechSuspiciousDb) {
    amber.push(`The speech margin is implausibly high (${Math.round(result.speechMarginDb)} dB). The device may be filtering background noise`);
  }
  const sigClaps = claps.filter((c) => c.reason === 'noise suppression signature').length;
  if (sigClaps >= 2) red.push(`${sigClaps} claps show a noise-suppression signature (background drops after the clap)`);
  else if (sigClaps === 1) amber.push('1 clap shows a noise-suppression signature; it was left out');

  // Per-band medians from usable claps with enough clean decay.
  const bandT20 = {}, bandN = {};
  let lowerConfidence = false;
  for (const fc of BANDS) {
    const vals = [];
    for (const c of usable) {
      const b = c.bands[fc];
      if (b.T20 && b.cleanDecayDb !== null && b.cleanDecayDb >= o.cleanMinDb) {
        vals.push(b.T20);
        if (b.cleanDecayDb < o.cleanFullDb) lowerConfidence = true;
      }
    }
    bandN[fc] = vals.length;
    bandT20[fc] = vals.length >= o.minClapsPerBand ? median(vals) : null;
  }
  const complete = BANDS.every((fc) => bandT20[fc] !== null);
  const avgT20 = complete ? BANDS.reduce((s, fc) => s + bandT20[fc], 0) / BANDS.length : null;

  // Repeatability of the 3-band T20 across claps.
  const per = usable.map((c) => BANDS.map((fc) => c.bands[fc].T20)).filter((v) => v.every(Boolean))
    .map((v) => v.reduce((s, t) => s + t, 0) / v.length);
  const spread = per.length >= 2 ? (Math.max(...per) - Math.min(...per)) / median(per) : null;
  if (spread !== null && spread > o.spreadAmber) amber.push(`Claps disagree by ${Math.round(spread * 100)} %`);

  const limit = limitFor(ctx.volumeFt3);
  const reasons = [];
  let verdict;
  if (red.length) verdict = 'Blocked';
  else if (!complete) {
    verdict = 'Incomplete';
    // Say which bands failed and why. Loud claps can still fail when the room's own echo sits close to
    // the background (strong direct sound, e.g. clapping near the device): the decay cannot reach -25 dB.
    const missing = BANDS.filter((fc) => bandT20[fc] === null);
    const loudButShort = missing.filter((fc) => usable.filter((c) => c.bands[fc].cleanDecayDb >= o.cleanMinDb && !c.bands[fc].T20).length >= 2);
    reasons.push(`Not enough clean claps in the ${missing.join(' and ')} Hz band${missing.length > 1 ? 's' : ''} (need ${o.minClapsPerBand} per band with ${o.cleanMinDb} dB of clean decay).`);
    if (loudButShort.length) reasons.push(`In the ${loudButShort.join(' and ')} Hz band the claps were loud, but the room's echo faded into the background too soon. Clap from the front of the room, not near the device, and keep the room quiet.`);
  }
  else if (!(ctx.volumeFt3 > 0)) { verdict = 'Incomplete'; reasons.push('Room size is needed to pick the limit'); }
  else if (limit === null) { verdict = 'Incomplete'; reasons.push('Rooms over 20,000 cubic feet are not covered by the S12.60 limit used here'); }
  else {
    verdict = decide(avgT20, limit, o.tooCloseFraction);
    // S12.60 text may apply the limit to each band, not only the average (research/CLAP_ACCURACY.md).
    // A false pass is the harm, so a band over the limit never lets the result read "Under".
    const over = BANDS.filter((fc) => bandT20[fc] > limit);
    if (verdict === 'Under the limit (weak evidence)' && over.length) {
      verdict = 'Too close to call';
      reasons.push(`The average is under the limit, but the ${over.join(' and ')} Hz band${over.length > 1 ? 's are' : ' is'} over it`);
    }
  }

  const badge = red.length ? 'red' : amber.length ? 'amber' : 'green';
  return {
    verdict, reasons, badge, red, amber, notes,
    limitS: limit, avgT20, bandT20, bandClaps: bandN,
    confidence: complete ? (lowerConfidence ? 'lower' : 'full') : null,
    spread, clapsUsed: usable.length, clapsFound: result.claps.length,
    speechMarginDb: result.speechMarginDb, speechGuidelineDb: o.speechGuidelineDb,
    // Filtering inflates the margin: show it only when the badge is green, flag it when amber.
    speechMarginStatus: result.speechMarginDb === null ? 'none' : red.length ? 'hidden' : amber.length ? 'flagged' : 'shown',
  };
}

// ---------- WAV reading (16-bit PCM or 32-bit float) ----------

/** Parse a WAV ArrayBuffer; returns { fs, x } with channel 0 as Float64Array. */
export function readWav(buf) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let o = 12, fmt = null;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true), body = o + 8;
    if (id === 'fmt ') fmt = { format: v.getUint16(body, true), ch: v.getUint16(body + 2, true), fs: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    if (id === 'data') {
      if (!fmt) throw new Error('fmt chunk missing');
      const bps = fmt.bits / 8, n = Math.floor(size / (bps * fmt.ch)), x = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const p = body + i * bps * fmt.ch;
        if (fmt.format === 1 && fmt.bits === 16) x[i] = v.getInt16(p, true) / 32768;
        else if (fmt.format === 3 && fmt.bits === 32) x[i] = v.getFloat32(p, true);
        else throw new Error(`unsupported WAV format ${fmt.format}/${fmt.bits}`);
      }
      return { fs: fmt.fs, x };
    }
    o = body + size + (size % 2);
  }
  throw new Error('data chunk missing');
}
