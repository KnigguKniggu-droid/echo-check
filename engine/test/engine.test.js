// Engine tests on synthetic clap decays with a known T60.
// Pass rule (README Phase 1): the band T20 is within 0.05 s or 5 % of the true value,
// whichever is larger. Run: node --test engine/test/engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../echo-engine.js';
import { synthRecording } from '../synth.js';

const synth = (o) => synthRecording(o);

const tol = (T) => Math.max(0.05, 0.05 * T);
const near = (got, want, msg) => assert.ok(Math.abs(got - want) <= tol(want), `${msg}: got ${got?.toFixed?.(3)}, want ${want} +/- ${tol(want).toFixed(3)}`);
const NO_PROCESSING = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false };

test('octave band filters: 0 dB at the centre, -3 dB at the edges, strong rejection', () => {
  for (const fs of [44100, 48000]) {
    for (const fc of E.BANDS) {
      const s = E.octaveBand(fc, fs);
      const fcd = (fs / Math.PI) * Math.atan(Math.sqrt(Math.tan(Math.PI * fc / Math.SQRT2 / fs) * Math.tan(Math.PI * fc * Math.SQRT2 / fs)));
      assert.ok(Math.abs(20 * Math.log10(E.magnitude(s, fcd, fs))) < 0.01, `centre ${fc} @ ${fs}`);
      for (const edge of [fc / Math.SQRT2, fc * Math.SQRT2]) {
        const g = 20 * Math.log10(E.magnitude(s, edge, fs));
        assert.ok(Math.abs(g + 3.01) < 0.05, `edge ${edge.toFixed(0)} Hz of ${fc} @ ${fs}: ${g.toFixed(2)} dB`);
      }
      assert.ok(20 * Math.log10(E.magnitude(s, fc / 4, fs)) < -30, `rejection below ${fc}`);
      assert.ok(20 * Math.log10(E.magnitude(s, fc * 4, fs)) < -30, `rejection above ${fc}`);
    }
  }
});

test('high-pass for clap detection: -3 dB at 200 Hz', () => {
  const s = E.designHighpass(200, 48000, 4);
  assert.ok(Math.abs(20 * Math.log10(E.magnitude(s, 200, 48000)) + 3.01) < 0.05);
  assert.ok(20 * Math.log10(E.magnitude(s, 50, 48000)) < -45);
  assert.ok(Math.abs(20 * Math.log10(E.magnitude(s, 2000, 48000))) < 0.01);
});

for (const T of [0.3, 0.45, 0.6, 0.9, 1.2]) {
  test(`synthetic decay T60 = ${T} s: 4 claps found, every band within 0.05 s or 5 %`, () => {
    const { fs, x } = synth({ T60: T, seed: Math.round(T * 100) });
    const res = E.analyse(x, fs);
    assert.equal(res.claps.length, 4, `claps at ${res.clapTimesS}`);
    res.clapTimesS.forEach((t, k) => assert.ok(Math.abs(t - [12, 15, 18, 21][k]) < 0.02, `clap ${k + 1} at ${t}`));
    const a = E.assess(res, { volumeFt3: 8000, reported: NO_PROCESSING });
    for (const fc of E.BANDS) near(a.bandT20[fc], T, `band ${fc}`);
    near(a.avgT20, T, '3-band average');
    assert.equal(a.confidence, 'full');
    assert.notEqual(a.verdict, 'Blocked');
    assert.notEqual(a.verdict, 'Incomplete');
  });
}

test('different T60 per band is measured per band', () => {
  const T = { 500: 0.8, 1000: 0.6, 2000: 0.45 };
  const { fs, x } = synth({ T60: T, seed: 7 });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  for (const fc of E.BANDS) near(a.bandT20[fc], T[fc], `band ${fc}`);
});

test('44.1 kHz recordings work too', () => {
  const { fs, x } = synth({ fs: 44100, T60: 0.6, seed: 11 });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  near(a.avgT20, 0.6, '3-band average at 44.1 kHz');
});

test('verdicts follow the limit and the +/-15 % band', () => {
  const run = (T, volumeFt3) => {
    const { fs, x } = synth({ T60: T, seed: 3 });
    return E.assess(E.analyse(x, fs), { volumeFt3, reported: NO_PROCESSING }).verdict;
  };
  assert.equal(run(0.3, 8000), 'Under the limit (weak evidence)');
  assert.equal(run(0.6, 8000), 'Too close to call');
  assert.equal(run(1.2, 8000), 'Likely over the limit');
  assert.equal(run(0.6, undefined), 'Incomplete');
  assert.equal(run(0.6, 25000), 'Incomplete');
});

test('limit and decision rules', () => {
  assert.equal(E.limitFor(9999), 0.6);
  assert.equal(E.limitFor(10000), 0.6);
  assert.equal(E.limitFor(15000), 0.7);
  assert.equal(E.limitFor(20001), null);
  assert.equal(E.limitFor(undefined), null);
  assert.equal(E.decide(0.70, 0.6), 'Likely over the limit');     // +16.7 %
  assert.equal(E.decide(0.68, 0.6), 'Too close to call');         // +13.3 %
  assert.equal(E.decide(0.52, 0.6), 'Too close to call');         // -13.3 %
  assert.equal(E.decide(0.50, 0.6), 'Under the limit (weak evidence)');
});

test('Incomplete says why: claps too quiet, or no claps at all', () => {
  const quiet = synth({ T60: 0.6, amp: 0.5, noiseDb: -33, seed: 5 });
  const a = E.assess(E.analyse(quiet.x, quiet.fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(a.verdict, 'Incomplete');
  assert.ok(a.reasons.some((m) => m.startsWith('The claps were too quiet above the background')), a.reasons.join(' | '));
  const none = synth({ T60: 0.6, amp: 0.5, noiseDb: -33, seed: 5, claps: [] });
  const b = E.assess(E.analyse(none.x, none.fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(b.verdict, 'Incomplete');
  assert.ok(b.reasons.some((m) => m.startsWith('No claps were heard clearly')), b.reasons.join(' | '));
});

test('too little clean decay gives Incomplete, not a verdict', () => {
  const { fs, x } = synth({ T60: 0.6, amp: 0.5, noiseDb: -33, seed: 5 });
  const res = E.analyse(x, fs);
  assert.equal(res.claps.length, 4, 'claps must still be detected');
  const a = E.assess(res, { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(a.verdict, 'Incomplete', JSON.stringify(a.bandClaps));
});

test('clipped claps block the verdict', () => {
  const { fs, x } = synth({ T60: 0.6, amp: 4, seed: 9, clip: true });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(a.verdict, 'Blocked');
  assert.ok(a.red.some((m) => m.includes('clipped')));
});

// The floor-drop rule sees a background that is quieter after the clap than before it
// (AGC pull-down or adaptive suppression). It cannot see suppression that is steady for the
// whole recording (Friday device test, HANDOFF.md 20:10); that case relies on getSettings().
test('a gain drop after each clap (AGC or adaptive suppression) is caught', () => {
  const { fs, x } = synth({ T60: 0.6, seed: 13, gate: { from: 0.8, to: 2.0, gain: 0.25 } });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(a.verdict, 'Blocked');
  assert.ok(a.red.some((m) => m.includes('noise-suppression signature')), a.red.join(' | '));
});

test('browser-reported processing blocks the verdict; all-off does not', () => {
  const { fs, x } = synth({ T60: 0.6, seed: 17 });
  const res = E.analyse(x, fs);
  const on = E.assess(res, { volumeFt3: 8000, reported: { ...NO_PROCESSING, noiseSuppression: true } });
  assert.equal(on.verdict, 'Blocked');
  assert.equal(on.badge, 'red');
  const off = E.assess(E.analyse(x, fs), { volumeFt3: 8000, reported: NO_PROCESSING });
  assert.equal(off.red.length, 0);
});

test('readWav reads 16-bit PCM', () => {
  const fs = 48000, n = 480;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(16384 * Math.sin(2 * Math.PI * 1000 * i / fs)), true);
  const r = E.readWav(buf);
  assert.equal(r.fs, fs);
  assert.equal(r.x.length, n);
  assert.ok(Math.abs(r.x[12] - 0.5) < 1e-3); // sin(pi/2) * 0.5 at sample 12
});

test('speech margin is measured against the quiet background', () => {
  const { fs, x } = synth({ dur: 45, T60: 0.6, seed: 21, speech: { from: 30.5, to: 40.5, levelDb: -40 } });
  const res = E.analyse(x, fs);
  assert.ok(res.speechMarginDb > 15 && res.speechMarginDb < 40, `speech margin ${res.speechMarginDb}`);
});

test('a clean exponential decay raises no warnings; a double-slope decay is a note only (badge stays green)', () => {
  for (const T of [0.45, 0.62, 1.1]) {
    const { fs, x } = synth({ dur: 45, T60: T, seed: 300 + Math.round(T * 100) });
    const a = E.assess(E.analyse(x, fs), { volumeFt3: 7500, reported: NO_PROCESSING });
    assert.equal(a.badge, 'green', `T60 ${T}: ${a.amber.join(' | ')}`);
  }
  const { fs, x } = synth({ dur: 45, T60: 0.35, seed: 401, second: { T60: 1.4, levelDb: -18 } });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 7500, reported: NO_PROCESSING });
  assert.equal(a.badge, 'green', a.amber.join(' | '));
  assert.ok(a.notes.some((m) => m.includes('bends')));
  assert.equal(a.red.length, 0);
});

test('an implausibly high speech margin (steady filtering) is amber, and the margin is not shown when red', () => {
  const quiet = synth({ dur: 45, T60: 0.6, seed: 31, noiseDb: -100, amp: 0.3, speech: { from: 30.5, to: 40.5, levelDb: -35 } });
  const r1 = E.analyse(quiet.x, quiet.fs);
  const a1 = E.assess(r1, { volumeFt3: 7500, reported: NO_PROCESSING });
  assert.ok(r1.speechMarginDb > 55, `margin ${r1.speechMarginDb}`);
  assert.ok(a1.amber.some((m) => m.includes('implausibly high')), a1.amber.join(' | '));
  assert.equal(a1.speechMarginStatus, 'flagged');
  const a2 = E.assess(r1, { volumeFt3: 7500, reported: { ...NO_PROCESSING, noiseSuppression: true } });
  assert.equal(a2.speechMarginStatus, 'hidden');
});

test('a band over the limit never lets the verdict read Under', () => {
  const { fs, x } = synth({ T60: { 500: 0.66, 1000: 0.33, 2000: 0.28 }, seed: 41 });
  const a = E.assess(E.analyse(x, fs), { volumeFt3: 7500, reported: NO_PROCESSING });
  assert.ok(a.avgT20 < 0.51, `avg ${a.avgT20}`);
  assert.equal(a.verdict, 'Too close to call', a.reasons.join(' | '));
  assert.ok(a.reasons.some((m) => m.includes('500 Hz band')));
});
