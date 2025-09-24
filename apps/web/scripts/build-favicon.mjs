import fs from 'node:fs/promises';
import path from 'node:path';
import Jimp from 'jimp';
import pngToIco from 'png-to-ico';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const srcPng = path.join(rootDir, 'src', 'assets', 'ledgermind-lockup-1024.png');
const outIco = path.join(publicDir, 'favicon.ico');
const outPng192 = path.join(publicDir, 'favicon-192.png');
const outPng512 = path.join(publicDir, 'favicon-512.png');
const outApple = path.join(publicDir, 'apple-touch-icon.png');

async function ensurePngSizes() {
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoBuffers = [];
  const original = await Jimp.read(srcPng);
  // Autocrop transparent margins to make the mark visually larger
  const cropped = original.clone().autocrop({ tolerance: 0.0001, leaveBorder: 0 });
  const maxSide = Math.max(cropped.bitmap.width, cropped.bitmap.height);
  // Padding is intentionally small to maximize visible size; override via env if needed
  const paddingPct = process.env.FAVICON_PADDING_PCT ? parseFloat(process.env.FAVICON_PADDING_PCT) : 0.03; // 3%
  const minPadPx = process.env.FAVICON_MIN_PAD_PX ? parseInt(process.env.FAVICON_MIN_PAD_PX, 10) : 2; // 2px
  const pad = Math.max(minPadPx, Math.round(maxSide * paddingPct));
  const side = maxSide + pad * 2;
  const canvas = await new Jimp(side, side, 0x00000000);
  const cx = Math.round((side - cropped.bitmap.width) / 2);
  const cy = Math.round((side - cropped.bitmap.height) / 2);
  canvas.composite(cropped, cx, cy);

  for (const s of icoSizes) {
    const clone = canvas.clone();
    clone.resize(s, s, Jimp.RESIZE_BILINEAR);
    icoBuffers.push(await clone.getBufferAsync(Jimp.MIME_PNG));
  }
  // Write common standalone PNGs from padded canvas
  await canvas.clone().resize(192, 192).write(outPng192);
  await canvas.clone().resize(512, 512).write(outPng512);
  await canvas.clone().resize(180, 180).write(outApple);
  return icoBuffers;
}

async function main() {
  try {
  const pngs = await ensurePngSizes();
    const ico = await pngToIco(pngs);
    await fs.writeFile(outIco, ico);
  console.log(`[favicon] wrote ${outIco}, ${outPng192}, ${outPng512}, ${outApple}`);
  } catch (e) {
    console.error('[favicon] build failed:', e);
    process.exit(1);
  }
}

main();
