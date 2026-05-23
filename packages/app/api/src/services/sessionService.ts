import type { SessionData } from '@taka/types';
import type {
  Storage,
  SessionSummary,
  ListOptions,
  SessionStats,
  ScreenshotRef,
} from '@taka/storage';

export class SessionService {
  constructor(private storage: Storage) {}

  async saveSession(sessionData: SessionData): Promise<void> {
    return this.storage.saveSession(sessionData);
  }

  async getSession(id: string): Promise<SessionData | null> {
    return this.storage.getSession(id);
  }

  async getAllSessions(opts: ListOptions = {}): Promise<{
    sessions: SessionSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const result = await this.storage.listSessions(opts);
    return {
      sessions: result.items,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.storage.deleteSession(id);
  }

  async searchSessions(query: string): Promise<SessionSummary[]> {
    return this.storage.searchSessions(query);
  }

  async getSessionStats(): Promise<SessionStats> {
    return this.storage.getSessionStats();
  }

  async hasBaseline(sessionId: string): Promise<boolean> {
    return this.storage.hasBaseline(sessionId);
  }

  async setBaselineFlag(sessionId: string, testId: string): Promise<void> {
    return this.storage.setBaselineFlag(sessionId, testId);
  }

  async listBaselineScreenshots(sessionId: string): Promise<ScreenshotRef[]> {
    return this.storage.listBaselineScreenshots(sessionId);
  }
}
