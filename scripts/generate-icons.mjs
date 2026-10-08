// Generates every app icon (and the iPhone launch screens) from scripts/icon.svg.
// Run with: npm run icons
//
// Outputs in public/:
//   apple-touch-icon.png   180x180, fully opaque (iOS fills transparency with black)
//   pwa-192x192.png        manifest icon (rounded corners, transparent outside)
//   pwa-512x512.png        manifest icon (rounded corners, transparent outside)
//   maskable-512x512.png   manifest maskable icon (full-bleed, artwork inside the 80% safe zone)
//   favicon.svg            vector favicon (rounded corners)
//   favicon-32x32.png      PNG favicon fallback
//   splash/*.png           apple-touch-startup-image launch screens, light + dark, one per iPhone screen size
// It also rewrites the <link rel="apple-touch-startup-image"> block in index.html between the
// "splash-screens:start/end" markers, so the files and the tags can never drift apart.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const splashDir = path.join(publicDir, 'splash');
const indexHtmlPath = path.join(root, 'index.html');

/** App background colors. MUST match --bg in src/styles/tokens.css (light and dark). */
const LIGHT_BG = '#f2f2f7';
const DARK_BG = '#000000';
/** Solid color used to flatten the apple-touch-icon (only matters if the SVG ever gains transparency). */
const ICON_FLATTEN_BG = '#2ea8e0';
/** Maskable icons: everything important must sit inside a centered circle of 80% diameter. */
const MASKABLE_ART_SCALE = 0.82;
/** Corner radius for the rounded variants (iOS-like, ~22.4% of the size). */
const ROUNDED_RADIUS = 229;

/**
 * Portrait iPhone screens (CSS points + device pixel ratio). Launch images must match the exact
 * device pixel size, so every current screen size is listed.
 */
const IPHONE_SCREENS = [
  { w: 375, h: 667, dpr: 2, devices: 'iPhone SE (2nd/3rd gen), 8, 7, 6s' },
  { w: 414, h: 736, dpr: 3, devices: 'iPhone 8 Plus, 7 Plus' },
  { w: 375, h: 812, dpr: 3, devices: 'iPhone X, XS, 11 Pro, 12 mini, 13 mini' },
  { w: 414, h: 896, dpr: 2, devices: 'iPhone XR, 11' },
  { w: 414, h: 896, dpr: 3, devices: 'iPhone XS Max, 11 Pro Max' },
  { w: 390, h: 844, dpr: 3, devices: 'iPhone 12, 12 Pro, 13, 13 Pro, 14, 16e' },
  { w: 428, h: 926, dpr: 3, devices: 'iPhone 12 Pro Max, 13 Pro Max, 14 Plus' },
  { w: 393, h: 852, dpr: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16' },
  { w: 430, h: 932, dpr: 3, devices: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
  { w: 402, h: 874, dpr: 3, devices: 'iPhone 16 Pro, 17, 17 Pro' },
  { w: 420, h: 912, dpr: 3, devices: 'iPhone Air' },
  { w: 440, h: 956, dpr: 3, devices: 'iPhone 16 Pro Max, 17 Pro Max' },
];

// ---------------------------------------------------------------------------------------------
// SVG variants

// Comments are stripped first so the documentation inside icon.svg can't confuse the hooks below.
const masterSvg = (await readFile(path.join(root, 'scripts', 'icon.svg'), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');

function requireOnce(haystack, needle, what) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) throw new Error(`icon.svg: expected exactly one ${what} (${needle}), found ${count}`);
}

/** Wrap the whole drawing in a rounded-square clip (for favicons and "any" manifest icons). */
function roundedSvg(svg) {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) throw new Error('icon.svg: no <svg> tag');
  const start = open.index + open[0].length;
  const end = svg.lastIndexOf('</svg>');
  const clip = `<clipPath id="roundedClip"><rect width="1024" height="1024" rx="${ROUNDED_RADIUS}" ry="${ROUNDED_RADIUS}"/></clipPath>`;
  return `${svg.slice(0, start)}${clip}<g clip-path="url(#roundedClip)">${svg.slice(start, end)}</g></svg>\n`;
}

/** Shrink the artwork into the maskable safe zone; the background stays full-bleed. */
function maskableSvg(svg) {
  requireOnce(svg, '<g id="art">', 'artwork group without a transform');
  const t = `translate(512 512) scale(${MASKABLE_ART_SCALE}) translate(-512 -512)`;
  return svg.replace('<g id="art">', `<g id="art" transform="${t}">`);
}

/** Drop indentation for the shipped favicon.svg. */
function minifySvg(svg) {
  return `${svg
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()}\n`;
}

requireOnce(masterSvg, 'id="bg"', 'full-bleed background rect');

const variants = {
  full: masterSvg,
  rounded: roundedSvg(masterSvg),
  maskable: maskableSvg(masterSvg),
};

/** Render an SVG string to a PNG buffer at `size` (rendered large, then downscaled for crisp edges). */
async function renderPng(svg, size) {
  const big = await sharp(Buffer.from(svg), { density: 144 }).resize(2048, 2048).png().toBuffer();
  return sharp(big).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
}

// ---------------------------------------------------------------------------------------------
// Icons

await mkdir(publicDir, { recursive: true });

const outputs = [];

async function writePng(name, buffer) {
  const file = path.join(publicDir, name);
  await writeFile(file, buffer);
  outputs.push(file);
}

// apple-touch-icon: full-bleed square, flattened so there is NO alpha channel at all.
await writePng(
  'apple-touch-icon.png',
  await sharp(await renderPng(variants.full, 180))
    .flatten({ background: ICON_FLATTEN_BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer(),
);

for (const size of [192, 512]) {
  await writePng(
    `pwa-${size}x${size}.png`,
    await sharp(await renderPng(variants.rounded, size)).png({ compressionLevel: 9 }).toBuffer(),
  );
}

await writePng(
  'maskable-512x512.png',
  await sharp(await renderPng(variants.maskable, 512))
    .flatten({ background: ICON_FLATTEN_BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer(),
);

await writePng(
  'favicon-32x32.png',
  await sharp(await renderPng(variants.rounded, 32)).png({ compressionLevel: 9 }).toBuffer(),
);

await writeFile(path.join(publicDir, 'favicon.svg'), minifySvg(variants.rounded));
outputs.push(path.join(publicDir, 'favicon.svg'));

// ---------------------------------------------------------------------------------------------
// Launch screens (apple-touch-startup-image): app background color + the rounded icon, centered.

await rm(splashDir, { recursive: true, force: true });
await mkdir(splashDir, { recursive: true });

const splashLinks = [];
const iconMaster = await sharp(Buffer.from(variants.rounded), { density: 144 }).resize(1024, 1024).png().toBuffer();

for (const s of IPHONE_SCREENS) {
  const width = s.w * s.dpr;
  const height = s.h * s.dpr;
  const iconSize = Math.round(s.w * 0.3) * s.dpr;
  const icon = await sharp(iconMaster).resize(iconSize, iconSize, { kernel: 'lanczos3' }).png().toBuffer();
  for (const scheme of ['light', 'dark']) {
    const name = `splash-${width}x${height}-${scheme}.png`;
    const png = await sharp({
      create: { width, height, channels: 3, background: scheme === 'light' ? LIGHT_BG : DARK_BG },
    })
      .composite([
        {
          input: icon,
          left: Math.round((width - iconSize) / 2),
          top: Math.round((height - iconSize) / 2),
        },
      ])
      .removeAlpha()
      .png({ compressionLevel: 9, palette: true, quality: 95, dither: 0.6 })
      .toBuffer();
    await writeFile(path.join(splashDir, name), png);
    outputs.push(path.join(splashDir, name));
    const media =
      `screen and (device-width: ${s.w}px) and (device-height: ${s.h}px) and ` +
      `(-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`;
    splashLinks.push(`<link rel="apple-touch-startup-image" media="${media}" href="/splash/${name}" />`);
  }
}

// Rewrite the splash block in index.html.
const START = '<!-- splash-screens:start (generated by scripts/generate-icons.mjs) -->';
const END = '<!-- splash-screens:end -->';
const html = await readFile(indexHtmlPath, 'utf8');
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a === -1 || b === -1 || b < a) {
  console.warn('! index.html has no splash-screens markers; add these tags to <head> yourself:');
  console.warn(splashLinks.join('\n'));
} else {
  const lineStart = html.lastIndexOf('\n', a) + 1;
  const indent = html.slice(lineStart, a);
  const block = [START, ...splashLinks, END].join(`\n${indent}`);
  const next = html.slice(0, a) + block + html.slice(b + END.length);
  if (next !== html) await writeFile(indexHtmlPath, next);
  console.log(`✓ index.html: ${splashLinks.length} launch-screen links`);
}

// ---------------------------------------------------------------------------------------------
// Checks

const tokens = await readFile(path.join(root, 'src', 'styles', 'tokens.css'), 'utf8').catch(() => '');
for (const color of [LIGHT_BG, DARK_BG]) {
  if (tokens && !tokens.toLowerCase().includes(`--bg: ${color}`)) {
    console.warn(`! ${color} is no longer a --bg value in tokens.css; update LIGHT_BG/DARK_BG here, in index.html and in vite.config.ts`);
  }
}

const apple = await sharp(path.join(publicDir, 'apple-touch-icon.png')).metadata();
if (apple.width !== 180 || apple.height !== 180 || apple.hasAlpha || apple.channels !== 3) {
  throw new Error(`apple-touch-icon.png must be 180x180 with no alpha (got ${apple.width}x${apple.height}, channels ${apple.channels}, alpha ${apple.hasAlpha})`);
}

for (const file of outputs) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (file.endsWith('.png')) {
    const m = await sharp(file).metadata();
    console.log(`✓ ${rel}  ${m.width}x${m.height}  ${m.hasAlpha ? 'alpha' : 'opaque'}`);
  } else {
    console.log(`✓ ${rel}`);
  }
}
const splashCount = (await readdir(splashDir)).length;
console.log(`Done: ${outputs.length - splashCount} icons + ${splashCount} launch screens.`);
