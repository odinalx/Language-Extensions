/**
 * Copies Tesseract.js worker + core wasm files into public/tesseract/ so they
 * are bundled into the extension and loaded from the extension's own origin
 * (required — a content script's page origin cannot construct an extension Worker,
 * and strict site CSPs block remote core scripts).
 * Runs automatically via "postinstall" in package.json.
 */
import { cpSync, mkdirSync, readdirSync, existsSync, writeFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destDir = resolve(root, 'public/tesseract');
mkdirSync(destDir, { recursive: true });

// 1. Worker script
cpSync(
  resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  resolve(destDir, 'worker.min.js')
);

// 2. All core variants (.wasm + their .js loaders) — Tesseract auto-selects
//    the right one (simd / lstm) when corePath points at this directory.
const coreDir = resolve(root, 'node_modules/tesseract.js-core');
for (const f of readdirSync(coreDir)) {
  if (f.startsWith('tesseract-core') && (f.endsWith('.js') || f.endsWith('.wasm'))) {
    cpSync(resolve(coreDir, f), resolve(destDir, f));
  }
}

// 3. Korean language data (BEST model, ~15 MB — most accurate) bundled locally
//    at setup so scans need no network round-trip. Downloaded once, then cached
//    in the repo's (gitignored) public/ dir.
//    Override the variant with TESS_MODEL=4.0.0_fast for a faster/smaller model.
const variant = process.env.TESS_MODEL || '4.0.0_best';
const langFile = resolve(destDir, 'kor.traineddata.gz');
if (!existsSync(langFile)) {
  const url = `https://tessdata.projectnaptha.com/${variant}/kor.traineddata.gz`;
  console.log(`↓ Downloading kor.traineddata.gz (${variant}) — this is a one-time setup step …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download lang data: HTTP ${res.status}`);
  writeFileSync(langFile, Buffer.from(await res.arrayBuffer()));
}

console.log('✓ Copied tesseract worker + core + kor lang data into public/tesseract/');

// ---------------------------------------------------------------------------
// Kiwi (Korean morphological analyzer) — wasm + model, run in the offscreen doc
// to split spaceless Korean runs into word-units. Same "bundle locally + load
// from the extension origin" approach as Tesseract.
// ---------------------------------------------------------------------------
const kiwiDest = resolve(root, 'public/kiwi');
mkdirSync(kiwiDest, { recursive: true });

// 1. wasm binary (KiwiBuilder.create loads this from the extension origin).
cpSync(
  resolve(root, 'node_modules/kiwi-nlp/dist/kiwi-wasm.wasm'),
  resolve(kiwiDest, 'kiwi-wasm.wasm')
);

// 2. Model files. The matching model release (kiwipiepy_model 0.23.0) ships only
//    the neural `cong.mdl` language model (~76 MB, mandatory). We extract just
//    the minimal set needed to build + tokenize from the PyPI source tarball.
const KIWI_MODEL_VERSION = '0.23.0';
const KIWI_MODEL_FILES = ['combiningRule.txt', 'sj.morph', 'extract.mdl', 'cong.mdl'];
const haveModel = KIWI_MODEL_FILES.every((f) => existsSync(resolve(kiwiDest, f)));
if (!haveModel) {
  const url =
    'https://files.pythonhosted.org/packages/77/59/' +
    '28403890c5f757254bf2068ff321fb3e656fb2e5658a3de8bfc092e4fd83/' +
    `kiwipiepy_model-${KIWI_MODEL_VERSION}.tar.gz`;
  console.log(`↓ Downloading Kiwi model (~84 MB — one-time setup) …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download Kiwi model: HTTP ${res.status}`);
  const tmp = resolve(kiwiDest, '_kiwi_model.tar.gz');
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  // Extract only the needed files (strip the two leading path segments).
  const inner = KIWI_MODEL_FILES.map(
    (f) => `kiwipiepy_model-${KIWI_MODEL_VERSION}/kiwipiepy_model/${f}`
  ).join(' ');
  execSync(`tar -xzf "${tmp}" --strip-components=2 -C "${kiwiDest}" ${inner}`, { stdio: 'inherit' });
  rmSync(tmp);
}

console.log('✓ Copied Kiwi wasm + model into public/kiwi/');
