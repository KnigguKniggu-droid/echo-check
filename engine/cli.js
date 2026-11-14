// Command-line check of a recorder take.
// Usage: node engine/cli.js <take.wav> [--volume <ft3>] [--info <take.json>]
// --info reads the recorder's JSON file and uses its "reported" settings for the trust check.
import { readFileSync } from 'node:fs';
import { analyse, assess, readWav, BANDS } from './echo-engine.js';

const args = process.argv.slice(2);
const wav = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (!wav) { console.error('usage: node engine/cli.js <take.wav> [--volume <ft3>] [--info <take.json>]'); process.exit(2); }

const b = readFileSync(wav);
const { fs, x } = readWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const info = opt('--info') ? JSON.parse(readFileSync(opt('--info'), 'utf8')) : null;
const res = analyse(x, fs);
const a = assess(res, { volumeFt3: Number(opt('--volume')) || undefined, reported: info ? info.reported : null });

const r3 = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(3));
const r1 = (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(1));
console.log(`${wav.split(/[\\/]/).pop()}  fs=${fs}  claps at ${res.clapTimesS.map((t) => t.toFixed(2)).join(', ')} s`);
res.claps.forEach((c) => {
  console.log(`  t=${c.t.toFixed(2)} clipRun=${c.clipRun} trust=${c.trust ?? '-'}`);
  for (const fc of BANDS) {
    const d = c.bands[fc];
    console.log(`    ${String(fc).padStart(4)}  clean ${r1(d.cleanDecayDb)} dB  resid ${r1(d.floorResidDb)} dB  T20 ${r3(d.T20)}  T30 ${r3(d.T30)}  EDT ${r3(d.EDT)}`);
  }
});
console.log(`  speech margin ${r1(res.speechMarginDb)} dB`);
console.log(JSON.stringify({ ...a }, null, 1));
