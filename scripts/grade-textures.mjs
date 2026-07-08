/* ============================================================
   GROW TOWER — texture grading pipeline
   Processes raw stock macros in /assets/img/stock-raw into the
   brand world and writes srcset-ready WebP to /assets/img/generated.

   Grade (mirrors the .duotone utility in css/base.css):
     luminance 0.0 -> --black      #000000
     luminance 0.5 -> --mint-deep  #5D8673
     luminance 1.0 -> --mint       #8FCFB0
   plus a faint deep-mint vignette (multiply) and seeded mono grain
   (overlay) so the images read as designed, not stock.

   Color values are copied from css/tokens.css — if the tokens
   change, update them here too.

   Usage:
     node grade-textures.mjs                 # process every image
     node grade-textures.mjs --only carbon   # process one image
     node grade-textures.mjs --preview-dir X # also write an ungraded
                                             # 800w "before" crop to X
   ============================================================ */

import sharp from "sharp";
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "assets", "img", "stock-raw");
const OUT_DIR = path.join(ROOT, "assets", "img", "generated");

/* ---- tokens (from css/tokens.css) -------------------------- */
const BLACK = [0x00, 0x00, 0x00]; /* --black     */
const DEEP  = [0x5d, 0x86, 0x73]; /* --mint-deep */
const MINT  = [0x8f, 0xcf, 0xb0]; /* --mint      */

/* ---- output spec ------------------------------------------- */
const MASTER_W = 1600;
const MASTER_H = 1200; /* 4:3 */
const WIDTHS = [1600, 800, 400];
const WEBP_OPTS = { quality: 82, effort: 5 };

const GRAIN_SIGMA = 7;      /* grain strength (std-dev around neutral) */
const VIGNETTE_ALPHA = 0.3; /* deep-mint multiply strength at corners  */

/* ---- tritone LUT: black -> deep mint -> mint ---------------- */
function buildLut() {
  const lut = new Uint8Array(256 * 3);
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const [from, to, u] =
      t <= 0.5 ? [BLACK, DEEP, t / 0.5] : [DEEP, MINT, (t - 0.5) / 0.5];
    lut[i * 3 + 0] = lerp(from[0], to[0], u);
    lut[i * 3 + 1] = lerp(from[1], to[1], u);
    lut[i * 3 + 2] = lerp(from[2], to[2], u);
  }
  return lut;
}
const LUT = buildLut();

/* ---- seeded PRNG so grain is reproducible (no git churn) ---- */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Mono gaussian noise centered on 128 (neutral under overlay). */
function grainBuffer(w, h, seed) {
  const rand = mulberry32(seed);
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    /* Box–Muller */
    const g =
      Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    const v = Math.max(0, Math.min(255, Math.round(128 + g * GRAIN_SIGMA)));
    px[i * 3] = px[i * 3 + 1] = px[i * 3 + 2] = v;
  }
  return px;
}

function vignetteSvg(w, h) {
  const hex = `#${DEEP.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <radialGradient id="v" cx="50%" cy="50%" r="72%">
           <stop offset="55%" stop-color="${hex}" stop-opacity="0"/>
           <stop offset="100%" stop-color="${hex}" stop-opacity="${VIGNETTE_ALPHA}"/>
         </radialGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#v)"/>
     </svg>`
  );
}

/* Crop to the 4:3 master, grade to the tritone, add the vignette.
   Returns a flat RGB PNG buffer at MASTER_W x MASTER_H. */
async function gradedMaster(srcPath) {
  const cropped = sharp(srcPath)
    .resize(MASTER_W, MASTER_H, { fit: "cover", position: "centre" })
    .grayscale()
    .linear(1.05, -128 * 0.05); /* match .duotone's contrast(1.05) */

  const { data, info } = await cropped
    .raw()
    .toBuffer({ resolveWithObject: true });

  /* single-channel luminance -> tritone RGB via LUT */
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0; i < info.width * info.height; i++) {
    const v = data[i * info.channels];
    rgb[i * 3 + 0] = LUT[v * 3 + 0];
    rgb[i * 3 + 1] = LUT[v * 3 + 1];
    rgb[i * 3 + 2] = LUT[v * 3 + 2];
  }

  return sharp(rgb, {
    raw: { width: info.width, height: info.height, channels: 3 },
  })
    .composite([{ input: vignetteSvg(info.width, info.height), blend: "multiply" }])
    .png()
    .toBuffer();
}

/* Grain is added per output size so it stays pixel-fine. */
async function exportSizes(masterPng, name, seedBase) {
  const written = [];
  for (const w of WIDTHS) {
    const h = Math.round((w * 3) / 4);
    const resized = await sharp(masterPng).resize(w, h).png().toBuffer();
    const outPath = path.join(OUT_DIR, `texture-${name}-${w}w.webp`);
    await sharp(resized)
      .composite([
        {
          input: grainBuffer(w, h, seedBase + w),
          raw: { width: w, height: h, channels: 3 },
          blend: "overlay",
        },
      ])
      .webp(WEBP_OPTS)
      .toFile(outPath);
    written.push(outPath);
  }
  return written;
}

/* ---- main --------------------------------------------------- */
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const previewDir = args.includes("--preview-dir")
  ? args[args.indexOf("--preview-dir") + 1]
  : null;

const files = (await readdir(SRC_DIR)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const targets = only ? files.filter((f) => path.parse(f).name === only) : files;
if (targets.length === 0) {
  console.error(only ? `No source image named "${only}" in ${SRC_DIR}` : `No images in ${SRC_DIR}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
if (previewDir) await mkdir(previewDir, { recursive: true });

for (const file of targets) {
  const name = path.parse(file).name;
  const srcPath = path.join(SRC_DIR, file);

  if (previewDir) {
    /* ungraded "before": same 4:3 crop, 800w, for side-by-side QA */
    await sharp(srcPath)
      .resize(800, 600, { fit: "cover", position: "centre" })
      .webp(WEBP_OPTS)
      .toFile(path.join(previewDir, `${name}-before-800w.webp`));
  }

  /* stable per-image seed so reruns are byte-identical */
  const seedBase = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const master = await gradedMaster(srcPath);
  const written = await exportSizes(master, name, seedBase);
  console.log(`${file} -> ${written.map((p) => path.basename(p)).join(", ")}`);
}
