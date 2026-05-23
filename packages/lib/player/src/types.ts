import type { SessionData, Screenshot } from '@taka/types';

export interface PlayerConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  timeout?: number;
}

export interface ReplayOptions {
  screenshotOutputPath?: string;
}

export interface PlaybackResult {
  sessionId: string;
  success: boolean;
  screenshots: Screenshot[];
  errors?: string[];
  duration: number;
}