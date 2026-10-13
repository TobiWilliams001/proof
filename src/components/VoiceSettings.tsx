'use client';

import { useEffect, useState } from 'react';
import { WAKE_KEY, wakeSupported } from '@/lib/voice/useWakeWord';
import { openVoice } from './VoiceCommand';

/** Voice settings: the talk button always works; "Hey Proof" is opt-in and only while Proof is open. */
export function VoiceSettings() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    // Checking the browser and the saved choice after mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupported(wakeSupported());
    try {
      setOn(localStorage.getItem(WAKE_KEY) === '1');
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(WAKE_KEY, next ? '1' : '0');
    } catch {}
    window.dispatchEvent(new Event('proof:wake-setting'));
  };

  return (
    <div className="list">
      <button className="list-item" onClick={() => openVoice()}>
        <span style={{ flex: 1 }}>
          Talk to Proof
          <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
            Tap the sound-wave button anywhere, then say a note, a question, a rule or where to go.
          </span>
        </span>
      </button>
      <div className="list-item">
        <span style={{ flex: 1, minWidth: 0 }}>
          Listen for “Hey Proof”
          <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
            {supported
              ? 'Only while Proof is open on this screen. Nothing is recorded. A green dot shows when it’s listening.'
              : 'Not available in this browser. On iPhone, tap the sound-wave button instead.'}
          </span>
        </span>
        <button className="switch" role="switch" aria-checked={on && supported} aria-label="Listen for Hey Proof" disabled={!supported} onClick={toggle} />
      </div>
    </div>
  );
}
