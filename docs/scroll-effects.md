# Scroll Effects — Technique Reference

Research notes from 2026-09-02. Two reference sites were inspected to work out how their
scroll choreography is built. Everything below is a **technique write-up with original
implementations** — none of it is the reference sites' source. Their themes are their own
proprietary work; we rebuild the mechanics, not their code.

---

## The core principle: the scroll never actually stops

The effect reads as "the scroll froze and the content animated." It didn't. Nothing is
scroll-jacked.

The pattern is a **tall container with a sticky child**:

```css
.stage        { height: 250vh; position: relative; }   /* the scroll budget */
.stage__inner { position: sticky; top: 0; height: 100vh; overflow: hidden; }
```

You scroll normally through 250vh. The inner panel sticks to the viewport for 150vh of that,
and its animation is scrubbed to your progress. Feels like a pause, behaves like a scroll.

**Why this beats GSAP's `pin: true`:** no cloned DOM, no pin-spacer injection, no layout jump
on refresh, scrollbar length stays honest, and it degrades to a plain static section if JS
fails. The reference site uses the sticky pattern throughout, not `pin`.

The ScrollTrigger signature that gives it away:

```js
scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: true }
```

`start: "top top"` → `end: "bottom bottom"` on a tall element = progress 0→1 spans exactly the
sticky travel. Always pair with `invalidateOnRefresh: true` so measurements recompute on resize.

---

## Libraries

```
gsap                    core tweening
gsap/ScrollTrigger      scroll → progress mapping
lenis                   smooth-scroll inertia
```

**Lenis is not optional.** Native scroll is steppy — wheel events arrive in discrete jumps, so
scrubbed animations stutter. Lenis interpolates toward the target each frame. Reference config
is `lerp: 0.1` (10% of the remaining distance per frame). Lower = heavier/slower glide.

Wiring Lenis into GSAP so both share one RAF loop:

```js
import Lenis from "lenis";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({ lerp: 0.1 });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
```

Skipping `lagSmoothing(0)` makes GSAP swallow frames after a stall and the scrub desyncs.

Respect motion preferences on every effect below:

```js
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
```

---

## Effect 1 — Hero reveal

Text starts invisible and scrubs to fully visible as you scroll through the sticky stage.

```html
<section class="hero">
  <div class="hero__screen">
    <p class="hero__line">Hello, we are</p>
    <p class="hero__line">RAVYN Games.</p>
  </div>
</section>
```

```css
.hero          { height: 250vh; position: relative; }
.hero__screen  { position: sticky; top: 0; height: 100vh;
                 display: grid; place-content: center; }
.hero__line    { opacity: 0; will-change: opacity, transform; }
```

```js
gsap.to(".hero__line", {
  opacity: 1,
  y: 0,
  stagger: 0.15,
  ease: "none",
  scrollTrigger: {
    trigger: ".hero",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    invalidateOnRefresh: true,
  },
});
```

`ease: "none"` matters on scrubbed tweens — any other ease makes the motion lag your finger.

The reference computes its end distance rather than hardcoding it, so the reveal finishes at a
known element rather than at an arbitrary scroll depth:

```js
end: () => {
  const target = stage.querySelector(".hero__line:last-child");
  const travel = stage.offsetHeight - window.innerHeight;
  return "+=" + Math.max(travel, target ? target.offsetTop : window.innerHeight * 0.4);
}
```

Worth doing once content length varies between breakpoints.

---

## Effect 2 — Panel slides in from the right

One sticky stage, two phases: hold the first screen, then a panel scrubs across to fill it.

```css
.reveal         { height: 300vh; position: relative; }
.reveal__screen { position: sticky; top: 0; height: 100vh; overflow: hidden; }
.reveal__panel  { position: absolute; inset: 0; transform: translate3d(100%, 0, 0);
                  will-change: transform; }
```

```js
gsap.to(".reveal__panel", {
  xPercent: -100,
  ease: "none",
  scrollTrigger: {
    trigger: ".reveal",
    start: () => "top+=" + window.innerWidth + " top",   // hold phase first
    end: "bottom bottom",
    scrub: true,
    invalidateOnRefresh: true,
  },
});
```

The `start` offset is the trick: the first `window.innerWidth` pixels of scroll do nothing but
hold the opening screen, then the panel takes the rest. Using viewport **width** as a vertical
scroll distance is deliberate — it ties the reveal's pace to how far the panel has to travel,
so it feels consistent from mobile to ultrawide.

---

## Effect 3 — Scroll-scrubbed video

Scroll position drives `video.currentTime`. Scrolling up plays it backwards — that's free, it's
the same code, not a second effect.

```html
<section class="scrub">
  <div class="scrub__screen">
    <video class="scrub__video" src="/media/loop.mp4" muted playsinline preload="auto"></video>
  </div>
</section>
```

No `autoplay`, no `loop`, no `controls`.

```js
const video = document.querySelector(".scrub__video");
const proxy = { p: 0 };

const tl = gsap.to(proxy, {
  p: 1,
  ease: "none",
  paused: true,
  onUpdate() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = proxy.p * Math.max(0, video.duration - 0.05);
  },
  scrollTrigger: {
    trigger: ".scrub",
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    invalidateOnRefresh: true,
  },
});

// duration is NaN until metadata lands — remeasure once it does
video.addEventListener("loadedmetadata", () => ScrollTrigger.refresh(), { once: true });
```

### The three details that make or break it

**1. The Safari/iOS unlock.** Safari refuses to *seek* a video that has never played. Play it
once muted, then immediately pause and rewind. Without this the scrub silently does nothing on
iPhone — no error, just a frozen first frame.

```js
video.muted = true;
const attempt = video.play();
if (attempt?.then) {
  attempt.then(() => {
    video.addEventListener("timeupdate", () => {
      video.pause();
      video.currentTime = 0;
    }, { once: true });
  }).catch(() => { /* autoplay blocked — scrub still works on desktop */ });
}
```

**2. `duration - 0.05`.** Seeking to exactly `duration` stalls the decoder or flickers the last
frame. Stop just short of the end.

**3. Gate it with IntersectionObserver.** Only drive `currentTime` while the section is on
screen; seeking an offscreen video burns decode budget for nothing.

### Encoding the video

This matters more than the JS. Seeking is only smooth if keyframes are dense — a normal web
export has a keyframe every ~2s and will visibly snap while scrubbing.

```
ffmpeg -i source.mp4 -an -vf scale=1280:-2 -c:v libx264 -crf 24 -g 1 -keyint_min 1 \
       -movflags +faststart out.mp4
```

`-g 1` = every frame is a keyframe. File gets bigger; scrubbing gets buttery. `-an` strips
audio (it's muted anyway). Keep it short — 3–5 seconds is plenty.

---

## Effect 4 — Layered wordmark (footer)

The logo appears to unfold into stacked layers on scroll. This is the most elegant of the four
and it's **almost entirely CSS** — JS writes exactly one number.

Stack N opaque copies of the wordmark directly behind the real one. Each copy is cropped from
the bottom and travels up a distance proportional to its index. Because every copy paints an
opaque background in the page color, it hides the ones behind it — so you never see whole
duplicate logos, only the sliver of each one peeking above the copy in front.

```html
<div class="stack" style="--p: 0">
  <span class="stack__layer" style="--i: 4"></span>
  <span class="stack__layer" style="--i: 3"></span>
  <span class="stack__layer" style="--i: 2"></span>
  <span class="stack__layer" style="--i: 1"></span>
  <svg class="stack__front"><!-- the real wordmark --></svg>
</div>
```

```css
.stack {
  --p: 0;              /* scroll progress, 0 → 1 — the only thing JS touches */
  --crop: 8%;          /* how much of each copy is cut from the bottom */
  --step: -22%;        /* travel per index step */
  position: relative;
  isolation: isolate;  /* keep z-index local to this component */
}

.stack__front { position: relative; z-index: 5; display: block; width: 100%; }

.stack__layer {
  position: absolute;
  inset: 0;
  background: var(--bg);                        /* the occlusion — the whole trick */
  clip-path: inset(0 0 var(--crop) 0);
  transform: translateY(calc(var(--p) * var(--i) * var(--step)));
  will-change: transform;
}
```

```js
ScrollTrigger.create({
  trigger: ".footer",
  start: "top bottom",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => {
    stack.style.setProperty("--p", self.progress);
  },
});
```

That's the entire JavaScript. No per-layer loop, no N tweens — one custom property cascades to
every layer and the compositor does the rest. It cannot lag.

**Notes**
- The layer copies can be empty boxes (as above, just occluders) or duplicate SVGs, depending
  on whether you want the slivers to show letterform edges or flat bands. Try both.
- `--i` ordering: highest index furthest back in the DOM so it travels most and sits deepest.
- The liquid/wavy look on the reference site is **its typeface**, not an effect. If we want
  something similar for RAVYN Games it's a type choice, not a filter. Don't chase it with SVG
  goo filters — that route is expensive and looks worse.

---

## Effect 5 — 3D chrome logo that docks into the header

Added 2026-09-02 after a second pass on `pxpush.com`. This is the spinning metal mark that sits
mid-screen and flies up into the nav as you scroll.

### It is not a 3D model

There is no `.glb`, no Blender export, no Spline embed. It is **a flat SVG extruded at runtime**
by three.js. One `logo.svg` — the same file you'd use for a normal `<img>` — becomes a beveled
metal solid in about fifteen lines. That's the whole reason it looks expensive and still costs
~4KB of art.

```js
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";

new SVGLoader().load("/img/ravyn.svg", (data) => {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe7edf6,          // pale blue-white, not pure white — pure white kills the specular
    metalness: 0.92,
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.7,
    side: THREE.DoubleSide,
  });

  data.paths.forEach((path) => {
    SVGLoader.createShapes(path).forEach((shape) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 30,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 10,
        bevelSize: 0.5,
        bevelThickness: 1,
        curveSegments: 50,
      });
      root.add(new THREE.Mesh(geo, material));
    });
  });

  // SVG's Y axis points down; three.js points up. Flip, then re-center on the bounding box.
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.children.forEach((m) => {
    m.geometry.translate(-c.x, -c.y, -c.z);
    m.geometry.scale(1, -1, 1);
    m.geometry.computeVertexNormals();   // mandatory after the flip or lighting inverts
  });
  modelSize = box.getSize(new THREE.Vector3());
});
```

`bevelSize: 0.5` / `bevelThickness: 1` against `depth: 30` is the ratio that reads as "machined
metal." Drop the bevel entirely and it looks like a cheap CSS 3D transform. `curveSegments: 50`
is high, but the mark is the hero — pay for it here, nowhere else.

### The chrome comes from the environment, not the lights

```js
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
```

`RoomEnvironment` ships **inside three.js** — no `.hdr` to download, no CDN, no CORS. That one
line is what makes a metal surface have something to reflect. Without it a `metalness: 0.92`
material renders as a flat black silhouette, which is the usual reason people give up on this.

Lights are then only for shaping:

```js
key  = DirectionalLight(0xffffff, 2.6)  at ( 3,  4,  8)
fill = DirectionalLight(0xa8d7ff, 1.2)  at (-4, -1,  6)   // cool blue fill — the "cold" read
rim  = DirectionalLight(0xffffff, 1.0)  at ( 0,  2, -8)   // behind, edge separation
amb  = AmbientLight(0xffffff, 0.8)
```

```js
renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });  // alpha — page shows through
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));            // cap at 2, never more
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
```

### Camera: fov 10

```js
camera = new THREE.PerspectiveCamera(10, w / h, 0.1, 100);
camera.position.set(0, 0, 13);
```

**A 10° field of view is the single most copyable decision here.** It's near-orthographic, so
the mark reads as a graphic object rather than a photographed one — no keystoning, no vanishing
point, letterforms stay true while it turns. A default 50° fov makes the same geometry look
like a video-game asset.

The narrow fov means you must fit the model to the frustum manually:

```js
function fit() {
  const { width, height } = containerSize();
  const fh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fw = fh * (width / height);
  root.scale.setScalar(Math.min((fw * 0.8) / modelSize.x, (fh * 0.8) / modelSize.y));
}
```

Call it on init and on every resize. The `0.8` is padding. Because the fit is relative to the
*container*, the identical scene fills a 70vw hero box and a 60px header slot with no separate
configuration — which is exactly what makes the next part possible.

### The spin: idle drift + scroll-velocity kick

```js
const IDLE  = -0.01;    // rad per frame, constant
const KICK  = 2e-5;     // scroll velocity → spin
const CLAMP = 0.08;     // ceiling on the kick

let impulse = 0, smoothed = 0;

function frame() {
  const dr = gsap.ticker.deltaRatio(60);
  impulse *= Math.pow(0.9, dr);                          // decay the kick
  smoothed += (impulse - smoothed) * (1 - Math.pow(1 - 0.16, dr));
  root.rotation.y += (IDLE + smoothed) * dr;
  renderer.render(scene, camera);
}
gsap.ticker.add(frame);                        // GSAP's ticker, not your own rAF

ScrollTrigger.create({
  trigger: document.body, start: "top top", end: "bottom bottom",
  onUpdate: (self) => {
    impulse = gsap.utils.clamp(-CLAMP, CLAMP, -self.getVelocity() * KICK);
  },
});
```

Two rules that matter:

1. **Use `gsap.ticker.add`, never your own `requestAnimationFrame`.** Two rAF loops means the
   render can land before the scroll math and the logo judders by one frame. One loop, one
   order of operations. (Same reason Lenis is wired into the ticker in the Libraries section.)
2. **The decay chain is `impulse *= 0.9` then `smoothed += (impulse - smoothed) * 0.16`.** One
   lerp is not enough — it snaps. Two stages give the flywheel feel: it spools up over ~4
   frames and coasts down over ~20.

Gate it off where the spin is a distraction — the reference kills the kick while the pricing
section is on screen, via an IntersectionObserver setting `impulse = 0`.

### The docking — and why it is *not* `position: sticky`

The user-visible behaviour: hero-size in the middle of the screen, then it shrinks and rises
until it parks in the nav bar, where it becomes the home button.

`position: sticky` cannot do this, because the element must **scale while it travels**. So the
element is `position: fixed` from frame one and JS writes `top` every frame:

```html
<div class="logo3d logo3d--hero"><div class="logo3d__canvas"></div></div>
```

```css
.logo3d              { position: absolute; z-index: 3; pointer-events: none; }
.logo3d--hero        { top: 55vh; left: 50vw; width: 70vw; height: 32vh;
                       transform: translate(-50%, -50%); }
```

The CSS above is only the **measurement pose** — where the logo would sit with JS off. On mount,
JS reads it once, stores the original inline `style` string so it can restore and re-measure,
then takes over:

```js
const DOCK_SCALE = 1 / 4;

let dockTop, startTop, w, h, travel;

function measure() {
  el.setAttribute("style", originalStyle);        // restore the CSS pose
  const r = el.getBoundingClientRect();
  dockTop  = isMobile() ? innerHeight * 0.025 : 0;
  startTop = r.top + window.scrollY;              // document-space top
  w = r.width;
  h = r.height;
  travel = Math.max(1, startTop - dockTop);       // scroll distance of the whole flight
}

function apply() {
  const p = gsap.utils.clamp(0, 1, window.scrollY / travel);
  docked  = p >= 0.98;

  gsap.set(el, {
    position: "fixed",
    top: Math.max(dockTop, startTop - window.scrollY),
    left: (window.innerWidth - w) / 2,
    width: w, height: h,
    x: 0, y: 0, xPercent: 0, yPercent: 0,          // clear the CSS centering transform
    scale: gsap.utils.interpolate(1, DOCK_SCALE, p),
    transformOrigin: "50% 0%",
    zIndex: docked ? 21 : 12,
    pointerEvents: docked ? "auto" : "none",
    cursor: docked ? "pointer" : "default",
  });
}

measure();
ScrollTrigger.create({
  trigger: document.body,
  start: "top top",
  end: () => `${Math.max(travel, 1)}px top`,
  scrub: true,
  onUpdate: apply,
  onRefresh: () => { measure(); apply(); },
});
addEventListener("resize", () => { measure(); apply(); });
```

The four details:

- **`top: Math.max(dockTop, startTop - scrollY)`** is sticky, hand-rolled. The element tracks
  the page exactly until it reaches the header line, then parks. Because we own the number, we
  can scale on the same frame.
- **`transformOrigin: "50% 0%"`** — it shrinks toward its own top-centre, so the docked mark's
  top edge lands precisely on `top: dockTop` regardless of scale. With the default `50% 50%`
  origin it drifts upward as it shrinks and you end up hand-tuning offsets forever.
- **`left: (innerWidth - w) / 2`** recentres every frame instead of relying on
  `translateX(-50%)`, because the `scale` already owns the transform. Hence the `xPercent: 0`
  reset — a leftover `-50%` from the CSS pose will fight you.
- **`pointerEvents` flips `none` → `auto` only when docked.** In flight the logo overlaps hero
  copy; click-through keeps that text selectable. Parked, it becomes the home button.

Inner pages skip the flight entirely: a `logo-small-header` class on `<body>` (or a route
allowlist) forces `p = 1`, so those pages render with the mark already in the nav. On SPA route
change: tear down, re-measure after ~80ms of layout settle, `ScrollTrigger.refresh()`.

### The nav bar with no nav bar

Khaled's observation was right and it's deliberate: **there is no header background.** The
"nav" is a transparent strip of text links — wordmark left, menu right — with the 3D mark
flying into the gap between them as a *separate fixed element*, not a child of the header. That's
why nothing occludes the hero. `z-index: 21` when docked puts it above the links; `12` in flight
puts it under them.

If we want legibility over busy imagery, use a text shadow or a short gradient scrim behind the
links only — never a filled bar.

### Cost control

- One `WebGLRenderer` per logo instance, `alpha: true`, sized to its container div.
- Cap `setPixelRatio` at 2. Retina phones report 3 and will cook the GPU for no visible gain.
- Dispose properly on unmount: traverse and dispose every `geometry` and `material`, then
  `scene.environment.dispose()`, `pmrem.dispose()`, `renderer.dispose()`. WebGL contexts are a
  hard browser limit (~16); leak them across route changes and the canvas goes blank.
- Honour `prefers-reduced-motion`: keep the mark, set `IDLE = 0` and never apply the kick.

---

## Effect 5b — RAVYN variant: the bird flaps as it flies to the nav

**This is what we're actually building.** Same rig as Effect 5 — extruded SVG, chrome material,
fov 10, the fixed-position docking flight — but the mark is a bird, and it beats its wings on
the way up. Two things change: the SVG must be authored in parts, and the continuous Y-spin has
to go.

### Asset status — 2026-09-02

`assets/ravyn-bird.svg` exists and is production-ready: traced from the supplied artwork,
`viewBox="0 0 120 106.52"`, paths only, no strokes/transforms/raster, 99.21% accurate to the
source silhouette. It carries three groups — `#body` (full silhouette, 70 verts), `#wing`
(26 verts, root buried 14px into the body), `#facets` (36 rings, the low-poly line art) — plus
`#pivot-wing` at `66.35,56.11`.

**But the pose is a perched raven in side profile with a folded wing.** The rig below assumes a
front-facing bird with two spread wings, and that mark cannot do it: a folded wing rotated at
the shoulder reads as a shrug, not a flap.

**Decided 2026-09-02 — build the *Perched variant* below.** No flap; the wing lifts ~13° during
the flight to the nav and settles once docked. No new artwork needed. The `#facets` layer ships
too, extruded shallow over the body as raised panel lines. The generic two-wing spec that
follows is kept only for whenever a spread-wing pose exists — it is not what we are building.

### The SVG is no longer one shape

The extrusion technique still holds; the file just has to arrive pre-separated:

```xml
<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
  <g id="body">   <path d="…"/> </g>   <!-- head, torso, tail, legs — everything static -->
  <g id="wing-l"> <path d="…"/> </g>
  <g id="wing-r"> <path d="…"/> </g>
  <circle id="pivot-l" cx="52" cy="38" r="1" fill="none"/>
  <circle id="pivot-r" cx="68" cy="38" r="1" fill="none"/>
</svg>
```

Three authoring rules, all load-bearing:

1. **Wings must overlap the body at the shoulder** by a few user units. A butt-joint opens a
   visible wedge the moment the wing rotates, and on a chrome material that gap catches light
   and reads as a crack. Tuck the wing root *under* the body silhouette.
2. **Draw the wings level** — the neutral mid-stroke pose, not up and not down. The flap swings
   symmetrically around whatever pose you author, so a resting pose that's already raised gives
   you an unbalanced beat.
3. **The two `<circle>` elements are coordinate carriers, not art.** `fill="none"`, and we skip
   them when building geometry — we only read `cx`/`cy` to find the shoulder joints. Putting
   them in the file is far more reliable than guessing pivots from bounding boxes.

Everything from the Effect 5 spec still applies: paths only, no strokes, no `<use>`/masks/
gradients, closed subpaths with correct fill-rule, and a viewBox around **100–150 units wide**
so `depth: 30` stays proportionally right.

### Building it: three meshes, one material, two pivots

```js
const PIVOT_IDS = new Set(["pivot-l", "pivot-r"]);
const groupOf = (p) => p.userData?.node?.closest?.("g[id]")?.id ?? "body";

new SVGLoader().load("/img/ravyn-bird.svg", (data) => {
  // 1. read the shoulder joints straight off the DOM nodes, before anything moves
  const joints = {};
  data.paths.forEach((p) => {
    const node = p.userData?.node;
    const id = node?.getAttribute?.("id");
    if (PIVOT_IDS.has(id)) {
      joints[id] = { x: +node.getAttribute("cx"), y: +node.getAttribute("cy") };
    }
  });

  // 2. extrude each group into its own mesh, sharing ONE material instance
  const parts = { body: [], "wing-l": [], "wing-r": [] };
  data.paths.forEach((p) => {
    const id = p.userData?.node?.getAttribute?.("id");
    if (PIVOT_IDS.has(id)) return;                 // markers are not geometry
    const bucket = parts[groupOf(p)] ?? parts.body;
    SVGLoader.createShapes(p).forEach((shape) => {
      bucket.push(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, EXTRUDE), material));
    });
  });

  // 3. the Effect 5 normalisation, computed once over everything
  const all = new THREE.Group();
  Object.values(parts).flat().forEach((m) => all.add(m));
  const box = new THREE.Box3().setFromObject(all);
  const c = box.getCenter(new THREE.Vector3());

  const toModelSpace = (g) => {
    g.translate(-c.x, -c.y, -c.z);
    g.scale(1, -1, 1);                             // SVG Y-down → three Y-up
    g.computeVertexNormals();
  };

  // the pivots go through the SAME transform, or the hinges land in the wrong place
  const joint = (id) => new THREE.Vector3(joints[id].x - c.x, -(joints[id].y - c.y), 0);

  parts.body.forEach((m) => { toModelSpace(m.geometry); root.add(m); });

  wingL = hinge(parts["wing-l"], joint("pivot-l"));
  wingR = hinge(parts["wing-r"], joint("pivot-r"));

  function hinge(meshes, at) {
    const pivot = new THREE.Group();
    pivot.position.copy(at);
    meshes.forEach((m) => {
      toModelSpace(m.geometry);
      m.geometry.translate(-at.x, -at.y, 0);       // shoulder to the mesh's own origin
      pivot.add(m);
    });
    root.add(pivot);
    return pivot;
  }

  restSize = box.getSize(new THREE.Vector3());     // measure at REST, never per-frame
  fit();
});
```

**`geometry.translate(-at.x, -at.y, 0)` then `pivot.position = at` is the whole hinge trick.**
The wing's shoulder sits at its mesh origin, and the pivot puts it back where it belongs — so
`pivot.rotation` turns the wing about the joint instead of about the bird's centre.

Leaving pivot `z` at `0` puts the hinge axis through the **middle of the extrusion depth**,
which is what you want — hinge at the front face and the wing swings out of the body.

`side: THREE.DoubleSide` matters more here than in Effect 5: a raised wing shows its back faces.

### The flap

```js
const IDLE_HZ = 0.45, MAX_HZ = 3.2;      // beats per second
const IDLE_AMP = 0.06, MAX_AMP = 0.55;   // radians (~3° resting breathe → ~31° full beat)

let phase = 0, energy = 0, target = 0;

function frame() {
  const dt = gsap.ticker.deltaRatio(60) / 60;

  energy += (target - energy) * 0.06;
  target *= 0.92;                              // decays back toward the idle breathe

  const hz  = gsap.utils.interpolate(IDLE_HZ,  MAX_HZ,  energy);
  const amp = gsap.utils.interpolate(IDLE_AMP, MAX_AMP, energy);

  phase += hz * Math.PI * 2 * dt;              // ← accumulate, never sin(hz * t)
  const flap = Math.sin(phase) * amp;

  wingR.rotation.z =  flap;                    // +X wing: +Z rotation lifts it
  wingL.rotation.z = -flap;                    // mirrored
  wingL.rotation.x = wingR.rotation.x = flap * 0.35;   // feathering twist about the span

  root.rotation.y = REST_YAW + Math.sin(phase * 0.5) * 0.08 + yawKick;
  renderer.render(scene, camera);
}
```

**Accumulate the phase.** `Math.sin(hz * elapsed)` looks equivalent and is not: the instant `hz`
changes, the sine's argument jumps and the wings teleport mid-beat. `phase += hz * 2π * dt`
keeps the wave continuous through any frequency change. This is the bug to expect if the flap
ever snaps.

A real bird's downstroke is faster than its upstroke. If the pure sine reads too mechanical,
warp the phase rather than the amplitude — but try it plain first; on a chrome logo the
symmetric beat often looks more deliberate.

### Driving it from the flight

The bird should beat hardest **mid-flight** — calm hovering in the hero, calm parked in the nav:

```js
// p is the docking progress from Effect 5's apply()
const flight   = Math.sin(Math.PI * p);                                    // 0 → 1 → 0
const velocity = gsap.utils.clamp(0, 1, Math.abs(self.getVelocity()) / 1800);
target = Math.max(flight, velocity);
```

`Math.sin(Math.PI * p)` is the whole takeoff curve: zero at rest, peak halfway up, zero once
docked. Layering the scroll-velocity term on top means a hard flick also startles it, which
matches the velocity-kick language used in Effects 5 and 6.

### Kill the continuous spin

Effect 5's `root.rotation.y += -0.01` **must not carry over.** A bird that keeps rotating hits
edge-on every few seconds and vanishes into a sliver — and a flap only reads from the front.

Replace it with a resting three-quarter yaw plus a small drift, as in the `frame()` above:
`REST_YAW ≈ -0.35`, drift `±0.08 rad`, and let scroll velocity add a bounded `yawKick` using
the same `clamp(±0.08, -velocity * 2e-5)` from Effect 5. Motion stays alive, silhouette stays
readable.

### Perched variant — the motion that fits the mark we actually have

With `assets/ravyn-bird.svg` there is one hinge, not two, and it opens rather than beats. The
flight to the nav becomes *stir and settle* instead of *flap*:

```js
const LIFT = 0.22;                       // rad, ~13° — past this the joint reads as broken

// same flight curve as above: 0 at rest, peak mid-flight, 0 once docked
const flight = Math.sin(Math.PI * p);
energy += (Math.max(flight, velocity) - energy) * (1 - Math.pow(1 - 0.06, dr));

wing.rotation.z = -LIFT * energy;        // -Z opens the folded wing upward and back
wing.rotation.x =  LIFT * energy * 0.4;  // and lets the tip swing toward the camera
root.rotation.y = REST_YAW + energy * 0.12;
```

Keep `LIFT` small. The whole point of a folded wing is that it reads as *contained*; a big
rotation just exposes that the geometry underneath was never drawn.

Because `#body` is the **complete** silhouette and `#wing` overlaps it, the wing is placed
slightly forward in Z and no gap can open at the root no matter what the rotation does. This is
the one structural advantage of the perched pose — it is strictly more forgiving than a
butt-jointed spread wing.

**The `#facets` layer.** Extrude it shallow (`depth ≈ 6` against the body's `30`) with no bevel
and lay it on the front face. On a `metalness: 0.92` surface those ridges catch the environment
map and the low-poly faceting reads as machined panel lines rather than as a flat drawing. It is
the single highest-value detail available from this artwork — do not drop it to save triangles.
If it proves too busy at nav size, fade it out with `p` rather than deleting it.

### Consequences elsewhere

- **`fit()` must use the rest-pose bounding box.** Measuring per-frame while the wings move makes
  the bird pulse in size as it flaps. Measure once, on load.
- **Effect 4 still needs a wordmark.** The layered-footer fan works on horizontal lettering, not
  a bird. That's a second, separate flat SVG.
- Reduced motion: keep the bird, set `energy = 0` permanently and freeze `phase` — it holds the
  neutral pose and still docks.

---

## Effect 6 — Hold-to-skim infinite gallery

The image strip that auto-scrolls, speeds up ~15× while you hold the mouse down, and can be
flicked with a finger on touch. One `gsap.ticker` callback drives all three behaviours.

```html
<div class="skim">
  <div class="skim__loop"><!-- items, then the same items again --></div>
</div>
<div class="skim__cursor"><span>Hold to skim</span></div>
```

```css
.skim        { position: relative; width: 100vw; overflow: hidden;
               cursor: pointer; user-select: none;
               touch-action: pan-y; }          /* JS owns X, browser keeps Y */
.skim__loop  { display: flex; gap: 2.5vw; width: max-content; height: 100%;
               will-change: transform; }
.skim__item  { flex: 0 0 auto; height: 100%; overflow: hidden;
               pointer-events: none; }         /* handlers stay on the container */
.skim__item img { height: 100%; width: auto; max-width: none;
                  object-fit: contain; user-select: none; -webkit-user-drag: none; }

/* edges fade so items don't pop in */
.skim::before, .skim::after {
  content: ""; position: absolute; top: 0; height: 100%; width: 6vw;
  opacity: .3; pointer-events: none; z-index: 2;
}
.skim::before { left: 0;  background: linear-gradient(90deg,  var(--bg), transparent); }
.skim::after  { right: 0; background: linear-gradient(270deg, var(--bg), transparent); }

.skim__cursor { position: fixed; top: 0; left: 0; z-index: 21;
                opacity: 0; pointer-events: none; border-radius: 999px;
                white-space: nowrap; will-change: transform, opacity; }
```

`touch-action: pan-y` is the line that makes mobile work. It tells the browser "I handle
horizontal, you handle vertical" — without it you either block page scroll or lose the swipe.

### Measuring the loop

Render the array **twice**, then measure the distance between item 0 and item N (the first of
the duplicate set). That's one set's width including gaps, with no arithmetic you can get wrong:

```js
const items = loop.querySelectorAll(".skim__item");
setWidth = Math.max(items[N].offsetLeft - items[0].offsetLeft, 1);
```

Re-measure on **every image `load` and `error`**, and from a `ResizeObserver`. `offsetLeft` is
meaningless until images have intrinsic dimensions — this is the bug that makes the loop jump
once on first paint if you skip it.

### The one ticker

```js
const BASE = 200;        // px/s idle drift
const BOOST = 15;        // hold multiplier — this is the whole feel
const SMOOTH = 0.16;     // cursor follow

let offset = 0, boost = 1, gate = 1, scrollKick = 0, dragVel = 0;

gsap.ticker.add(() => {
  if (!inView) return;

  const dr = gsap.ticker.deltaRatio(60);     // 1.0 at 60fps, 2.0 at 30fps
  const dt = dr / 60;

  const targetBoost = (!isTouch() && holding) ? BOOST : 1;
  const targetGate  = (isTouch() && dragging) ? 0 : 1;   // finger owns it while dragging

  // every lerp and decay is raised to dr — see "Decay is not frame-rate free" below
  boost = gsap.utils.interpolate(boost, targetBoost, 1 - Math.pow(1 - 0.04, dr));
  gate  = gsap.utils.interpolate(gate,  targetGate,  1 - Math.pow(1 - 0.08, dr));

  const speed = (isTouch() ? BASE * gate : BASE + scrollKick) * boost
              + (isTouch() ? dragVel : 0);

  offset -= speed * dt;
  offset = gsap.utils.wrap(-setWidth, 0, offset);            // ← the infinite loop
  gsap.set(loop, { x: offset, force3D: true });

  scrollKick *= Math.pow(0.9, dr);
  dragVel *= Math.pow(dragging ? 0.96 : 0.94, dr);

  if (cursorVisible) {                                       // frame-rate-independent lerp
    const k = 1 - Math.pow(1 - SMOOTH, dr);
    cx = gsap.utils.interpolate(cx, mouseX, k);
    cy = gsap.utils.interpolate(cy, mouseY, k);
    gsap.set(cursorEl, { x: cx, y: cy - 8, xPercent: -50, yPercent: -150 });
  }
});
```

`gsap.utils.wrap(-setWidth, 0, offset)` is the entire infinite-marquee mechanism. No cloning at
runtime, no index bookkeeping, no `if (offset < -w) offset += w`.

### Decay is not frame-rate free — measured 2026-09-03

The obvious form of every line above is `x *= 0.9` and `lerp(a, b, 0.04)`. Both are **per frame**,
so on a machine rendering at 15fps they decay four times slower in wall-clock terms than at 60fps.
Multiplying position by `dt` is not enough; the coefficients need it too.

Measured on the real page, before and after raising each coefficient to `dr`:

| | idle | held | after release | boost reached |
|---|---|---|---|---|
| per-frame coefficients | 575 px/s | 1893 px/s | 825 px/s | 8.6 of 15 |
| raised to `dr` | **200 px/s** | **2983 px/s** | **202 px/s** | **15.0 of 15** |

The first row is not a rounding error — it is a different feel. The strip never idles at its design
speed, the hold never reaches full boost, and letting go leaves it drifting at four times base.
Rule: `x *= k` becomes `x *= Math.pow(k, dr)`, and `lerp(a, b, k)` becomes
`lerp(a, b, 1 - Math.pow(1 - k, dr))`. Apply it to every decay in Effects 5, 5b and 6.

**Why `BOOST` eases at `0.04` rather than snapping.** At 0.04 it takes roughly half a second to
reach full speed and about as long to coast down. That spool-up *is* the thing Khaled liked —
a hard 15× cut on mousedown feels broken, not fast.

`deltaRatio(60)` everywhere, and `1 - (1 - k)^dr` for the cursor, means the motion is identical
on a 60Hz laptop and a 144Hz monitor. Plain `x += k * (target - x)` is not.

### Pointer handling

Desktop and touch are branched on `innerWidth <= 768`:

```js
// desktop: hold anywhere on the strip
onpointerdown → e.preventDefault(); holding = true;  pressFeedback(true);
onpointerup   → holding = false; pressFeedback(false);   // bound to window, not the element

// touch: flick, with a direction gate so vertical scrolling still works
onpointerdown → startX = e.clientX; startY = e.clientY; t0 = performance.now();
onpointermove → const dx = e.clientX - startX, dy = e.clientY - startY;
                if (!captured) {
                  if (Math.abs(dx) < 8 || Math.abs(dy) > Math.abs(dx)) return;  // ← the gate
                  captured = true;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
                e.preventDefault();
                const dt = Math.max((performance.now() - lastT) / 1000, 0.016);
                dragVel = gsap.utils.clamp(-3600, 3600, -(e.clientX - lastX) / dt * 2);
```

The **8px + "more horizontal than vertical"** gate is what stops the gallery from stealing every
vertical swipe on a phone. Don't capture the pointer until both conditions pass.

Press feedback — the strip dips slightly while held:

```js
gsap.to(scaleWrapper, { scale: down ? 0.95 : 1,
                        duration: down ? 0.35 : 0.45,
                        ease: "power2.out", overwrite: "auto" });
```

Scale a **wrapper**, not the loop itself — the loop's `x` is being written every frame and the
two transforms would fight.

### Scroll velocity feeds it too

```js
ScrollTrigger.create({
  trigger: section, start: "top bottom", end: "bottom top",
  onEnter: () => inView = true,  onLeave:     () => inView = false,
  onEnterBack: () => inView = true, onLeaveBack: () => inView = false,
  onUpdate: (self) => {
    scrollKick = isTouch() ? 0 : gsap.utils.clamp(-1800, 1500, self.getVelocity() * 0.85);
  },
});
```

Scrolling the page nudges the strip along — the same velocity-impulse idea as the 3D logo, so
the two feel like one system. The clamp is asymmetric (`-1800` / `1500`) on purpose: scrolling
down should push the strip harder than scrolling up pulls it back.

`inView` gates the ticker so an offscreen gallery costs nothing.

### Init late

The reference defers the whole setup by ~250ms plus an idle callback. First paint should not
compete with measuring a 30-image strip. Do the same.

---

## Checklist before shipping any of these

- [ ] `prefers-reduced-motion` honored — reveals resolve to their end state, video doesn't scrub
- [ ] `ScrollTrigger.refresh()` after fonts/images load, or sticky offsets land wrong
- [ ] `invalidateOnRefresh: true` on every scrubbed trigger
- [ ] Mobile: sticky + `100vh` fights browser chrome — use `100svh`/`100dvh`
- [ ] Test the video scrub on a real iPhone, not just a simulator
- [ ] `will-change` only on elements actually animating; remove it when idle if the list is long
- [ ] Content readable with JS disabled (sticky stages degrade to plain tall sections)
- [ ] WebGL: `setPixelRatio` capped at 2, contexts disposed on unmount, one `gsap.ticker` loop
      for everything — never a second `requestAnimationFrame`
- [ ] Marquees/galleries re-measure on image `load` **and** `error`, plus `ResizeObserver`
- [ ] Horizontal drag areas set `touch-action: pan-y` and gate capture on 8px + horizontal-dominant
- [ ] Frame-rate independence: `gsap.ticker.deltaRatio(60)` for motion, `k ** dr` for every
      decay and `1 - (1 - k) ** dr` for every lerp — measured, not assumed
