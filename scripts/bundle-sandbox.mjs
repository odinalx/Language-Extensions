// Pre-bundle the sandboxed Kiwi host into a STATIC, self-contained ES module at
// public/kiwi-sandbox.js. We deliberately bundle this OUTSIDE WXT's HTML/HMR
// pipeline: a WXT entrypoint injects dev-server (localhost:3000) module scripts
// into the page, but the Kiwi sandbox runs at an opaque origin ('null') where
// those cross-origin fetches are blocked by CORS (and its CSP can't allow them).
// Serving a static script from the extension origin ('self') works the same in
// `npm run dev` and production.
//
// Kiwi's Emscripten glue references Node builtins (node:fs/path/url/crypto/module)
// inside ENVIRONMENT_IS_NODE branches that never run in the browser; we stub them
// to empty modules so esbuild doesn't try to resolve them for the browser build.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const nodeStub = {
  name: 'node-builtins-stub',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: 'node-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
      contents: 'export default {}; export const createRequire = () => () => ({});',
      loader: 'js',
    }));
  },
};

await build({
  entryPoints: [resolve(root, 'src/kiwi-sandbox/main.ts')],
  outfile: resolve(root, 'public/kiwi-sandbox.js'),
  bundle: true,
  format: 'esm', // keep import.meta.url that the Emscripten glue reads
  platform: 'browser',
  target: 'es2022',
  plugins: [nodeStub],
  legalComments: 'none',
  logLevel: 'info',
});

console.log('✔ bundled public/kiwi-sandbox.js');
