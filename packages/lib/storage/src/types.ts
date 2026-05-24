import type { Project, SessionData, TestResult } from '@taka/types';

export interface SessionSummary {
  id: string;
  projectId: string;
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

export interface ProjectUpdate {
  name?: string;
  description?: string;
}

export interface Storage {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // --- Projects ---
  createProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  updateProject(id: string, updates: ProjectUpdate): Promise<boolean>;
  deleteProject(id: string): Promise<boolean>;

  // --- User sessions (project-scoped) ---
  saveSession(projectId: string, session: SessionData): Promise<void>;
  getSession(projectId: string, id: string): Promise<SessionData | null>;
  listSessions(projectId: string, opts?: ListOptions): Promise<ListResult<SessionSummary>>;
  deleteSession(projectId: string, id: string): Promise<boolean>;
  searchSessions(projectId: string, query: string): Promise<SessionSummary[]>;
  getSessionStats(projectId: string): Promise<SessionStats>;

  // --- Baselines (project-scoped) ---
  hasBaseline(projectId: string, sessionId: string): Promise<boolean>;
  setBaselineFlag(projectId: string, sessionId: string, testId: string): Promise<void>;
  putBaselineScreenshot(projectId: string, sessionId: string, filename: string, bytes: Buffer): Promise<void>;
  listBaselineScreenshots(projectId: string, sessionId: string): Promise<ScreenshotRef[]>;
  getBaselineScreenshot(projectId: string, sessionId: string, filename: string): Promise<Buffer | null>;

  // --- Test runs (project-scoped) ---
  saveTestResult(projectId: string, testId: string, result: TestResult): Promise<void>;
  getTestResult(projectId: string, testId: string): Promise<TestResult | null>;

  putTestScreenshot(projectId: string, testId: string, filename: string, bytes: Buffer): Promise<void>;
  listTestScreenshots(projectId: string, testId: string): Promise<ScreenshotRef[]>;
  getTestScreenshot(projectId: string, testId: string, filename: string): Promise<Buffer | null>;

  putTestDiff(projectId: string, testId: string, filename: string, bytes: Buffer): Promise<void>;
  listTestDiffs(projectId: string, testId: string): Promise<ScreenshotRef[]>;
  getTestDiff(projectId: string, testId: string, filename: string): Promise<Buffer | null>;

  putTestDiffReport(projectId: string, testId: string, report: DiffReport): Promise<void>;
}

export interface FileStorageConfig {
  projectsRoot: string;
}

export type StorageKind = 'file' | 'logOnly';
