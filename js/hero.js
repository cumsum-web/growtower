/* global gsap, ScrollTrigger */
/* ============================================================
   GROW TOWER — hero: 3D scroll-scrub
   Idle rotation (~60s/rev) + GSAP ScrollTrigger scrub adding
   180° and a camera pull-back across 150vh. Falls back to a
   render on mobile, reduced-motion, or WebGL failure; when the
   fallback is the visual and motion is allowed, it gets ambient
   Ken Burns + scroll parallax (static otherwise).
   ============================================================ */

const hero = document.querySelector(".hero");
const canvas = document.querySelector(".hero__canvas");
const fallbackEl = document.querySelector(".hero__fallback");

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

const IDLE_SPEED = (Math.PI * 2) / 60; // one revolution ≈ 60s
const SCRUB_ANGLE = Math.PI;           // +180° over the scrub range
const scrub = { angle: 0, pull: 0 };   // written by ScrollTrigger, read by render loop

function revealNow() {
  document.documentElement.classList.remove("hero-intro");
}

/* ---- intro: grid → wordmark wipe → visual → UI text (<2s) ---- */
function runIntro(visualEl) {
  if (!motionOK || typeof gsap === "undefined") {
    revealNow();
    return;
  }
  clearTimeout(window.__heroIntroTimer); // timeline owns the reveal now
  const tl = gsap.timeline({ defaults: { ease: "power2.out" }, onComplete: revealNow });
  tl.fromTo(".hero__grid", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0)
    .fromTo(
      ".hero__wordmark",
      { opacity: 1, clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0% 0 0)", duration: 0.65, ease: "power3.inOut" },
      0.3
    )
    .fromTo(visualEl, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.7 }, 0.85)
    .fromTo(
      [".hero__brand", ".hero__card", ".hero__cue"],
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.1 },
      1.35
    ); // last tween ends ≈ 1.95s
}

/* ---- fallback ambient motion ---------------------------------
   Ken Burns on the render (scale 1 -> 1.08 with a few px of
   drift, ~20s, infinite alternate) inside its overflow-hidden
   frame, plus a subtle parallax: the frame trails the foreground
   text by up to 40px as the hero scrolls out. The Ken Burns
   tween runs only while the hero is onscreen. Never called under
   prefers-reduced-motion, so the render stays a static frame. */
function startAmbient() {
  if (!hero || !fallbackEl || !motionOK) return;
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
  const img = fallbackEl.querySelector("img");
  if (!img) return;

  gsap.registerPlugin(ScrollTrigger);

  // Scales the img; the intro tween scales the wrapper — separate
  // elements, so the two never fight over the same transform.
  const kenBurns = gsap.fromTo(
    img,
    { scale: 1, x: 0, y: 0 },
    {
      scale: 1.08,
      x: -8,
      y: 5,
      duration: 20,
      ease: "sine.inOut",
      repeat: -1,
      yoyo: true,
      paused: true,
      transformOrigin: "50% 50%",
    }
  );

  // GSAP folds this y into the wrapper's existing centering
  // translate, so the frame stays centered while it trails.
  gsap.fromTo(fallbackEl, { y: 0 }, {
    y: 40,
    ease: "none",
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "bottom top",
      scrub: true,
    },
  });

  ScrollTrigger.create({
    trigger: hero,
    start: "top bottom",
    end: "bottom top",
    onToggle(self) {
      if (self.isActive) {
        kenBurns.play();
      } else {
        kenBurns.pause();
      }
    },
  });
}

/* ---- 3D scene ------------------------------------------------ */
async function init3D() {
  if (!hero || !canvas || !motionOK || isMobile) return false;
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return false;

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
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0); // transparent — .bg-grid shows through

  const scene = new THREE.Scene();

  // neutral studio environment lighting
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  // key light drives the soft shadow
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);

  // model
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  let gltf;
  try {
    gltf = await loader.loadAsync("assets/models/growtower-web.glb");
  } catch (e) {
    return false;
  }

  const model = gltf.scene;
  model.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });

  // center the model on the origin
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  const group = new THREE.Group();
  group.add(model);
  scene.add(group);

  // shadow catcher under the tower
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(size.x, size.z) * 1.8, 48),
    new THREE.ShadowMaterial({ opacity: 0.35 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -size.y / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // scale lighting + framing to the model
  const s = size.y;
  key.position.set(s * 0.8, s * 1.5, s * 0.9);
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.camera.near = 0.01;
  key.shadow.camera.far = s * 6;

  const baseZ = ((s / 2) / Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
  const pullDist = baseZ * 0.35;
  camera.position.set(0, s * 0.06, baseZ);
  camera.lookAt(0, 0, 0);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // 3D mode confirmed: swap in the tall scrub layout, then measure
  hero.classList.add("hero--3d");
  resize();
  window.addEventListener("resize", resize);

  // scroll scrub: +180° and camera pull-back across the first 150vh
  gsap.registerPlugin(ScrollTrigger);
  gsap.to(scrub, {
    angle: SCRUB_ANGLE,
    pull: 1,
    ease: "none",
    scrollTrigger: {
      trigger: hero,
      start: "top top",
      end: "+=150%",
      scrub: 0.7,
    },
  });

  // render loop — idle and scrub angles sum, so they blend without snapping
  const clock = new THREE.Clock();
  let idle = 0;
  let rafId = 0;
  let running = false;

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    idle += dt * IDLE_SPEED;
    group.rotation.y = idle + scrub.angle;
    camera.position.z = baseZ + scrub.pull * pullDist;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  // pause the render loop while the hero is offscreen
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true;
      clock.getDelta(); // swallow the paused gap so idle doesn't jump
      frame();
    } else if (!entry.isIntersecting && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  });
  io.observe(hero.querySelector(".hero__stage"));

  return true;
}

/* ---- bootstrap ------------------------------------------------ */
(async () => {
  try {
    const ok = await init3D();
    if (!ok) startAmbient();
    runIntro(ok ? canvas : fallbackEl);
  } catch (e) {
    revealNow();
  }
})();
