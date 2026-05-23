import type { SessionData, TestResult } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ScreenshotRef,
  ListOptions,
  ListResult,
  SessionStats,
  DiffReport,
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

  async saveSession(session: SessionData): Promise<void> {
    const snapshot = session.storageSnapshot;
    console.log(`${TAG} saveSession(`, {
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

  async getSession(id: string): Promise<SessionData | null> {
    console.log(`${TAG} getSession(${id}) → null`);
    return null;
  }

  async listSessions(opts: ListOptions = {}): Promise<ListResult<SessionSummary>> {
    console.log(`${TAG} listSessions(`, opts, ') → empty');
    return { items: [], total: 0, limit: opts.limit ?? 50, offset: opts.offset ?? 0 };
  }

  async deleteSession(id: string): Promise<boolean> {
    console.log(`${TAG} deleteSession(${id}) → false`);
    return false;
  }

  async searchSessions(query: string): Promise<SessionSummary[]> {
    console.log(`${TAG} searchSessions(${query}) → empty`);
    return [];
  }

  async getSessionStats(): Promise<SessionStats> {
    console.log(`${TAG} getSessionStats() → zeros`);
    return {
      totalSessions: 0,
      totalEvents: 0,
      totalNetworkRequests: 0,
      totalSize: 0,
      averageEventsPerSession: 0,
    };
  }

  async hasBaseline(_sessionId: string): Promise<boolean> {
    console.log(`${TAG} hasBaseline(${_sessionId}) → false`);
    return false;
  }

  async setBaselineFlag(sessionId: string, testId: string): Promise<void> {
    console.log(`${TAG} setBaselineFlag(${sessionId}, ${testId})`);
  }

  async putBaselineScreenshot(sessionId: string, filename: string, bytes: Buffer): Promise<void> {
    console.log(`${TAG} putBaselineScreenshot(${sessionId}, ${filename},`, logBytes(bytes), ')');
  }

  async listBaselineScreenshots(sessionId: string): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listBaselineScreenshots(${sessionId}) → empty`);
    return [];
  }

  async getBaselineScreenshot(sessionId: string, filename: string): Promise<Buffer | null> {
    console.log(`${TAG} getBaselineScreenshot(${sessionId}, ${filename}) → null`);
    return null;
  }

  async saveTestResult(testId: string, result: TestResult): Promise<void> {
    console.log(`${TAG} saveTestResult(${testId},`, {
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

  async getTestResult(testId: string): Promise<TestResult | null> {
    console.log(`${TAG} getTestResult(${testId}) → null`);
    return null;
  }

  async putTestScreenshot(testId: string, filename: string, bytes: Buffer): Promise<void> {
    console.log(`${TAG} putTestScreenshot(${testId}, ${filename},`, logBytes(bytes), ')');
  }

  async listTestScreenshots(testId: string): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listTestScreenshots(${testId}) → empty`);
    return [];
  }

  async getTestScreenshot(testId: string, filename: string): Promise<Buffer | null> {
    console.log(`${TAG} getTestScreenshot(${testId}, ${filename}) → null`);
    return null;
  }

  async putTestDiff(testId: string, filename: string, bytes: Buffer): Promise<void> {
    console.log(`${TAG} putTestDiff(${testId}, ${filename},`, logBytes(bytes), ')');
  }

  async listTestDiffs(testId: string): Promise<ScreenshotRef[]> {
    console.log(`${TAG} listTestDiffs(${testId}) → empty`);
    return [];
  }

  async getTestDiff(testId: string, filename: string): Promise<Buffer | null> {
    console.log(`${TAG} getTestDiff(${testId}, ${filename}) → null`);
    return null;
  }

  async putTestDiffReport(testId: string, report: DiffReport): Promise<void> {
    console.log(`${TAG} putTestDiffReport(${testId},`, report.summary, ')');
  }
}
