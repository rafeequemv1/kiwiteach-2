/**
 * Resize + WebP encode landing marketing images.
 * Drop new PNGs into public/landing/, run: npm run optimize:landing-images
 * Then point landingContent.ts at the .webp paths and commit the WebP files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'public', 'landing');

/** Max width; height scales. Hero/slides use full; OMR is already small. */
const MAX_W = {
  default: 1280,
  'neet-test-prep-omr-hero.png': 1000,
};

async function main() {
  const entries = fs.readdirSync(root).filter((f) => f.toLowerCase().endsWith('.png'));
  if (!entries.length) {
    console.log('No PNG files in public/landing');
    return;
  }

  for (const name of entries) {
    const input = path.join(root, name);
    const base = name.replace(/\.png$/i, '');
    const output = path.join(root, `${base}.webp`);
    const maxW = MAX_W[name] ?? MAX_W.default;

    const meta = await sharp(input).metadata();
    const pipeline = sharp(input).rotate();

    if (meta.width && meta.width > maxW) {
      pipeline.resize(maxW, null, { fit: 'inside', withoutEnlargement: true });
    }

    await pipeline.webp({ quality: 84, effort: 6, smartSubsample: true }).toFile(output);

    const inStat = fs.statSync(input);
    const outStat = fs.statSync(output);
    console.log(
      `${base}: ${(inStat.size / 1024).toFixed(0)}KB png → ${(outStat.size / 1024).toFixed(0)}KB webp`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
