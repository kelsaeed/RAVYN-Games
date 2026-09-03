/* ==========================================================================
   Effects 1, 2, 4, 6 + the text marquee.
   Every scrubbed trigger uses invalidateOnRefresh and ease "none".
   ========================================================================== */

const { gsap, ScrollTrigger } = window;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Effect 1 — hero reveal ───────────────────────────────────────────── */
export function initHero() {
  const stage = document.querySelector('.hero');
  if (!stage) return;
  const bits = stage.querySelectorAll('.hero__line, .hero__sub');
  if (still) { gsap.set(bits, { opacity: 1, y: 0 }); return; }

  gsap.set(bits, { y: 26 });
  gsap.to(bits, {
    opacity: 1, y: 0, stagger: 0.15, ease: 'none',
    scrollTrigger: {
      trigger: stage, start: 'top top', end: 'bottom bottom',
      scrub: true, invalidateOnRefresh: true,
    },
  });
}

/* ── Effect 2 — panel slides in from the right ────────────────────────── */

/* Mirrors --hold in the .reveal rule. The stage reserves hold + slide; if this
   number drifts from the CSS the panel gets less scroll than it needs to cross
   the viewport, and a "slide" that outruns the scroll reads as a teleport. */
const holdPx = () => Math.min(window.innerWidth * 0.55, 800);

export function initPanel() {
  const stage = document.querySelector('.reveal');
  const panel = stage?.querySelector('.reveal__panel');
  if (!panel) return;
  if (still) { gsap.set(panel, { xPercent: 0, x: 0 }); return; }

  /* The CSS translate is only the pre-JS pose. Zero the px component GSAP
     parsed out of it, or xPercent stacks on top and the panel starts twice
     as far right as it should. */
  gsap.set(panel, { x: 0 });

  /* fromTo, not to: with a scrubbed tween and invalidateOnRefresh, a plain
     `to` re-records its start value from wherever the panel currently sits.
     Any refresh mid-slide (fonts settling, the SVG landing) then rebases the
     range and the panel jumps. An explicit from is re-read as 100 every time. */
  gsap.fromTo(panel,
    { xPercent: 100 },
    {
      xPercent: 0, ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: () => 'top+=' + holdPx() + ' top',   // hold the opening screen first
        end: 'bottom bottom',
        scrub: true, invalidateOnRefresh: true,
      },
    });
}

/* ── the raven's flower ───────────────────────────────────────────────
   Hover rolls the bloom on the end of the twig; leaving stops it wherever
   it got to, so whichever flower is showing is the one you keep.

   The images are built once and all live in the DOM together. Rolling only
   moves an is-on class between them, so a swap costs no decode and cannot
   flash a gap on a slow connection. Preloading via new Image() and swapping
   src looked identical on a warm cache and dropped frames on a cold one.  */
export function initRaven({ flowers, period = 110 }) {
  const root = document.getElementById('raven');
  const bloom = document.getElementById('ravenBloom');
  if (!root || !bloom || !flowers?.length) return;

  const imgs = flowers.map((src, i) => {
    const img = new Image();
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    if (i === 0) img.className = 'is-on';
    bloom.append(img);
    return img;
  });

  let at = 0;
  let timer = 0;
  const show = (i) => {
    imgs[at].classList.remove('is-on');
    at = (i + imgs.length) % imgs.length;
    imgs[at].classList.add('is-on');
  };

  const start = () => {
    root.classList.add('is-used');            // the nudge has done its job
    /* Reduced motion still gets a new flower, just one per visit instead of
       nine a second - the point of the interaction survives, the strobe does not. */
    if (still) { show(at + 1); return; }
    if (timer) return;
    root.classList.add('is-rolling');
    timer = setInterval(() => show(at + 1), period);
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    root.classList.remove('is-rolling');      // last one landed on stays put
  };

  root.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') start();
  });
  root.addEventListener('pointerleave', stop);

  /* No hover on a touch screen, so a tap spins it and lets it settle. */
  root.addEventListener('click', () => {
    if (timer) { stop(); return; }
    start();
    setTimeout(stop, 1300);
  });

  /* Keyboard: the figure is focusable, so give it the same deal as hover. */
  root.addEventListener('focus', start);
  root.addEventListener('blur', stop);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(at + 1); }
  });

  /* Land on a different flower each visit rather than always the dahlia. */
  show(Math.floor(Math.random() * imgs.length));

  return { start, stop, show };
}

/* ── text marquee ─────────────────────────────────────────────────────── */
export function initMarquee({ text, symbol = '●', copies = 8, speed = 150 }) {
  const root = document.querySelector('.marquee');
  const track = root?.querySelector('.marquee__track');
  if (!track) return;

  track.innerHTML = Array.from({ length: copies }, () =>
    `<span class="marquee__item"><span class="marquee__dot">${symbol}</span>${text}</span>`
  ).join('');

  let tween = null, lastW = 0;
  const build = () => {
    const item = track.querySelector('.marquee__item');
    if (!item) return;
    const w = item.getBoundingClientRect().width;
    if (!w || Math.abs(w - lastW) < 1) return;
    const p = tween ? tween.progress() : 0;
    tween?.kill();
    lastW = w;
    gsap.set(track, { x: 0 });
    tween = gsap.to(track, {
      x: -w, duration: w / (window.innerWidth < 640 ? 80 : speed),
      ease: 'none', repeat: -1,
    });
    if (p) tween.progress(p);
  };
  build();
  new ResizeObserver(build).observe(root);
  document.fonts?.ready.then(build);
}

/* ── Effect 6 — hold-to-skim gallery ──────────────────────────────────── */
export function initSkim({ images, label = 'Hold to skim' }) {
  const root = document.querySelector('.skim');
  const scale = root?.querySelector('.skim__scale');
  const loop = root?.querySelector('.skim__loop');
  if (!loop) return;

  const set = images.concat(images);          // render twice, wrap on one set
  loop.innerHTML = set.map((src) =>
    `<figure class="skim__item"><img src="${src}" alt="" loading="lazy" decoding="async" draggable="false"></figure>`
  ).join('');

  const cursor = document.createElement('div');
  cursor.className = 'skim__cursor mono';
  cursor.innerHTML = `<span>${label}</span>`;
  document.body.appendChild(cursor);

  const BASE = 200, BOOST = 15, SMOOTH = 0.16;
  const isTouch = () => window.innerWidth <= 768;

  let offset = 0, setWidth = 1;
  let boost = 1, gate = 1, scrollKick = 0, dragVel = 0;
  let inView = false, holding = false, dragging = false, captured = false;
  let hovering = false;
  let mx = 0, my = 0, cx = 0, cy = 0;
  let startX = 0, startY = 0, lastX = 0, lastT = 0;

  /* offsetLeft is meaningless until the images have intrinsic dimensions */
  function measure() {
    const items = loop.querySelectorAll('.skim__item');
    const first = items[0], mark = items[images.length];
    if (!first || !mark) return;
    setWidth = Math.max(mark.offsetLeft - first.offsetLeft, 1);
    offset = gsap.utils.wrap(-setWidth, 0, offset);
    gsap.set(loop, { x: offset, force3D: true });
  }
  measure();
  loop.querySelectorAll('img').forEach((img) => {
    if (img.complete) return;
    img.addEventListener('load', measure, { once: true });
    img.addEventListener('error', measure, { once: true });
  });
  new ResizeObserver(measure).observe(loop);

  const press = (down) => gsap.to(scale, {
    scale: down ? 0.96 : 1, duration: down ? 0.35 : 0.45,
    ease: 'power2.out', overwrite: 'auto',
  });

  const showCursor = (on) => gsap.to(cursor, {
    opacity: on ? 1 : 0, duration: on ? 0.35 : 0.2, ease: 'power2.out', overwrite: 'auto',
  });

  /* pointer — desktop holds, touch flicks */
  root.addEventListener('pointerenter', (e) => {
    if (isTouch()) return;
    hovering = true; cx = mx = e.clientX; cy = my = e.clientY;
    gsap.set(cursor, { x: cx, y: cy - 8, xPercent: -50, yPercent: -150 });
    showCursor(true);
  });
  root.addEventListener('pointermove', (e) => {
    if (isTouch()) { onDragMove(e); return; }
    mx = e.clientX; my = e.clientY;
  });
  root.addEventListener('pointerleave', () => {
    hovering = false; holding = false; press(false); showCursor(false);
  });
  root.addEventListener('pointerdown', (e) => {
    if (isTouch()) {
      dragging = true; captured = false;
      startX = lastX = e.clientX; startY = e.clientY; lastT = performance.now();
      return;
    }
    e.preventDefault();
    holding = true; press(true);
  });
  function onDragMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!captured) {
      // 8px and horizontal-dominant, or the page loses its vertical swipe
      if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx)) return;
      captured = true;
      e.currentTarget?.setPointerCapture?.(e.pointerId);
    }
    e.preventDefault();
    const now = performance.now();
    const dt = Math.max((now - lastT) / 1000, 0.016);
    dragVel = gsap.utils.clamp(-3600, 3600, -(e.clientX - lastX) / dt * 2);
    lastX = e.clientX; lastT = now;
  }
  const release = () => {
    holding = false; dragging = false; captured = false; press(false);
  };
  window.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);

  ScrollTrigger.create({
    trigger: root, start: 'top bottom', end: 'bottom top',
    onEnter: () => (inView = true), onLeave: () => (inView = false),
    onEnterBack: () => (inView = true), onLeaveBack: () => (inView = false),
    onRefresh: (self) => (inView = self.isActive),
    onUpdate: (self) => {
      scrollKick = isTouch() ? 0
        : gsap.utils.clamp(-1800, 1500, self.getVelocity() * 0.85);
    },
  });

  /* exposed so the behaviour can be asserted from a driver, not eyeballed */
  const state = {
    speed: 0,
    get boost() { return boost; },
    get offset() { return offset; },
    get setWidth() { return setWidth; },
    get inView() { return inView; },
    get holding() { return holding; },
  };

  gsap.ticker.add(() => {
    if (!inView) return;
    const dr = gsap.ticker.deltaRatio(60);
    const dt = dr / 60;

    const targetBoost = (!isTouch() && holding) ? BOOST : 1;
    const targetGate = (isTouch() && dragging) ? 0 : 1;
    /* every lerp and decay below is raised to dr, so the feel is identical
       on a 144Hz monitor and on a phone dropping to 15fps */
    boost = gsap.utils.interpolate(boost, targetBoost, 1 - Math.pow(1 - 0.04, dr));
    gate = gsap.utils.interpolate(gate, targetGate, 1 - Math.pow(1 - 0.08, dr));

    const speed = (isTouch() ? BASE * gate : BASE + scrollKick) * boost
      + (isTouch() ? dragVel : 0);

    offset -= speed * dt;
    offset = gsap.utils.wrap(-setWidth, 0, offset);             // the infinite loop
    gsap.set(loop, { x: offset, force3D: true });

    scrollKick *= Math.pow(0.9, dr);
    dragVel *= Math.pow(dragging ? 0.96 : 0.94, dr);

    if (hovering || holding) {
      const k = 1 - Math.pow(1 - SMOOTH, dr);                   // frame-rate independent
      cx = gsap.utils.interpolate(cx, mx, k);
      cy = gsap.utils.interpolate(cy, my, k);
      gsap.set(cursor, { x: cx, y: cy - 8, xPercent: -50, yPercent: -150 });
    }
    state.speed = speed;
  });

  return state;
}

/* ── the watch — they look away, then they look at you ────────────────── */
export function initWatch() {
  const stage = document.querySelector('.watch');
  const faces = stage?.querySelectorAll('.watch__face');
  if (!faces?.length) return;
  const eyes = stage.querySelectorAll('.watch__eye');

  const away = [-44, 36, -32, 41];               // each one looks a different way
  const angleOf = (i) => away[i % away.length];

  if (still) { gsap.set(faces, { rotateY: 0 }); gsap.set(eyes, { xPercent: 0 }); return; }

  gsap.set(faces, { transformPerspective: 1400, rotateY: (i) => angleOf(i) });
  // pupils sit off to the same side as the turn, then centre on you
  gsap.set(eyes, { xPercent: (i) => (angleOf(Math.floor(i / 2)) > 0 ? 62 : -62) });

  gsap.timeline({
    scrollTrigger: {
      trigger: stage, start: 'top top', end: 'bottom bottom',
      scrub: true, invalidateOnRefresh: true,
    },
  })
    .to(faces, { rotateY: 0, ease: 'none', stagger: 0.07 }, 0)
    .to(eyes, { xPercent: 0, ease: 'none', stagger: 0.03 }, 0.12);
}

/* ── Effect 4 — layered wordmark ──────────────────────────────────────
   The footer is a sticky stage, so the wordmark stays centred on screen
   for the whole fan instead of sliding past and snapping at the end.   */
export function initWordmark() {
  const stack = document.getElementById('stack');
  const footer = document.querySelector('.footer');
  if (!stack || !footer) return;
  if (still) { stack.style.setProperty('--p', '1'); return; }

  ScrollTrigger.create({
    trigger: footer,
    /* Head start: begin while the footer is still rising into view, so by the
       time it pins and the word is fully on screen the trail has already
       broken cover. Starting at 'top top' left the word sitting over an empty
       reserved block for the first stretch of the stage. */
    /* Phones get their own range. There the footer is a flow block exactly one
       screen tall sitting at the very end of the document, so 'bottom bottom'
       resolves to the last scrollable pixel — the trail would only finish at
       the instant you hit the floor, and any drift in the measurement leaves
       it stuck at 0. Ending at 'top center' completes the fan while the
       wordmark is still mid-screen, and it stays finished after that.
       Function-based so invalidateOnRefresh re-reads them on rotate. */
    start: () => (matchMedia('(max-width: 640px)').matches ? 'top bottom' : 'top bottom-=25%'),
    end: () => (matchMedia('(max-width: 640px)').matches ? 'top center' : 'bottom bottom'),
    /* A number, not true. `scrub: true` pins the value to the scroll position
       exactly, so every wheel notch lands as a discrete jump in --p and the
       trail steps rather than glides. 0.6 lets it catch up over 0.6s, which is
       what actually reads as smooth once Lenis is already easing the scroll. */
    scrub: 0.6,
    invalidateOnRefresh: true,
    onUpdate: (self) => stack.style.setProperty('--p', self.progress),
  });
}
