import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

export function hasOcrCreds(s: Settings): boolean {
  return Boolean(s.ocrInvokeUrl.trim() && s.ocrSecret.trim());
}

export function hasVoiceCreds(s: Settings): boolean {
  return Boolean(s.voiceApiKeyId.trim() && s.voiceApiKey.trim());
}
