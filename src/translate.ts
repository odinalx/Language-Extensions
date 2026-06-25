import type { AnalysisResult, WordInfo } from './types';
import { naverLemma } from './naver';

// Uses Google Translate's public (unofficial) endpoint. Called from the
// background service worker, which has host_permissions for translate.googleapis.com
// so the request is not subject to page CORS.

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

function url(params: Record<string, string>, extraDt: string[] = []): string {
  const q = new URLSearchParams(params);
  for (const dt of extraDt) q.append('dt', dt);
  return `${ENDPOINT}?${q.toString()}`;
}

// Whole-phrase translation.
async function translateSentence(text: string): Promise<string> {
  const res = await fetch(
    url({ client: 'gtx', sl: 'ko', tl: 'en', dt: 't', q: text })
  );
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data = await res.json();
  const segments: string[] = (data?.[0] ?? []).map((s: unknown[]) => s?.[0] ?? '');
  return segments.join('').trim();
}

// Korean particles (조사), longest first, stripped to recover a noun stem.
const PARTICLES = [
  '으로서', '으로써', '에서는', '에게서', '에서', '에게', '한테', '께서', '으로', '까지',
  '부터', '마다', '처럼', '보다', '이라고', '라고', '이나', '든지', '밖에', '조차', '마저',
  '을', '를', '은', '는', '이', '가', '에', '도', '만', '와', '과', '의', '로', '께', '나',
];

function stripParticle(word: string): string | null {
  for (const p of PARTICLES) {
    if (word.length > p.length && word.endsWith(p)) {
      const stem = word.slice(0, -p.length);
      if (stem.length >= 1) return stem;
    }
  }
  return null;
}

// Conjugated predicate endings → very likely a verb/adjective.
function looksLikePredicate(word: string): boolean {
  // Only used as a last resort (after dictionary lookups fail), so broad
  // conjugation endings are safe: real nouns resolve via the dictionary first.
  if (word.length < 2) return false;
  return /(어요|아요|여요|예요|에요|세요|을까|ㄹ까|습니다|ㅂ니다|었어|았어|였어|겠어|었다|았다|겠다|는다|ㄴ다|니까|잖아|거든|는데|면서|려고|아서|어서|더라|구나|군요|네요|어라|아라|자|요|다|지|네|어|아)$/.test(
    word
  );
}

interface BdResult {
  translation: string;
  pos: string;
  meanings: string[];
}

async function queryBd(word: string): Promise<BdResult> {
  const res = await fetch(
    url({ client: 'gtx', sl: 'ko', tl: 'en', dt: 't', q: word }, ['bd'])
  );
  if (!res.ok) throw new Error(`Lookup HTTP ${res.status}`);
  const data = await res.json();

  const translation = ((data?.[0] ?? []).map((s: unknown[]) => s?.[0] ?? '').join('') || '').trim();

  let pos = '';
  const meanings: string[] = [];
  const dict = data?.[1];
  if (Array.isArray(dict) && dict.length > 0) {
    pos = String(dict[0]?.[0] ?? '').toLowerCase();
    for (const group of dict) {
      for (const m of group?.[1] ?? []) {
        if (typeof m === 'string' && !meanings.includes(m)) meanings.push(m);
      }
    }
  }
  return { translation, pos, meanings: meanings.slice(0, 6) };
}

// Strip leading/trailing punctuation so OCR artifacts don't block POS detection.
function core(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
}

// Single-word lookup: translation + part of speech (with particle-stripping and
// a predicate heuristic to recover POS for inflected forms).
async function lookupWord(word: string): Promise<WordInfo> {
  const c = core(word);
  if (!c) return { surface: word, translation: '', pos: '', meanings: [] };

  let translation = '';
  let pos = '';
  let meanings: string[] = [];

  const primary = await queryBd(c);
  if (primary.pos) {
    translation = primary.translation;
    pos = primary.pos;
    meanings = primary.meanings;
  } else {
    // Try the bare noun stem (drop a trailing particle).
    let resolved = false;
    const stem = stripParticle(c);
    if (stem) {
      try {
        const sec = await queryBd(stem);
        if (sec.pos) {
          translation = primary.translation || sec.translation;
          pos = sec.pos;
          meanings = primary.meanings.length ? primary.meanings : sec.meanings;
          resolved = true;
        }
      } catch {
        /* ignore, fall through */
      }
    }
    if (!resolved) {
      translation = primary.translation;
      meanings = primary.meanings;
      pos = looksLikePredicate(c) ? 'verb' : '';
    }
  }

  const info: WordInfo = { surface: word, translation, pos, meanings };

  // For predicates, attach the Korean dictionary form (best effort).
  if (pos === 'verb' || pos === 'adjective') {
    try {
      const lemma = await naverLemma(c);
      if (lemma && lemma !== c) info.infinitive = lemma;
    } catch {
      /* ignore */
    }
  }

  return info;
}

// Rough sentence-level politeness/tone from verb endings (Korean tone is
// sentence-level, so we report it once rather than per word).
function detectTone(text: string): string {
  if (/(습니다|ㅂ니다|습니까|ㅂ니까|십시오|읍시다)/.test(text)) return 'formal (합쇼체)';
  if (/요[\s.?!~]*$/.test(text) || /요[\s.?!~]/.test(text)) return 'polite (해요체)';
  if (/(니|냐|자|아라|어라|마)[\s.?!~]*$/.test(text)) return 'casual (해라체)';
  if (/(다|아|어|지|네|군|걸)[\s.?!~]*$/.test(text)) return 'plain / casual (해체)';
  return 'neutral';
}

// Simple concurrency-limited map so we don't fire dozens of requests at once.
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Per-word cache in chrome.storage.local keyed by the surface form.
// Bump the prefix whenever the analysis output shape changes so stale entries
// (e.g. cached before POS detection improved) are ignored.
const CACHE_PREFIX = 'wkr3:';

async function getCache(words: string[]): Promise<Record<string, WordInfo>> {
  const keys = words.map((w) => `${CACHE_PREFIX}${w}`);
  const stored = await chrome.storage.local.get(keys);
  const out: Record<string, WordInfo> = {};
  for (const w of words) {
    const v = stored[`${CACHE_PREFIX}${w}`];
    if (v) out[w] = v as WordInfo;
  }
  return out;
}

async function putCache(infos: WordInfo[]): Promise<void> {
  const entries: Record<string, WordInfo> = {};
  for (const info of infos) entries[`${CACHE_PREFIX}${info.surface}`] = info;
  await chrome.storage.local.set(entries);
}

// Remove OCR artifacts: unmatched brackets and odd (unpaired) quotes that the
// recognizer hallucinates from bubble outlines.
const BRACKET_PAIRS: [string, string][] = [
  ['(', ')'], ['[', ']'], ['{', '}'],
  ['（', '）'], ['「', '」'], ['『', '』'], ['《', '》'], ['〈', '〉'],
  ['“', '”'], ['‘', '’'],
];
const SYMMETRIC_QUOTES = ['"', "'", '`', '＂', '＇'];

function removeUnmatchedPair(s: string, open: string, close: string): string {
  const remove = new Set<number>();
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === open) stack.push(i);
    else if (s[i] === close) {
      if (stack.length) stack.pop();
      else remove.add(i);
    }
  }
  for (const i of stack) remove.add(i);
  if (remove.size === 0) return s;
  return [...s].filter((_, i) => !remove.has(i)).join('');
}

export function cleanOcrText(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim();
  for (const [open, close] of BRACKET_PAIRS) s = removeUnmatchedPair(s, open, close);
  for (const q of SYMMETRIC_QUOTES) {
    const positions: number[] = [];
    for (let i = 0; i < s.length; i++) if (s[i] === q) positions.push(i);
    if (positions.length % 2 === 1) {
      const drop = positions[positions.length - 1];
      s = s.slice(0, drop) + s.slice(drop + 1);
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

export async function analyze(text: string): Promise<AnalysisResult> {
  const clean = cleanOcrText(text);
  const tokens = clean.split(' ').filter(Boolean);
  const uniqueTokens = [...new Set(tokens)];

  const [sentenceTranslation, cached] = await Promise.all([
    translateSentence(clean).catch(() => ''),
    getCache(uniqueTokens),
  ]);

  const toFetch = uniqueTokens.filter((w) => !cached[w]);
  const fetched = await mapLimit(toFetch, 4, (w) =>
    lookupWord(w).catch((): WordInfo => ({ surface: w, translation: '', meanings: [], pos: '' }))
  );
  if (fetched.length) await putCache(fetched).catch(() => {});

  const byWord: Record<string, WordInfo> = { ...cached };
  for (const info of fetched) byWord[info.surface] = info;

  // Preserve original token order (including duplicates).
  const words = tokens.map(
    (w) => byWord[w] ?? { surface: w, translation: '', meanings: [], pos: '' }
  );

  return { text: clean, sentenceTranslation, tone: detectTone(clean), words };
}
