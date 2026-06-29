import { KiwiBuilder, type Kiwi } from 'kiwi-nlp';
import { groupEojeol, type KiwiToken } from '../kiwiTokens';

// Sandboxed Kiwi host. Bundled by scripts/bundle-sandbox.mjs into a STATIC,
// self-contained file at public/kiwi-sandbox.js (served from the extension
// origin, NOT the dev server) so it works identically in `npm run dev` and
// production — a WXT HTML entrypoint would inject dev-server (localhost) scripts
// that the opaque-origin sandbox can't fetch (CORS) and its CSP can't allow.
//
// Kiwi's Emscripten/Embind glue JITs binding functions via `new Function(...)`,
// which only a SANDBOXED page's CSP may permit. This page has NO chrome.* APIs
// (opaque origin), so the parent (offscreen document) fetches the wasm + model
// bytes and TRANSFERS them in over postMessage (wasm → same-origin blob: URL;
// models → raw bytes, which kiwi-nlp's loader writes straight to its virtual FS).

type InitMsg = { kind: 'kiwi-init'; wasm: ArrayBuffer; models: Record<string, ArrayBuffer> };
type SegMsg = { kind: 'kiwi-segment'; id: number; text: string };
type InMsg = InitMsg | SegMsg;

let kiwiPromise: Promise<Kiwi> | null = null;

function post(msg: unknown) {
  // Parent is opaque-origin to us as well; target '*' is required.
  window.parent.postMessage(msg, '*');
}

function buildKiwi(init: InitMsg): Promise<Kiwi> {
  if (kiwiPromise) return kiwiPromise;
  kiwiPromise = (async () => {
    const wasmUrl = URL.createObjectURL(new Blob([init.wasm], { type: 'application/wasm' }));
    const builder = await KiwiBuilder.create(wasmUrl);
    const modelFiles: Record<string, Uint8Array> = {};
    for (const [name, buf] of Object.entries(init.models)) modelFiles[name] = new Uint8Array(buf);
    return builder.build({
      modelFiles,
      modelType: 'cong',
      loadDefaultDict: false,
      loadTypoDict: false,
      loadMultiDict: false,
    });
  })().catch((e) => {
    kiwiPromise = null; // allow a later re-init to retry
    throw e;
  });
  return kiwiPromise;
}

window.addEventListener('message', (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.kind === 'kiwi-init') {
    buildKiwi(msg).then(
      () => post({ kind: 'kiwi-init-done' }),
      (e) => post({ kind: 'kiwi-init-error', message: describe(e) })
    );
    return;
  }

  if (msg.kind === 'kiwi-segment') {
    const { id, text } = msg;
    (async () => {
      try {
        if (!kiwiPromise) throw new Error('Kiwi is not initialized');
        const kiwi = await kiwiPromise;
        const tokens = kiwi.tokenize(text) as KiwiToken[];
        post({ kind: 'kiwi-result', id, words: groupEojeol(text, tokens) });
      } catch (e) {
        post({ kind: 'kiwi-error', id, message: describe(e) });
      }
    })();
  }
});

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// Tell the parent we're loaded and ready to receive the init payload.
post({ kind: 'kiwi-ready' });
