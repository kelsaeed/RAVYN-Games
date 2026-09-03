/* ==========================================================================
   Bootstrap. Lenis and GSAP share one RAF loop — never a second one.
   ========================================================================== */

import { createLogo3D } from './logo3d.js';
import { initHero, initPanel, initMarquee, initSkim, initWatch, initWordmark } from './effects.js';

const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

/* On a phone the URL bar collapses as you scroll, which fires a resize and
   makes ScrollTrigger recompute every start/end mid-gesture. Positions jump
   and scrubbed values stall. This tells it to ignore that one resize. */
ScrollTrigger.config({ ignoreMobileResize: true });

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!still) {
  const lenis = new Lenis({ lerp: 0.1 });
  window.__lenis = lenis;            // handy when driving the page from devtools
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);   // without this the scrub desyncs after a stall
}

const WORKS = Array.from({ length: 14 }, (_, i) =>
  `./assets/works/work${String(i + 1).padStart(2, '0')}.png`);

initHero();
initPanel();
initMarquee({ text: 'RAVYN Games', symbol: '●', copies: 8, speed: 150 });
window.__skim = initSkim({ images: WORKS });
initWatch();
initWordmark();

const logoRoot = document.getElementById('logo3d');
if (logoRoot) {
  createLogo3D({
    root: logoRoot,
    src: './assets/ravyn-bird.svg',
    // park it on the nav line
    dockOffset: window.innerWidth <= 640 ? window.innerHeight * 0.012 : 4,
  });
}

/* sticky offsets land wrong if fonts or images settle after the first pass */
window.addEventListener('load', () => ScrollTrigger.refresh());
document.fonts?.ready.then(() => ScrollTrigger.refresh());
