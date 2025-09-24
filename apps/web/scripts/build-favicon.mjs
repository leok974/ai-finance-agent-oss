import fs from 'node:fs/promises';
import path from 'node:path';
import Jimp from 'jimp';
import pngToIco from 'png-to-ico';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const srcPng = path.join(rootDir, 'src', 'assets', 'ledgermind-lockup-1024.png');
const outIco = path.join(publicDir, 'favicon.ico');

async function ensurePngSizes() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = [];
  const base = await Jimp.read(srcPng);
  for (const s of sizes) {
    const clone = base.clone();
    clone.resize(s, s);
    buffers.push(await clone.getBufferAsync(Jimp.MIME_PNG));
  }
  return buffers;
}

async function main() {
  try {
    const pngs = await ensurePngSizes();
    const ico = await pngToIco(pngs);
    await fs.writeFile(outIco, ico);
    console.log(`[favicon] wrote ${outIco}`);
  } catch (e) {
    console.error('[favicon] build failed:', e);
    process.exit(1);
  }
}

main();
