// Free Naver pronunciation audio from the Korean dictionary (no account needed).
// Only works for dictionary headwords with a recorded pronunciation; callers
// should fall back to another TTS when this returns null.

function stripTags(s: string): string {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '').trim();
}

// Returns a signed .mp3 URL for the word, or null if the dictionary has no
// exact-match pronunciation for it.
export async function naverWordAudioUrl(word: string): Promise<string | null> {
  const q = word.trim();
  if (!q || /\s/.test(q)) return null; // single words only

  const url = `https://ko.dict.naver.com/api3/koko/search?query=${encodeURIComponent(q)}&m=pc&range=word`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const text = await res.text();
  if (!text) return null; // the API occasionally returns an empty body

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const items: any[] = json?.searchResultMap?.searchResultListMap?.WORD?.items ?? [];
  // Only trust audio when the top entry is an exact match for the queried word,
  // so inflected forms don't get the dictionary lemma's pronunciation instead.
  const match = items.find(
    (it) => it?.handleEntry === q || stripTags(it?.expEntry) === q
  );
  if (!match) return null;

  const file = (match.searchPhoneticSymbolList ?? []).find(
    (s: any) => s?.symbolFile
  )?.symbolFile;
  return file || null;
}

// Best-effort Korean dictionary form (e.g. 먹어요 → 먹다). Returns null on any
// failure so callers can silently skip it.
export async function naverLemma(word: string): Promise<string | null> {
  const q = word.trim();
  if (!q || /\s/.test(q)) return null;

  const url = `https://ko.dict.naver.com/api3/koko/search?query=${encodeURIComponent(q)}&m=pc&range=word`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const top = json?.searchResultMap?.searchResultListMap?.WORD?.items?.[0];
  if (!top) return null;
  const lemma = stripTags(top.expEntry || top.handleEntry || '');
  // Only trust dictionary forms of predicates (end in 다).
  return lemma && /다$/.test(lemma) ? lemma : null;
}
