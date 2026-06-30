import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../src/types';
import { getSettings, saveSettings, hasVoiceCreds } from '../../src/settings';

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSaved(false);
  };

  const onSave = async () => {
    await saveSettings(settings);
    setSaved(true);
  };

  return (
    <div className="page">
      <h1>Korean Reader — Settings</h1>
      <p className="lead">
        Set up sending words to Anki. The reader works out of the box with free
        OCR and voice — no keys needed.
      </p>

      {SHOW_NAVER_CLOUD && (<>
      <section>
        <div className="sec-head">
          <h2>Clova Voice (pronunciation)</h2>
          <span className={hasVoiceCreds(settings) ? 'badge on' : 'badge'}>
            {hasVoiceCreds(settings) ? 'active' : 'using Google TTS'}
          </span>
        </div>
        <p className="hint">
          Naver Cloud → Services → <strong>Clova Voice (Premium)</strong>. Register an
          application, then copy its <em>API Key ID</em> and <em>API Key</em>.
        </p>
        <label>
          API Key ID
          <input
            type="text"
            placeholder="X-NCP-APIGW-API-KEY-ID"
            value={settings.voiceApiKeyId}
            onChange={(e) => update({ voiceApiKeyId: e.target.value })}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            placeholder="X-NCP-APIGW-API-KEY"
            value={settings.voiceApiKey}
            onChange={(e) => update({ voiceApiKey: e.target.value })}
          />
        </label>
        <label>
          Voice
          <select
            value={settings.voiceSpeaker}
            onChange={(e) => update({ voiceSpeaker: e.target.value })}
          >
            <option value="nara">nara (female)</option>
            <option value="nminyoung">nminyoung (female)</option>
            <option value="nyejin">nyejin (female)</option>
            <option value="njihun">njihun (male)</option>
            <option value="njinho">njinho (male)</option>
          </select>
        </label>
      </section>
      </>)}

      <section>
        <div className="sec-head">
          <h2>Anki cards</h2>
          <span className="badge on">AnkiConnect</span>
        </div>
        <p className="hint">
          Add words and example sentences to <strong>Anki</strong> straight from the
          result panel. Requires desktop Anki running with the free{' '}
          <a href="https://ankiweb.net/shared/info/2055492159" target="_blank" rel="noreferrer">
            AnkiConnect
          </a>{' '}
          add-on. <strong>One-time setup:</strong> in Anki, open{' '}
          <em>Tools → Add-ons → AnkiConnect → Config</em> and add this extension's
          origin to <code>webCorsOriginList</code>:
        </p>
        <pre className="origin-box">
{`"webCorsOriginList": [
    "http://localhost",
    "${extensionOrigin}"
]`}
        </pre>
        <label>
          AnkiConnect URL
          <input
            type="text"
            placeholder="http://127.0.0.1:8765"
            value={settings.ankiConnectUrl}
            onChange={(e) => update({ ankiConnectUrl: e.target.value })}
          />
        </label>
        <label>
          Deck name
          <input
            type="text"
            placeholder="Korean Reader"
            value={settings.ankiDeck}
            onChange={(e) => update({ ankiDeck: e.target.value })}
          />
          <span className="field-hint">
            Cards use a “Korean Reader” note type that the extension creates
            automatically (Vocab, English, sound, 4 dictionaries, example sentence).
          </span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.ankiAutoSend}
            onChange={(e) => update({ ankiAutoSend: e.target.checked })}
          />
          Send each card to Anki immediately (otherwise they wait in a queue you flush with “Send all to Anki”).
        </label>
      </section>

      <div className="actions">
        <button className="save" onClick={onSave}>Save</button>
        {saved && <span className="saved-note">Saved ✓</span>}
      </div>
    </div>
  );
}

const extensionOrigin = `chrome-extension://${chrome.runtime.id}`;

// Naver Clova Voice settings are set aside for now — the code stays but the UI
// is hidden. Flip to true to bring the section back.
const SHOW_NAVER_CLOUD = false;
