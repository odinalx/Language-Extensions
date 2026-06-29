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
  // Anki (via the AnkiConnect add-on running in desktop Anki).
  ankiConnectUrl: string; // e.g. "http://127.0.0.1:8765"
  ankiDeck: string;       // target deck name
  ankiAutoSend: boolean;  // push each card to Anki immediately instead of queueing
}

export const DEFAULT_SETTINGS: Settings = {
  ocrInvokeUrl: '',
  ocrSecret: '',
  voiceApiKeyId: '',
  voiceApiKey: '',
  voiceSpeaker: 'nara',
  ankiConnectUrl: 'http://127.0.0.1:8765',
  ankiDeck: 'Korean Reader',
  ankiAutoSend: false,
};

// One Anki card waiting in the session queue (or being sent directly).
export interface AnkiCardDraft {
  id: string;                  // unique queue id
  word: string;                // Korean word as it appears in the sentence (surface)
  base?: string;               // normal/dictionary form used for the Vocab field
  wordTranslation: string;     // primary English meaning
  meanings: string[];          // additional meanings
  wordPos: string;             // part of speech (may be '')
  infinitive?: string;         // dictionary form for verbs/adjectives
  sentence: string;            // the scanned sentence (example)
  sentenceTranslation: string; // its translation
  addedAt: number;             // timestamp
}

// Per-word analysis (translation + grammar).
export interface WordInfo {
  surface: string;       // the word as it appears in the text
  translation: string;   // primary English meaning
  meanings: string[];    // additional meanings (may be empty)
  pos: string;           // part of speech: 'noun' | 'verb' | 'adjective' | ... | ''
  infinitive?: string;   // Korean dictionary form for verbs/adjectives (e.g. 먹다)
  base?: string;         // normal form for ANY word (사과를→사과, 허락하다니→허락하다)
  form?: string;         // grammatical ending note (e.g. "-다니 — exclamatory (surprise)")
  speechLevel?: string;  // politeness/speech level (e.g. "casual (해체)")
}

// A morpheme produced by Kiwi (subset of its TokenInfo).
export interface SegMorph {
  str: string;
  tag: string;
}
// A reconstructed word-unit (어절): its surface plus the morphemes composing it.
export interface SegWord {
  surface: string;
  morphs: SegMorph[];
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

// background -> content script (user picked "Analyze selection" from the
// right-click menu — open the panel and analyze this already-selected text)
export interface AnalyzeSelection {
  type: 'ANALYZE_SELECTION';
  text: string;
}

// content script -> background (run the text pipeline on raw Korean text,
// skipping capture/OCR). Responds with CaptureResult / CaptureError.
export interface AnalyzeTextRequest {
  type: 'ANALYZE_TEXT';
  text: string;
}

// content script -> background: show/hide the "Analyze selection" menu item.
// Chrome can't filter context menus by content, so the content script reports
// whether the current selection contains Hangul and we toggle visibility.
export interface SetMenuVisible {
  type: 'SET_MENU_VISIBLE';
  visible: boolean;
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

// background -> offscreen document (Kiwi word segmentation)
export interface SegmentRequest {
  type: 'SEGMENT_REQUEST';
  target: 'offscreen';
  text: string;
}
export interface SegmentResult {
  type: 'SEGMENT_RESULT';
  words: SegWord[];
}
export interface SegmentError {
  type: 'SEGMENT_ERROR';
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

// content -> background: queue a card (auto-sends to Anki if that's enabled)
export interface AnkiAddRequest {
  type: 'ANKI_ADD';
  card: Omit<AnkiCardDraft, 'id' | 'addedAt'>;
}
export interface AnkiAddDone {
  type: 'ANKI_ADD_DONE';
  ok: boolean;
  queued: number;   // queue size after the operation
  sentNow: boolean; // true if it went straight into Anki (auto-send)
  message?: string;
}

// content/popup -> background: flush the whole queue into Anki
export interface AnkiSendAllRequest {
  type: 'ANKI_SEND_ALL';
}
export interface AnkiSendAllDone {
  type: 'ANKI_SEND_ALL_DONE';
  ok: boolean;
  added: number;
  failed: number;
  remaining: number; // cards still queued (the failures)
  message?: string;
}

// content/popup -> background: read the queue state
export interface AnkiQueueQuery {
  type: 'ANKI_QUEUE';
}
export interface AnkiQueueInfo {
  type: 'ANKI_QUEUE_INFO';
  count: number;
  autoSend: boolean;
}

// content/popup -> background: empty the queue
export interface AnkiClearRequest {
  type: 'ANKI_CLEAR';
}
export interface AnkiClearDone {
  type: 'ANKI_CLEAR_DONE';
  ok: boolean;
}

export type ExtensionMessage =
  | ActivateScan
  | AnalyzeSelection
  | AnalyzeTextRequest
  | SetMenuVisible
  | CaptureRequest
  | CaptureResult
  | CaptureError
  | OcrRequest
  | OcrResult
  | OcrError
  | SegmentRequest
  | SegmentResult
  | SegmentError
  | OcrProgress
  | TtsRequest
  | TtsDone
  | TtsPlay
  | AnkiAddRequest
  | AnkiAddDone
  | AnkiSendAllRequest
  | AnkiSendAllDone
  | AnkiQueueQuery
  | AnkiQueueInfo
  | AnkiClearRequest
  | AnkiClearDone;
