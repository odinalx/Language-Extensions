import type { AnalysisResult, SegMorph, SegWord, WordInfo } from './types';
import { naverLemma } from './naver';
import { wordGrammar } from './grammar';

// Uses Google Translate's public (unofficial) endpoint. Called from the
// background service worker, which has host_permissions for translate.googleapis.com
// so the request is not subject to page CORS.

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

function url(params: Record<string, string>, extraDt: string[] = []): string {
  const q = new URLSearchParams(params);
  for (const dt of extraDt) q.append('dt', dt);
  return `${ENDPOINT}?${q.toString()}`;
}

// Part-of-speech labels come back in the *interface* language (hl), which Google
// infers from locale when unset — that's why a French user got "nom"/"adjectif"
// (which then matched no English posColor case and fell through to grey). Map any
// stray non-English label back to the canonical English key.
const POS_ALIASES: Record<string, string> = {
  nom: 'noun', substantif: 'noun',
  verbe: 'verb',
  adjectif: 'adjective',
  adverbe: 'adverb',
  pronom: 'pronoun',
  préposition: 'preposition', preposition: 'preposition',
  conjonction: 'conjunction',
  déterminant: 'determiner', determinant: 'determiner', article: 'determiner',
  numéral: 'numeral', numéro: 'numeral',
  particule: 'particle',
};

function normalizePos(raw: string): string {
  const p = raw.trim().toLowerCase();
  return POS_ALIASES[p] ?? p;
}

// Whole-phrase translation.
async function translateSentence(text: string): Promise<string> {
  const res = await fetch(
    url({ client: 'gtx', sl: 'ko', tl: 'en', hl: 'en', dt: 't', q: text })
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
    url({ client: 'gtx', sl: 'ko', tl: 'en', hl: 'en', dt: 't', q: word }, ['bd'])
  );
  if (!res.ok) throw new Error(`Lookup HTTP ${res.status}`);
  const data = await res.json();

  const mtTranslation = ((data?.[0] ?? []).map((s: unknown[]) => s?.[0] ?? '').join('') || '').trim();

  let pos = '';
  const meanings: string[] = [];
  const dict = data?.[1];
  if (Array.isArray(dict) && dict.length > 0) {
    pos = normalizePos(String(dict[0]?.[0] ?? ''));
    for (const group of dict) {
      for (const m of group?.[1] ?? []) {
        if (typeof m === 'string' && !meanings.includes(m)) meanings.push(m);
      }
    }
  }

  // The plain `t` MT field translates the word as if it were a sentence, picking
  // one dominant sense out of context — for ambiguous single syllables it often
  // disagrees with the dictionary POS we report (사 → "buy" while the dict block
  // gives the numeral "four"). The dictionary's top meaning is sense-aligned with
  // `pos`, so prefer it; fall back to MT when there's no dictionary entry.
  const translation = meanings[0] || mtTranslation;
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

  // -기 nominalized verbs (보호하기 "protecting", 먹기 "eating") come back tagged
  // as 'noun' because -기 makes a verb function as a nominal. If the de-nominalized
  // form (보호하다, 먹다) is actually a verb/adjective in the dictionary, prefer that
  // — verifying via lookup avoids misfiring on true 기-nouns (경기, 일기).
  if ((primary.pos === 'noun' || primary.pos === '') && c.length >= 2 && c.endsWith('기')) {
    const cand = c.slice(0, -1) + '다';
    try {
      const v = await queryBd(cand);
      if (v.pos === 'verb' || v.pos === 'adjective') {
        return {
          surface: word,
          translation: primary.translation || v.translation,
          pos: v.pos,
          meanings: primary.meanings.length ? primary.meanings : v.meanings,
          infinitive: cand,
        };
      }
    } catch {
      /* ignore, fall through to normal handling */
    }
  }

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
const CACHE_PREFIX = 'wkr7:';

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

// Strict mode (default) keeps ONLY letters/numbers/whitespace and . ! ? — used
// for the displayed word chips. `keepPunct` additionally keeps , … ~ · and
// quotes: used for the sentence we send to Google, since commas/quotes are real
// translation cues we don't want to throw away.
export function cleanOcrText(text: string, opts?: { keepPunct?: boolean }): string {
  let s = text.replace(/\s+/g, ' ').trim();
  // Underscores are an OCR artifact (underlines / panel borders), never real
  // Korean text — drop them.
  s = s.replace(/_+/g, ' ');
  for (const [open, close] of BRACKET_PAIRS) s = removeUnmatchedPair(s, open, close);
  for (const q of SYMMETRIC_QUOTES) {
    const positions: number[] = [];
    for (let i = 0; i < s.length; i++) if (s[i] === q) positions.push(i);
    if (positions.length % 2 === 1) {
      const drop = positions[positions.length - 1];
      s = s.slice(0, drop) + s.slice(drop + 1);
    }
  }
  // Normalize CJK / fullwidth sentence enders to their ASCII forms, then strip
  // every other OCR-hallucinated symbol. Runs of dots collapse to an ellipsis.
  const strip = opts?.keepPunct
    ? /[^\p{L}\p{N}\s.!?,…~·"'’“”]/gu
    : /[^\p{L}\p{N}\s.!?]/gu;
  s = s
    .replace(/[。．｡]/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/[…⋯]/g, '...')
    .replace(strip, '')
    .replace(/\.{2,}/g, '...')
    .replace(/\s+([.!?])/g, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  // A lone standalone jamo (single ㄱ/ㅏ/ㅈ…) is almost always an OCR artifact
  // from a bubble outline, not real text. Drop single-jamo tokens, but keep
  // multi-jamo expressions like ㅋㅋ / ㅠㅠ which are intentional.
  return s
    .split(' ')
    .filter((t) => !/^[㄰-㆏ᄀ-ᇿ]$/u.test(t))
    .join(' ');
}

export async function analyze(text: string, segWords?: SegWord[]): Promise<AnalysisResult> {
  // Build, from Kiwi's word-units, three things:
  //  • tokens     — strict-cleaned clickable chips (. ! ? only)
  //  • morphs map — per token, for dictionary form / tense / POS
  //  • translationInput — the surfaces joined with spaces, i.e. CORRECTLY-spaced
  //    Korean with punctuation kept. OCR spacing is often wrong and Korean
  //    meaning depends on it, so re-spacing via Kiwi gives Google much better
  //    input than the raw OCR line.
  const tokens: string[] = [];
  const morphBySurface = new Map<string, SegMorph[]>();
  let translationInput: string;

  if (segWords && segWords.length) {
    const surfaces: string[] = [];
    for (const w of segWords) {
      const soft = w.surface.trim();
      if (!soft) continue;
      surfaces.push(soft);
      const token = cleanOcrText(w.surface); // strict — for the chip + lookup
      if (token) {
        tokens.push(token);
        if (!morphBySurface.has(token)) morphBySurface.set(token, w.morphs);
      }
    }
    translationInput = surfaces.join(' ');
  } else {
    // No segmentation: fall back to naive space-splitting of the cleaned text.
    translationInput = cleanOcrText(text, { keepPunct: true });
    for (const t of cleanOcrText(text).split(' ')) if (t) tokens.push(t);
  }

  // The displayed sentence is the strict-cleaned, Kiwi-respaced text so the
  // popover example highlight lines up with the chips.
  const clean =
    segWords && segWords.length ? tokens.join(' ') : cleanOcrText(text);
  const uniqueTokens = [...new Set(tokens)];

  const [sentenceTranslation, cached] = await Promise.all([
    translateSentence(translationInput).catch(() => ''),
    getCache(uniqueTokens),
  ]);

  const toFetch = uniqueTokens.filter((w) => !cached[w]);
  const fetched = await mapLimit(toFetch, 4, (w) =>
    lookupWord(w).catch((): WordInfo => ({ surface: w, translation: '', meanings: [], pos: '' }))
  );
  if (fetched.length) await putCache(fetched).catch(() => {});

  const byWord: Record<string, WordInfo> = { ...cached };
  for (const info of fetched) byWord[info.surface] = info;

  // Attach Kiwi-derived grammar (normal form, ending note, speech level). Kiwi's
  // lemma is more reliable than the Naver-based one, so prefer it when present.
  for (const surface of Object.keys(byWord)) {
    const g = wordGrammar(morphBySurface.get(surface));
    const info = byWord[surface];
    if (g.base && g.base !== surface) info.base = g.base;
    if (g.infinitive && g.infinitive !== surface) info.infinitive = g.infinitive;
    // Kiwi natively distinguishes Korean verb vs adjective — descriptive verbs
    // like 붉다 ("to be red") are VA → adjective, where Google's English-derived
    // bd POS is null and lookupWord's looksLikePredicate fallback blindly guesses
    // 'verb'. Trust Kiwi's POS whenever it has one; keep Google's as a fallback
    // (e.g. tokens Kiwi can't tag, where dt=bd did classify the lemma).
    if (g.pos) info.pos = g.pos;
    if (g.form) info.form = g.form;
    if (g.speechLevel) info.speechLevel = g.speechLevel;
  }

  // Preserve original token order (including duplicates).
  const words = tokens.map(
    (w) => byWord[w] ?? { surface: w, translation: '', meanings: [], pos: '' }
  );

  return { text: clean, sentenceTranslation, tone: detectTone(clean), words };
}
