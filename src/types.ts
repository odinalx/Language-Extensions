export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

// Naver Cloud credentials (one account powers both services).
export interface Settings {
  ocrInvokeUrl: string;   // CLOVA OCR APIGW invoke URL
  ocrSecret: string;      // CLOVA OCR X-OCR-SECRET
  voiceApiKeyId: string;  // Clova Voice X-NCP-APIGW-API-KEY-ID
  voiceApiKey: string;    // Clova Voice X-NCP-APIGW-API-KEY
  voiceSpeaker: string;   // e.g. "nara"
}

export const DEFAULT_SETTINGS: Settings = {
  ocrInvokeUrl: '',
  ocrSecret: '',
  voiceApiKeyId: '',
  voiceApiKey: '',
  voiceSpeaker: 'nara',
};

// Per-word analysis (translation + grammar).
export interface WordInfo {
  surface: string;       // the word as it appears in the text
  translation: string;   // primary English meaning
  meanings: string[];    // additional meanings (may be empty)
  pos: string;           // part of speech: 'noun' | 'verb' | 'adjective' | ... | ''
  infinitive?: string;   // Korean dictionary form for verbs/adjectives (e.g. 먹다)
}

export interface AnalysisResult {
  text: string;                 // recognized Korean text
  sentenceTranslation: string;  // whole-phrase translation
  tone: string;                 // heuristic politeness/tone of the phrase
  words: WordInfo[];
}

// content script -> background
export interface CaptureRequest {
  type: 'CAPTURE_REQUEST';
  rect: SelectionRect;
}

// background -> content script (response to CaptureRequest)
export interface CaptureResult {
  type: 'CAPTURE_RESULT';
  analysis: AnalysisResult;
}
export interface CaptureError {
  type: 'CAPTURE_ERROR';
  message: string;
}

// background -> content script (activate the drag overlay)
export interface ActivateScan {
  type: 'ACTIVATE_SCAN';
}

// background -> offscreen document (OCR)
export interface OcrRequest {
  type: 'OCR_REQUEST';
  target: 'offscreen';
  imageDataUrl: string;
}
export interface OcrResult {
  type: 'OCR_RESULT';
  text: string;
}
export interface OcrError {
  type: 'OCR_ERROR';
  message: string;
}

// offscreen -> all contexts (progress while OCR runs)
export interface OcrProgress {
  type: 'OCR_PROGRESS';
  status: string;
  progress: number; // 0..1
}

// content script -> background (request spoken audio for some Korean text)
export interface TtsRequest {
  type: 'TTS_REQUEST';
  text: string;
}
export interface TtsDone {
  type: 'TTS_DONE';
  ok: boolean;
  message?: string;
}

// background -> offscreen document (play fetched audio)
export interface TtsPlay {
  type: 'TTS_PLAY';
  target: 'offscreen';
  audioDataUrl: string;
}

export type ExtensionMessage =
  | ActivateScan
  | CaptureRequest
  | CaptureResult
  | CaptureError
  | OcrRequest
  | OcrResult
  | OcrError
  | OcrProgress
  | TtsRequest
  | TtsDone
  | TtsPlay;
