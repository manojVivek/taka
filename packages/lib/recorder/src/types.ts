import type { RecorderConfig, SessionData, SessionEvent, NetworkRequest, StorageSnapshot } from '@taka/types';

export interface RecorderInstance {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  identify(userId: string): void;
  getSessionId(): string;
  isRecording(): boolean;
}

export interface EventBuffer {
  events: SessionEvent[];
  networkRequests: NetworkRequest[];
  lastUpload: number;
}

export interface RecorderState {
  sessionId: string;
  isRecording: boolean;
  isPaused: boolean;
  startTime: number;
  userId?: string;
  storageSnapshot?: StorageSnapshot;
  config: RecorderConfig;
  buffer: EventBuffer;
}