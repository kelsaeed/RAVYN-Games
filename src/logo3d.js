/* ==========================================================================
   Effect 5b — the extruded mark that docks into the nav.
   See docs/scroll-effects.md. Framework-agnostic: this module only needs a
   DOM element, plus gsap + ScrollTrigger on window.

   The mark is assets/krow-mark.svg — the OUTER SILHOUETTE ONLY, no holes — and
   assets/krow-mark-face.webp, the artwork baked flat and mapped onto the caps.
   The cream facets and the outline are painted on, not cut out, so the slab
   stays solid all the way round. The texture is cropped to exactly the SVG's
   viewBox, so the two have to be regenerated together or the art slides off.
   ========================================================================== */

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const { gsap, ScrollTrigger } = window;

const DEPTH = 22;          // extrusion, in SVG user units (the mark is 120 wide)

const SPIN_IDLE = 0.30;    // rad/s — the slow turn it keeps to on its own
const DRAG_RAD  = 0.011;   // rad per pixel dragged
const SPIN_MAX  = 16;      // rad/s — a hard throw should not become a blur
const SPIN_DECAY = 0.955;  // per 60fps frame, how a throw bleeds off
const CLICK_SLOP = 6;      // px of travel still counted as a click, not a drag
const SCROLL_KICK = 6e-4;  // scrolling hard nudges the spin along too

const DOCK_SCALE = 0.23;   // parked height fills the nav strip without crowding

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Extrude flips handedness, which inverts winding and therefore normals.
   On a metalness .6 surface that is not subtle — reverse it explicitly. */
function flipY(geom) {
  geom.scale(1, -1, 1);
  const idx = geom.getIndex();
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  } else {
    for (const name of Object.keys(geom.attributes)) {
      const at = geom.attributes[name], n = at.itemSize, arr = at.array;
      for (let i = 0; i < arr.length; i += n * 3) {
        for (let k = 0; k < n; k++) {
          const t = arr[i + k];
          arr[i + k] = arr[i + 2 * n + k];
          arr[i + 2 * n + k] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
  geom.computeVertexNormals();
}

export function createLogo3D({ root, src, faceSrc, dockOffset = 0 }) {
  const container = root.querySelector('.logo3d__canvas');
  if (!container) throw new Error('logo3d: missing .logo3d__canvas');

  /* ── scene ──────────────────────────────────────────────────────────── */
  const scene = new THREE.Scene();
  const size = () => ({
    w: container.clientWidth || container.offsetWidth || 1,
    h: container.clientHeight || container.offsetHeight || 1,
  });
  let { w, h } = size();

  const camera = new THREE.PerspectiveCamera(10, w / h, 0.1, 100);
  camera.position.set(0, 0, 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  /* Much softer than the chrome version this replaces. The caps carry printed
     artwork now, and the old key light blew the cream facets out to flat white
     every time the face swung toward it. Ambient does most of the work so the
     colours stay the colours; the directionals only shape the edges. */
  const key  = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(3, 4, 8);
  const fill = new THREE.DirectionalLight(0xa8d7ff, 0.45); fill.position.set(-4, -1, 6);
  const rim  = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(0, 2, -8);
  scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 1.45));

  const shell = new THREE.Group();
  scene.add(shell);

  /* Two materials, because ExtrudeGeometry groups the caps as index 0 and the
     side walls as index 1. The caps carry the artwork; the wall is the deep
     orange of the logo's own outline, which is what makes the thickness legible
     while it turns — one flat colour and it reads as a sticker, not a slab. */
  const face = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.0, roughness: 0.62,
    clearcoat: 0.22, clearcoatRoughness: 0.4,
    envMapIntensity: 0.3, side: THREE.DoubleSide,
  });
  const wall = new THREE.MeshPhysicalMaterial({
    color: 0xa32700, metalness: 0.25, roughness: 0.5,
    clearcoat: 0.2, clearcoatRoughness: 0.4,
    envMapIntensity: 0.35, side: THREE.DoubleSide,
  });

  let restSize = new THREE.Vector3(1, 1, 1);
  let ready = false;
  let disposed = false;
  let faceTex = null;
  let svgData = null;

  /* ── build ──────────────────────────────────────────────────────────────
     Geometry and texture are fetched together but NOTHING is added to the
     scene until both have landed. Adding the mesh on the SVG alone put an
     untextured white bird on screen for as long as the texture took, which
     read as three separate loading states instead of one. */
  new THREE.TextureLoader().load(faceSrc, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    faceTex = t;
    face.map = t;
    face.needsUpdate = true;
    build();
  });
  new SVGLoader().load(src, (data) => { svgData = data; build(); });

  function build() {
    if (disposed || ready || !svgData || !faceTex) return;
    const data = svgData;

    const geoms = [];
    for (const p of data.paths) {
      for (const shape of SVGLoader.createShapes(p)) {
        geoms.push(new THREE.ExtrudeGeometry(shape, {
          depth: DEPTH, bevelEnabled: true, bevelSegments: 2, steps: 1,
          bevelSize: 0.5, bevelThickness: 0.9, curveSegments: 8,
        }));
      }
    }

    const bb = new THREE.Box3();
    for (const g of geoms) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    restSize.set(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 1);

    for (const g of geoms) {
      g.translate(-cx, -cy, -DEPTH / 2);   // centred on its own thickness, so it
      flipY(g);                            // turns about the middle of the slab
      /* ExtrudeGeometry's own cap UVs are raw model coordinates, and flipY has
         since mirrored the positions under them. Rebuild from the FINAL
         positions so the artwork lands the right way up and fills the box the
         texture was cropped to. The walls get nonsense UVs out of this, which
         costs nothing because the wall material carries no map. */
      g.computeBoundingBox();
      const b = g.boundingBox;
      const sx = b.max.x - b.min.x || 1;
      const sy = b.max.y - b.min.y || 1;
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (pos.getX(i) - b.min.x) / sx, (pos.getY(i) - b.min.y) / sy);
      }
      uv.needsUpdate = true;
      shell.add(new THREE.Mesh(g, [face, wall]));
    }

    ready = true;
    fit();
    ScrollTrigger.refresh();
  }

  function fit() {
    if (!ready) return;
    const { w, h } = size();
    const fh = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const fw = fh * (w / h);
    shell.scale.setScalar(Math.min((fw * 0.86) / restSize.x, (fh * 0.86) / restSize.y));
  }

  /* ── docking flight ─────────────────────────────────────────────────── */
  const baseStyle = root.getAttribute('style') || '';
  let dockTop = 0, startTop = 0, boxW = 0, boxH = 0, travel = 1;
  let progress = 0, docked = false;

  function measure() {
    root.setAttribute('style', baseStyle);
    const r = root.getBoundingClientRect();
    dockTop  = dockOffset;
    startTop = r.top + window.scrollY;
    boxW = r.width; boxH = r.height;
    travel = Math.max(1, startTop - dockTop);
    const s = size();
    renderer.setSize(s.w, s.h);
    camera.aspect = s.w / s.h;
    camera.updateProjectionMatrix();
    fit();
  }

  const hint = root.querySelector('.logo3d__hint');

  function apply() {
    progress = gsap.utils.clamp(0, 1, window.scrollY / travel);
    docked = progress >= 0.98;
    /* gone by a third of the way up: past that the box is small enough that the
       label would be shrinking into an unreadable smear on its way to the nav */
    if (hint) hint.style.opacity = String(gsap.utils.clamp(0, 1, 1 - progress * 3));
    gsap.set(root, {
      position: 'fixed',
      top: Math.max(dockTop, startTop - window.scrollY),
      left: (window.innerWidth - boxW) / 2,
      width: boxW, height: boxH,
      x: 0, y: 0, xPercent: 0, yPercent: 0,
      scale: gsap.utils.interpolate(1, DOCK_SCALE, progress),
      transformOrigin: '50% 0%',
      zIndex: docked ? 21 : 12,
      /* always grabbable now, not only once parked — the turn is the point */
      pointerEvents: 'auto',
      cursor: dragging ? 'grabbing' : 'grab',
    });
  }

  /* ── turning: idle drift, drag to steer, throw to spin ──────────────── */
  let yaw = -0.34;          // opens on the resting three-quarter view
  let spin = 0;             // rad/s on top of the idle drift
  let dragging = false;
  let lastX = 0, lastT = 0, travelled = 0, vpx = 0;

  function onDown(e) {
    if (still) return;
    root.classList.add('is-used');        // the nudge has done its job
    dragging = true;
    lastX = e.clientX; lastT = e.timeStamp || performance.now();
    travelled = 0; vpx = 0; spin = 0;
    root.setPointerCapture?.(e.pointerId);
    root.style.cursor = 'grabbing';
  }

  function onMove(e) {
    if (!dragging) return;
    const now = e.timeStamp || performance.now();
    const dx = e.clientX - lastX;
    const dt = now - lastT;
    yaw += dx * DRAG_RAD;                 // the mark follows the finger exactly
    travelled += Math.abs(dx);
    /* keep the most recent pointer speed rather than an average: what you feel
       on release is the flick at the end, not the whole gesture */
    if (dt > 0) vpx = dx / dt;            // px per ms
    lastX = e.clientX; lastT = now;
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    root.releasePointerCapture?.(e.pointerId);
    root.style.cursor = 'grab';
    /* a stale reading means the finger had already stopped before lifting */
    const idle = (e.timeStamp || performance.now()) - lastT > 90;
    spin = idle ? 0 : gsap.utils.clamp(-SPIN_MAX, SPIN_MAX, vpx * 1000 * DRAG_RAD);
    if (travelled < CLICK_SLOP && docked) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  measure();
  apply();

  const flightST = ScrollTrigger.create({
    trigger: document.body,
    start: 'top top',
    end: () => `${Math.max(travel, 1)}px top`,
    scrub: true,
    invalidateOnRefresh: true,
    onUpdate: (self) => { apply(); kick(self.getVelocity()); },
    onRefresh: () => { measure(); apply(); },
  });

  const velST = ScrollTrigger.create({
    trigger: document.body, start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => kick(self.getVelocity()),
  });

  function kick(v) {
    if (still || dragging) return;
    spin = gsap.utils.clamp(-SPIN_MAX, SPIN_MAX, spin - v * SCROLL_KICK);
  }

  /* ── one loop, shared with Lenis ────────────────────────────────────── */
  function frame() {
    if (!ready) return;
    const dr = gsap.ticker.deltaRatio(60);

    if (!still && !dragging) {
      yaw += (SPIN_IDLE + spin) * (dr / 60);
      spin *= Math.pow(SPIN_DECAY, dr);
    }
    shell.rotation.y = yaw;
    /* a fixed sliver of tilt. Dead level, the quarter turn is a plain rectangle
       and the slab reads as a bar; off-axis you keep a little of the face. */
    shell.rotation.x = 0.09;

    renderer.render(scene, camera);
  }
  gsap.ticker.add(frame);

  const onResize = () => { measure(); apply(); };
  window.addEventListener('resize', onResize);

  /* ── teardown ───────────────────────────────────────────────────────── */
  function dispose() {
    disposed = true;
    gsap.ticker.remove(frame);
    window.removeEventListener('resize', onResize);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    flightST.kill(); velST.kill();
    shell.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    faceTex?.dispose();
    face.dispose(); wall.dispose();
    envRT.texture.dispose(); pmrem.dispose(); renderer.dispose();
    renderer.domElement.remove();
    root.setAttribute('style', baseStyle);
  }

  return { dispose, refresh: onResize };
}
