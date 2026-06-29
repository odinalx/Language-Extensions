import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';
import { KiwiBuilder, type Kiwi } from 'kiwi-nlp';
import type { ExtensionMessage } from '../../src/types';
import { groupEojeol, type KiwiToken } from '../../src/kiwiTokens';

// Runs in the extension's own origin (chrome-extension://), so constructing the
// Tesseract Worker and importing the local core wasm are both same-origin → allowed.

let workerPromise: Promise<TesseractWorker> | null = null;

function reportProgress(status: string, progress: number) {
  // Fire-and-forget; ignore "no receiver" errors when no panel is listening.
  chrome.runtime
    .sendMessage({ type: 'OCR_PROGRESS', status, progress } satisfies ExtensionMessage)
    .catch(() => {});
}

function getWorker(): Promise<TesseractWorker> {
  if (workerPromise) return workerPromise;
  workerPromise = createWorker('kor', 1, {
    // Load the worker directly as an extension-origin Worker (no blob bootstrap).
    workerBlobURL: false,
    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
    // Directory (NO trailing slash): Tesseract joins with `/tesseract-core…`.
    // langPath joins as `${langPath}/kor.traineddata.gz` WITHOUT stripping a
    // trailing slash, so a trailing slash here would 404 (double slash).
    corePath: chrome.runtime.getURL('tesseract').replace(/\/$/, ''),
    // Local language data (bundled) — no network round-trip on first scan.
    langPath: chrome.runtime.getURL('tesseract').replace(/\/$/, ''),
    logger: (m) => {
      if (m && typeof m.progress === 'number') reportProgress(m.status, m.progress);
    },
  }).catch((e) => {
    // Reset so a later scan can retry worker creation instead of being stuck
    // on a permanently-rejected promise.
    workerPromise = null;
    throw new Error(`Failed to initialize OCR engine: ${describe(e)}`);
  });
  return workerPromise;
}

// ---------------------------------------------------------------------------
// Kiwi morphological analyzer (Korean word segmentation)
// ---------------------------------------------------------------------------
// Loaded lazily and cached. The wasm + model files are bundled locally under
// public/kiwi/ and served from the extension origin. The only language model in
// the 0.23 release is the (mandatory) neural `cong.mdl`, so modelType is 'cong'.

let kiwiPromise: Promise<Kiwi> | null = null;

function getKiwi(): Promise<Kiwi> {
  if (kiwiPromise) return kiwiPromise;
  kiwiPromise = (async () => {
    const builder = await KiwiBuilder.create(chrome.runtime.getURL('kiwi/kiwi-wasm.wasm'));
    const names = ['combiningRule.txt', 'sj.morph', 'extract.mdl', 'cong.mdl'];
    const modelFiles: Record<string, string> = {};
    for (const n of names) modelFiles[n] = chrome.runtime.getURL('kiwi/' + n);
    return builder.build({
      modelFiles,
      modelType: 'cong',
      loadDefaultDict: false,
      loadTypoDict: false,
      loadMultiDict: false,
    });
  })().catch((e) => {
    kiwiPromise = null; // allow retry on a later request
    throw new Error(`Failed to initialize word analyzer: ${describe(e)}`);
  });
  return kiwiPromise;
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse): boolean => {
  const message = msg as ExtensionMessage;

  if (message.type === 'SEGMENT_REQUEST' && message.target === 'offscreen') {
    (async () => {
      try {
        const kiwi = await getKiwi();
        const tokens = kiwi.tokenize(message.text) as KiwiToken[];
        sendResponse({ type: 'SEGMENT_RESULT', words: groupEojeol(message.text, tokens) } satisfies ExtensionMessage);
      } catch (e) {
        sendResponse({ type: 'SEGMENT_ERROR', message: describe(e) } satisfies ExtensionMessage);
      }
    })();
    return true; // async sendResponse
  }

  if (message.type === 'OCR_REQUEST' && message.target === 'offscreen') {
    (async () => {
      try {
        const worker = await getWorker();
        reportProgress('recognizing text', 0);
        const { data } = await worker.recognize(message.imageDataUrl);
        sendResponse({ type: 'OCR_RESULT', text: (data.text ?? '').trim() } satisfies ExtensionMessage);
      } catch (e) {
        sendResponse({ type: 'OCR_ERROR', message: describe(e) } satisfies ExtensionMessage);
      }
    })();
    return true; // async sendResponse
  }

  if (message.type === 'TTS_PLAY' && message.target === 'offscreen') {
    const audio = new Audio(message.audioDataUrl);
    audio.play().catch((e) => console.error('[Korean Reader] audio play failed:', e));
    return false;
  }

  return false;
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
