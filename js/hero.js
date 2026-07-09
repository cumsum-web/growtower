/* global gsap, ScrollTrigger */
/* ============================================================
   GROW TOWER — hero: 3D scroll-scrub
   Idle rotation (~60s/rev) + GSAP ScrollTrigger scrub adding
   180° and a camera pull-back across 150vh. Falls back to a
   render on mobile, reduced-motion, or WebGL failure; when the
   fallback is the visual and motion is allowed, it gets ambient
   Ken Burns + scroll parallax (static otherwise).

   Wordmark exit: WORDMARK_HOLD seconds after its wipe-in
   completes, the wordmark glitch-jitters, flickers, and
   collapses CRT-style. In 3D mode the collapse rides a
   stroboscopic burst of flat vector glyphs (rings, plus marks,
   triangles, chevrons, corner brackets, one targeting reticle)
   popping around the baseline with no easing — faction-intro
   motion language — plus a flickering scanline. Teal drifter
   glyphs linger after the strobe, floating free and slowly
   fading. Fallback mode gets the jitter and collapse alone;
   reduced motion keeps the wordmark (a timed vanish is motion,
   so static = visible).
   ============================================================ */

const hero = document.querySelector(".hero");
const canvas = document.querySelector(".hero__canvas");
const fallbackEl = document.querySelector(".hero__fallback");

const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 768px)").matches;

const IDLE_SPEED = (Math.PI * 2) / 60; // one revolution ≈ 60s
const SCRUB_ANGLE = Math.PI;           // +180° over the scrub range
const scrub = { angle: 0, pull: 0 };   // written by ScrollTrigger, read by render loop

const WORDMARK_HOLD = 1.5; // seconds the wordmark stays once its wipe completes

let glyphBurst = null; // set by init3D once the scene can host the burst

function revealNow() {
  document.documentElement.classList.remove("hero-intro");
}

/* Wordmark exit: glyph burst (3D mode only) while the wordmark
   itself jitters sideways in hard snaps, flickers, and collapses
   to a bright line, CRT-style. Only ever scheduled from the
   intro timeline, so gsap exists and motion is allowed by the
   time this runs. */
function dissolveWordmark() {
  if (glyphBurst) glyphBurst();
  gsap.timeline()
    .set(".hero__wordmark", { x: -8 }, 0)
    .to(".hero__wordmark", { opacity: 0.25, duration: 0.06, ease: "none" }, 0)
    .set(".hero__wordmark", { x: 10 }, 0.06)
    .to(".hero__wordmark", { opacity: 1, duration: 0.05, ease: "none" }, 0.06)
    .set(".hero__wordmark", { x: -5 }, 0.11)
    .to(".hero__wordmark", { opacity: 0.4, duration: 0.05, ease: "none" }, 0.11)
    .set(".hero__wordmark", { x: 0 }, 0.16)
    .to(".hero__wordmark", { opacity: 1, duration: 0.04, ease: "none" }, 0.16)
    .to(".hero__wordmark", {
      scaleY: 0.04,
      scaleX: 1.06,
      opacity: 0,
      duration: 0.32,
      ease: "power3.in",
    }, 0.22);
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
    // wordmark wipe ends at 0.95 — hold it, then glitch it out
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

  /* ---- wordmark glyph burst ----------------------------------
     Faction-intro-style exit: a swarm of flat vector glyphs —
     rings, plus marks, triangles, chevrons, corner brackets and
     one targeting reticle — pops stroboscopically around the
     wordmark's baseline while it flickers out. Motion is
     quantized to STEP with no easing: glyphs appear, hold a few
     frames, jump or vanish. Teal-only drifters survive the
     strobe, floating and slowly fading. Additive draw in token
     colors; teal leads, mint reads as rim light. Colors from
     css/tokens.css. */
  let burst = null;

  const MINT = new THREE.Color(0x8fcfb0);  /* --mint      */
  const DEEP = new THREE.Color(0x5d8673);  /* --mint-deep */
  const TEAL = new THREE.Color(0x56a49a);  /* --teal      */
  const WHITE = new THREE.Color(0xffffff); /* --white     */

  // screen point (NDC) -> world point on the model's z=0 plane
  function ndcAtZ0(x, y) {
    const p = new THREE.Vector3(x, y, 0.5).unproject(camera);
    const dir = p.sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    return camera.position.clone().addScaledVector(dir, t);
  }

  function makeGlyphBurst(left, right) {
    const band = new THREE.Vector3().subVectors(right, left);
    const W = band.length();
    const center = left.clone().addScaledVector(band, 0.5);
    const STEP = 1 / 18; // strobe quantum — all glyph changes snap to this

    const group = new THREE.Group();
    scene.add(group);

    const palette = [TEAL, TEAL, TEAL, MINT, MINT, WHITE, DEEP]; // weighted

    function lineMat(c) {
      return new THREE.LineBasicMaterial({
        color: c,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
    }
    function fillMat(c) {
      return new THREE.MeshBasicMaterial({
        color: c,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    /* unit-size glyph geometries, scaled per instance */
    function ringGeo(segs) {
      const pts = [];
      for (let a = 0; a < segs; a++) {
        const th = (a / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(th), Math.sin(th), 0));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    }
    function triGeo() {
      return new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0.87, -0.5, 0),
        new THREE.Vector3(-0.87, -0.5, 0),
      ]);
    }
    function chevGeo() {
      return new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, 0.8, 0),
        new THREE.Vector3(0.5, 0, 0),
        new THREE.Vector3(-0.5, -0.8, 0),
      ]);
    }
    function bracketGeo() {
      // four corner ticks of a square, like a targeting frame
      const v = [];
      for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
        v.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x - Math.sign(x) * 0.4, y, 0));
        v.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y - Math.sign(y) * 0.4, 0));
      }
      return new THREE.BufferGeometry().setFromPoints(v);
    }
    function plusGeo() {
      // filled plus, same silhouette as icon-plus.svg
      const a = 0.33;
      const s = new THREE.Shape();
      s.moveTo(-a, 1); s.lineTo(a, 1); s.lineTo(a, a); s.lineTo(1, a);
      s.lineTo(1, -a); s.lineTo(a, -a); s.lineTo(a, -1); s.lineTo(-a, -1);
      s.lineTo(-a, -a); s.lineTo(-1, -a); s.lineTo(-1, a); s.lineTo(-a, a);
      return new THREE.ShapeGeometry(s);
    }

    const glyphs = [];
    const COUNT = 26;
    for (let i = 0; i < COUNT; i++) {
      const c = palette[(Math.random() * palette.length) | 0];
      const kind = Math.random();
      let obj;
      if (kind < 0.22) obj = new THREE.LineLoop(ringGeo(28), lineMat(c));
      else if (kind < 0.42) obj = new THREE.Mesh(plusGeo(), fillMat(c));
      else if (kind < 0.62) obj = new THREE.LineLoop(triGeo(), lineMat(c));
      else if (kind < 0.82) obj = new THREE.Line(chevGeo(), lineMat(c));
      else obj = new THREE.LineSegments(bracketGeo(), lineMat(c));
      obj.frustumCulled = false;
      obj.visible = false;
      group.add(obj);
      glyphs.push({
        obj,
        size: W * (0.018 + Math.random() * 0.05),
        die: 0.55 + Math.random() * 0.75, // stops re-appearing after this
      });
    }

    // one large targeting reticle that blinks over the band center
    const reticle = new THREE.Group();
    reticle.add(new THREE.LineLoop(ringGeo(48), lineMat(WHITE)));
    const rBrackets = new THREE.LineSegments(bracketGeo(), lineMat(WHITE));
    rBrackets.scale.setScalar(1.35);
    reticle.add(rBrackets);
    reticle.position.copy(center);
    reticle.scale.setScalar(W * 0.085);
    reticle.visible = false;
    group.add(reticle);

    // hard placement, no tween: position in the band, snapped rotation
    function place(g) {
      g.obj.position.copy(left)
        .addScaledVector(band, Math.random())
        .add(new THREE.Vector3(0, (Math.random() - 0.5) * W * 0.3, 0));
      g.obj.rotation.z = ((Math.random() * 4) | 0) * (Math.PI / 2);
      g.obj.scale.setScalar(g.size * (0.6 + Math.random() * 0.9));
    }

    // scanline: the waterline flares white, cools to teal, dies
    const scanMat = new THREE.LineBasicMaterial({
      color: WHITE,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const scan = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        left.clone().addScaledVector(band, -0.02),
        right.clone().addScaledVector(band, 0.02),
      ]),
      scanMat
    );
    scan.frustumCulled = false;
    scene.add(scan);

    /* lingering drifters: teal-only linework that floats free of
       the strobe grid and slowly fades away — the holo debris
       that hangs in the air after the burst. Smooth motion here
       is deliberate contrast to the strobe glyphs. */
    const drifters = [];
    for (let i = 0; i < 9; i++) {
      const kind = Math.random();
      let obj;
      if (kind < 0.3) obj = new THREE.LineLoop(ringGeo(28), lineMat(TEAL));
      else if (kind < 0.55) obj = new THREE.LineLoop(triGeo(), lineMat(TEAL));
      else if (kind < 0.8) obj = new THREE.Line(chevGeo(), lineMat(TEAL));
      else obj = new THREE.LineSegments(bracketGeo(), lineMat(TEAL));
      obj.frustumCulled = false;
      obj.visible = false;
      obj.position.copy(left)
        .addScaledVector(band, Math.random())
        .add(new THREE.Vector3(0, (Math.random() - 0.5) * W * 0.4, 0));
      obj.rotation.z = Math.random() * Math.PI * 2;
      obj.scale.setScalar(W * (0.015 + Math.random() * 0.035));
      group.add(obj);
      drifters.push({
        obj,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * W * 0.04,
          (0.02 + Math.random() * 0.025) * W, // gentle rise
          (Math.random() - 0.5) * W * 0.015
        ),
        rotSpeed: (Math.random() - 0.5) * 0.7,
        start: 1.0 + Math.random() * 0.5, // wakes as the strobe thins out
        life: 3.5 + Math.random() * 3,
        dim: 1, // stepped dropout, re-rolled on strobe boundaries
      });
    }

    let elapsed = 0;
    let lastIdx = -1;
    const DUR = 1.5; // strobe phase length
    const endAt = drifters.reduce((m, d) => Math.max(m, d.start + d.life), DUR);

    return {
      update(dt) {
        elapsed += dt;

        // all glyph changes happen on strobe boundaries — hard pops
        const idx = Math.floor(elapsed / STEP);
        if (idx !== lastIdx) {
          lastIdx = idx;
          for (const g of glyphs) {
            if (elapsed > g.die) {
              g.obj.visible = false;
              continue;
            }
            const r = Math.random();
            if (!g.obj.visible) {
              if (r < 0.5) {
                place(g);
                g.obj.visible = true;
              }
            } else if (r < 0.3) {
              g.obj.visible = false;
            } else if (r < 0.65) {
              place(g); // jump cut, no tween
            }
          }
          // reticle blinks over the center on alternating steps
          reticle.visible = elapsed > 0.35 && elapsed < 1.1 && idx % 2 === 0;
          if (reticle.visible) reticle.rotation.z = ((idx % 4) * Math.PI) / 8;
          // drifters drop a frame now and then — holo interference
          for (const d of drifters) {
            d.dim = Math.random() < 0.12 ? 0.15 : 1;
          }
        }

        // scanline: hard flicker while it cools white -> teal
        const sk = Math.min(1, elapsed / 0.3);
        scanMat.color.copy(WHITE).lerp(TEAL, sk);
        scanMat.opacity = (1 - sk) * (Math.floor(elapsed * 24) % 2 ? 0.45 : 1);

        // drifters: smooth float, slow spin, long fade — teal only
        for (const d of drifters) {
          const t = elapsed - d.start;
          if (t < 0 || t > d.life) {
            d.obj.visible = false;
            continue;
          }
          d.obj.visible = true;
          d.obj.position.addScaledVector(d.vel, dt);
          d.obj.rotation.z += d.rotSpeed * dt;
          const k = t / d.life;
          d.obj.material.opacity = (k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6) * d.dim;
        }

        if (elapsed >= endAt) {
          scene.remove(group);
          group.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
          });
          scene.remove(scan);
          scan.geometry.dispose();
          scanMat.dispose();
          burst = null;
        }
      },
    };
  }

  glyphBurst = function () {
    if (burst) return;
    // wordmark box: centered at 42% viewport height, min(92vw, 1400px) wide
    const ndcY = 1 - 2 * 0.42;
    const halfW = 0.85 * Math.min(0.92, 1400 / canvas.clientWidth);
    burst = makeGlyphBurst(ndcAtZ0(-halfW, ndcY), ndcAtZ0(halfW, ndcY));
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
    if (burst) burst.update(dt);
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
