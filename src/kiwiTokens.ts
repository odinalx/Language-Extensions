// Reconstruct Korean word-units (어절) from Kiwi morpheme tokens.
//
// Kiwi splits text into morphemes (e.g. 그녀/NP 는/JX 어둠/NNG 속/NNG 에서/JKB …).
// For a reader we want clickable WORD units, not grammatical morphemes, so we
// regroup: a new word starts at every "head" morpheme (noun/verb/adverb/…), and
// every following dependent morpheme (particle 조사, ending 어미, suffix, copula)
// attaches to it. We then slice the ORIGINAL text by position so contracted
// surfaces (부르+었+다 → 불렀다) come out as they actually appear, and carry the
// morphemes of each unit along so callers can derive its dictionary form, tense
// and speech level (see src/grammar.ts).

import type { SegWord } from './types';

/** Minimal shape of a Kiwi token (subset of kiwi-nlp's TokenInfo). */
export interface KiwiToken {
  str: string;
  position: number;
  length: number;
  tag: string;
}

// A "head" morpheme begins a new word-unit. Everything else (J* 조사, E* 어미,
// XS* 접미사, VC* 지정사/copula, punctuation) attaches to the current unit.
const HEAD = /^(NN|NR|NP|VV|VA|VX|MM|MA|IC|XR|XPN|SL|SH|SN|SW)/;

function isHead(tag: string): boolean {
  return HEAD.test(tag);
}

/**
 * Group morpheme `tokens` (over `text`) into word-units. Each unit carries its
 * surface (sliced from the ORIGINAL text by position) and the morphemes that
 * compose it. Falls back gracefully: tokens are sorted by position; a whitespace
 * gap in the original text always forces a new unit.
 */
export function groupEojeol(text: string, tokens: KiwiToken[]): SegWord[] {
  const sorted = [...tokens].sort((a, b) => a.position - b.position);
  const groups: { s: number; e: number; morphs: KiwiToken[] }[] = [];
  let cur: { s: number; e: number; morphs: KiwiToken[] } | null = null;

  for (const t of sorted) {
    const start = t.position;
    const end = t.position + t.length;
    const gap = cur ? text.slice(cur.e, start).trim() !== '' : false;
    if (!cur || isHead(t.tag) || gap) {
      if (cur) groups.push(cur);
      cur = { s: start, e: end, morphs: [t] };
    } else {
      cur.e = Math.max(cur.e, end);
      cur.morphs.push(t);
    }
  }
  if (cur) groups.push(cur);

  return groups
    .map((g) => ({
      surface: text.slice(g.s, g.e).trim(),
      morphs: g.morphs.map((m) => ({ str: m.str, tag: m.tag })),
    }))
    .filter((u) => u.surface !== '');
}
