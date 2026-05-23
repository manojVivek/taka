'use client';

import { useEffect, useRef } from 'react';

export function RecorderProvider() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Skip recording during test replays (flag set by Player via evaluateOnNewDocument)
    if ((window as any).__taka_replay) {
      console.log('[Test App] Replay mode detected, skipping recorder');
      return;
    }

    async function initRecorder() {
      try {
        const { TakaRecorder } = await import('@taka/recorder');
        const recorder = TakaRecorder.init({
          apiEndpoint: 'http://localhost:3001/api',
          uploadInterval: 5000,
          maxBatchSize: 50,
          enableNetworkCapture: true,
          enableStorageCapture: true,
          captureConsole: false,
        });
        console.log('[Test App] Recorder initialized, session:', recorder.getSessionId());
        (window as any).__takaRecorder = recorder;
      } catch (err) {
        console.error('[Test App] Failed to init recorder:', err);
      }
    }

    initRecorder();
  }, []);

  return null;
}
