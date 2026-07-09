/* global gsap, ScrollTrigger */
/* ============================================================
   GROW TOWER — hero: 3D scroll-scrub
   Idle rotation (~60s/rev) + GSAP ScrollTrigger scrub adding
   180° and a camera pull-back across 150vh. Falls back to a
   render on mobile, reduced-motion, or WebGL failure; when the
   fallback is the visual and motion is allowed, it gets ambient
   Ken Burns + scroll parallax (static otherwise).

   Wordmark exit: WORDMARK_HOLD seconds after its wipe-in
   completes, the wordmark dissolves. In 3D mode the dissolve
   rides a vector water splash — additive mint line droplets and
   expanding waterline rings in the tower scene. Fallback mode
   gets the plain dissolve; reduced motion keeps the wordmark
   (a timed vanish is motion, so the static state is visible).
   ============================================================ */

const hero = document.querySelector(".hero");
const canvas = document.querySelector(".hero__canvas");
const fallbackEl = document.querySelector(".hero__fallback");

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

const IDLE_SPEED = (Math.PI * 2) / 60; // one revolution ≈ 60s
const SCRUB_ANGLE = Math.PI;           // +180° over the scrub range
const scrub = { angle: 0, pull: 0 };   // written by ScrollTrigger, read by render loop

const WORDMARK_HOLD = 3; // seconds the wordmark stays once its wipe completes

let splashBurst = null; // set by init3D once the scene can host the splash

function revealNow() {
  document.documentElement.classList.remove("hero-intro");
}

/* Wordmark exit: splash (3D mode only), then a short sink-and-fade.
   Only ever scheduled from the intro timeline, so gsap exists and
   motion is allowed by the time this runs. */
function dissolveWordmark() {
  if (splashBurst) splashBurst();
  gsap.to(".hero__wordmark", {
    opacity: 0,
    y: 24,
    duration: 0.7,
    delay: 0.12, // let the first droplets read as the cause
    ease: "power2.in",
  });
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
    ) // last tween ends ≈ 1.95s
    // wordmark wipe ends at 0.95 — hold it, then splash it away
    .call(() => gsap.delayedCall(WORDMARK_HOLD, dissolveWordmark), [], 0.95);
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

  /* ---- wordmark splash ---------------------------------------
     One burst of streaking droplets plus expanding waterline
     rings along the wordmark's baseline, drawn as additive lines
     so they glow on the black grid and fade out by darkening to
     black. Colors from css/tokens.css. */
  let splash = null;

  const MINT = new THREE.Color(0x8fcfb0);  /* --mint      */
  const DEEP = new THREE.Color(0x5d8673);  /* --mint-deep */
  const WHITE = new THREE.Color(0xffffff); /* --white     */

  // screen point (NDC) -> world point on the model's z=0 plane
  function ndcAtZ0(x, y) {
    const p = new THREE.Vector3(x, y, 0.5).unproject(camera);
    const dir = p.sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    return camera.position.clone().addScaledVector(dir, t);
  }

  function makeSplash(left, right) {
    const band = new THREE.Vector3().subVectors(right, left);
    const W = band.length();
    const V = W * 0.22; // launch speed scale
    const G = -V * 2.4; // gravity
    const N = 240;

    const drops = [];
    for (let i = 0; i < N; i++) {
      const pick = Math.random();
      drops.push({
        pos: left.clone().addScaledVector(band, Math.random()),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.7 * V,
          (0.55 + Math.random() * 0.95) * V,
          (Math.random() - 0.5) * 0.3 * V
        ),
        birth: Math.random() * 0.25,
        life: 0.9 + Math.random() * 0.6,
        color: pick < 0.6 ? MINT : pick < 0.85 ? DEEP : WHITE,
      });
    }

    // one segment per droplet: head at pos, tail trailing the velocity
    const pos = new Float32Array(N * 6);
    const col = new Float32Array(N * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);

    // flat elliptical rings that ripple out from the waterline
    const rings = [0.22, 0.5, 0.78].map((f, i) => {
      const pts = [];
      for (let a = 0; a <= 48; a++) {
        const th = (a / 48) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(th), 0, Math.sin(th) * 0.45));
      }
      const ring = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: DEEP,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        })
      );
      ring.position.copy(left).addScaledVector(band, f);
      ring.frustumCulled = false;
      ring.userData = { delay: i * 0.08, grow: W * (0.16 + 0.1 * Math.random()) };
      scene.add(ring);
      return ring;
    });

    let elapsed = 0;
    const DUR = 1.9;

    return {
      update(dt) {
        elapsed += dt;

        for (let i = 0; i < N; i++) {
          const d = drops[i];
          const t = elapsed - d.birth;
          const alive = t > 0 && t < d.life;
          if (alive) {
            d.vel.y += G * dt;
            d.pos.addScaledVector(d.vel, dt);
          }
          // fade: full until 55% of life, then ease to black
          const k = t / d.life;
          const a = !alive ? 0 : k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
          const o = i * 6;
          pos[o] = d.pos.x;
          pos[o + 1] = d.pos.y;
          pos[o + 2] = d.pos.z;
          pos[o + 3] = d.pos.x - d.vel.x * 0.05;
          pos[o + 4] = d.pos.y - d.vel.y * 0.05;
          pos[o + 5] = d.pos.z - d.vel.z * 0.05;
          col[o] = d.color.r * a;
          col[o + 1] = d.color.g * a;
          col[o + 2] = d.color.b * a;
          col[o + 3] = d.color.r * a * 0.35; // dimmer tail = taper
          col[o + 4] = d.color.g * a * 0.35;
          col[o + 5] = d.color.b * a * 0.35;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;

        rings.forEach((ring) => {
          const k = Math.min(1, Math.max(0, elapsed - ring.userData.delay) / 1.1);
          const e = 1 - Math.pow(1 - k, 3);
          const r = 0.08 + ring.userData.grow * e;
          ring.scale.set(r, 1, r);
          ring.material.opacity = 1 - e;
        });

        if (elapsed >= DUR) {
          scene.remove(lines);
          geo.dispose();
          mat.dispose();
          rings.forEach((ring) => {
            scene.remove(ring);
            ring.geometry.dispose();
            ring.material.dispose();
          });
          splash = null;
        }
      },
    };
  }

  splashBurst = function () {
    if (splash) return;
    // wordmark box: centered at 42% viewport height, min(92vw, 1400px) wide
    const ndcY = 1 - 2 * 0.42;
    const halfW = 0.85 * Math.min(0.92, 1400 / canvas.clientWidth);
    splash = makeSplash(ndcAtZ0(-halfW, ndcY), ndcAtZ0(halfW, ndcY));
  };

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
    if (splash) splash.update(dt);
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
