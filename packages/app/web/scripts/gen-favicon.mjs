// Generate src/app/favicon.ico from src/app/icon.svg (the logo symbol).
//
// Next.js App Router auto-serves both app/icon.svg (modern browsers) and
// app/favicon.ico (legacy/Safari, bookmarks, /favicon.ico probes). icon.svg is
// the source of truth — edit it, then re-run this to refresh the .ico:
//
//   node packages/app/web/scripts/gen-favicon.mjs   (or: pnpm --filter @taka/web gen:favicon)
//
// sharp isn't a direct dependency of @taka/web; we borrow the copy installed for
// @taka/differ (same workspace) via createRequire so no extra install is needed.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const req = createRequire(resolve(here, '../../../lib/differ/package.json'));
const sharp = req('sharp');

const svgPath = join(here, '..', 'src', 'app', 'icon.svg');
const icoPath = join(here, '..', 'src', 'app', 'favicon.ico');
const SIZES = [16, 32, 48];

const svg = readFileSync(svgPath);
// Rasterize once at high resolution, then downscale to each icon size so small
// sizes stay crisp.
const base = await sharp(svg, { density: 512 }).resize(256, 256).png().toBuffer();
const pngs = await Promise.all(SIZES.map(s => sharp(base).resize(s, s).png().toBuffer()));

// Pack a PNG-embedded ICO (ICONDIR + ICONDIRENTRY[] + PNG blobs).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = icon
header.writeUInt16LE(SIZES.length, 4); // image count

const entries = [];
let offset = 6 + SIZES.length * 16;
SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
  e.writeUInt8(size >= 256 ? 0 : size, 1); // height
  e.writeUInt8(0, 2); // palette colors
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8); // image data size
  e.writeUInt32LE(offset, 12); // image data offset
  offset += pngs[i].length;
  entries.push(e);
});

const ico = Buffer.concat([header, ...entries, ...pngs]);
writeFileSync(icoPath, ico);
console.log(`favicon.ico written: ${ico.length} bytes (${SIZES.join('/')}px) -> ${icoPath}`);
