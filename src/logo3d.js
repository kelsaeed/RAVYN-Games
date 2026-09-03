/* ==========================================================================
   Effect 5b — the extruded chrome crow that docks into the nav.
   See docs/scroll-effects.md. Framework-agnostic: this module only needs a
   DOM element, plus gsap + ScrollTrigger on window.
   ========================================================================== */

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const { gsap, ScrollTrigger } = window;

/* extrusion depths, in SVG user units (the mark's viewBox is 120 wide) */
const BODY_DEPTH  = 34;
const WING_DEPTH  = 30;
const FACET_DEPTH = 6;

const REST_YAW  = -0.34;   // resting three-quarter view
const YAW_DRIFT = 0.09;
const YAW_KICK  = 2e-5;
const YAW_CLAMP = 0.08;

const LIFT      = 0.22;    // rad, ~13° — past this the folded joint reads as broken
const DOCK_SCALE = 0.23;   // parked height should fill the nav strip without crowding the links

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Extrude flips handedness, which inverts winding and therefore normals.
   On a metalness .92 surface that is not subtle — reverse it explicitly. */
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

export function createLogo3D({ root, src, dockOffset = 0 }) {
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
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  /* the chrome comes from the environment, not the lights */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  const key  = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 4, 8);
  const fill = new THREE.DirectionalLight(0xa8d7ff, 1.2); fill.position.set(-4, -1, 6);
  const rim  = new THREE.DirectionalLight(0xffffff, 1.0); rim.position.set(0, 2, -8);
  scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.8));

  const shell = new THREE.Group();
  scene.add(shell);

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xe7edf6, metalness: 0.92, roughness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.08,
    envMapIntensity: 1.7, side: THREE.DoubleSide,
  });
  const groove = new THREE.MeshPhysicalMaterial({
    color: 0x76828e,                     // palette steel
    metalness: 0.95, roughness: 0.28,
    clearcoat: 0.55, clearcoatRoughness: 0.3,
    envMapIntensity: 1.2, side: THREE.DoubleSide,
  });

  let wingPivot = null;
  let restSize = new THREE.Vector3(1, 1, 1);
  let ready = false;
  let disposed = false;

  /* ── build ──────────────────────────────────────────────────────────── */
  new SVGLoader().load(src, (data) => {
    if (disposed) return;

    const groupOf = (p) => p.userData?.node?.closest?.('g[id]')?.id ?? 'body';
    const joints = {};
    const buckets = { body: [], wing: [], facets: [] };

    for (const p of data.paths) {
      const node = p.userData?.node;
      const id = node?.getAttribute?.('id');
      if (id && id.startsWith('pivot-')) {
        joints[id] = { x: +node.getAttribute('cx'), y: +node.getAttribute('cy') };
        continue;                                  // markers are not geometry
      }
      const g = groupOf(p);
      const depth = g === 'facets' ? FACET_DEPTH : g === 'wing' ? WING_DEPTH : BODY_DEPTH;
      const opts = g === 'facets'
        ? { depth, bevelEnabled: false, steps: 1, curveSegments: 8 }
        : { depth, bevelEnabled: true, bevelSegments: 2, steps: 1,
            bevelSize: 0.6, bevelThickness: 1.1, curveSegments: 12 };
      for (const shape of SVGLoader.createShapes(p)) {
        (buckets[g] || buckets.body).push(new THREE.ExtrudeGeometry(shape, opts));
      }
    }

    /* centre on the body+wing footprint only — facets must not shift it */
    const bb = new THREE.Box3();
    for (const g of [...buckets.body, ...buckets.wing]) {
      g.computeBoundingBox(); bb.union(g.boundingBox);
    }
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    restSize.set(bb.max.x - bb.min.x, bb.max.y - bb.min.y, 1);

    const place = (geom, zOff) => {
      geom.translate(-cx, -cy, zOff);
      flipY(geom);
    };

    for (const g of buckets.body)   { place(g, -BODY_DEPTH / 2);      shell.add(new THREE.Mesh(g, chrome)); }
    for (const g of buckets.facets) { place(g, BODY_DEPTH / 2 - 2);   shell.add(new THREE.Mesh(g, groove)); }

    if (buckets.wing.length) {
      const j = joints['pivot-wing'];
      // the pivot goes through the same transform as the geometry
      const px = j ? j.x - cx : 0;
      const py = j ? -(j.y - cy) : 0;
      wingPivot = new THREE.Group();
      wingPivot.position.set(px, py, 2);           // sit just proud of the body
      for (const g of buckets.wing) {
        place(g, -WING_DEPTH / 2);
        g.translate(-px, -py, 0);                  // shoulder to the mesh origin
        wingPivot.add(new THREE.Mesh(g, chrome));
      }
      shell.add(wingPivot);
    }

    ready = true;
    fit();
    ScrollTrigger.refresh();
  });

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
    root.setAttribute('style', baseStyle);         // back to the CSS pose
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

  function apply() {
    progress = gsap.utils.clamp(0, 1, window.scrollY / travel);
    docked = progress >= 0.98;
    gsap.set(root, {
      position: 'fixed',
      top: Math.max(dockTop, startTop - window.scrollY),
      left: (window.innerWidth - boxW) / 2,
      width: boxW, height: boxH,
      x: 0, y: 0, xPercent: 0, yPercent: 0,        // clear the CSS centring transform
      scale: gsap.utils.interpolate(1, DOCK_SCALE, progress),
      transformOrigin: '50% 0%',
      zIndex: docked ? 21 : 12,
      pointerEvents: docked ? 'auto' : 'none',
      cursor: docked ? 'pointer' : 'default',
    });
  }

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

  let target = 0, energy = 0, yawKick = 0, phase = 0;
  function kick(v) {
    if (still) return;
    yawKick = gsap.utils.clamp(-YAW_CLAMP, YAW_CLAMP, -v * YAW_KICK);
    target = Math.max(target, gsap.utils.clamp(0, 1, Math.abs(v) / 1800));
  }

  /* ── one loop, shared with Lenis ────────────────────────────────────── */
  function frame() {
    if (!ready) return;
    const dr = gsap.ticker.deltaRatio(60);

    if (!still) {
      // lifts hardest mid-flight, calm at rest and calm once docked
      const flight = Math.sin(Math.PI * progress);
      energy += (Math.max(flight, target) - energy) * (1 - Math.pow(1 - 0.06, dr));
      target *= Math.pow(0.92, dr);
      yawKick *= Math.pow(0.9, dr);
      phase += 0.012 * dr;
    }

    if (wingPivot) {
      wingPivot.rotation.z = -LIFT * energy;       // -Z opens the folded wing upward
      wingPivot.rotation.x = LIFT * energy * 0.4;  // tip swings toward the camera
    }
    shell.rotation.y = REST_YAW + Math.sin(phase) * YAW_DRIFT + yawKick;

    renderer.render(scene, camera);
  }
  gsap.ticker.add(frame);

  const onResize = () => { measure(); apply(); };
  window.addEventListener('resize', onResize);

  root.addEventListener('click', () => {
    if (docked) window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── teardown ───────────────────────────────────────────────────────── */
  function dispose() {
    disposed = true;
    gsap.ticker.remove(frame);
    window.removeEventListener('resize', onResize);
    flightST.kill(); velST.kill();
    shell.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    chrome.dispose(); groove.dispose();
    envRT.texture.dispose(); pmrem.dispose(); renderer.dispose();
    renderer.domElement.remove();
    root.setAttribute('style', baseStyle);
  }

  return { dispose, refresh: onResize };
}
