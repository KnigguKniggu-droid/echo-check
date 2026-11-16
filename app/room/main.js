// Echo Check+ stage: entry. Finds #stage by itself, needs no arguments, and exposes window.echoStage for tests.
// The poster and every word are already in the HTML. This file draws the chart and the clock, runs the switch
// and the two buttons, and, when WebGL 2 is there and motion is allowed, fades the live room in over the poster.
// Any error leaves the poster and a static chart. It plays no sound and asks for no microphone.
import { SRC, MIC, ROOMS, SLOW as SLOW_DEFAULT, HOLD, CAMS, L, H, W, levelDb, forward, coverTan, project, lerp3, smooth } from './model.js';

const stage = document.getElementById('stage');
if (stage && !window.echoStage) { try { boot(); } catch (e) { /* the poster stays */ } }

function boot() {
  const q = new URLSearchParams(location.search);
  const debug = q.has('debug');
  const SLOW = debug && +q.get('slow') > 0 ? Math.min(400, Math.max(5, +q.get('slow'))) : SLOW_DEFAULT;
  const $ = (s) => stage.querySelector(s);
  const media = $('.stage-media'), canvas = $('.stage-canvas'), posterImg = $('.stage-poster img');
  const stills = [...stage.querySelectorAll('.stage-still')];
  const labels = [...stage.querySelectorAll('.stage-label')];
  const radios = [...stage.querySelectorAll('.stage-switch input')];
  const controls = $('.stage-controls'), btnClap = $('[data-stage="clap"]'), btnPause = $('[data-stage="pause"]');
  const elT = $('[data-stage="t"]'), elSlow = $('[data-stage="slow"]');
  const chLine = $('[data-chart="line"]'), chGhost = $('[data-chart="ghost"]'), chEnd = $('[data-chart="end"]'), chHead = $('[data-chart="head"]');
  const stations = [...stage.querySelectorAll('.stage-stations li')];
  const startCard = document.getElementById('start');
  const avoid = ['.stage-display', '.lede', '.stage-hud', '.stage-stations li:nth-child(1) p', '.stage-stations li:nth-child(2) p', '.stage-stations li:nth-child(3) p'].map((x) => $(x)).filter(Boolean);
  const mqPhone = matchMedia('(max-width: 700px)'), mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const cams = JSON.parse(JSON.stringify(CAMS));
  const POINTS = { clap: SRC, mic: [MIC[0], MIC[1] + 0.12, MIC[2]], reflections: [2.6, H - 0.02, 3.2] };

  const S = {
    mode: 'static', reason: 'starting', room: 'treated', T: ROOMS.treated.T, t: ROOMS.treated.T, hold: 0,
    paused: false, running: false, frames: 0, station: 0, rail: 0, view: 'poster', model: false, quality: 1,
  };
  if (elSlow) elSlow.textContent = String(SLOW);
  try { S.paused = sessionStorage.getItem('echo-stage-paused') === '1'; } catch (e) { /* private mode */ }

  // ---------- chart and clock ----------
  const X0 = 8, X1 = 160, Y0 = 16, Y1 = 70, TMAX = 1.2;
  const cx = (t) => X0 + ((X1 - X0) * t) / TMAX, cy = (db) => Y0 + ((Y1 - Y0) * -db) / 60;
  let shownT = '';
  function drawChart() {
    const x = cx(S.t), y = cy(levelDb(S.t, S.T));
    if (chLine) { chLine.setAttribute('x2', x.toFixed(2)); chLine.setAttribute('y2', y.toFixed(2)); }
    if (chHead) { chHead.setAttribute('cx', x.toFixed(2)); chHead.setAttribute('cy', y.toFixed(2)); }
    const txt = Math.min(S.t, S.T).toFixed(2);
    if (elT && txt !== shownT) { elT.textContent = txt; shownT = txt; }
  }
  function drawRoom() {
    const xe = cx(S.T);
    if (chGhost) { chGhost.setAttribute('x2', xe.toFixed(2)); chGhost.setAttribute('y2', String(Y1)); }
    if (chEnd) chEnd.setAttribute('transform', `translate(${xe.toFixed(2)} ${Y1})`);
    for (const r of radios) r.checked = r.value === S.room;
    stage.dataset.room = S.room;
  }

  // ---------- camera: station rail, a small turn while dragged, and the fit to the poster's crop ----------
  const orbit = { yaw: 0, pitch: 0, held: false, id: -1, x: 0, y: 0 };
  let railTarget = 0, box = { w: 1, h: 1 }, settled = false;
  const pictureAspect = () => (posterImg && posterImg.naturalWidth > 0 ? posterImg.naturalWidth / posterImg.naturalHeight : 1.6);
  function camAt(u, yaw = 0, pitch = 0) {
    const a = smooth(Math.min(1, u)), b = smooth(Math.max(0, u - 1));
    let pos = lerp3(cams.hero.pos, cams.s2.pos, a), look = lerp3(cams.hero.look, cams.s2.look, a);
    if (b > 0) { pos = lerp3(pos, cams.s3.pos, b); look = lerp3(look, cams.s3.look, b); }
    const fov = cams.hero.fov || 50;
    return { pos, fwd: forward(pos, look, yaw, pitch), tanHalf: coverTan(fov, box.w / box.h, pictureAspect()) };
  }
  let cam = camAt(0);
  function measure() { const r = media.getBoundingClientRect(); box = { w: Math.max(1, r.width), h: Math.max(1, r.height) }; }
  function readRail() {
    if (mqPhone.matches || stations.length < 3 || stage.hidden) { railTarget = 0; return; }
    const vh = window.innerHeight || 1;
    // the camera arrives as a station's sentence reaches the middle of the screen
    const u = (el) => Math.min(1, Math.max(0, (vh * 1.15 - (el.firstElementChild || el).getBoundingClientRect().top) / (vh * 0.6)));
    railTarget = u(stations[1]) + u(stations[2]);
  }
  function setStation(n) {
    if (n === S.station) return; S.station = n;
    stage.dataset.station = String(n + 1);
    if (S.view !== 'room') for (const im of stills) im.classList.toggle('is-on', +im.dataset.station === n + 1 && im.naturalWidth > 0);
    if (S.view === 'overlay') canvas.style.visibility = n === 0 ? 'visible' : 'hidden';
  }
  function placeLabels() {
    const stillShown = S.view !== 'room' && S.station > 0 && stills.some((im) => im.classList.contains('is-on'));
    const c = S.view === 'room' ? cam : camAt(stillShown ? S.station : 0);
    const posterUp = !!(posterImg && posterImg.naturalWidth > 0);
    const hideAll = S.view !== 'room' && ((S.station > 0 && !stillShown) || (!stillShown && !posterUp));   // no picture, no pins
    // a label never sits under the words or the HUD: it steps aside instead
    const m = media.getBoundingClientRect();
    const keepOut = mqPhone.matches ? [] : avoid.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
    for (const el of labels) {
      const p = hideAll ? null : project(POINTS[el.dataset.at] || SRC, c.pos, c.fwd, c.tanHalf, box.w, box.h);
      const on = !!p && p.x > 14 && p.x < box.w - 14 && p.y > (mqPhone.matches ? 118 : 60) && p.y < box.h - 24;
      if (!on) { el.classList.remove('is-on'); continue; }
      const left = p.x > box.w * 0.62;
      if (left !== (el.dataset.side === 'left')) { if (left) el.dataset.side = 'left'; else delete el.dataset.side; }
      const lw = el.offsetWidth, lh = el.offsetHeight, x0 = left ? p.x - lw : p.x, y0 = p.y - lh / 2;
      const hit = keepOut.some((r) => x0 + m.left < r.right + 6 && x0 + lw + m.left > r.left - 6 && y0 + m.top < r.bottom + 2 && y0 + lh + m.top > r.top - 2);
      el.classList.toggle('is-on', !hit);
      el.style.transform = `translate3d(${x0.toFixed(1)}px,${y0.toFixed(1)}px,0)`;
    }
  }

  // ---------- the loop: one requestAnimationFrame, stopped whenever nobody can see it ----------
  let scene = null, raf = 0, last = 0, inView = true, dpr = 1;
  // ft holds frame times in 60 Hz terms. A steady 30 Hz pace (iOS Low Power Mode, a browser energy saver) is the
  // display's pace, not a slow GPU, so those frame times count half. The first 30 frames set the scale. A GPU that
  // holds a steady 30 fps on a 60 Hz display looks the same and keeps its quality.
  const ft = [], firstFt = [];
  let frameScale = 0;
  const startHidden = () => !!(startCard && startCard.classList.contains('hidden'));
  const canRun = () => S.mode === 'live' && scene && inView && !document.hidden && !stage.hidden;
  function kick() { settled = false; if (!raf && canRun()) { last = 0; raf = requestAnimationFrame(frame); S.running = true; } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; S.running = false; }
  function frame(now) {
    raf = 0;
    if (!canRun()) { S.running = false; return; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    if (last) {
      const d = now - last;
      if (!frameScale) { firstFt.push(d); if (firstFt.length >= 30) { const p25 = [...firstFt].sort((a, b) => a - b)[7]; frameScale = p25 > 30 && p25 < 36.5 ? 0.5 : 1; } }
      else { ft.push(d * frameScale); if (ft.length > 240) ft.shift(); }
    }
    last = now;
    try {
      if (!S.paused) {
        if (S.t >= S.T) { S.hold += dt; if (S.hold >= HOLD) { S.t = 0; S.hold = 0; } }
        else S.t = Math.min(S.T, S.t + dt / SLOW);
      }
      // what is held moves with the hand; what nobody holds eases
      const k = 1 - Math.exp(-dt * 4.5);
      const before = S.rail + orbit.yaw + orbit.pitch;
      S.rail += (railTarget - S.rail) * k;
      if (Math.abs(railTarget - S.rail) < 0.0005) S.rail = railTarget;
      if (!orbit.held) { orbit.yaw *= 1 - k; orbit.pitch *= 1 - k; if (Math.abs(orbit.yaw) < 1e-4) orbit.yaw = 0; if (Math.abs(orbit.pitch) < 1e-4) orbit.pitch = 0; }
      settled = !orbit.held && Math.abs(S.rail + orbit.yaw + orbit.pitch - before) < 1e-6;
      setStation(Math.round(S.view === 'room' ? S.rail : railTarget));
      cam = S.view === 'room' ? camAt(S.rail, orbit.yaw, orbit.pitch) : camAt(0);
      scene.render(cam, S.t, S.T);
      S.frames++;
      drawChart(); placeLabels();
      if (S.frames % 30 === 0) adapt();
    } catch (e) { fallback('render error'); return; }
    if (S.paused && settled) { S.running = false; return; }   // a paused, resting picture needs no more frames
    raf = requestAnimationFrame(frame);
  }
  function adapt() {                                           // fewer grains, then fewer pixels, if frames run long
    if (ft.length < 30) return;
    const sorted = [...ft].sort((a, b) => a - b), p75 = sorted[Math.floor(sorted.length * 0.75)];
    if (p75 > 24 && S.quality > 0.3) { S.quality = Math.max(0.3, S.quality * 0.7); scene.setQuality(S.quality); if (S.quality < 0.6 && dpr > 1) { dpr = 1; resize(); } ft.length = 0; }
  }
  function resize() {
    measure();
    if (scene) { try { scene.setSize(box.w, box.h, dpr); if (!S.running && S.mode === 'live') { cam = S.view === 'room' ? camAt(S.rail, orbit.yaw, orbit.pitch) : camAt(0); scene.render(cam, S.t, S.T); } } catch (e) { fallback('resize error'); } }
    placeLabels();
  }

  // ---------- public controls ----------
  function setPauseLabel() { if (btnPause) btnPause.textContent = S.paused ? 'Play' : 'Pause'; }
  const api = {
    setRoom(name) {
      if (!ROOMS[name]) return;
      S.room = name; S.T = ROOMS[name].T; S.hold = 0;
      S.t = S.mode === 'live' ? (S.paused ? Math.min(0.02, S.T) : 0) : S.T;
      drawRoom(); drawChart(); kick();
    },
    clap() { if (S.mode !== 'live') return; S.t = 0; S.hold = 0; if (S.paused) api.play(); else kick(); drawChart(); },
    pause() { S.paused = true; setPauseLabel(); try { sessionStorage.setItem('echo-stage-paused', '1'); } catch (e) { /* private mode */ } },
    play() { S.paused = false; setPauseLabel(); try { sessionStorage.removeItem('echo-stage-paused'); } catch (e) { /* private mode */ } kick(); },
    state() {
      const s = [...ft].sort((a, b) => a - b);
      return {
        mode: S.mode, reason: S.reason, view: S.view, room: S.room, T: S.T, t: +S.t.toFixed(4), levelDb: +levelDb(S.t, S.T).toFixed(2),
        paused: S.paused, running: S.running, frames: S.frames, station: S.station + 1, rail: +S.rail.toFixed(3), model: S.model, slow: SLOW,
        quality: +S.quality.toFixed(2), dpr, frameScale, frameMs: s.length ? { p50: +s[Math.floor(s.length * 0.5)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), n: s.length } : null,
        scene: scene ? scene.info : null, yaw: +orbit.yaw.toFixed(3), pitch: +orbit.pitch.toFixed(3),
      };
    },
  };
  window.echoStage = api;

  for (const r of radios) r.addEventListener('change', () => { if (r.checked) api.setRoom(r.value); });
  if (btnClap) btnClap.addEventListener('click', () => api.clap());
  if (btnPause) btnPause.addEventListener('click', () => (S.paused ? api.play() : api.pause()));
  // the two hero buttons stand in for the Start card's own buttons
  // (the tool's page wires them itself, in a few inline lines, so they work even if this file never arrives)
  if (stage.dataset.proxies !== 'page') for (const b of stage.querySelectorAll('[data-proxy]')) {
    b.addEventListener('click', () => {
      const target = document.getElementById(b.dataset.proxy);
      if (target) target.click();
      const main = document.querySelector('main'), a = document.activeElement;   // keep the focus the tool itself chose
      if (main) {
        main.scrollIntoView({ block: 'start' });
        if (!a || a === document.body || stage.contains(a)) { if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1'); try { main.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
      }
    });
  }

  // ---------- static state: the poster, the full chart, the stills ----------
  function fallback(reason) {
    stop();
    S.mode = 'static'; S.reason = reason; S.view = 'poster'; S.t = S.T; S.hold = 0;
    stage.dataset.stage = 'static';
    canvas.style.opacity = '0'; canvas.style.visibility = 'hidden';
    if (controls) controls.hidden = true;
    delete media.dataset.drag;
    if (scene) { try { scene.dispose(); } catch (e) { /* gone already */ } scene = null; }
    S.station = -1; setStation(Math.round(railTarget));
    drawRoom(); drawChart(); placeLabels();
  }

  // pictures that are missing never show as broken: the slate ground stays
  if (posterImg) {
    const posterFailed = () => {
      const sources = posterImg.parentNode.querySelectorAll('source');
      if (sources.length) { sources.forEach((el) => el.remove()); posterImg.src = posterImg.getAttribute('src'); } else posterImg.style.visibility = 'hidden';
    };
    posterImg.addEventListener('error', posterFailed);
    if (posterImg.complete && posterImg.naturalWidth === 0) posterFailed();   // it failed before this script arrived
    posterImg.addEventListener('load', () => { posterImg.style.visibility = ''; resize(); });
  }
  for (const im of stills) im.addEventListener('error', () => { im.remove(); });

  // ---------- who can see it ----------
  let wasHidden = null;                                         // our own record: the page may set stage.hidden before we look
  const syncStart = () => {
    const hide = startHidden();
    if (hide === wasHidden) return;
    wasHidden = hide; stage.hidden = hide;
    if (hide) stop(); else { resize(); readRail(); kick(); }
  };
  if (startCard) { new MutationObserver(syncStart).observe(startCard, { attributes: true, attributeFilter: ['class'] }); syncStart(); }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; if (inView) kick(); else stop(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else kick(); });
  addEventListener('scroll', () => { readRail(); if (S.mode === 'live') kick(); else { setStation(Math.round(railTarget)); placeLabels(); } }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); readRail(); kick(); }).observe(media); else addEventListener('resize', resize);
  mqReduce.addEventListener?.('change', () => { if (mqReduce.matches && S.mode === 'live') fallback('reduced motion'); });

  // ---------- drag turns the view a little: 1:1 while held, eases back on release ----------
  const YAW = (25 * Math.PI) / 180, PITCH = (10 * Math.PI) / 180;
  media.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'live' || S.view !== 'room' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    orbit.held = true; orbit.id = e.pointerId; orbit.x = e.clientX; orbit.y = e.clientY; media.dataset.drag = 'held';
    try { media.setPointerCapture(e.pointerId); } catch (err) { /* fine without it */ }
    kick();
  });
  media.addEventListener('pointermove', (e) => {
    if (!orbit.held || e.pointerId !== orbit.id) return;
    const perPx = (2 * cam.tanHalf) / box.h;                  // radians per pixel at the centre of the view
    orbit.yaw = Math.max(-YAW, Math.min(YAW, orbit.yaw + (e.clientX - orbit.x) * perPx));
    if (e.pointerType !== 'touch') orbit.pitch = Math.max(-PITCH, Math.min(PITCH, orbit.pitch + (e.clientY - orbit.y) * perPx));
    orbit.x = e.clientX; orbit.y = e.clientY; kick();
  });
  const release = (e) => { if (e.pointerId !== orbit.id) return; orbit.held = false; orbit.id = -1; if (media.dataset.drag) media.dataset.drag = 'ready'; kick(); };
  media.addEventListener('pointerup', release); media.addEventListener('pointercancel', release); media.addEventListener('lostpointercapture', release);

  // ---------- first state, then the live scene if it can run ----------
  measure(); readRail(); drawRoom(); drawChart(); setPauseLabel();
  stage.dataset.stage = 'static';
  S.station = -1; setStation(0); placeLabels();

  // ask for a context on a throwaway canvas first, so a machine without WebGL 2 never downloads the 3D code
  // (a software or blocklisted GPU counts as none; ?debug&softgl lets a test machine through)
  let noGL = q.has('nogl') || !window.WebGL2RenderingContext;
  if (!noGL) {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) noGL = true; else { const lose = probe.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    } catch (e) { noGL = true; }
  }
  // three r185 uses class static blocks (Safari 16.4 and later). An older engine keeps the poster and skips the download.
  if (!noGL) { try { new Function('class A{static{}}'); } catch (e) { noGL = true; } }
  if (mqReduce.matches) { S.reason = 'reduced motion'; return; }
  if (noGL) { S.reason = 'no WebGL'; return; }
  // the 3D is about 900 KB of decoration: a metered or slow link, or a low-memory device, keeps the poster
  try {
    const c = navigator.connection;
    if (c && c.saveData) { S.reason = 'save data'; return; }
    if (c && /2g|3g/.test(c.effectiveType || '')) { S.reason = 'slow network'; return; }
    if ((navigator.deviceMemory || 8) <= 2) { S.reason = 'low memory'; return; }
  } catch (e) { S.reason = 'device check error'; return; }
  S.reason = 'loading';
  goLive().catch((e) => fallback('load error: ' + (e && e.message ? e.message : e)));

  async function goLive() {
    const asset = (p) => new URL('./assets/' + p, import.meta.url).href;
    const phone = mqPhone.matches || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
    dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
    const order = debug && +q.get('order') >= 0 && q.has('order') ? Math.min(5, +q.get('order')) : phone ? 2 : 4;
    const camsReady = fetch(asset('cameras.json')).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j) return;
      for (const k of ['hero', 's2', 's3']) if (j[k] && Array.isArray(j[k].pos) && Array.isArray(j[k].look)) cams[k] = { pos: j[k].pos.map(Number), look: j[k].look.map(Number), fov: +j[k].fov || 50 };
    }).catch(() => { /* the numbers from the design stand */ });
    // the heavy steps wait while the Start screen is hidden, so they never land on the setup screen or a recording
    // (an error here rejects goLive, and the poster stays)
    const shown = () => (stage.hidden ? new Promise((r) => {
      const mo = new MutationObserver(() => { if (!stage.hidden) { mo.disconnect(); r(); } });
      mo.observe(stage, { attributes: true, attributeFilter: ['hidden'] });
    }) : Promise.resolve());
    await shown();
    const { createScene } = await import('./scene.js');
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fallback('context lost'); });
    scene = await createScene({ canvas, phone, order });
    await shown();
    const [, gotModel] = await Promise.all([camsReady, q.has('box') ? false : scene.loadRoom(asset('classroom.glb'))]);
    S.model = !!gotModel;
    if (posterImg && !posterImg.complete) await Promise.race([new Promise((r) => { posterImg.addEventListener('load', r, { once: true }); posterImg.addEventListener('error', r, { once: true }); }), new Promise((r) => setTimeout(r, 1500))]);
    const posterOk = !!(posterImg && posterImg.naturalWidth > 0);
    // with the modelled room: a full live picture. Without it: the poster stays the picture and only the sound is drawn on top.
    // data-view="overlay" on #stage (or ?overlay) keeps the poster as the picture even when the model loads.
    const wantOverlay = q.has('overlay') || stage.dataset.view === 'overlay';
    S.view = wantOverlay && posterOk ? 'overlay' : gotModel || !posterOk || q.has('box') ? 'room' : 'overlay';
    scene.setMode(S.view);
    await shown();
    measure(); scene.setSize(box.w, box.h, dpr);
    S.t = S.paused ? 0.02 : 0; S.hold = 0;
    cam = camAt(0);
    await scene.compile();
    await shown();
    for (let i = 0; i < 2; i++) { await new Promise((r) => requestAnimationFrame(r)); scene.render(cam, S.t, S.T); }
    if (scene.renderer.getContext().isContextLost()) throw new Error('context lost');
    // hand-off: the canvas fades in over the poster at the same framing, only now that a frame exists
    canvas.style.visibility = 'visible';
    canvas.style.transition = 'opacity 450ms cubic-bezier(.33,0,.2,1)';
    await new Promise((r) => requestAnimationFrame(r));
    canvas.style.opacity = '1';
    S.mode = 'live'; S.reason = gotModel ? 'model' : 'stand-in: ' + (scene.info.modelError || 'no model'); stage.dataset.stage = 'live';
    if (controls) controls.hidden = false;
    if (S.view === 'room') { media.dataset.drag = 'ready'; for (const im of stills) im.classList.remove('is-on'); }
    S.station = -1; setStation(Math.round(railTarget));
    drawChart(); kick();
    if (debug) { api.scene = scene; api.seek = (t) => { S.t = Math.max(0, Math.min(S.T, +t || 0)); S.hold = 0; kick(); drawChart(); }; }
  }
}
