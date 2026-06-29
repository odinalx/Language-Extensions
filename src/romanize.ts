// Approximate phonetic pronunciation (romanization) for Korean.
//
// Decomposes each Hangul syllable block into its initial / medial / final jamo
// and maps them to Latin per syllable, joining syllables with "-". This is a
// simple reading hint, NOT full Revised Romanization — it does not apply
// sound-change rules (liaison, assimilation), so a syllable-final ㄱ stays "g"
// rather than becoming "k". e.g. 속에서 → "sog-e-seo", 안녕 → "an-nyeong".
// Non-Hangul characters pass through unchanged.

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

// Initial consonants (19) — also used for finals so they read as their plain
// consonant value (ㄱ → "g"), matching the per-syllable hint style.
const CHO = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp',
  's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];

// Medial vowels (21).
const JUNG = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];

// Final consonants (28, index 0 = no final). ㅇ as a final reads "ng".
const JONG = [
  '', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls',
  'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h',
];

/** Romanize a single Korean word/token. Non-Hangul characters are kept as-is. */
export function romanize(word: string): string {
  const out: string[] = [];
  for (const ch of word) {
    const code = ch.codePointAt(0)!;
    if (code < SYLLABLE_BASE || code > SYLLABLE_LAST) {
      out.push(ch);
      continue;
    }
    const s = code - SYLLABLE_BASE;
    const cho = Math.floor(s / 588);
    const jung = Math.floor((s % 588) / 28);
    const jong = s % 28;
    out.push(CHO[cho] + JUNG[jung] + JONG[jong]);
  }
  // Join consecutive romanized syllables with hyphens; keep pass-through chars
  // (spaces, punctuation) attached as they are.
  return out
    .map((part, i) => (i > 0 && isSyllable(out[i - 1]) && isSyllable(part) ? '-' + part : part))
    .join('');
}

// A romanized chunk is a syllable if it came from the tables (lowercase a–z only).
function isSyllable(part: string): boolean {
  return /^[a-z]+$/.test(part);
}
