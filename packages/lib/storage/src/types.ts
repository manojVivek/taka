import type { SessionData, TestResult } from '@taka/types';

export interface SessionSummary {
  id: string;
  url: string;
  timestamp: number;
  eventCount: number;
  networkRequestCount: number;
  userAgent: string;
  title?: string;
  userId?: string;
  size: number;
  hasBaseline?: boolean;
}

export interface ScreenshotRef {
  filename: string;
  eventIndex: number;
  size: number;
  timestamp?: number;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'eventCount';
  sortOrder?: 'asc' | 'desc';
}

export interface ListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SessionStats {
  totalSessions: number;
  totalEvents: number;
  totalNetworkRequests: number;
  totalSize: number;
  averageEventsPerSession: number;
  oldestSession?: Date;
  newestSession?: Date;
}

export interface DiffReportEntry {
  id: string;
  baseEventIndex: number;
  headEventIndex: number;
  pixelDifference: number;
  percentageDifference: number;
  threshold: number;
  passed: boolean;
  diffFilename?: string;
}

export interface DiffReport {
  timestamp: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgPixelDifference: number;
  };
  diffs: DiffReportEntry[];
}

export interface Storage {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // --- User sessions ---
  saveSession(session: SessionData): Promise<void>;
  getSession(id: string): Promise<SessionData | null>;
  listSessions(opts?: ListOptions): Promise<ListResult<SessionSummary>>;
  deleteSession(id: string): Promise<boolean>;
  searchSessions(query: string): Promise<SessionSummary[]>;
  getSessionStats(): Promise<SessionStats>;

  // --- Baselines (per session) ---
  hasBaseline(sessionId: string): Promise<boolean>;
  setBaselineFlag(sessionId: string, testId: string): Promise<void>;
  putBaselineScreenshot(sessionId: string, filename: string, bytes: Buffer): Promise<void>;
  listBaselineScreenshots(sessionId: string): Promise<ScreenshotRef[]>;
  getBaselineScreenshot(sessionId: string, filename: string): Promise<Buffer | null>;

  // --- Test runs ---
  saveTestResult(testId: string, result: TestResult): Promise<void>;
  getTestResult(testId: string): Promise<TestResult | null>;

  putTestScreenshot(testId: string, filename: string, bytes: Buffer): Promise<void>;
  listTestScreenshots(testId: string): Promise<ScreenshotRef[]>;
  getTestScreenshot(testId: string, filename: string): Promise<Buffer | null>;

  putTestDiff(testId: string, filename: string, bytes: Buffer): Promise<void>;
  listTestDiffs(testId: string): Promise<ScreenshotRef[]>;
  getTestDiff(testId: string, filename: string): Promise<Buffer | null>;

  putTestDiffReport(testId: string, report: DiffReport): Promise<void>;
}

export interface FileStorageConfig {
  userSessionsPath: string;
  testSessionsPath: string;
}

export type StorageKind = 'file' | 'logOnly';
