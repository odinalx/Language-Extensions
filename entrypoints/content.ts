import type { ExtensionMessage, SelectionRect, AnalysisResult, WordInfo } from '../src/types';

let scanActive = false;
let activePanel: ShadowRoot | null = null;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((msg: unknown) => {
      const message = msg as ExtensionMessage;
      if (message.type === 'ACTIVATE_SCAN' && !scanActive) {
        activateScan();
      } else if (message.type === 'OCR_PROGRESS' && activePanel) {
        setPanelProgress(activePanel, message.status, message.progress);
      }
    });
  },
});

// ---------------------------------------------------------------------------
// SVG icons (no emoji)
// ---------------------------------------------------------------------------

const ICON = {
  book: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M9 3v16"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" fill="currentColor"/></svg>`,
  external: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h2l1.5-2h7L19 5h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="13" cy="12" r="3.5"/></svg>`,
};

// ---------------------------------------------------------------------------
// Part-of-speech → color (for word coloring)
// ---------------------------------------------------------------------------

function posColor(pos: string): string {
  switch (pos) {
    case 'noun': return '#4dabf7';        // blue
    case 'verb': return '#ff6b6b';        // red
    case 'adjective': return '#51cf66';   // green
    case 'adverb': return '#ffa94d';      // orange
    case 'pronoun': return '#845ef7';     // indigo
    case 'numeral': return '#20c997';     // teal
    case 'particle': return '#f783ac';    // pink
    case 'conjunction': return '#fcc419'; // gold
    case 'interjection': return '#ff922b';// deep orange
    case 'determiner': return '#94d82d';  // lime
    default: return '#cc5de8';            // vivid orchid (never gray/white/pale)
  }
}

// ---------------------------------------------------------------------------
// Capture overlay
// ---------------------------------------------------------------------------

function activateScan() {
  scanActive = true;

  const overlay = el('div', {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.45)',
    zIndex: '2147483645',
    cursor: 'crosshair',
    userSelect: 'none',
    touchAction: 'none',
  });

  const hint = el('div', {
    position: 'fixed', top: '16px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)', color: '#fff',
    padding: '8px 16px', borderRadius: '8px',
    fontFamily: 'system-ui, sans-serif', fontSize: '14px',
    pointerEvents: 'none', zIndex: '2147483647',
    whiteSpace: 'nowrap',
  });
  hint.textContent = 'Drag to select a speech bubble — ESC to cancel';

  const selBox = el('div', {
    position: 'fixed', display: 'none',
    border: '2px dashed #fff', background: 'rgba(255,255,255,0.08)',
    zIndex: '2147483646', pointerEvents: 'none', boxSizing: 'border-box',
  });

  document.body.append(hint, selBox, overlay);

  // Lock page scroll while selecting.
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  const blockScroll = (e: Event) => e.preventDefault();
  overlay.addEventListener('wheel', blockScroll, { passive: false });
  overlay.addEventListener('touchmove', blockScroll, { passive: false });

  let startX = 0, startY = 0, dragging = false;

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    Object.assign(selBox.style, { left: `${startX}px`, top: `${startY}px`, width: '0', height: '0', display: 'block' });
    e.preventDefault();
  };

  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    Object.assign(selBox.style, {
      left: `${x}px`, top: `${y}px`,
      width: `${Math.abs(e.clientX - startX)}px`,
      height: `${Math.abs(e.clientY - startY)}px`,
    });
  };

  const cleanup = () => {
    scanActive = false;
    document.documentElement.style.overflow = prevOverflow;
    overlay.removeEventListener('mousedown', onDown);
    overlay.removeEventListener('wheel', blockScroll);
    overlay.removeEventListener('touchmove', blockScroll);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKey);
    overlay.remove(); hint.remove(); selBox.remove();
  };

  const onUp = async (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;

    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    if (w < 10 || h < 10) { cleanup(); return; }
    cleanup();

    runCapture({ x, y, width: w, height: h, devicePixelRatio: window.devicePixelRatio || 1 });
  };

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup(); };

  overlay.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------
// Capture -> OCR -> render (with retry)
// ---------------------------------------------------------------------------

async function runCapture(rect: SelectionRect) {
  const panel = createPanel();
  activePanel = panel;
  setPanelStatus(panel, 'Capturing…');

  try {
    const resp = (await browser.runtime.sendMessage({
      type: 'CAPTURE_REQUEST',
      rect,
    } satisfies ExtensionMessage)) as ExtensionMessage | undefined;

    if (!resp) {
      setPanelError(panel, 'No response from the extension. Try reloading the page.', rect);
      return;
    }
    if (resp.type === 'CAPTURE_ERROR') { setPanelError(panel, resp.message, rect); return; }
    if (resp.type !== 'CAPTURE_RESULT') return;

    renderResults(panel, resp.analysis, rect);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes('message channel closed') || msg.includes('Extension context invalidated')) {
      setPanelError(panel, 'Extension was reloaded. Refresh the page and try again.', rect);
    } else {
      setPanelError(panel, msg, rect);
    }
  }
}

// ---------------------------------------------------------------------------
// Result panel (Shadow DOM for style isolation)
// ---------------------------------------------------------------------------

function createPanel(): ShadowRoot {
  document.getElementById('wkr-host')?.remove();

  const host = document.createElement('div');
  host.id = 'wkr-host';
  Object.assign(host.style, {
    position: 'fixed', top: '16px', right: '16px',
    width: '340px', zIndex: '2147483647',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="header">
      <span class="title">${ICON.book}<span>Korean Reader</span></span>
      <button class="close" title="Close">${ICON.close}</button>
    </div>
    <div class="body"><div class="status">Capturing…</div></div>
  `;
  shadow.appendChild(panel);

  shadow.querySelector('.close')!.addEventListener('click', () => {
    if (activePanel === shadow) activePanel = null;
    host.remove();
  });
  makeDraggable(host, shadow.querySelector('.header') as HTMLElement);

  return shadow;
}

function setPanelStatus(shadow: ShadowRoot, msg: string) {
  (shadow.querySelector('.body') as HTMLElement).innerHTML =
    `<div class="status">${esc(msg)}</div>`;
}

function setPanelProgress(shadow: ShadowRoot, status: string, progress: number) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  (shadow.querySelector('.body') as HTMLElement).innerHTML = `
    <div class="status">${esc(status)}…</div>
    <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="progress-pct">${pct}%</div>
  `;
}

function setPanelError(shadow: ShadowRoot, msg: string, rect?: SelectionRect) {
  const body = shadow.querySelector('.body') as HTMLElement;
  body.innerHTML = `
    <div class="error">${esc(msg)}</div>
    ${rect ? `<button class="btn-primary retry">${ICON.refresh}<span>Try again</span></button>` : ''}
  `;
  if (rect) {
    body.querySelector('.retry')!.addEventListener('click', () => runCapture(rect));
  }
}

function renderResults(shadow: ShadowRoot, analysis: AnalysisResult, rect: SelectionRect) {
  const body = shadow.querySelector('.body') as HTMLElement;

  if (!analysis.text) {
    body.innerHTML = `
      <div class="status">No text detected. Try a cleaner crop.</div>
      <button class="btn-primary scan-again">${ICON.camera}<span>Scan again</span></button>`;
    body.querySelector('.scan-again')!.addEventListener('click', () => activateScan());
    return;
  }

  body.innerHTML = `
    <div class="phrase"></div>
    <button class="btn-row toggle-tr">
      ${ICON.eye}<span class="toggle-label">Show translation</span>
    </button>
    <div class="translation hidden">
      ${analysis.sentenceTranslation
        ? esc(analysis.sentenceTranslation)
        : '<span class="muted">(translation unavailable)</span>'}
      ${analysis.tone ? `<div class="tone">tone: ${esc(analysis.tone)}</div>` : ''}
    </div>
    <button class="btn-primary speak-all">${ICON.speaker}<span>Speak phrase</span></button>
    <button class="btn-row scan-again">${ICON.camera}<span>Scan again</span></button>
    <div class="legend"></div>
  `;

  // Flowing Korean phrase — each word is inline, colored by POS, clickable.
  const phraseEl = body.querySelector('.phrase') as HTMLElement;
  analysis.words.forEach((info, i) => {
    const color = posColor(info.pos);
    const w = document.createElement('span');
    w.className = 'w';
    w.textContent = info.surface;
    w.style.color = color;
    w.addEventListener('click', () => showWordPopover(shadow, w, info));
    phraseEl.appendChild(w);
    if (i < analysis.words.length - 1) phraseEl.appendChild(document.createTextNode(' '));
  });

  // Show / hide translation toggle.
  const tr = body.querySelector('.translation') as HTMLElement;
  const toggle = body.querySelector('.toggle-tr') as HTMLElement;
  const label = body.querySelector('.toggle-label') as HTMLElement;
  toggle.addEventListener('click', () => {
    const hidden = tr.classList.toggle('hidden');
    label.textContent = hidden ? 'Show translation' : 'Hide translation';
  });

  body.querySelector('.speak-all')!.addEventListener('click', () => tts(analysis.text));
  body.querySelector('.scan-again')!.addEventListener('click', () => activateScan());

  // Legend of the parts of speech actually present.
  const present = [...new Set(analysis.words.map((w) => w.pos || 'other'))];
  const legend = body.querySelector('.legend') as HTMLElement;
  legend.innerHTML = present
    .map((p) => {
      const c = posColor(p === 'other' ? '' : p);
      return `<span class="legend-item"><span class="dot" style="background:${c}"></span>${esc(p)}</span>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Word detail popover
// ---------------------------------------------------------------------------

function showWordPopover(shadow: ShadowRoot, anchor: HTMLElement, info: WordInfo) {
  shadow.querySelector('.popover')?.remove();

  const color = posColor(info.pos);
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.innerHTML = `
    <div class="pop-head">
      <span class="pop-word">${esc(info.surface)}</span>
      <button class="pop-tts" title="Pronounce">${ICON.speaker}</button>
      <button class="pop-close" title="Close">${ICON.close}</button>
    </div>
    ${info.pos ? `<span class="pos-tag" style="color:${color};border-color:${hexA(color, 0.5)};background:${hexA(color, 0.12)}">${esc(info.pos)}</span>` : ''}
    <div class="pop-trans">${info.translation ? esc(info.translation) : '<span class="muted">no translation</span>'}</div>
    ${info.infinitive ? `<div class="pop-inf">dictionary form: <b>${esc(info.infinitive)}</b></div>` : ''}
    ${info.meanings.length > 1
      ? `<ul class="pop-meanings">${info.meanings.slice(0, 5).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
      : ''}
    <a class="pop-naver" target="_blank" href="https://en.dict.naver.com/#/search?query=${encodeURIComponent(info.surface)}">
      ${ICON.external}<span>Naver Dictionary</span>
    </a>
  `;
  shadow.appendChild(pop);

  // Position relative to the clicked word, then clamp inside the viewport on
  // both axes (flip above the word if it would overflow the bottom).
  const r = anchor.getBoundingClientRect();
  const margin = 8;
  const { width: popW, height: popH } = pop.getBoundingClientRect();

  let left = r.left;
  if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
  left = Math.max(margin, left);

  let top = r.bottom + 6;
  if (top + popH > window.innerHeight - margin) {
    top = r.top - popH - 6; // flip above the word
    if (top < margin) top = Math.max(margin, window.innerHeight - popH - margin);
  }

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  pop.querySelector('.pop-tts')!.addEventListener('click', () => tts(info.surface));
  pop.querySelector('.pop-close')!.addEventListener('click', () => pop.remove());

  // Close on outside click.
  const onDoc = (e: MouseEvent) => {
    const path = e.composedPath();
    if (!path.includes(pop) && !path.includes(anchor)) {
      pop.remove();
      document.removeEventListener('mousedown', onDoc);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
}

// ---------------------------------------------------------------------------
// Text-to-speech (routed through background → Google TTS; falls back locally)
// ---------------------------------------------------------------------------

async function tts(text: string) {
  try {
    const resp = (await browser.runtime.sendMessage({
      type: 'TTS_REQUEST',
      text,
    } satisfies ExtensionMessage)) as ExtensionMessage | undefined;
    if (resp && resp.type === 'TTS_DONE' && resp.ok) return;
    throw new Error(resp && resp.type === 'TTS_DONE' ? resp.message || 'tts failed' : 'tts failed');
  } catch {
    // Fallback to the browser's own voice (may be silent if none installed).
    try {
      speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'ko-KR';
      utt.rate = 0.85;
      speechSynthesis.speak(utt);
    } catch {
      /* nothing we can do */
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// "#rrggbb" + alpha → rgba()
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function el(tag: string, styles: Partial<CSSStyleDeclaration>): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, styles);
  return e;
}

function makeDraggable(host: HTMLElement, handle: HTMLElement) {
  let startX = 0, startY = 0, startL = 0, startT = 0;
  handle.style.cursor = 'move';

  const onMove = (e: MouseEvent) => {
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.left = `${startL + (e.clientX - startX)}px`;
    host.style.top = `${startT + (e.clientY - startY)}px`;
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.close')) return;
    const rect = host.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startL = rect.left; startT = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

// ---------------------------------------------------------------------------
// Panel styles
// ---------------------------------------------------------------------------

const STYLES = `
  .panel {
    background: #1a1a2e;
    color: #e8e8f0;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 520px;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    user-select: none;
  }
  .title {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 600; color: #7fd3ff; letter-spacing: 0.4px;
  }
  .close {
    display: flex; background: none; border: none; color: #888; cursor: pointer;
    padding: 3px; border-radius: 4px;
  }
  .close:hover { color: #fff; background: rgba(255,255,255,0.1); }
  .body {
    padding: 12px; overflow-y: auto; flex: 1;
    display: flex; flex-direction: column; gap: 10px;
  }
  .status { color: #888; font-size: 13px; text-align: center; padding: 16px 0; }
  .muted { color: #777; }
  .error {
    color: #ff6b6b; font-size: 13px; padding: 8px;
    background: rgba(255,107,107,0.1); border-radius: 6px;
    line-height: 1.5; word-break: break-word;
  }
  .progress { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; }
  .progress-bar { height: 100%; background: #7fd3ff; border-radius: 3px; transition: width 0.2s ease; }
  .progress-pct { font-size: 11px; color: #888; text-align: center; }

  .phrase {
    font-size: 19px; line-height: 1.7; font-weight: 500;
    padding: 12px; background: rgba(255,255,255,0.04); border-radius: 8px;
    word-break: keep-all;
  }
  .w { cursor: pointer; border-bottom: 1px dotted transparent; }
  .w:hover { border-bottom-color: currentColor; }

  .translation {
    font-size: 15px; line-height: 1.5; color: #f0f0f8; font-weight: 500;
    padding: 10px; background: rgba(127,211,255,0.07); border-radius: 8px;
  }
  .translation.hidden { display: none; }
  .tone { font-size: 11px; color: #9aa0b0; margin-top: 6px; font-weight: 400; }

  .btn-primary, .btn-row {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; padding: 7px 12px; cursor: pointer; font-size: 13px;
    border-radius: 7px; font-family: inherit;
  }
  .btn-primary {
    background: #0f3460; border: 1px solid #1a5080; color: #7fd3ff;
  }
  .btn-primary:hover { background: #1a5080; }
  .btn-row {
    background: none; border: 1px dashed #2c3252; color: #9aa0b0;
  }
  .btn-row:hover { color: #7fd3ff; border-color: #1a5080; }

  .legend { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 2px; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #888; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

  .popover {
    position: fixed; width: 240px; z-index: 2147483647;
    max-height: calc(100vh - 16px); overflow-y: auto;
    background: #20243a; border: 1px solid #38406b; border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.55); padding: 10px 12px;
    display: flex; flex-direction: column; gap: 7px;
  }
  .pop-head { display: flex; align-items: center; gap: 8px; }
  .pop-word { font-size: 18px; font-weight: 700; color: #fff; flex: 1; }
  .pop-tts, .pop-close {
    display: flex; background: none; border: none; cursor: pointer;
    color: #9fb4d8; padding: 3px; border-radius: 5px;
  }
  .pop-tts:hover, .pop-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .pos-tag {
    align-self: flex-start; font-size: 11px; padding: 1px 8px;
    border: 1px solid; border-radius: 20px; text-transform: lowercase;
  }
  .pop-trans { font-size: 14px; color: #e8e8f0; }
  .pop-inf { font-size: 12px; color: #9fb4d8; }
  .pop-inf b { color: #d8e2f5; }
  .pop-meanings { margin: 0; padding-left: 16px; color: #b8bcd0; font-size: 12px; line-height: 1.5; }
  .pop-naver {
    display: flex; align-items: center; gap: 6px;
    color: #7fd3ff; text-decoration: none; font-size: 12px;
    padding-top: 4px; border-top: 1px solid #2c3252;
  }
  .pop-naver:hover { text-decoration: underline; }
`;
