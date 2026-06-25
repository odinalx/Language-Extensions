import { useState } from 'react';
import type { ExtensionMessage } from '../../src/types';

type Status = 'idle' | 'activating' | 'error';

export function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const startScan = async () => {
    setStatus('activating');
    setError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found.');
      await browser.tabs.sendMessage(tab.id, { type: 'ACTIVATE_SCAN' } satisfies ExtensionMessage);
      window.close();
    } catch (e) {
      const msg = String(e);
      // Content script not yet injected (page loaded before extension)
      if (msg.includes('Could not establish connection')) {
        setError('Reload the page first, then try again.');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  };

  return (
    <div className="app">
      <div className="logo">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
          <path d="M9 3v16" />
        </svg>
      </div>
      <h1 className="title">Korean Reader</h1>
      <p className="sub">Scan a webtoon speech bubble to extract and translate Korean text.</p>

      <button
        className="scan-btn"
        onClick={startScan}
        disabled={status === 'activating'}
      >
        {status === 'activating' ? (
          'Activating…'
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h2l1.5-2h7L19 5h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <circle cx="13" cy="12" r="3.5" />
            </svg>
            Start Scanning
          </>
        )}
      </button>

      {status === 'error' && <div className="error">{error}</div>}

      <div className="hint">
        <strong>How to use:</strong>
        <ol>
          <li>Open a webtoon page</li>
          <li>Click "Start Scanning"</li>
          <li>Drag over a speech bubble</li>
          <li>Click words to look them up</li>
        </ol>
      </div>

      <button className="settings-link" onClick={() => browser.runtime.openOptionsPage()}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Naver Cloud settings
      </button>
    </div>
  );
}
