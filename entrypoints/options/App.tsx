import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../../src/types';
import { getSettings, saveSettings, hasOcrCreds, hasVoiceCreds } from '../../src/settings';

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
        Optional. Leave blank to use the free defaults (Tesseract OCR + Google voice).
        Add Naver Cloud keys for higher-quality Korean OCR and a natural Korean voice.
      </p>

      <section>
        <div className="sec-head">
          <h2>CLOVA OCR</h2>
          <span className={hasOcrCreds(settings) ? 'badge on' : 'badge'}>
            {hasOcrCreds(settings) ? 'active' : 'using Tesseract'}
          </span>
        </div>
        <p className="hint">
          Naver Cloud → Services → <strong>CLOVA OCR</strong>. Create a Domain (General),
          then copy its <em>APIGW Invoke URL</em> and <em>Secret Key</em>.
        </p>
        <label>
          Invoke URL
          <input
            type="text"
            placeholder="https://xxxxx.apigw.ntruss.com/custom/v1/.../general"
            value={settings.ocrInvokeUrl}
            onChange={(e) => update({ ocrInvokeUrl: e.target.value })}
          />
        </label>
        <label>
          Secret Key
          <input
            type="password"
            placeholder="X-OCR-SECRET"
            value={settings.ocrSecret}
            onChange={(e) => update({ ocrSecret: e.target.value })}
          />
        </label>
      </section>

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

      <div className="actions">
        <button className="save" onClick={onSave}>Save</button>
        {saved && <span className="saved-note">Saved ✓</span>}
      </div>
    </div>
  );
}
