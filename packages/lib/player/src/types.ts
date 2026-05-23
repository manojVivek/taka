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
}

export interface PlaybackResult {
  sessionId: string;
  success: boolean;
  screenshots: ScreenshotMeta[];
  errors?: string[];
  duration: number;
}
