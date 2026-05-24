import type { Project, SessionData, TestResult } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ScreenshotRef,
  ListOptions,
  ListResult,
  SessionStats,
  DiffReport,
  ProjectUpdate,
} from './types';

const TAG = '[Storage:LogOnly]';

function logBytes(bytes: Buffer): { length: number } {
  return { length: bytes.length };
}

export class LogOnlyStorage implements Storage {
  async initialize(): Promise<void> {
    console.log(`${TAG} initialize()`);
  }

  async cleanup(): Promise<void> {
    console.log(`${TAG} cleanup()`);
  }

  // === Projects ===

  async createProject(project: Project): Promise<void> {
    console.log(`${TAG} createProject(`, project, ')');
  }

  async getProject(id: string): Promise<Project | null> {
    console.log(`${TAG} getProject(${id}) → null`);
    return null;
  }

  async listProjects(): Promise<Project[]> {
    console.log(`${TAG} listProjects() → empty`);
    return [];
  }

  async updateProject(id: string, updates: ProjectUpdate): Promise<boolean> {
    console.log(`${TAG} updateProject(${id},`, updates, ') → false');
    return false;
  }

  async deleteProject(id: string): Promise<boolean> {
    console.log(`${TAG} deleteProject(${id}) → false`);
    return false;
  }

  // === Sessions ===

  async saveSession(projectId: string, session: SessionData): Promise<void> {
    const snapshot = session.storageSnapshot;
    console.log(`${TAG} saveSession(${projectId},`, {
      id: session.id,
      url: session.url,
      eventCount: session.events.length,
      networkRequestCount: session.networkRequests.length,
      storage: snapshot
        ? {
            localStorage: Object.keys(snapshot.localStorage).length,
            sessionStorage: Object.keys(snapshot.sessionStorage).length,
            cookies: Object.keys(snapshot.cookies).length,
          }
        : undefined,
      metadata: session.metadata,
    }, ')');

    if (session.events.length > 0) {
      console.log(`${TAG}   events:`);
      for (const e of session.events) {
        console.log(
          `${TAG}     #${e.id.slice(0, 8)} [${e.type}] +${e.timestamp - session.timestamp}ms ` +
            `target=${e.target ?? '-'} data=${e.data ? JSON.stringify(e.data) : '-'}`,
        );
      }
    }

    if (session.networkRequests.length > 0) {
      console.log(`${TAG}   networkRequests:`);
      for (const r of session.networkRequests) {
        const status = r.response?.status ?? 'pending';
        const bodyLen = r.response?.body?.length ?? 0;
        console.log(
          `${TAG}     #${r.id.slice(0, 8)} ${r.method} ${r.url} → ${status} (${bodyLen}b)`,
        );
      }
    }
  }

  async getSession(projectId: string, id: string): Promise<SessionData | null> {
    console.log(`${TAG} getSession(${projectId}, ${id}) → null`);
    return null;
  }

  async listSessions(
    projectId: string,
    opts: ListOptions = {},
  ): Promise<ListResult<SessionSummary>> {
    console.log(`${TAG} listSessions(${projectId},`, opts, ') → empty');
    return { items: [], total: 0, limit: opts.limit ?? 50, offset: opts.offset ?? 0 };
  }

  async deleteSession(projectId: string, id: string): Promise<boolean> {
    console.log(`${TAG} deleteSession(${projectId}, ${id}) → false`);
    return false;
  }

  async searchSessions(projectId: string, query: string): Promise<SessionSummary[]> {
    console.log(`${TAG} searchSessions(${projectId}, ${query}) → empty`);
    return [];
  }

  async getSessionStats(projectId: string): Promise<SessionStats> {
    console.log(`${TAG} getSessionStats(${projectId}) → zeros`);
    return {
      totalSessions: 0,
      totalEvents: 0,
      totalNetworkRequests: 0,
      totalSize: 0,
      averageEventsPerSession: 0,
    };
  }

  async hasBaseline(projectId: string, sessionId: string): Promise<boolean> {
    console.log(`${TAG} hasBaseline(${projectId}, ${sessionId}) → false`);
    return false;
  }

  async setBaselineFlag(
    projectId: string,
    sessionId: string,
    testId: string,
  ): Promise<void> {
    console.log(`${TAG} setBaselineFlag(${projectId}, ${sessionId}, ${testId})`);
  }

  async putBaselineScreenshot(
    projectId: string,
    sessionId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    console.log(
      `${TAG} putBaselineScreenshot(${projectId}, ${sessionId}, ${filename},`,
      logBytes(bytes),
      ')',
    );
  }

  async listBaselineScreenshots(
    projectId: string,
    sessionId: string,
  ): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listBaselineScreenshots(${projectId}, ${sessionId}) → empty`);
    return [];
  }

  async getBaselineScreenshot(
    projectId: string,
    sessionId: string,
    filename: string,
  ): Promise<Buffer | null> {
    console.log(
      `${TAG} getBaselineScreenshot(${projectId}, ${sessionId}, ${filename}) → null`,
    );
    return null;
  }

  async saveTestResult(
    projectId: string,
    testId: string,
    result: TestResult,
  ): Promise<void> {
    console.log(`${TAG} saveTestResult(${projectId}, ${testId},`, {
      sessionId: result.sessionId,
      status: result.status,
      isBaseline: result.isBaseline,
      screenshotCount: result.screenshots.length,
      diffCount: result.diffs.length,
    }, ')');

    if (result.screenshots.length > 0) {
      console.log(`${TAG}   screenshots:`);
      for (const s of result.screenshots) {
        console.log(`${TAG}     [${s.eventIndex}] ${s.path}`);
      }
    }

    if (result.diffs.length > 0) {
      console.log(`${TAG}   diffs:`);
      for (const d of result.diffs) {
        console.log(
          `${TAG}     base=${d.baseScreenshot.eventIndex} head=${d.headScreenshot.eventIndex} ` +
            `pixels=${d.pixelDifference} pct=${(d.percentageDifference * 100).toFixed(2)}% ` +
            `passed=${d.passed}`,
        );
      }
    }
  }

  async getTestResult(projectId: string, testId: string): Promise<TestResult | null> {
    console.log(`${TAG} getTestResult(${projectId}, ${testId}) → null`);
    return null;
  }

  async putTestScreenshot(
    projectId: string,
    testId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    console.log(
      `${TAG} putTestScreenshot(${projectId}, ${testId}, ${filename},`,
      logBytes(bytes),
      ')',
    );
  }

  async listTestScreenshots(projectId: string, testId: string): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listTestScreenshots(${projectId}, ${testId}) → empty`);
    return [];
  }

  async getTestScreenshot(
    projectId: string,
    testId: string,
    filename: string,
  ): Promise<Buffer | null> {
    console.log(
      `${TAG} getTestScreenshot(${projectId}, ${testId}, ${filename}) → null`,
    );
    return null;
  }

  async putTestDiff(
    projectId: string,
    testId: string,
    filename: string,
    bytes: Buffer,
  ): Promise<void> {
    console.log(
      `${TAG} putTestDiff(${projectId}, ${testId}, ${filename},`,
      logBytes(bytes),
      ')',
    );
  }

  async listTestDiffs(projectId: string, testId: string): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listTestDiffs(${projectId}, ${testId}) → empty`);
    return [];
  }

  async getTestDiff(
    projectId: string,
    testId: string,
    filename: string,
  ): Promise<Buffer | null> {
    console.log(`${TAG} getTestDiff(${projectId}, ${testId}, ${filename}) → null`);
    return null;
  }

  async putTestDiffReport(
    projectId: string,
    testId: string,
    report: DiffReport,
  ): Promise<void> {
    console.log(`${TAG} putTestDiffReport(${projectId}, ${testId},`, report.summary, ')');
  }
}
