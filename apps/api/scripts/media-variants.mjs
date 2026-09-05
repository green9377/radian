/*
  One-time: write the card/thumb WebP versions for every picture already in
  media storage (see media.ts, "one upload, three files"). Safe to run again —
  a file whose versions exist is skipped.

    docker exec radian_api_dev node scripts/media-variants.mjs

  MEDIA_DIR comes from the container's env (/media).
*/
import { readdir, stat, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const dir = process.env.MEDIA_DIR;
if (!dir) { console.error('MEDIA_DIR is not set'); process.exit(1); }

const SIZES = { card: [600, 80], thumb: [160, 78] };
let made = 0, skipped = 0, failed = 0;

async function walk(d) {
  for (const name of await readdir(d)) {
    const p = join(d, name);
    const st = await stat(p);
    if (st.isDirectory()) { await walk(p); continue; }
    if (/\.(card|thumb)\.webp$/.test(name)) continue;
    if (!/\.(jpe?g|png|webp|avif)$/i.test(name)) continue;
    const base = p.slice(0, p.length - extname(p).length);
    const targets = Object.entries(SIZES).map(([k, [w, q]]) => ({ out: `${base}.${k}.webp`, w, q }));
    const missing = [];
    for (const t of targets) {
      try { await access(t.out); } catch { missing.push(t); }
    }
    if (missing.length === 0) { skipped++; continue; }
    try {
      const img = sharp(p, { animated: false }).rotate();
      for (const t of missing) {
        await img.clone().resize({ width: t.w, withoutEnlargement: true }).webp({ quality: t.q }).toFile(t.out);
      }
      made++;
    } catch (e) {
      failed++;
      console.error('skip', p, e.message);
    }
  }
}

await walk(join(dir, 'radian'));
console.log(`variants: made ${made}, already had ${skipped}, failed ${failed}`);
