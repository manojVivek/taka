import type { SessionData } from '@taka/types';

export class SessionUploader {
  constructor(private uploadUrl: string) {}

  getUploadUrl(): string {
    return this.uploadUrl;
  }

  async upload(sessionData: SessionData): Promise<void> {
    try {
      const response = await fetch(this.uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Taka] Session data uploaded successfully:', result);
    } catch (error) {
      console.error('[Taka] Failed to upload session data:', error);
      throw error;
    }
  }

  uploadSync(sessionData: SessionData): void {
    // Use sendBeacon for synchronous upload during page unload
    if ('sendBeacon' in navigator) {
      const success = navigator.sendBeacon(this.uploadUrl, JSON.stringify(sessionData));

      if (!success) {
        console.warn('[Taka] Failed to send beacon');
      }
    } else {
      // Fallback to synchronous XHR (not recommended)
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', this.uploadUrl, false); // synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(sessionData));

        if (xhr.status >= 400) {
          console.warn('[Taka] Synchronous upload failed:', xhr.status, xhr.statusText);
        }
      } catch (error) {
        console.error('[Taka] Synchronous upload error:', error);
      }
    }
  }
}
