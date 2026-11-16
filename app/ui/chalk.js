// Chalk progress line. Fails silently.
try {
  const bar = document.createElement('div');
  bar.className = 'chalk-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    bar.style.transform = 'scaleX(' + p + ')';
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
  const stage = document.getElementById('stage');
  if (stage && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      for (const e of es) bar.classList.toggle('is-hidden', e.isIntersecting);
    }).observe(stage);
  }
} catch (e) { /* page stays finished without it */ }
