/* global gsap, ScrollTrigger */
/* ============================================================
   GROW TOWER — features / anatomy walkthrough
   Card activation via ScrollTrigger center zone; sticky panel
   reuses the hero's GLB in a second lightweight Three.js view.
   The panel renders on demand (during camera tweens only) —
   no animation loop.
   ============================================================ */

const section = document.querySelector(".features");
const canvas = document.querySelector(".features__canvas");
const hotspot = document.querySelector(".features__hotspot");
const cards = section ? Array.from(section.querySelectorAll(".feature-card")) : [];

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isNarrow = window.matchMedia("(max-width: 900px)").matches;

// Enable the shared three.js file cache so the hero's GLB request
// (same module instance, same URL) is fetched exactly once. This
// script tag sits before js/hero.js, so this runs first. Gated:
// when 3D never initializes (narrow viewport, reduced motion),
// three.js must not be downloaded at all.
if (!isNarrow && motionOK) {
  import("three").then((m) => {
    m.Cache.enabled = true;
  }).catch(() => {});
}

/* Camera presets, one per feature card (order matches the DOM).
   ty  = look-target height, as a fraction of model height (0 = center)
   az  = orbit azimuth in radians (0 = front of the model)
   el  = camera elevation as a fraction of model height
   r   = camera distance, as a fraction of the full-fit distance
   Tune these numbers to reframe any feature. */
const PRESETS = [
  { ty: 0.38,  az: 0.35,  el: 0.20,  r: 0.55 }, // 01 AIR DRAFT PANEL — filter cap
  { ty: 0.05,  az: -0.55, el: 0.06,  r: 0.60 }, // 02 PLANT HOLDERS — mid-tower
  { ty: 0.10,  az: 2.60,  el: 0.12,  r: 0.65 }, // 03 HOSE + SPINE — rear spine
  { ty: -0.28, az: 0.70,  el: 0.00,  r: 0.60 }, // 04 PUMP — bucket
  { ty: -0.32, az: -0.40, el: -0.04, r: 0.55 }, // 05 AIR INTAKE — base front
  { ty: -0.42, az: 0.90,  el: -0.10, r: 0.50 }, // 06 BASE PEGS — base
];
const HOME = { ty: 0, az: 0.15, el: 0.08, r: 1 }; // initial full-product view

let goTo = null;      // set once the 3D view is ready
let lastActive = -1;

function setActive(i) {
  lastActive = i;
  section.classList.add("features--engaged");
  cards.forEach((c, j) => c.classList.toggle("is-active", j === i));
  if (goTo) goTo(i);
}

/* ---- card highlight choreography (desktop, motion allowed) ---- */
function initHighlights() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  cards.forEach((card, i) => {
    ScrollTrigger.create({
      trigger: card,
      start: "top 60%",
      end: "bottom 40%",
      onToggle: (self) => {
        if (self.isActive) setActive(i);
      },
    });
  });
}

/* ---- second lightweight 3D view ---- */
async function init3D() {
  if (!section || !canvas || !motionOK || isNarrow) return false;
  if (typeof gsap === "undefined") return false;

  let THREE, GLTFLoader, DRACOLoader, RoomEnvironment;
  try {
    THREE = await import("three");
    ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));
    ({ DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js"));
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
  } catch (e) {
    return false;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) {
    return false;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0); // transparent — studio-gray panel shows through

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const fill = new THREE.DirectionalLight(0xffffff, 1.1);
  fill.position.set(2, 3, 2.5);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);

  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let gltf;
  try {
    // Same URL the hero loads — served from THREE.Cache, not the network.
    gltf = await loader.loadAsync("assets/models/growtower-web.glb");
  } catch (e) {
    return false;
  }

  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  scene.add(model);

  const H = size.y;
  const fitDist = ((H / 2) / Math.tan((camera.fov * Math.PI) / 360)) * 1.25;

  // camera/target state, tweened by GSAP between preset framings
  const view = { px: 0, py: 0, pz: fitDist, tx: 0, ty: 0, tz: 0 };
  const anchor = new THREE.Vector3(); // hotspot's 3D position

  function framing(p) {
    const target = { x: 0, y: p.ty * H, z: 0 };
    const d = p.r * fitDist;
    return {
      tx: target.x,
      ty: target.y,
      tz: target.z,
      px: target.x + d * Math.sin(p.az),
      py: target.y + p.el * H + d * 0.12,
      pz: target.z + d * Math.cos(p.az),
    };
  }

  function positionHotspot() {
    const v = anchor.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * canvas.clientHeight;
    hotspot.style.transform = "translate(" + x + "px," + y + "px) translate(-50%,-50%)";
  }

  function apply() {
    camera.position.set(view.px, view.py, view.pz);
    camera.lookAt(view.tx, view.ty, view.tz);
    renderer.render(scene, camera);
    positionHotspot();
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    apply();
  }

  goTo = function (i) {
    const f = framing(PRESETS[i]);
    gsap.to(hotspot, { opacity: 0, duration: 0.2, overwrite: true });
    gsap.to(view, {
      ...f,
      duration: 0.8,
      ease: "power2.inOut",
      overwrite: true,
      onUpdate: apply,
      onComplete: function () {
        anchor.set(f.tx, f.ty, f.tz);
        positionHotspot();
        gsap.to(hotspot, { opacity: 1, duration: 0.25 });
      },
    });
  };

  // reveal the canvas, then measure and draw the home framing
  section.classList.add("features--3d");
  Object.assign(view, framing(HOME));
  resize();
  window.addEventListener("resize", resize);

  return true;
}

/* ---- bootstrap ---- */
(async () => {
  if (!section || cards.length === 0) return;
  if (!isNarrow && motionOK) initHighlights();
  try {
    const ok = await init3D();
    // if a card activated while the model was still loading, catch up
    if (ok && lastActive >= 0) goTo(lastActive);
  } catch (e) {
    /* static panel stays — still image fallback */
  }
})();
