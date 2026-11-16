// Echo Check+ page enhancements. Optional by design: every part is wrapped so that a
// failure here changes nothing about the page or the measuring tool.
//   1. rise-in on scroll for [data-reveal]
//   2. the room-size drawing in #roombox (follows #len, #wid, #hei)
//   3. smooth wheel scrolling (the native scroll position stays the source of truth)

const reduceQuery = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { return null; }
})();
const reduced = () => !!(reduceQuery && reduceQuery.matches);

/* ---------- 1. rise in when scrolled to ---------- */
function setupReveal() {
  const root = document.documentElement;
  const items = Array.from(document.querySelectorAll('[data-reveal]'));
  const showAll = () => { for (const el of items) el.classList.add('is-in'); };

  if (reduced() || !('IntersectionObserver' in window)) {
    root.classList.add('js-reveal');
    showAll();
    return;
  }

  // Measure first, then add both classes in the same turn, so that what is already on
  // screen never passes through the hidden state.
  const vh = window.innerHeight || root.clientHeight || 0;
  const inView = items.filter((el) => {
    const r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0) && r.top < vh && r.bottom > 0;
  });
  root.classList.add('js-reveal');
  for (const el of inView) el.classList.add('is-in');

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const rootH = (e.rootBounds && e.rootBounds.height) || window.innerHeight || 1;
      // 12 % visible, or (for a block much taller than the screen) a good part of the screen covered.
      if (e.intersectionRatio >= 0.12 || e.intersectionRect.height >= rootH * 0.3 || e.boundingClientRect.height * 0.12 > rootH * 0.5) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: [0, 0.04, 0.12] });
  for (const el of items) if (!el.classList.contains('is-in')) io.observe(el);

  // If the reader turns reduced motion on later, nothing may stay hidden.
  if (reduceQuery && reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', () => { if (reduced()) showAll(); });
  }
}

/* ---------- 2. room-size drawing ---------- */
function setupRoomBox() {
  const fig = document.getElementById('roombox');
  if (!fig) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const make = (name, cls) => {
    const n = document.createElementNS(NS, name);
    if (cls) n.setAttribute('class', cls);
    return n;
  };

  const svg = make('svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const floor = make('polygon', 'rb-floor');
  const back = make('path', 'rb-back');
  const edge = make('path', 'rb-edge');
  const tLen = make('text'); tLen.setAttribute('text-anchor', 'middle');
  const tHei = make('text'); tHei.setAttribute('text-anchor', 'end'); tHei.setAttribute('dominant-baseline', 'middle');
  const tWid = make('text'); tWid.setAttribute('text-anchor', 'start');
  svg.append(floor, back, edge, tLen, tHei, tWid);
  fig.replaceChildren(svg);

  const inputs = { l: document.getElementById('len'), w: document.getElementById('wid'), h: document.getElementById('hei') };
  const fallback = { l: 30, w: 25, h: 10 };
  const read = () => {
    const out = {};
    for (const k of ['l', 'w', 'h']) {
      const inp = inputs[k];
      let v = parseFloat(inp ? inp.value : '');
      if (!(isFinite(v) && v > 0)) v = parseFloat(inp ? inp.placeholder : '');
      if (!(isFinite(v) && v > 0)) v = fallback[k];
      out[k] = v;
    }
    return out;
  };
  const unit = () => {
    const c = document.querySelector('input[name=units]:checked');
    return c && c.value === 'm' ? 'm' : 'ft';
  };
  const fmt = (v) => String(Math.round(v * 10) / 10);

  const COS = Math.cos(Math.PI / 6) * 0.5; // cabinet projection: depth at 30 degrees, half length
  const SIN = Math.sin(Math.PI / 6) * 0.5;
  let size = { w: 400, h: 300 };
  let cur = read();
  let from = cur, target = cur, t0 = 0, raf = 0;

  const draw = () => {
    const W = size.w, H = size.h;
    // Clamp extreme ratios so a corridor or a tower still reads as a box.
    const m = Math.max(cur.l, cur.w, cur.h);
    const l = Math.max(cur.l, m / 6), w = Math.max(cur.w, m / 6), h = Math.max(cur.h, m / 6);
    const padL = Math.min(64, W * 0.18), padR = Math.min(60, W * 0.17), padT = 10, padB = 30;
    const spanX = l + w * COS, spanY = h + w * SIN;
    const availX = Math.max(40, W - padL - padR), availY = Math.max(40, H - padT - padB);
    const s = Math.min(availX / spanX, availY / spanY);
    const ox = padL + (availX - spanX * s) / 2;
    const oy = H - padB - (availY - spanY * s) / 2;
    const P = (x, y, z) => [ox + (x + z * COS) * s, oy - (y + z * SIN) * s];
    const f = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    const A = P(0, 0, 0), B = P(l, 0, 0), C = P(l, h, 0), D = P(0, h, 0);
    const A2 = P(0, 0, w), B2 = P(l, 0, w), C2 = P(l, h, w), D2 = P(0, h, w);

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    floor.setAttribute('points', [A, B, B2, A2].map(f).join(' '));
    // Hidden: the three edges that meet at the far bottom-left corner.
    back.setAttribute('d', 'M' + f(A) + 'L' + f(A2) + 'L' + f(B2) + 'M' + f(A2) + 'L' + f(D2));
    edge.setAttribute('d',
      'M' + f(A) + 'L' + f(B) + 'L' + f(C) + 'L' + f(D) + 'Z' +
      'M' + f(B) + 'L' + f(B2) + 'L' + f(C2) + 'L' + f(C) +
      'M' + f(D) + 'L' + f(D2) + 'L' + f(C2));

    tLen.setAttribute('x', ((A[0] + B[0]) / 2).toFixed(1));
    tLen.setAttribute('y', (A[1] + 21).toFixed(1));
    tHei.setAttribute('x', (A[0] - 10).toFixed(1));
    tHei.setAttribute('y', ((A[1] + D[1]) / 2).toFixed(1));
    tWid.setAttribute('x', ((B[0] + B2[0]) / 2 + 10).toFixed(1));
    tWid.setAttribute('y', ((B[1] + B2[1]) / 2 + 13).toFixed(1));
  };

  const label = () => {
    const u = unit();
    tLen.textContent = fmt(target.l) + ' ' + u;
    tWid.textContent = fmt(target.w) + ' ' + u;
    tHei.textContent = fmt(target.h) + ' ' + u;
  };

  const step = (now) => {
    const t = Math.min(1, (now - t0) / 300);
    const e = 1 - Math.pow(1 - t, 3); // ease-out
    cur = {
      l: from.l + (target.l - from.l) * e,
      w: from.w + (target.w - from.w) * e,
      h: from.h + (target.h - from.h) * e,
    };
    draw();
    raf = t < 1 ? requestAnimationFrame(step) : 0;
  };

  const update = () => {
    try {
      const next = read();
      const same = next.l === target.l && next.w === target.w && next.h === target.h;
      target = next;
      label(); // the words change at once; only the shape eases
      if (same) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (reduced()) { cur = target; draw(); return; }
      from = cur;
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    } catch (e) { /* the drawing is optional */ }
  };
  const later = () => setTimeout(update, 0); // after the page's own handlers have run

  for (const k of ['l', 'w', 'h']) {
    if (!inputs[k]) continue;
    inputs[k].addEventListener('input', update);
    inputs[k].addEventListener('change', update);
  }
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t && t.name === 'units') later();
  });
  // The page can also fill the fields itself (a sample room); its volume line then changes. Read only.
  const vol = document.getElementById('vol-out');
  if (vol && 'MutationObserver' in window) {
    new MutationObserver(later).observe(vol, { childList: true, characterData: true, subtree: true });
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      const w = fig.clientWidth;
      if (!w) return; // hidden: keep the last size
      const h = fig.clientHeight || w * 0.75;
      if (Math.abs(w - size.w) < 0.5 && Math.abs(h - size.h) < 0.5) return;
      size = { w, h };
      draw();
    }).observe(fig);
  }

  if (fig.clientWidth) size = { w: fig.clientWidth, h: fig.clientHeight || fig.clientWidth * 0.75 };
  label();
  draw();
  return update;
}

/* ---------- 3. smooth wheel scrolling ---------- */
async function setupSmoothScroll() {
  if (reduced()) return;
  const mod = await import('./vendor/lenis/lenis.mjs');
  const Lenis = mod.default;
  if (reduced()) return;

  let lenis = new Lenis({
    lerp: 0.11,
    smoothWheel: true,
    syncTouch: false,       // touch keeps the browser's own scrolling
    allowNestedScroll: true, // a scrollable box inside the page scrolls by itself
    autoRaf: true,
  });

  // The page scrolls by itself too (focus(), sections shown or hidden). When it does, drop any
  // glide in progress and take the browser's position as the truth.
  const adopt = () => {
    if (!lenis) return;
    try {
      lenis.resize();
      lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    } catch (e) { /* optional */ }
  };

  let mo = null;
  if ('MutationObserver' in window) {
    mo = new MutationObserver(adopt);
    const main = document.querySelector('main');
    const watched = new Set(main ? Array.from(main.children) : []);
    const stage = document.getElementById('stage');
    if (stage) watched.add(stage);
    for (const el of watched) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
  }
  const onFocus = () => { if (lenis && lenis.isScrolling === 'smooth') adopt(); };
  document.addEventListener('focusin', onFocus);

  if (reduceQuery && reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', () => {
      if (!reduced() || !lenis) return;
      try { lenis.destroy(); } catch (e) { /* optional */ }
      lenis = null;
      if (mo) mo.disconnect();
      document.removeEventListener('focusin', onFocus);
    });
  }
}

try { setupReveal(); } catch (e) {
  // Never leave anything hidden because of a fault here.
  try { document.documentElement.classList.remove('js-reveal'); } catch (e2) { /* nothing */ }
}
try { setupRoomBox(); } catch (e) { /* the drawing is optional */ }
setupSmoothScroll().catch(() => { /* native scrolling stays */ });
