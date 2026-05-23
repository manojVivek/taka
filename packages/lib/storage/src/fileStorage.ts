import fs from 'fs-extra';
import path from 'path';
import type { SessionData, TestResult } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ScreenshotRef,
  ListOptions,
  ListResult,
  SessionStats,
  DiffReport,
  FileStorageConfig,
} from './types';

export class FileStorage implements Storage {
  private userSessionsPath: string;
  private testSessionsPath: string;
  private sessionsIndex: Map<string, SessionSummary> = new Map();

  constructor(config: FileStorageConfig) {
    this.userSessionsPath = path.resolve(config.userSessionsPath);
    this.testSessionsPath = path.resolve(config.testSessionsPath);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.userSessionsPath);
    await fs.ensureDir(this.testSessionsPath);
    await this.loadSessionsIndex();
    console.log(`[Storage:File] Initialized with ${this.sessionsIndex.size} sessions`);
  }

  async cleanup(): Promise<void> {
    await this.saveSessionsIndex();
  }

  // === Sessions ===

  async saveSession(session: SessionData): Promise<void> {
    const sessionDir = path.join(this.userSessionsPath, session.id);
    await fs.ensureDir(sessionDir);
    const sessionPath = path.join(sessionDir, 'session.json');
    await fs.writeJson(sessionPath, session, { spaces: 2 });

    this.sessionsIndex.set(session.id, this.summarize(session));
    await this.saveSessionsIndex();
  }

  async getSession(id: string): Promise<SessionData | null> {
    const sessionPath = path.join(this.userSessionsPath, id, 'session.json');
    try {
      if (!(await fs.pathExists(sessionPath))) return null;
      return await fs.readJson(sessionPath);
    } catch (error) {
      console.error('[Storage:File] Failed to read session:', id, error);
      return null;
    }
  }

  async listSessions(opts: ListOptions = {}): Promise<ListResult<SessionSummary>> {
    const { limit = 50, offset = 0, sortBy = 'timestamp', sortOrder = 'desc' } = opts;

    let items = Array.from(this.sessionsIndex.values());
    items.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = items.length;
    items = items.slice(offset, offset + limit);
    return { items, total, limit, offset };
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!this.sessionsIndex.has(id)) return false;
    const sessionDir = path.join(this.userSessionsPath, id);
    await fs.remove(sessionDir);
    this.sessionsIndex.delete(id);
    await this.saveSessionsIndex();
    return true;
  }

  async searchSessions(query: string): Promise<SessionSummary[]> {
    const q = query.toLowerCase();
    return Array.from(this.sessionsIndex.values()).filter(
      s =>
        s.url.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q) ||
        s.userId?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }

  async getSessionStats(): Promise<SessionStats> {
    const items = Array.from(this.sessionsIndex.values());
    if (items.length === 0) {
      return {
        totalSessions: 0,
        totalEvents: 0,
        totalNetworkRequests: 0,
        totalSize: 0,
        averageEventsPerSession: 0,
      };
    }

    const totalEvents = items.reduce((sum, s) => sum + s.eventCount, 0);
    const totalNetworkRequests = items.reduce((sum, s) => sum + s.networkRequestCount, 0);
    const totalSize = items.reduce((sum, s) => sum + s.size, 0);
    const timestamps = items.map(s => s.timestamp).sort();

    return {
      totalSessions: items.length,
      totalEvents,
      totalNetworkRequests,
      totalSize,
      averageEventsPerSession: totalEvents / items.length,
      oldestSession: new Date(timestamps[0]),
      newestSession: new Date(timestamps[timestamps.length - 1]),
    };
  }

  // === Baselines ===

  async hasBaseline(sessionId: string): Promise<boolean> {
    const dir = this.baselineDir(sessionId);
    try {
      if (!(await fs.pathExists(dir))) return false;
      const files = await fs.readdir(dir);
      return files.some(f => f.endsWith('.png'));
    } catch {
      return false;
    }
  }

  async setBaselineFlag(sessionId: string, testId: string): Promise<void> {
    const sessionPath = path.join(this.userSessionsPath, sessionId, 'session.json');
    if (!(await fs.pathExists(sessionPath))) return;
    const data = await fs.readJson(sessionPath);
    data.hasBaseline = true;
    data.baselineTestId = testId;
    await fs.writeJson(sessionPath, data, { spaces: 2 });

    const existing = this.sessionsIndex.get(sessionId);
    if (existing) {
      this.sessionsIndex.set(sessionId, { ...existing, hasBaseline: true });
      await this.saveSessionsIndex();
    }
  }

  async putBaselineScreenshot(sessionId: string, filename: string, bytes: Buffer): Promise<void> {
    const dir = this.baselineDir(sessionId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listBaselineScreenshots(sessionId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.baselineDir(sessionId));
  }

  async getBaselineScreenshot(sessionId: string, filename: string): Promise<Buffer | null> {
    return this.readFileOrNull(path.join(this.baselineDir(sessionId), filename));
  }

  // === Test runs ===

  async saveTestResult(testId: string, result: TestResult): Promise<void> {
    const dir = path.join(this.testSessionsPath, testId);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'result.json'), result, { spaces: 2 });
  }

  async getTestResult(testId: string): Promise<TestResult | null> {
    const p = path.join(this.testSessionsPath, testId, 'result.json');
    try {
      if (!(await fs.pathExists(p))) return null;
      return await fs.readJson(p);
    } catch {
      return null;
    }
  }

  async putTestScreenshot(testId: string, filename: string, bytes: Buffer): Promise<void> {
    const dir = this.testScreenshotsDir(testId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listTestScreenshots(testId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.testScreenshotsDir(testId));
  }

  async getTestScreenshot(testId: string, filename: string): Promise<Buffer | null> {
    return this.readFileOrNull(path.join(this.testScreenshotsDir(testId), filename));
  }

  async putTestDiff(testId: string, filename: string, bytes: Buffer): Promise<void> {
    const dir = this.testDiffsDir(testId);
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, filename), bytes);
  }

  async listTestDiffs(testId: string): Promise<ScreenshotRef[]> {
    return this.listPngsIn(this.testDiffsDir(testId));
  }

  async getTestDiff(testId: string, filename: string): Promise<Buffer | null> {
    return this.readFileOrNull(path.join(this.testDiffsDir(testId), filename));
  }

  async putTestDiffReport(testId: string, report: DiffReport): Promise<void> {
    const dir = this.testDiffsDir(testId);
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, 'report.json'), report, { spaces: 2 });
  }

  // === Internals ===

  private baselineDir(sessionId: string): string {
    return path.join(this.userSessionsPath, sessionId, 'screenshots');
  }

  private testScreenshotsDir(testId: string): string {
    return path.join(this.testSessionsPath, testId, 'screenshots');
  }

  private testDiffsDir(testId: string): string {
    return path.join(this.testSessionsPath, testId, 'diffs');
  }

  private async readFileOrNull(p: string): Promise<Buffer | null> {
    try {
      if (!(await fs.pathExists(p))) return null;
      return await fs.readFile(p);
    } catch {
      return null;
    }
  }

  private async listPngsIn(dir: string): Promise<ScreenshotRef[]> {
    try {
      if (!(await fs.pathExists(dir))) return [];
      const files = await fs.readdir(dir);
      const refs: ScreenshotRef[] = [];
      for (const file of files) {
        if (!file.endsWith('.png')) continue;
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        const match = file.match(/^(\d+)_/);
        const eventIndex = match ? parseInt(match[1], 10) : 0;
        refs.push({
          filename: file,
          eventIndex,
          size: stat.size,
          timestamp: stat.mtime.getTime(),
        });
      }
      refs.sort((a, b) => a.eventIndex - b.eventIndex);
      return refs;
    } catch {
      return [];
    }
  }

  private summarize(session: SessionData): SessionSummary {
    return {
      id: session.id,
      url: session.url,
      timestamp: session.timestamp,
      eventCount: session.events.length,
      networkRequestCount: session.networkRequests.length,
      userAgent: session.metadata.userAgent,
      title: session.metadata.title,
      userId: session.metadata.userId,
      size: Buffer.byteLength(JSON.stringify(session), 'utf8'),
      hasBaseline: session.hasBaseline,
    };
  }

  private async loadSessionsIndex(): Promise<void> {
    const indexPath = path.join(this.userSessionsPath, 'index.json');
    try {
      if (await fs.pathExists(indexPath)) {
        const data = await fs.readJson(indexPath);
        this.sessionsIndex = new Map(data.sessions || []);
        return;
      }
    } catch (error) {
      console.warn('[Storage:File] Failed to load index, rebuilding:', error);
    }
    await this.rebuildIndex();
  }

  private async saveSessionsIndex(): Promise<void> {
    const indexPath = path.join(this.userSessionsPath, 'index.json');
    try {
      await fs.writeJson(
        indexPath,
        { lastUpdated: Date.now(), sessions: Array.from(this.sessionsIndex.entries()) },
        { spaces: 2 },
      );
    } catch (error) {
      console.error('[Storage:File] Failed to save index:', error);
    }
  }

  private async rebuildIndex(): Promise<void> {
    try {
      const entries = await fs.readdir(this.userSessionsPath);
      for (const entry of entries) {
        if (entry === 'index.json') continue;
        const sessionPath = path.join(this.userSessionsPath, entry, 'session.json');
        if (!(await fs.pathExists(sessionPath))) continue;
        try {
          const session: SessionData = await fs.readJson(sessionPath);
          this.sessionsIndex.set(session.id, this.summarize(session));
        } catch (error) {
          console.warn('[Storage:File] Skipped malformed session:', entry, error);
        }
      }
    } catch (error) {
      console.error('[Storage:File] Failed to rebuild index:', error);
    }
  }
}
