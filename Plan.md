# Webtoon Korean Reader — Master Plan

Single source of truth for [[CLAUDE|Webtoon Korean Reader]]. Your **flagship #1** (faster, plays to your web-dev strength, useful daily, serves [[Korean]]). [[03-Projects/rift-analytics/CLAUDE|Rift Analytics]] is paused until this ships.

> Goal of the project: a Chrome extension where you **drag a box over a Korean webtoon panel** → it OCRs the text → shows the words with **Naver dictionary links** and a **🔊 hear-it** button.

---

## 1. The core challenge & solution
Webtoons are **images, not selectable text**. Solution pipeline:
**Select box → screenshot the tab → crop → OCR → show text + dictionary links + TTS.**
Screenshotting the tab (not reading the image pixels) sidesteps the image CORS problem.

---

## 2. Tech stack (all of it)

| Layer | Tech | Notes |
|-------|------|-------|
| Platform | **Chrome Extension, Manifest V3** | service worker + content script |
| Language | **TypeScript** | your strength |
| Build/dev | **Vite** + **@crxjs/vite-plugin** | fast HMR for extensions |
| UI | **React** | popup/side panel (your strength) |
| Screenshot | `chrome.tabs.captureVisibleTab` | captures visible viewport as dataURL |
| Crop | **Canvas API** | crop to selection box (mind `devicePixelRatio`!) |
| OCR (image→Korean) | **Tesseract.js** (`kor`) | free, in-browser, MVP |
| OCR (upgrade) | **Naver CLOVA OCR** | Korean-optimized, free tier, for stylized fonts |
| Pronunciation (TTS) | **Web Speech API** (`speechSynthesis`, `lang='ko-KR'`) | built-in, free |
| Dictionary | **Naver Dict deep links** — `https://en.dict.naver.com/#/search?query=단어` | no API needed |
| Translation (later) | **Papago API** (Naver Cloud) | phrase meaning; or skip in MVP |
| Word splitting (later) | Korean morphological analyzer (API) | per-word; MVP = space/punct split |
| Storage | `chrome.storage` | save looked-up words (→ Anki export stretch, ties to [[Anki]]) |
| Permissions | `activeTab`, `scripting`, `storage` + host perms (webtoons.com, naver) | |

---

## 3. Architecture (data flow)
```
[Webtoon page]
   │ content script injects overlay + "Scan" button
   ▼
[User drags selection box]  ──coords──►  [service worker]
                                            │ chrome.tabs.captureVisibleTab()
                                            ▼
                                       [full screenshot dataURL]
   ◄────────────── cropped image ── Canvas crop (×devicePixelRatio)
   │
   ▼
[Tesseract.js OCR (kor)] ──► Korean text
   │
   ▼
[Panel UI (React)]:
   • recognized text
   • each word → Naver Dict link + 🔊 (speechSynthesis ko-KR)
   • (later) Papago translation, save word
```

---

## 4. Build roadmap (each phase = a working thing)

**Phase 0 — Hello extension (~half day)** *learn the MV3 skeleton*
- [ ] Scaffold: Vite + @crxjs/vite-plugin + React + TS
- [ ] `manifest.json` (MV3), load unpacked in `chrome://extensions`
- [ ] Popup that renders "Hello" → confirms the toolchain works

**Phase 1 — Capture a region (~1–2 days)** *the foundation*
- [ ] Content script: inject an overlay + "Scan" button
- [ ] Drag to draw a selection box (mouse events → rect coords)
- [ ] Service worker: `captureVisibleTab` → crop to box on a canvas (× `devicePixelRatio`)
- [ ] Show the cropped image in a panel → **prove capture works**

**Phase 2 — OCR (~2–3 days)** *the magic*
- [ ] Pipe the cropped image into **Tesseract.js** with `kor`
- [ ] Display the recognized Korean text
- [ ] Preprocess image (upscale, grayscale, threshold) to boost accuracy

**Phase 3 — Dictionary + TTS (~2 days)** *now it's useful*
- [ ] Split recognized text into words (space/punctuation for MVP)
- [ ] Each word → **Naver Dict link** + **🔊 button** (`speechSynthesis`, ko-KR)
- [ ] "Speak whole phrase" button

**▶ Phases 0–3 = the MVP. Ship/use it before adding more.**

**Phase 4 — Polish (stretch)**
- [ ] Papago translation of the phrase
- [ ] CLOVA OCR option for better accuracy
- [ ] Save words to `chrome.storage` → export to [[Anki]] (CSV) — links to your [[Korean-60-Day-Plan]]
- [ ] Per-word morpheme analysis

**Phase 5 — Ship**
- [ ] README + screenshots, package the extension
- [ ] Use it on real webtoons; optionally publish to Chrome Web Store
- [ ] Add to **odinalx.fr** + [[CV-English|CV]] (great talking point: "OCR + TTS Chrome extension")

---

## 5. What to learn (minimal — you know web dev)
- **Chrome Extensions MV3** — [official "Get started"](https://developer.chrome.com/docs/extensions/get-started) (service worker, content scripts, messaging)
- **@crxjs/vite-plugin** — [docs](https://crxjs.dev/vite-plugin) (scaffolding)
- **Tesseract.js** — [github/readme](https://github.com/naptha/tesseract.js) (the `recognize()` API + `kor`)
- **Web Speech API** — `window.speechSynthesis` + `SpeechSynthesisUtterance` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API))
- `chrome.tabs.captureVisibleTab` + Canvas crop — the one tricky bit (devicePixelRatio)

---

## 6. ▶ Start RIGHT NOW (first 30 min)
1. `npm create vite@latest webtoon-reader -- --template react-ts`
2. `npm i -D @crxjs/vite-plugin@beta` and set up the manifest (I can write this config for you)
3. Load unpacked in `chrome://extensions` (Developer mode on)
4. Get the popup rendering → Phase 0 done.

> Rule: ship Phases 0–3 (the MVP) before touching translation/Anki/polish. → [[Consistency]] · [[Podcast-Notes-McConaughey|"don't half-ass it"]]. GitHub from commit 1.

**Want me to write the Phase 0 starter** — `manifest.json` + Vite config + the capture-and-crop code? Just ask.
