// Echo Check+ app: room size -> set up -> 45 s recording (or upload / sample) -> result.
import { analyse, assess, readWav, limitFor, decide, BANDS, FT3_PER_M3, DEFAULTS } from '../engine/echo-engine.js';
import { synthRecording } from '../engine/synth.js';

const $ = (id) => document.getElementById(id);
const show = (...ids) => { for (const s of ['start', 'room', 'setup', 'measure', 'samples', 'result']) $(s).classList.toggle('hidden', !ids.includes(s)); };
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- room size ----------
function volumeFt3() {
  const u = document.querySelector('input[name=units]:checked').value;
  const L = parseFloat($('len').value), W = parseFloat($('wid').value), H = parseFloat($('hei').value);
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const v = L * W * H;
  return u === 'm' ? v * FT3_PER_M3 : v;
}
function renderVolume() {
  const v = volumeFt3();
  if (v === null) { $('vol-out').textContent = 'A typical classroom is about 30 × 25 × 10 ft = 7,500 cubic feet.'; return; }
  const lim = limitFor(v);
  const vs = Math.round(v).toLocaleString('en-US');
  $('vol-out').textContent = lim === null
    ? `Volume about ${vs} cubic feet. Rooms over 20,000 cubic feet are not covered by this limit: you will get echo times but no verdict.`
    : `Volume about ${vs} cubic feet. Limit: ${lim} s (ANSI/ASA S12.60-2010 Part 1).`;
  if (lastResult) renderResult(lastResult.res, lastResult.ctx);
}
for (const id of ['len', 'wid', 'hei']) $(id).addEventListener('input', renderVolume);
for (const r of document.querySelectorAll('input[name=units]')) r.addEventListener('change', renderVolume);

// ---------- OS-specific set-up steps (the page cannot read OS effects) ----------
function osSteps() {
  const ua = navigator.userAgent;
  if (/CrOS/.test(ua)) return 'on a Chromebook, open Settings → Device → Audio and turn off Noise cancellation (if shown).';
  if (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'on an iPhone or iPad, a web page cannot turn off all voice processing. Use a laptop if you can. If Control Centre shows Mic Mode, choose Standard.';
  if (/Android/.test(ua)) return 'on Android, a web page cannot see phone-maker audio effects. Use a laptop if you can.';
  if (/Macintosh/.test(ua)) return 'on a Mac, while this page uses the microphone, open Control Centre → Mic Mode and choose Standard.';
  if (/Windows/.test(ua)) return 'on Windows, open Settings → System → Sound → your microphone, and turn off Audio enhancements and Voice clarity (if shown). Microsoft says Voice clarity reduces reverberation, which would make the room look less echoey than it is.';
  return 'turn off noise cancellation or voice effects in this device\'s sound settings.';
}
$('os-steps').textContent = osSteps();

// ---------- navigation ----------
$('go-check').addEventListener('click', () => { show('room', 'setup'); $('len').focus(); });
$('setup-back').addEventListener('click', () => show('start', 'room'));
$('go-samples').addEventListener('click', () => { show('samples'); renderAce(); $('samples-h').focus?.(); });
$('samples-back').addEventListener('click', () => show('start', 'room'));
$('home').addEventListener('click', () => { lastResult = null; show('start', 'room'); });
$('again').addEventListener('click', () => show('room', 'setup'));
$('print').addEventListener('click', () => window.print());

// ---------- recording ----------
const DURATION_S = 45;
// Guided claps, 4 s apart (RPI architectural-acoustics student review, Sun 2026-11-15): each clap is cued, and each
// decay window is more than twice a long classroom echo time. Claps fall at about 12, 16, 20 and 24 s, inside the
// engine's clap window (DEFAULTS.clapWindowS = [9, 29.5]). Speech 30-40 s, inside DEFAULTS.speechWindowS = [30, 41].
const PHASES = [[0, 'Walk to the front quietly'], [8, 'Get ready: cupped hands']];
for (let k = 0; k < 4; k++) {
  const t0 = 12 + 4 * k;
  PHASES.push([t0 - 3, `Clap ${k + 1} of 4 in 3…`], [t0 - 2, `Clap ${k + 1} of 4 in 2…`], [t0 - 1, `Clap ${k + 1} of 4 in 1…`], [t0, `CLAP NOW (${k + 1} of 4)`]);
}
PHASES.push([25, 'Stay quiet'], [30, 'Count slowly from 1 to 20'], [40, 'Stop talking. Stay quiet'], [42, 'Stay quiet. Finishing']);
const WORKLET = "class Rec extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c&&c.length)this.port.postMessage(c.slice(0));return true}}registerProcessor('rec',Rec);";
let rec = null;

function setupError(text) { const m = $('setup-msg'); m.textContent = text; m.classList.remove('hidden'); m.classList.add('err'); }

async function startRecording() {
  $('setup-msg').classList.add('hidden');
  if (!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    setupError('The microphone needs a secure page (https). Open the hosted link, or use "Try a sample room".');
    return;
  }
  // Flags inside `audio`, asked as {exact:false} first; plain false if the browser rejects exact.
  // Processing cannot be switched off later with applyConstraints once Chrome opened the mic with it.
  const flags = (v) => ({ echoCancellation: v, noiseSuppression: v, autoGainControl: v, voiceIsolation: v });
  const testOn = window.__autotest && window.__autotest.pass === 'on'; // automated test only: processing on
  const exactReq = testOn ? { audio: { ...flags(true), channelCount: { ideal: 1 } } } : { audio: { ...flags({ exact: false }), channelCount: { ideal: 1 } } };
  const plainReq = { audio: { ...flags(testOn), channelCount: { ideal: 1 } } };
  $('rec-start').disabled = true;
  const r = { chunks: [], n: 0, peak: 0, blockPeak: 0, hidden: false };
  rec = r;
  let waitTimer;
  try {
    r.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); // created inside the click
    waitTimer = setTimeout(() => setupError('Still waiting for the microphone. Look for a prompt, or a blocked-microphone icon in the address bar. You can also use "Try a sample room".'), 8000);
    try {
      r.stream = await navigator.mediaDevices.getUserMedia(exactReq);
    } catch (e1) {
      if (!(e1 && (e1.name === 'OverconstrainedError' || e1.name === 'TypeError'))) throw e1;
      r.stream = await navigator.mediaDevices.getUserMedia(plainReq);
    }
    clearTimeout(waitTimer);
    if (rec !== r) { r.stream.getTracks().forEach((t) => t.stop()); return; }
    r.track = r.stream.getAudioTracks()[0];
    r.reported = r.track.getSettings ? r.track.getSettings() : null;
    if (r.ctx.state === 'suspended') await r.ctx.resume();
    r.src = r.ctx.createMediaStreamSource(r.stream);
    r.sink = r.ctx.createGain(); r.sink.gain.value = 0; r.sink.connect(r.ctx.destination); // never plays sound
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await r.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      r.node = new AudioWorkletNode(r.ctx, 'rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
      r.node.port.onmessage = (e) => onChunk(r, e.data);
      r.method = 'AudioWorklet';
    } catch (_) {
      r.node = r.ctx.createScriptProcessor(4096, 1, 1);
      r.node.onaudioprocess = (e) => onChunk(r, new Float32Array(e.inputBuffer.getChannelData(0)));
      r.method = 'ScriptProcessor';
    }
    r.src.connect(r.node); r.node.connect(r.sink);
    r.fs = r.ctx.sampleRate;
    r.t0 = performance.now();
    r.running = true;
    show('measure');
    $('rec-info').textContent = `Microphone: ${r.track.label || 'unknown'} · ${r.fs} Hz · ${r.method}`;
    r.timer = setInterval(() => tick(r), 100);
  } catch (e) {
    clearTimeout(waitTimer);
    cleanup(r);
    $('rec-start').disabled = false;
    const n = e && e.name;
    setupError(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone blocked. Allow it from the address bar (lock or microphone icon), then try again. Or use "Try a sample room".'
      : n === 'NotFoundError' ? 'No microphone found on this device. Use "Try a sample room" or upload a recording.'
      : n === 'NotReadableError' ? 'Another app is using the microphone. Close it and try again.'
      : 'Could not start the microphone: ' + ((e && e.message) || e));
  }
}

function onChunk(r, f32) {
  if (!r.running) return;
  r.chunks.push(f32); r.n += f32.length;
  for (let i = 0; i < f32.length; i++) { const a = Math.abs(f32[i]); if (a > r.blockPeak) r.blockPeak = a; }
}

function tick(r) {
  const t = (performance.now() - r.t0) / 1000;
  let ph = '';
  for (const [s, txt] of PHASES) if (t >= s) ph = txt;
  if ($('phase').textContent !== ph) $('phase').textContent = ph;
  $('count').textContent = Math.max(0, Math.ceil(DURATION_S - t));
  const d = 20 * Math.log10(Math.max(r.blockPeak, 1e-9)); r.blockPeak = 0;
  $('level').style.width = Math.max(0, Math.min(100, ((d + 60) / 60) * 100)) + '%';
  if (t >= DURATION_S) finishRecording(r);
}

document.addEventListener('visibilitychange', () => { if (rec && rec.running && document.hidden) rec.hidden = true; });

function cleanup(r) {
  if (!r) return;
  r.running = false;
  clearInterval(r.timer);
  for (const n of [r.src, r.node, r.sink]) { try { n && n.disconnect(); } catch (_) {} }
  if (r.stream) r.stream.getTracks().forEach((t) => t.stop());
  if (r.ctx) r.ctx.close().catch(() => {});
}

function finishRecording(r) {
  cleanup(r);
  $('rec-start').disabled = false;
  const x = new Float64Array(r.n);
  let o = 0;
  for (const c of r.chunks) { x.set(c, o); o += c.length; }
  rec = null;
  runAnalysis(x, r.fs, { reported: r.reported, source: 'microphone', microphone: r.track && r.track.label, tabHidden: r.hidden, captureMethod: r.method, audio: { x, fs: r.fs }, startedAt: new Date(Date.now() - DURATION_S * 1000).toISOString() });
}

$('rec-start').addEventListener('click', startRecording);
$('rec-cancel').addEventListener('click', () => { const r = rec; rec = null; cleanup(r); $('rec-start').disabled = false; show('room', 'setup'); });

// ---------- upload ----------
$('upload-btn').addEventListener('click', () => $('upload').click());
$('upload').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const { fs, x } = readWav(await f.arrayBuffer());
    runAnalysis(x, fs, { reported: null, source: 'upload', file: f.name });
  } catch (err) {
    show('start', 'room');
    alertBox('Could not read that file: ' + err.message + '. Use a 16-bit PCM or 32-bit float WAV, for example one saved by the Echo Check recorder.');
  }
});
function alertBox(text) {
  let m = $('start').querySelector('.msg');
  if (!m) { m = document.createElement('div'); m.className = 'msg err'; m.setAttribute('role', 'alert'); $('start').appendChild(m); }
  m.textContent = text;
}

// ---------- samples ----------
const OFF = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false };
const SAMPLES = {
  treated: { T60: 0.45, seed: 101, label: 'Simulated treated room (true echo time 0.45 s)' },
  border: { T60: 0.62, seed: 102, label: 'Simulated borderline room (true echo time 0.62 s)' },
  echoey: { T60: 1.1, seed: 103, label: 'Simulated echoey room (true echo time 1.1 s)' },
  filtered: { T60: 0.6, seed: 105, reported: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: false }, label: 'Simulated browser report: noise suppression, echo cancellation and gain control are on. In our tests, this report is how Chrome\'s real filtering was caught (14 of 14 runs); the audio alone did not show it' },
  processed: { T60: 0.6, seed: 104, gate: { from: 0.8, to: 2.0, gain: 0.25 }, label: 'Simulated processed microphone (the background drops after each clap)' },
  // Safety-rule demos: equally quiet claps (loud background) in an echoey and a treated room, and an uneven room.
  quietEchoey: { T60: 1.1, seed: 105, noiseDb: -36, speechDb: -20, label: 'Simulated quiet claps in an echoey room (true echo time 1.1 s; loud background)' },
  quietTreated: { T60: 0.45, seed: 106, noiseDb: -36, speechDb: -20, label: 'Simulated quiet claps in a treated room (true echo time 0.45 s; same clap and background levels as the echoey demo)' },
  uneven: { T60: { 500: 0.66, 1000: 0.30, 2000: 0.25 }, seed: 107, label: 'Simulated uneven room: long echo at 500 Hz, shorter at 1000 and 2000 Hz' },
};
for (const b of document.querySelectorAll('[data-sample]')) {
  b.addEventListener('click', () => {
    const s = SAMPLES[b.dataset.sample];
    if (!(volumeFt3() > 0)) { $('len').value = 30; $('wid').value = 25; $('hei').value = 10; document.querySelector('input[name=units][value=ft]').checked = true; renderVolume(); }
    const label = b.textContent;
    b.disabled = true; b.textContent = 'Working…';
    setTimeout(() => {
      const { fs, x } = synthRecording({ dur: 45, T60: s.T60, seed: s.seed, gate: s.gate || null, noiseDb: s.noiseDb ?? -70, speech: { from: 30.5, to: 40.5, levelDb: s.speechDb ?? -38 } });
      b.disabled = false; b.textContent = label;
      runAnalysis(x, fs, { reported: s.reported || OFF, source: 'simulated', label: s.label });
    }, 30);
  });
}

// ACE published values (README / engine/REFERENCE_VALUES.md). 3-band T20 mean per microphone position.
const ACE = [
  { room: 'Meeting room 1', ft3: 3519, t20: [0.41, 0.42] },
  { room: 'Meeting room 2', ft3: 8677, t20: [0.43, 0.40] },
  { room: 'Lecture room 1', ft3: 7144, t20: [0.59, 0.67] },
  { room: 'Lecture room 2', ft3: 13118, t20: [1.67, 1.69] },
];
function renderAce() {
  const rows = ACE.map((r) => {
    const lim = limitFor(r.ft3);
    const v = r.t20.map((t) => decide(t, lim));
    const same = v[0] === v[1];
    return `<tr><td>${r.room}</td><td class="num">${r.ft3.toLocaleString('en-US')} ft³</td><td class="num">${lim} s</td><td class="num">${r.t20.map((t) => t.toFixed(2)).join(' / ')} s</td><td>${same ? v[0] : v.join(' / ')}</td></tr>`;
  }).join('');
  $('ace').innerHTML = `<table><thead><tr><th>Room</th><th class="num">Volume</th><th class="num">Limit</th><th class="num">Echo time</th><th>Our verdict rule</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------- analysis and result ----------
let lastResult = null;

function runAnalysis(x, fs, meta) {
  show('result');
  $('verdict').className = 'verdict v-none';
  $('verdict').innerHTML = '<h2>Analysing…</h2><p>This takes a second. Nothing is uploaded.</p>';
  setTimeout(() => {
    const dur = x.length / fs;
    const opts = meta.source === 'upload' && dur < 41 ? { clapWindowS: [0.5, Math.max(1, dur - 0.5)] } : {};
    let res;
    try { res = analyse(x, fs, opts); } catch (err) {
      $('verdict').innerHTML = `<h2>Incomplete</h2><p>The recording could not be analysed: ${esc(err.message)}.</p>`;
      return;
    }
    lastResult = { res, ctx: meta };
    renderResult(res, meta);
    $('verdict').focus?.();
  }, 30);
}

const NEXT_ASK = 'Next step: ask your school\'s educational audiologist, a teacher of the deaf, your state\'s deaf-education outreach program, or the facilities manager for a proper room measurement. Show them this result.';
const VERDICT_TEXT = {
  'Likely over the limit': ['v-over', 'The echo at this seat is likely above the classroom limit.', NEXT_ASK],
  'Too close to call': ['v-close', 'The echo at this seat is close to the classroom limit. Claps cannot tell which side it is on.', NEXT_ASK],
  'Under the limit (weak evidence)': ['v-under', 'The echo at this seat looks under the classroom limit. This is weak evidence.', 'A pass never means a student has full access, and it must never be used to deny accommodations. Background noise, distance and seeing the speaker\'s face still matter.'],
  'Incomplete': ['v-none', 'The check could not give a verdict.', 'Try again: clap louder with cupped hands, keep the room quiet, and enter the room size.'],
  'Blocked': ['v-none', 'The verdict is blocked because the recording may be processed.', 'Turn off microphone effects (step 2) and try again, or use another device.'],
};

// Devices where a web page cannot turn off voice processing (research/MIC_PROCESSING.md).
function platformAmber() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return ['iPhone and iPad: a web page cannot turn off voice processing, so this device type is less reliable. Use a laptop if you can'];
  if (/Android/.test(ua)) return ['Android: phone makers can add audio processing that a web page cannot see or turn off, so this device type is less reliable'];
  return [];
}

// One sentence for an assistive-technology evaluation report. An audiology department chair told us such a report
// "would just include a simple sentence stating whether or not the classroom met recommended levels". A consultant
// warned that compliance needs a proper measurement, so the sentence says "estimate": never "complies" or "meets".
function reportSentence(a, meta, v) {
  const lim = a.limitS;
  if (!lim || !['Likely over the limit', 'Too close to call', 'Under the limit (weak evidence)'].includes(a.verdict)) return null;
  const d = meta.startedAt ? new Date(meta.startedAt) : new Date();
  const when = (Number.isNaN(d.getTime()) ? new Date() : d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const size = v ? `about ${Math.round(v).toLocaleString('en-US')} cubic feet` : 'this size';
  const head = (meta.source === 'simulated' ? 'SAMPLE RECORDING, NOT A REAL ROOM. ' : '')
    + `Room echo check (Echo Check+, ${when}), from hand claps recorded at one seat: `;
  const lims = `the ANSI/ASA S12.60-2010 Part 1 recommended maximum of ${lim} s for an unoccupied, furnished classroom of ${size}`;
  const tail = (a.badge === 'amber' ? ' The microphone check gave warnings, so this estimate is less certain.' : '')
    + ' Background noise was not assessed. This is an estimate from a quick room check, not a compliance measurement.';
  if (a.verdict === 'Likely over the limit' && a.basis === 'EDT')
    return head + `the early decay time (EDT, average of 500, 1000 and 2000 Hz) was ${fmt(a.avgEDT)} s, so the reverberation time is likely above ${lims} (lower confidence). A professional measurement is recommended.` + tail;
  const perBand = BANDS.every((fc) => Number.isFinite(a.bandT20[fc])) ? ` (${BANDS.map((fc) => fmt(a.bandT20[fc])).join(' / ')} s at 500 / 1000 / 2000 Hz)` : '';
  const t = `the estimated reverberation time (T20, average of 500, 1000 and 2000 Hz) was ${fmt(a.avgT20)} s${perBand}${a.confidence === 'lower' ? ' (lower confidence)' : ''}`;
  // S12.60-2010 also asks that rooms of 10,000 ft3 or less be readily adaptable to 0.3 s for students with hearing loss
  // (AAA position statement 2011; Iglehart 2016; research/STANDARDS_AND_AT_EVALUATION.md). The check does not test that.
  const small = lim === 0.6 ? ' It does not check the standard\'s provision that such rooms be adaptable to 0.3 s for students with hearing loss.' : '';
  if (a.verdict === 'Likely over the limit') return head + `${t}, likely above ${lims}. A professional measurement is recommended.` + tail;
  if (a.verdict === 'Too close to call') {
    // Two ways to get here (engine/echo-engine.js decide() and the per-band guard): the average is within ±15 % of the
    // limit, or the average is lower but at least one band is over the limit.
    const overBands = BANDS.filter((fc) => a.bandT20[fc] > lim);
    if (a.avgT20 < lim * 0.85 && overBands.length)
      return head + `${t}, below ${lims}, but the ${overBands.join(' and ')} Hz band${overBands.length > 1 ? 's were' : ' was'} above that limit, so the check cannot say the room is under it. A professional measurement is recommended.` + tail;
    return head + `${t}, within 15 % of ${lims}; the check cannot tell which side of the limit the room is on. A professional measurement is recommended.` + tail;
  }
  return head + `${t}, below ${lims}. This is weak evidence: it must not be used to deny accommodations.${small}` + tail;
}

function renderResult(res, meta) {
  const v = volumeFt3();
  const a = assess(res, { volumeFt3: v ?? undefined, reported: meta.reported, extraAmber: meta.source === 'microphone' ? platformAmber() : [] });
  if (meta.tabHidden) a.amber.push('The tab was hidden during the recording. Some browsers pause the microphone; repeat if possible.');
  if (meta.tabHidden && a.badge === 'green') a.badge = 'amber';
  lastResult.assessment = a;
  $('dl-wav').classList.toggle('hidden', !meta.audio);
  if (window.__autotest && meta.source === 'microphone') {
    console.log('ECHOCHECK_RESULT ' + JSON.stringify({ pass: window.__autotest.pass, verdict: a.verdict, badge: a.badge, avgT20: a.avgT20,
      bandT20: a.bandT20, confidence: a.confidence, red: a.red, amber: a.amber, speechMarginDb: res.speechMarginDb,
      clapTimesS: res.clapTimesS, clean: res.claps.slice(0, 4).map((c) => BANDS.map((fc) => c.bands[fc].cleanDecayDb)),
      resid: res.claps.slice(0, 4).map((c) => BANDS.map((fc) => c.bands[fc].floorResidDb)),
      reported: meta.reported, fs: meta.audio && meta.audio.fs, captureMethod: meta.captureMethod, durationS: meta.audio && meta.audio.x.length / meta.audio.fs }));
  }
  const [cls, line, next] = VERDICT_TEXT[a.verdict];
  const src = meta.source === 'simulated' ? `<p class="small">${esc(meta.label)}. Not a real room.</p>` : meta.source === 'upload' ? `<p class="small">Uploaded file: ${esc(meta.file)}</p>` : '';
  $('verdict').className = `verdict ${cls}`;
  $('verdict').setAttribute('tabindex', '-1');
  $('verdict').innerHTML = `<h2>${esc(a.verdict)}</h2>${src}<p>${esc(line)}</p>`
    + (a.reasons.length ? `<p>${a.reasons.map(esc).join(' ')}</p>` : '')
    + `<p><strong>${esc(next)}</strong></p>`;

  // Sentence for a report
  const sentence = reportSentence(a, meta, v);
  lastResult.reportSentence = sentence;
  $('report-text').textContent = sentence || 'No sentence: this check gave no verdict, so there is nothing to report yet.';
  $('copy-report').classList.toggle('hidden', !sentence);
  $('copy-status').textContent = '';

  // Print-only header: a dated room record when the page is printed or saved as PDF.
  const units = document.querySelector('input[name=units]:checked').value;
  const dims = ['len', 'wid', 'hei'].map((id) => $(id).value).filter(Boolean);
  const hv = $('hvac') ? $('hvac').options[$('hvac').selectedIndex].text : '';
  $('print-head').textContent = `Echo Check+ room echo check · ${new Date(meta.startedAt || Date.now()).toLocaleString('en-US')}`
    + ` · Room: ${dims.length === 3 ? dims.join(' × ') + ' ' + units : 'size not entered'}${v ? ` (about ${Math.round(v).toLocaleString('en-US')} cubic feet${a.limitS ? `; limit ${a.limitS} s` : ''})` : ''}`
    + (hv ? ` · Ventilation during the check: ${hv}` : '')
    + ` · Source: ${meta.source === 'simulated' ? 'simulated sample, not a real room' : meta.source === 'upload' ? 'uploaded file ' + (meta.file || '') : 'microphone' + (meta.microphone ? ' (' + meta.microphone + ')' : '')}`
    + ` · Microphone check: ${a.badge}`;

  // Echo time
  const lim = a.limitS;
  const maxT = Math.max(1.2, (a.avgT20 || 0) * 1.2, lim || 0);
  const frac = DEFAULTS.tooCloseFraction; // the engine's own ±15 % zone
  const zone = lim ? `<div class="zone" style="left:${lim * (1 - frac) / maxT * 100}%;width:${lim * 2 * frac / maxT * 100}%"></div>` : '';
  const caption = lim
    ? `Bar: 3-band average. Black line: the limit (${lim} s). Striped zone: too close to call (${fmt(lim * (1 - frac))}–${fmt(lim * (1 + frac))} s). The check says "Under" only left of the stripes, and only if no single band is over the limit.`
    : 'Bar: 3-band average.';
  const bar = a.avgT20 ? `<div class="bar" aria-hidden="true"><div class="fill" style="width:${Math.min(100, a.avgT20 / maxT * 100)}%"></div>${zone}${lim ? `<div class="limit" style="left:${lim / maxT * 100}%"></div>` : ''}</div><p class="small">${caption}</p>` : '';
  const rows = BANDS.map((fc) => {
    const clean = res.claps.slice(0, 4).map((c) => c.bands[fc].cleanDecayDb).filter((d) => d !== null);
    return `<tr><td>${fc} Hz</td><td class="num">${fmt(a.bandT20[fc])} s</td><td class="num">${a.bandClaps[fc]} of ${Math.min(4, res.claps.length)}</td><td class="num">${clean.length ? Math.round(Math.min(...clean)) + ' dB' : '—'}</td></tr>`;
  }).join('');
  const edtNote = a.basis === 'EDT'
    ? `<p><strong>Early-decay estimate (EDT), 3-band average: ${fmt(a.avgEDT)} s</strong> · ${BANDS.map((fc) => `${fc} Hz ${fmt(a.bandEDT[fc])} s`).join(' · ')} · lower confidence. The claps were too quiet for the full T20 measurement, so this can only say "likely over", never "under".</p>`
    : '';
  $('echo').innerHTML = `${edtNote}<p><strong>3-band average: ${fmt(a.avgT20)} s</strong>${lim ? ` · limit ${lim} s (${v ? Math.round(v).toLocaleString('en-US') : '—'} cubic feet)` : ''}${a.confidence && a.basis !== 'EDT' ? ` · ${a.confidence === 'full' ? 'full confidence' : 'lower confidence (30–37 dB of clean decay)'}` : ''}</p>${bar}
    <table><thead><tr><th>Band</th><th class="num">T20</th><th class="num">Claps used</th><th class="num">Least clean decay</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small">Claps found: ${res.claps.length} (the first 4 are used). "Too close to call" means within ±15 % of the limit, or under it on average with one band over it.${a.spread !== null ? ` Clap-to-clap spread: ${Math.round(a.spread * 100)} %.` : ''}</p>`;

  // Trust
  $('badge').className = `badge b-${a.badge}`;
  $('badge').textContent = { green: 'green', amber: 'amber', red: 'red' }[a.badge];
  const rep = meta.reported;
  const flags = rep ? ['echoCancellation', 'noiseSuppression', 'autoGainControl', 'voiceIsolation'].map((f) => `<tr><td>${f}</td><td>${rep[f] === true ? '<strong>on</strong>' : rep[f] === false ? 'off (reported)' : 'not reported'}</td></tr>`).join('') : '';
  $('trust').innerHTML = (a.red.length ? `<p><strong>Problems:</strong></p><ul class="list">${a.red.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '')
    + (a.amber.length ? `<p><strong>Warnings:</strong></p><ul class="list">${a.amber.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '')
    + (!a.red.length && !a.amber.length ? '<p>Browser processing: off (as reported by the browser). No signs of processing found in the audio.</p>' : '')
    + `<p class="small">${a.notes.map((n) => esc(/[.!?]$/.test(n) ? n : n + '.')).join(' ')}</p>`
    + (flags ? `<details><summary>What the browser reports</summary><table>${flags}</table>${meta.microphone ? `<p class="small">Microphone: ${esc(meta.microphone)}</p>` : ''}</details>` : '');

  // Speech margin
  const sm = res.speechMarginDb;
  const status = a.badge !== 'green' && a.speechMarginStatus === 'shown' ? 'flagged' : a.speechMarginStatus;
  const why = '<p class="small">How much louder the teaching voice was than the room background at this seat. It is a sound measurement, not a statement about anyone\'s hearing. A real lesson adds students, ventilation and corridor noise. <strong>Noise filtering on the device makes this number too high.</strong></p>';
  $('speech').innerHTML = status === 'none'
    ? '<p>Not measured: no counting was found between 30 and 41 s.</p>'
    : status === 'hidden'
      ? '<p><strong>Not shown.</strong> The recording may be processed. Processing makes the background look quieter, so this number would read too high (in our own test: +37 dB without filtering, +66 dB with it).</p>'
      : `<p><strong>${sm >= 0 ? '+' : ''}${Math.round(sm)} dB</strong> (guideline: at least +${a.speechGuidelineDb} dB). Empty room, best case.</p>`
        + (status === 'flagged' ? '<p class="msg"><strong>May read too high:</strong> the trust check has warnings (see above). Treat this number with caution.</p>' : '')
        + why;
  // Autotest: confirm that the whole result page rendered (an error above would stop this line).
  if (window.__autotest && meta.source === 'microphone') console.log('ECHOCHECK_RENDERED ' + JSON.stringify({ verdict: a.verdict, basis: a.basis, avgEDT: a.avgEDT, echoChars: $('echo').textContent.length, report: sentence }));
}

$('copy-report').addEventListener('click', async () => {
  const s = lastResult && lastResult.reportSentence;
  if (!s) return;
  try {
    await navigator.clipboard.writeText(s);
    $('copy-status').textContent = 'Copied.';
  } catch (e) {
    const r = document.createRange();
    r.selectNodeContents($('report-text'));
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    $('copy-status').textContent = 'Selected. Press Ctrl+C (or ⌘+C) to copy.';
  }
});

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement('a');
  aEl.href = url; aEl.download = name; document.body.appendChild(aEl); aEl.click(); aEl.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

$('dl-json').addEventListener('click', () => {
  if (!lastResult) return;
  const { res, ctx, assessment } = lastResult;
  const units = document.querySelector('input[name=units]:checked').value;
  const out = { tool: 'Echo Check+', savedAt: new Date().toISOString(), startedAt: ctx.startedAt || null, source: ctx.source,
    room: { units, length: parseFloat($('len').value) || null, width: parseFloat($('wid').value) || null, height: parseFloat($('hei').value) || null, volumeFt3: volumeFt3() },
    microphone: ctx.microphone || null, captureMethod: ctx.captureMethod || null, sampleRate: ctx.audio ? ctx.audio.fs : null, userAgent: navigator.userAgent,
    ventilation: $('hvac') ? $('hvac').value : null,
    reported: ctx.reported || null, tabHidden: !!ctx.tabHidden, assessment, reportSentence: lastResult.reportSentence || null, clapTimesS: res.clapTimesS, claps: res.claps, speechMarginDb: res.speechMarginDb };
  saveBlob(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), `echo-check_${stamp()}.json`);
});

// 16-bit PCM WAV of the raw take, for the team's accuracy table and home-room recordings.
function encodeWav16(x, fs) {
  const n = x.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, fs, true);
  v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
  return new Blob([buf], { type: 'audio/wav' });
}
$('dl-wav').addEventListener('click', () => {
  if (!lastResult || !lastResult.ctx.audio) return;
  const { x, fs } = lastResult.ctx.audio;
  saveBlob(encodeWav16(x, fs), `echo-check_${stamp()}.wav`);
});

show('start', 'room');

// ---------- automated browser test (headless Chrome with a fake microphone file) ----------
// ?autotest&pass=off|on&L=..&W=..&H=..&units=ft|m starts a recording without a click and logs the
// result as one console line "ECHOCHECK_RESULT {...}". Used by tools/browser_device_test.mjs only.
const QP = new URLSearchParams(location.search);
if (QP.has('autotest')) {
  window.__autotest = { pass: QP.get('pass') === 'on' ? 'on' : 'off' };
  if (QP.get('units') === 'm') document.querySelector('input[name=units][value=m]').checked = true;
  $('len').value = QP.get('L') || 30; $('wid').value = QP.get('W') || 25; $('hei').value = QP.get('H') || 10;
  renderVolume();
  show('room', 'setup');
  setTimeout(startRecording, 300);
}
