import type { Project, SessionData, TestResult } from '@taka/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

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

export interface SessionsListResponse {
  sessions: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface BaselineScreenshot {
  filename: string;
  eventIndex: number;
  size: number;
  timestamp?: number;
}

export interface BaselineScreenshotsResponse {
  screenshots: BaselineScreenshot[];
  total: number;
}

export interface SessionStats {
  totalSessions: number;
  totalEvents: number;
  totalNetworkRequests: number;
  totalSize: number;
  averageEventsPerSession: number;
  oldestSession?: string;
  newestSession?: string;
}

export interface QueueStatus {
  pending: number;
  running: number;
  completed: number;
}

export interface TestExecution {
  id: string;
  projectId: string;
  sessionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: TestResult;
  errors?: string[];
}

export interface TestsListResponse {
  tests: TestExecution[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReplayOptions {
  /** Replay against this origin (a preview/staging deployment) instead of the recorded one. */
  targetOrigin?: string;
  baseCommit?: string;
  headCommit?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) {
    let message = `API Error: ${response.status}`;
    try {
      const data = await response.json();
      message = data.message || data.error || message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return response.json();
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // ---- Health ----
  getHealth(): Promise<boolean> {
    return request<{ status: string }>('/health').then(() => true).catch(() => false);
  },

  // ---- Projects ----
  listProjects() {
    return request<ProjectListResponse>('/projects');
  },
  getProject(id: string) {
    return request<Project>(`/projects/${encodeURIComponent(id)}`);
  },
  createProject(body: { name: string; description?: string; id?: string }) {
    return request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) });
  },
  updateProject(id: string, body: { name?: string; description?: string }) {
    return request<Project>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  deleteProject(id: string) {
    return request<{ success: boolean }>(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // ---- Sessions ----
  getSessions(
    projectId: string,
    params: { limit?: number; offset?: number; sortBy?: 'timestamp' | 'eventCount'; sortOrder?: 'asc' | 'desc' } = {},
  ) {
    return request<SessionsListResponse>(`/projects/${projectId}/sessions${qs(params)}`);
  },
  getSession(projectId: string, id: string) {
    return request<SessionData>(`/projects/${projectId}/sessions/${id}`);
  },
  getBaselineScreenshots(projectId: string, id: string) {
    return request<BaselineScreenshotsResponse>(
      `/projects/${projectId}/sessions/${id}/screenshots`,
    );
  },
  getSessionStats(projectId: string) {
    return request<SessionStats>(`/projects/${projectId}/sessions/stats`);
  },
  searchSessions(projectId: string, q: string) {
    return request<{ query: string; results: SessionSummary[]; total: number }>(
      `/projects/${projectId}/sessions/search${qs({ q })}`,
    );
  },
  deleteSession(projectId: string, id: string) {
    return request<{ success: boolean }>(`/projects/${projectId}/sessions/${id}`, { method: 'DELETE' });
  },
  replaySession(projectId: string, id: string, options: ReplayOptions = {}) {
    return request<{ testId: string }>(`/projects/${projectId}/sessions/${id}/replay`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  },

  // ---- Tests ----
  getTests(projectId: string, params: { limit?: number; offset?: number; status?: string } = {}) {
    return request<TestsListResponse>(`/projects/${projectId}/tests${qs(params)}`);
  },
  getTest(projectId: string, id: string) {
    return request<TestExecution>(`/projects/${projectId}/tests/${id}`);
  },
  getTestResult(projectId: string, id: string) {
    return request<TestResult>(`/projects/${projectId}/tests/${id}/result`);
  },
  getQueueStatus(projectId: string) {
    return request<QueueStatus>(`/projects/${projectId}/tests/queue`);
  },
  runTest(projectId: string, sessionData: SessionData, options: Record<string, unknown> = {}) {
    return request<{ testId: string }>(`/projects/${projectId}/tests/run`, {
      method: 'POST',
      body: JSON.stringify({ sessionData, options }),
    });
  },
  compareScreenshots(projectId: string, baseSessionId: string, headSessionId: string, options: Record<string, unknown> = {}) {
    return request<{ comparisonId: string }>(`/projects/${projectId}/tests/compare`, {
      method: 'POST',
      body: JSON.stringify({ baseSessionId, headSessionId, ...options }),
    });
  },
};

// URL builders for <img> tags
export function baselineScreenshotUrl(projectId: string, sessionId: string, filename: string): string {
  return `${API_BASE}/projects/${projectId}/user-sessions/${sessionId}/screenshots/${filename}`;
}

export function testScreenshotUrl(projectId: string, testId: string, filename: string): string {
  return `${API_BASE}/projects/${projectId}/test-sessions/${testId}/screenshots/${filename}`;
}

export function testDiffUrl(projectId: string, testId: string, filename: string): string {
  return `${API_BASE}/projects/${projectId}/test-sessions/${testId}/diffs/${filename}`;
}
