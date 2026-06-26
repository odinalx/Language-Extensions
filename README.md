# Webtoon Korean Reader

A Chrome/Chromium extension that turns any Korean webtoon panel into a study tool.
Drag-select a speech bubble and it will:

- **OCR** the Korean text (bundled Tesseract `best` model — works fully offline, no API keys),
- **translate** the sentence and break it into words **colored by part of speech**,
- give each word a **pronunciation** (audio), meanings, dictionary form, and **Naver dictionary** links,
- let you **send words to Anki** as richly-formatted cards (word + audio + example sentence + audio), via the AnkiConnect add-on.

Everything works free and locally — no account, no paid services.

---

## Install

### Option A — Download & unpack (no build needed)

1. Go to the [**Releases**](https://github.com/odinalx/Language-Extensions/releases) page and download the latest `webtoon-korean-reader-*-chrome.zip`.
2. **Unzip** it anywhere (you'll get a folder containing `manifest.json`).
3. Open your browser and visit `chrome://extensions`.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.
6. Pin the **W** icon from the toolbar's puzzle-piece menu.

> The zip already contains the OCR model, so the extension works offline right after loading.

### Option B — Build from source

Requires [Node.js](https://nodejs.org/) 18+.

```bash
git clone https://github.com/odinalx/Language-Extensions.git
cd Language-Extensions
npm install        # postinstall downloads the Korean OCR model (~12 MB)
npm run build      # outputs .output/chrome-mv3/
```

Then load the **`.output/chrome-mv3`** folder via **Load unpacked** (steps 3–6 above).

After changing code, re-run `npm run build` and click the **↻ reload** icon on the
extension's card in `chrome://extensions`.

---

## Usage

1. Open a webtoon page (e.g. comic.naver.com).
2. Click the **W** toolbar icon → **Start Scanning**.
3. Drag a rectangle over a speech bubble.
4. Read the translation; **click any word** for its meaning, POS, pronunciation, and dictionary links.
5. Click **Add to Anki** on a word to queue a card, then **Send all to Anki** when you're done.

> Chrome can't screenshot `chrome://` pages, the Web Store, or PDFs — use it on a normal site.

---

## Anki setup (one time)

Cards are delivered through the [**AnkiConnect**](https://ankiweb.net/shared/info/2055492159) add-on.

1. In desktop Anki, install AnkiConnect (Tools → Add-ons → Get Add-ons → code `2055492159`) and restart.
2. Open the extension's **Settings** page (button in the popup). It shows the exact
   `chrome-extension://<id>` origin to copy.
3. In Anki: **Tools → Add-ons → AnkiConnect → Config**, add that origin to
   `webCorsOriginList`:
   ```json
   "webCorsOriginList": ["http://localhost", "chrome-extension://<your-id>"]
   ```
4. Keep Anki open while sending cards.

The extension auto-creates a **“Korean Reader”** note type (word, English, audio,
4 dictionaries, example sentence + audio). Set your target deck and an optional
“send each card immediately” toggle in Settings.

> The font on the cards uses the Nanum fonts. If your Anki profile doesn't already
> have them, drop `_NanumGothic-Regular.ttf`, `_NanumMyeongjo-Regular.ttf`,
> `_NanumPenScript-Regular.ttf` into your `collection.media` folder (free from
> [Google Fonts](https://fonts.google.com/?query=nanum)).

---

## Development

```bash
npm run dev    # launches Chromium with the extension + live reload
npm run build  # production build → .output/chrome-mv3/
npm run zip    # packaged zip → .output/webtoon-korean-reader-<version>-chrome.zip
```

To cut a release, run `npm run zip` and attach the generated zip to a GitHub Release.

---

## Optional: Naver Cloud (paid, off by default)

The reader works fully free with Tesseract OCR + Google voice/translation. For
higher-quality OCR and a more natural Korean voice you can wire in Naver Cloud
(CLOVA OCR + Clova Voice). That UI is hidden by default — flip `SHOW_NAVER_CLOUD`
to `true` in `entrypoints/options/App.tsx` to expose the key fields.

---

## Tech stack

WXT · TypeScript · React (popup/options) · Tesseract.js (`kor` best model, in an
offscreen document) · Google Translate (unofficial) for translation & POS ·
Web Speech / Naver / Google TTS for audio · AnkiConnect for card export.
