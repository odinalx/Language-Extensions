// Derive a word-unit's normal (dictionary) form, grammatical-ending note and
// speech level from its Kiwi morphemes. Pure + dependency-free so it can be unit
// tested in Node. Kiwi uses a Sejong-style tagset:
//   N* nouns · V* predicates (VV verb, VA adjective, VX aux) · VCP/VCN copula
//   J* particles (조사) · E* endings (EP 선어말, EF 종결, EC 연결, ETN/ETM 전성)
//   XSV/XSA verb/adjective-deriving suffixes (하다 etc.) · S* symbols
import type { SegMorph } from './types';

const isParticle = (t: string) => t.startsWith('J');
const isEnding = (t: string) => t.startsWith('E');
const isCopula = (t: string) => t === 'VCP' || t === 'VCN';
const isPredStem = (t: string) => /^(VV|VA|VX)/.test(t) || t === 'XSV' || t === 'XSA';
// S* are symbols; SL (foreign), SH (hanja) and SN (number) are real content.
const isPunct = (t: string) => t.startsWith('S') && !['SL', 'SH', 'SN'].includes(t);

export interface WordGrammar {
  base?: string;        // normal form for any word (사과를→사과, 허락하다니→허락하다)
  infinitive?: string;  // dictionary form when the word is a predicate (verb/adj)
  pos?: string;         // part-of-speech derived from Kiwi (verb/adjective/noun/…)
  form?: string;        // ending note, e.g. "past · -다니 — exclamatory (surprise)"
  speechLevel?: string; // e.g. "casual (해체)"
}

// Map a Kiwi morpheme tag to one of our POS labels (the set posColor() knows).
function tagToPos(tag: string): string | undefined {
  if (/^VA/.test(tag) || tag === 'XSA') return 'adjective';
  if (/^(VV|VX)/.test(tag) || tag === 'XSV') return 'verb';
  if (tag === 'NP') return 'pronoun';
  if (tag === 'NR' || tag === 'SN') return 'numeral';
  if (/^NN/.test(tag) || tag === 'XR') return 'noun';
  if (/^MAG|^MAJ/.test(tag)) return 'adverb';
  if (tag === 'MM') return 'determiner';
  if (tag === 'IC') return 'interjection';
  return undefined;
}

// Final/connective endings → a short human description of what they convey.
const ENDING_NOTES: Record<string, string> = {
  다니: 'exclamatory — surprise or disbelief',
  네: 'realization / mild surprise',
  군: 'realization / exclamation',
  구나: 'realization / exclamation',
  더라: 'retrospective — recalling something witnessed',
  잖아: 'reminding — "you know"',
  지: 'seeking agreement / softening',
  을까: 'wondering / suggestion',
  ㄹ까: 'wondering / suggestion',
  까: 'asking / wondering',
  자: 'proposal — "let\'s"',
  아라: 'command (imperative)',
  어라: 'command (imperative)',
  라: 'command (imperative)',
  세요: 'polite request / honorific',
  으세요: 'polite request / honorific',
  습니다: 'formal statement',
  ㅂ니다: 'formal statement',
  어요: 'polite statement',
  아요: 'polite statement',
  요: 'polite ending',
  다: 'plain statement (declarative)',
  고: 'connective — "and / that"',
  서: 'connective — cause / sequence',
  아서: 'connective — cause / sequence',
  어서: 'connective — cause / sequence',
  면: 'connective — "if"',
  는데: 'connective — background / contrast',
  지만: 'connective — "but"',
};

// Coarse fallback by ending class when the surface isn't in the table.
function classNote(tag: string): string {
  if (tag.startsWith('EF')) return 'sentence-final ending';
  if (tag.startsWith('EC')) return 'connective ending';
  if (tag.startsWith('ETN')) return 'nominalizing ending';
  if (tag.startsWith('ETM')) return 'adnominal (modifier) ending';
  return 'ending';
}

function speechLevel(endingStr: string): string {
  if (/(습니다|ㅂ니다|습니까|ㅂ니까|십시오|읍시다)/.test(endingStr)) return 'formal (합쇼체)';
  if (/요$/.test(endingStr)) return 'polite (해요체)';
  if (/(아라|어라|라|자)$/.test(endingStr)) return 'imperative / proposal (해라체)';
  return 'casual (해체)';
}

export function wordGrammar(morphs: SegMorph[] | undefined): WordGrammar {
  if (!morphs || morphs.length === 0) return {};

  // The stem is everything that is NOT a particle, ending, copula or symbol.
  const stem = morphs.filter(
    (m) => !isParticle(m.tag) && !isEnding(m.tag) && !isCopula(m.tag) && !isPunct(m.tag)
  );
  const last = stem[stem.length - 1];

  const out: WordGrammar = {};
  if (last && isPredStem(last.tag)) {
    out.base = stem.map((m) => m.str).join('') + '다';
    out.infinitive = out.base;
    out.pos = tagToPos(last.tag); // verb / adjective
  } else if (stem.length) {
    out.base = stem.map((m) => m.str).join('');
    out.pos = tagToPos(stem[0].tag); // noun / pronoun / adverb / …
  }

  // Ending note: pre-final markers (tense/honorific) + the final ending.
  const endings = morphs.filter((m) => isEnding(m.tag));
  if (endings.length) {
    const endingStr = endings.map((m) => m.str).join('');
    const parts: string[] = [];
    if (/(었|았|였)/.test(endingStr)) parts.push('past tense');
    if (/겠/.test(endingStr)) parts.push('intention / conjecture (겠)');
    if (/시/.test(endingStr) && endings.some((m) => m.tag.startsWith('EP') && m.str === '시'))
      parts.push('honorific (시)');

    // Prefer the final (EF) ending, else the last non-pre-final ending.
    const finalEnding =
      endings.find((m) => m.tag.startsWith('EF')) ??
      [...endings].reverse().find((m) => !m.tag.startsWith('EP')) ??
      endings[endings.length - 1];
    const note = ENDING_NOTES[finalEnding.str] ?? classNote(finalEnding.tag);
    parts.push(`-${finalEnding.str} — ${note}`);

    out.form = parts.join(' · ');
    out.speechLevel = speechLevel(endingStr);
  }

  return out;
}
