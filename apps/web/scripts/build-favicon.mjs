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
  const base = await Jimp.read(srcPng);
  for (const s of icoSizes) {
    const clone = base.clone();
    clone.resize(s, s);
    icoBuffers.push(await clone.getBufferAsync(Jimp.MIME_PNG));
  }
  // Write common standalone PNGs
  await base.clone().resize(192, 192).write(outPng192);
  await base.clone().resize(512, 512).write(outPng512);
  await base.clone().resize(180, 180).write(outApple);
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
