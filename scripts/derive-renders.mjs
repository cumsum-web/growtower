/* ============================================================
   GROW TOWER — render derivative pipeline
   Crops the multi-MB studio renders in /assets/img/renders down
   to their subjects and writes srcset-ready WebP to
   /assets/img/generated, plus a 1200x630 PNG for Open Graph.

   The renders ship on a uniform studio-gray field with the
   subject occupying a fraction of the frame; serving them raw
   costs ~12 MB of PNG. Each entry below names the source file,
   the subject crop (original pixels), and the output stem.

   Usage:
     node derive-renders.mjs              # process everything
     node derive-renders.mjs --only hero  # process one entry
   ============================================================ */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "assets", "img", "renders");
const OUT_DIR = path.join(ROOT, "assets", "img", "generated");

const WIDTHS = [1600, 800, 400];
const WEBP_OPTS = { quality: 82, effort: 5 };

/* crop = { left, top, width, height } in source pixels */
const ENTRIES = [
  {
    name: "hero",
    src: "full render.png", /* 3840x2400, tower at left */
    crop: { left: 440, top: 40, width: 1730, height: 2340 },
  },
  {
    name: "feature-head",
    src: "head render.png", /* 2932x2400, filter cap 3/4 view */
    crop: { left: 65, top: 335, width: 1680, height: 1680 },
  },
  {
    name: "feature-plant-holders",
    src: "full render.png", /* mid-tower pipes with plants */
    crop: { left: 760, top: 640, width: 1070, height: 1070 },
  },
  {
    name: "feature-hose-spine",
    src: "exploded view.png", /* 1800x2400, spine + hose at right */
    crop: { left: 810, top: 330, width: 570, height: 1030 },
  },
  {
    name: "feature-pump",
    src: "exploded view.png", /* pump over the reservoir bucket */
    crop: { left: 420, top: 1230, width: 540, height: 720 },
  },
  {
    name: "feature-air-intake",
    src: "base render.png", /* 3840x6144, ribbed circular intake */
    crop: { left: 1320, top: 2150, width: 1900, height: 1900 },
  },
  {
    name: "feature-base-pegs",
    src: "base render.png", /* full base assembly, pegs visible */
    crop: { left: 550, top: 1750, width: 2710, height: 3050 },
  },
];

/* Open Graph card: full tower on the left third, gray field right. */
const OG = {
  src: "full render.png",
  crop: { left: 140, top: 280, width: 3660, height: 1921 },
  out: "og-image.png",
  width: 1200,
  height: 630,
};

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const targets = only ? ENTRIES.filter((e) => e.name === only) : ENTRIES;
if (targets.length === 0 && only !== "og") {
  console.error(`No entry named "${only}"`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

for (const entry of targets) {
  const srcPath = path.join(SRC_DIR, entry.src);
  /* never upscale: emit the standard widths that fit, and the
     crop's own width when it is smaller than the largest step */
  const widths = WIDTHS.filter((w) => w <= entry.crop.width);
  if (widths.length === 0 || Math.max(...widths) < entry.crop.width) {
    widths.unshift(Math.min(entry.crop.width, WIDTHS[0]));
  }
  const written = [];
  for (const w of [...new Set(widths)]) {
    const outPath = path.join(OUT_DIR, `render-${entry.name}-${w}w.webp`);
    await sharp(srcPath)
      .extract(entry.crop)
      .resize({ width: w })
      .webp(WEBP_OPTS)
      .toFile(outPath);
    written.push(path.basename(outPath));
  }
  console.log(`${entry.src} [${entry.name}] -> ${written.join(", ")}`);
}

if (!only || only === "og") {
  await sharp(path.join(SRC_DIR, OG.src))
    .extract(OG.crop)
    .resize(OG.width, OG.height)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, OG.out));
  console.log(`${OG.src} [og] -> ${OG.out}`);
}
