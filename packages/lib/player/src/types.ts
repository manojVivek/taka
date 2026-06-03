export interface PlayerConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  timeout?: number;
}

export interface ScreenshotMeta {
  filename: string;
  eventIndex: number;
  eventType: string;
  timestamp: number;
}

export type ScreenshotSink = (meta: ScreenshotMeta, bytes: Buffer) => Promise<void>;

export interface ReplayOptions {
  onScreenshot?: ScreenshotSink;
  /**
   * Replay the session against this origin instead of the one it was recorded
   * on (e.g. a preview deployment). Same-origin URLs are rebased onto it;
   * cross-origin URLs are left as recorded. A normalized origin like
   * `https://preview.example.com`. Absent → replay on the recorded origin.
   */
  targetOrigin?: string;
}

export interface PlaybackResult {
  sessionId: string;
  success: boolean;
  screenshots: ScreenshotMeta[];
  errors?: string[];
  duration: number;
}
