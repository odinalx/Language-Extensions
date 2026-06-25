import type { Settings } from './types';

// Naver CLOVA OCR + Clova Voice. Called from the background service worker,
// which has host_permissions for *.apigw.ntruss.com so requests bypass page CORS.

// ---------------------------------------------------------------------------
// CLOVA OCR — image (base64) → Korean text
// ---------------------------------------------------------------------------

export async function clovaOcr(imageDataUrl: string, settings: Settings): Promise<string> {
  const data = imageDataUrl.slice(imageDataUrl.indexOf(',') + 1);
  const format = /^data:image\/(\w+)/.exec(imageDataUrl)?.[1] ?? 'png';

  const res = await fetch(settings.ocrInvokeUrl, {
    method: 'POST',
    headers: {
      'X-OCR-SECRET': settings.ocrSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'V2',
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      lang: 'ko',
      images: [{ format, name: 'webtoon', data }],
    }),
  });

  if (!res.ok) {
    throw new Error(`CLOVA OCR HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  const fields = json?.images?.[0]?.fields ?? [];
  let text = '';
  for (const f of fields) {
    text += (f.inferText ?? '');
    text += f.lineBreak ? '\n' : ' ';
  }
  return text.trim();
}

// ---------------------------------------------------------------------------
// Clova Voice — Korean text → spoken audio (mp3 data URL)
// ---------------------------------------------------------------------------

export async function clovaTts(text: string, settings: Settings): Promise<string> {
  const res = await fetch(
    'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts',
    {
      method: 'POST',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': settings.voiceApiKeyId,
        'X-NCP-APIGW-API-KEY': settings.voiceApiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        speaker: settings.voiceSpeaker || 'nara',
        text: text.slice(0, 1000),
        format: 'mp3',
        speed: '0',
        volume: '0',
        pitch: '0',
      }).toString(),
    }
  );

  if (!res.ok) {
    throw new Error(`Clova Voice HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  const chunk = 8192;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, Math.min(i + chunk, buf.length)));
  }
  return 'data:audio/mp3;base64,' + btoa(bin);
}
