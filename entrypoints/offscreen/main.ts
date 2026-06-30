import { createWorker, PSM, type Worker as TesseractWorker } from 'tesseract.js';
import type { ExtensionMessage, SegWord } from '../../src/types';

// Runs in the extension's own origin (chrome-extension://), so constructing the
// Tesseract Worker and importing the local core wasm are both same-origin → allowed.

let workerPromise: Promise<TesseractWorker> | null = null;

// Restrict the recognizer to Hangul syllables + the punctuation/digits we
// actually keep, so it can't hallucinate stray Latin letters or symbols out of
// bubble artwork. Standalone compatibility jamo (ㄱ–ㅎ, ㅏ–ㅣ) are deliberately
// excluded — they're almost always OCR noise. The LSTM engine honours
// tessedit_char_whitelist since Tesseract 4.1.
const HANGUL_WHITELIST = (() => {
  let s = '';
  for (let c = 0xac00; c <= 0xd7a3; c++) s += String.fromCharCode(c);
  return s + '0123456789 .,!?~·…"\'';
})();

// Words the recognizer reports below this confidence (0–100) are dropped rather
// than displayed — bubble-outline hallucinations come back with low confidence.
const MIN_WORD_CONFIDENCE = 50;

// Rebuild the recognized text from per-word data, keeping only confident words
// and preserving line structure. Falls back to the raw text if the structured
// block output is unavailable.
function confidentText(data: { text?: string; blocks?: unknown }): string {
  const blocks = data?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return (data?.text ?? '').trim();
  const lines: string[] = [];
  for (const block of blocks as any[]) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        const kept = (line?.words ?? [])
          .filter((w: any) => typeof w?.confidence === 'number' && w.confidence >= MIN_WORD_CONFIDENCE)
          .map((w: any) => String(w?.text ?? '').trim())
          .filter(Boolean);
        if (kept.length) lines.push(kept.join(' '));
      }
    }
  }
  return lines.join('\n').trim();
}

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
  })
    .then(async (worker) => {
      // A cropped speech bubble is one uniform block of text, so tell Tesseract
      // not to run full page-layout analysis (which invents structure — and
      // glyphs — on small noisy crops). Whitelist keeps output to Hangul.
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: HANGUL_WHITELIST,
        preserve_interword_spaces: '1',
      });
      return worker;
    })
    .catch((e) => {
      // Reset so a later scan can retry worker creation instead of being stuck
      // on a permanently-rejected promise.
      workerPromise = null;
      throw new Error(`Failed to initialize OCR engine: ${describe(e)}`);
    });
  return workerPromise;
}

// ---------------------------------------------------------------------------
// Kiwi morphological analyzer (Korean word segmentation) — via a sandboxed frame
// ---------------------------------------------------------------------------
// Kiwi's Emscripten/Embind glue JITs binding functions with `new Function(...)`,
// which the offscreen document's CSP forbids. So Kiwi runs in a SANDBOXED iframe
// (kiwi-sandbox.html, CSP includes 'unsafe-eval'). That page has no chrome.* APIs,
// so we fetch the wasm + model bytes here and TRANSFER them in over postMessage
// (wasm → same-origin blob: URL; models → raw bytes). Built once, lazily.

const KIWI_FILES = ['kiwi-wasm.wasm', 'combiningRule.txt', 'sj.morph', 'extract.mdl', 'cong.mdl'];

let kiwiFrame: Promise<HTMLIFrameElement> | null = null;
let frameEl: HTMLIFrameElement | null = null;
let segSeq = 0;
const pending = new Map<number, { resolve: (w: SegWord[]) => void; reject: (e: Error) => void }>();
// Resolvers for the one-time ready/init handshakes (single iframe).
let onReady: (() => void) | null = null;
let onInit: { resolve: () => void; reject: (e: Error) => void } | null = null;

window.addEventListener('message', (ev: MessageEvent) => {
  // Only trust messages coming from our sandbox frame.
  if (frameEl && ev.source !== frameEl.contentWindow) return;
  const m = ev.data as { kind?: string; id?: number; words?: SegWord[]; message?: string };
  if (!m || typeof m !== 'object') return;
  switch (m.kind) {
    case 'kiwi-ready':
      onReady?.();
      break;
    case 'kiwi-init-done':
      onInit?.resolve();
      break;
    case 'kiwi-init-error':
      onInit?.reject(new Error(m.message || 'init failed'));
      break;
    case 'kiwi-result':
      if (typeof m.id === 'number') {
        pending.get(m.id)?.resolve(m.words ?? []);
        pending.delete(m.id);
      }
      break;
    case 'kiwi-error':
      if (typeof m.id === 'number') {
        pending.get(m.id)?.reject(new Error(m.message || 'segmentation failed'));
        pending.delete(m.id);
      }
      break;
  }
});

function ensureKiwiFrame(): Promise<HTMLIFrameElement> {
  if (kiwiFrame) return kiwiFrame;
  kiwiFrame = (async () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = chrome.runtime.getURL('kiwi-sandbox.html');
    frameEl = iframe;

    const ready = new Promise<void>((resolve) => (onReady = resolve));
    document.body.appendChild(iframe);
    await ready;

    // Fetch the packaged wasm + model files (the offscreen doc is the extension
    // origin, so it can read its own resources directly).
    const buffers = await Promise.all(
      KIWI_FILES.map(async (n) => {
        const res = await fetch(chrome.runtime.getURL('kiwi/' + n));
        if (!res.ok) throw new Error(`Failed to load kiwi/${n}: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
    );
    const [wasm, ...modelBufs] = buffers;
    const models: Record<string, ArrayBuffer> = {};
    KIWI_FILES.slice(1).forEach((n, i) => (models[n] = modelBufs[i]));

    const inited = new Promise<void>((resolve, reject) => (onInit = { resolve, reject }));
    iframe.contentWindow!.postMessage({ kind: 'kiwi-init', wasm, models }, '*', [
      wasm,
      ...Object.values(models),
    ]);
    await inited;
    return iframe;
  })().catch((e) => {
    kiwiFrame = null; // allow retry on a later request
    frameEl?.remove();
    frameEl = null;
    throw new Error(`Failed to initialize word analyzer: ${describe(e)}`);
  });
  return kiwiFrame;
}

function segmentViaFrame(frame: HTMLIFrameElement, text: string): Promise<SegWord[]> {
  const id = ++segSeq;
  return new Promise<SegWord[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    frame.contentWindow!.postMessage({ kind: 'kiwi-segment', id, text }, '*');
  });
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse): boolean => {
  const message = msg as ExtensionMessage;

  if (message.type === 'SEGMENT_REQUEST' && message.target === 'offscreen') {
    (async () => {
      try {
        const frame = await ensureKiwiFrame();
        // Strip OCR's (often wrong) spaces so the Kiwi model drives segmentation
        // from scratch — OCR spacing like "수 십" or missing spaces shouldn't
        // dictate word boundaries. Newlines collapse to a single newline so Kiwi
        // still sees line breaks as soft separators.
        const compact = message.text.replace(/[^\S\n]+/g, '').replace(/\n+/g, '\n');
        const words = await segmentViaFrame(frame, compact);
        sendResponse({ type: 'SEGMENT_RESULT', words } satisfies ExtensionMessage);
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
        sendResponse({ type: 'OCR_RESULT', text: confidentText(data) } satisfies ExtensionMessage);
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
