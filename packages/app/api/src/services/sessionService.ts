import fs from 'fs-extra';
import path from 'path';
import type { SessionData } from '@taka/types';
import { STORAGE_PATHS } from '@taka/constants';
import { generateId } from '@taka/utils';

export class SessionService {
  private sessionsPath: string;
  private sessionsIndex: Map<string, SessionMetadata> = new Map();

  constructor() {
    this.sessionsPath = path.resolve(STORAGE_PATHS.userSessions);
  }

  getSessionDir(sessionId: string): string {
    return path.join(this.sessionsPath, sessionId);
  }

  getBaselineScreenshotsPath(sessionId: string): string {
    return path.join(this.sessionsPath, sessionId, 'screenshots');
  }

  async hasBaseline(sessionId: string): Promise<boolean> {
    const screenshotsDir = this.getBaselineScreenshotsPath(sessionId);
    try {
      if (!(await fs.pathExists(screenshotsDir))) return false;
      const files = await fs.readdir(screenshotsDir);
      return files.some(f => f.endsWith('.png'));
    } catch {
      return false;
    }
  }

  async setBaselineFlag(sessionId: string, testId: string): Promise<void> {
    const sessionPath = path.join(this.sessionsPath, sessionId, 'session.json');
    try {
      if (await fs.pathExists(sessionPath)) {
        const data = await fs.readJson(sessionPath);
        data.hasBaseline = true;
        data.baselineTestId = testId;
        await fs.writeJson(sessionPath, data, { spaces: 2 });
      }
    } catch (error) {
      console.error('[SessionService] Failed to set baseline flag:', error);
    }
  }

  async initialize(): Promise<void> {
    console.log('[SessionService] Initializing...');
    await fs.ensureDir(this.sessionsPath);
    await this.loadSessionsIndex();
    console.log('[SessionService] Initialized with', this.sessionsIndex.size, 'sessions');
  }

  async saveSession(sessionData: SessionData): Promise<void> {
    console.log('[SessionService] Saving session:', sessionData.id);
    
    try {
      // Create session directory
      const sessionDir = path.join(this.sessionsPath, sessionData.id);
      await fs.ensureDir(sessionDir);

      // Save session data
      const sessionPath = path.join(sessionDir, 'session.json');
      await fs.writeJson(sessionPath, sessionData, { spaces: 2 });

      // Update index
      this.sessionsIndex.set(sessionData.id, {
        id: sessionData.id,
        url: sessionData.url,
        timestamp: sessionData.timestamp,
        eventCount: sessionData.events.length,
        networkRequestCount: sessionData.networkRequests.length,
        userAgent: sessionData.metadata.userAgent,
        title: sessionData.metadata.title,
        userId: sessionData.metadata.userId,
        path: sessionPath,
        size: await this.calculateSessionSize(sessionData),
      });

      // Save updated index
      await this.saveSessionsIndex();

      console.log('[SessionService] Session saved successfully:', sessionData.id);
    } catch (error) {
      console.error('[SessionService] Failed to save session:', error);
      throw new Error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    console.log('[SessionService] Retrieving session:', sessionId);
    
    const metadata = this.sessionsIndex.get(sessionId);
    if (!metadata) {
      console.log('[SessionService] Session not found:', sessionId);
      return null;
    }

    try {
      const sessionData = await fs.readJson(metadata.path);
      console.log('[SessionService] Session retrieved successfully:', sessionId);
      return sessionData;
    } catch (error) {
      console.error('[SessionService] Failed to read session:', error);
      return null;
    }
  }

  async getAllSessions(
    options: {
      limit?: number;
      offset?: number;
      sortBy?: 'timestamp' | 'eventCount';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{
    sessions: SessionMetadata[];
    total: number;
    limit: number;
    offset: number;
  }> {
    console.log('[SessionService] Retrieving all sessions with options:', options);

    const {
      limit = 50,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'desc',
    } = options;

    // Convert map to array and sort
    let sessions = Array.from(this.sessionsIndex.values());

    // Sort sessions
    sessions.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const total = sessions.length;
    sessions = sessions.slice(offset, offset + limit);

    console.log('[SessionService] Returning', sessions.length, 'of', total, 'sessions');

    return {
      sessions,
      total,
      limit,
      offset,
    };
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    console.log('[SessionService] Deleting session:', sessionId);

    const metadata = this.sessionsIndex.get(sessionId);
    if (!metadata) {
      console.log('[SessionService] Session not found for deletion:', sessionId);
      return false;
    }

    try {
      // Delete session directory
      const sessionDir = path.dirname(metadata.path);
      await fs.remove(sessionDir);

      // Remove from index
      this.sessionsIndex.delete(sessionId);

      // Save updated index
      await this.saveSessionsIndex();

      console.log('[SessionService] Session deleted successfully:', sessionId);
      return true;
    } catch (error) {
      console.error('[SessionService] Failed to delete session:', error);
      return false;
    }
  }

  async getSessionStats(): Promise<{
    totalSessions: number;
    totalEvents: number;
    totalNetworkRequests: number;
    totalSize: number;
    averageEventsPerSession: number;
    oldestSession?: Date;
    newestSession?: Date;
  }> {
    const sessions = Array.from(this.sessionsIndex.values());
    
    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalEvents: 0,
        totalNetworkRequests: 0,
        totalSize: 0,
        averageEventsPerSession: 0,
      };
    }

    const totalEvents = sessions.reduce((sum, s) => sum + s.eventCount, 0);
    const totalNetworkRequests = sessions.reduce((sum, s) => sum + s.networkRequestCount, 0);
    const totalSize = sessions.reduce((sum, s) => sum + s.size, 0);
    
    const timestamps = sessions.map(s => s.timestamp).sort();
    
    return {
      totalSessions: sessions.length,
      totalEvents,
      totalNetworkRequests,
      totalSize,
      averageEventsPerSession: totalEvents / sessions.length,
      oldestSession: new Date(timestamps[0]),
      newestSession: new Date(timestamps[timestamps.length - 1]),
    };
  }

  async searchSessions(query: string): Promise<SessionMetadata[]> {
    console.log('[SessionService] Searching sessions for:', query);
    
    const searchTerm = query.toLowerCase();
    const results = Array.from(this.sessionsIndex.values()).filter(session => 
      session.url.toLowerCase().includes(searchTerm) ||
      session.title?.toLowerCase().includes(searchTerm) ||
      session.userId?.toLowerCase().includes(searchTerm) ||
      session.id.toLowerCase().includes(searchTerm)
    );

    console.log('[SessionService] Search returned', results.length, 'results');
    return results;
  }

  async cleanup(): Promise<void> {
    console.log('[SessionService] Cleaning up...');
    // Save final index state
    await this.saveSessionsIndex();
    console.log('[SessionService] Cleanup completed');
  }

  private async loadSessionsIndex(): Promise<void> {
    const indexPath = path.join(this.sessionsPath, 'index.json');
    
    try {
      if (await fs.pathExists(indexPath)) {
        const indexData = await fs.readJson(indexPath);
        this.sessionsIndex = new Map(indexData.sessions || []);
        console.log('[SessionService] Loaded sessions index with', this.sessionsIndex.size, 'entries');
      } else {
        console.log('[SessionService] No existing index found, starting fresh');
        // Scan for existing sessions
        await this.rebuildIndex();
      }
    } catch (error) {
      console.error('[SessionService] Failed to load sessions index:', error);
      await this.rebuildIndex();
    }
  }

  private async saveSessionsIndex(): Promise<void> {
    const indexPath = path.join(this.sessionsPath, 'index.json');
    
    try {
      await fs.writeJson(indexPath, {
        lastUpdated: Date.now(),
        sessions: Array.from(this.sessionsIndex.entries()),
      }, { spaces: 2 });
    } catch (error) {
      console.error('[SessionService] Failed to save sessions index:', error);
    }
  }

  private async rebuildIndex(): Promise<void> {
    console.log('[SessionService] Rebuilding sessions index...');
    
    try {
      const sessionDirs = await fs.readdir(this.sessionsPath);
      
      for (const dir of sessionDirs) {
        if (dir === 'index.json') continue;
        
        const sessionPath = path.join(this.sessionsPath, dir, 'session.json');
        
        if (await fs.pathExists(sessionPath)) {
          try {
            const sessionData = await fs.readJson(sessionPath);
            this.sessionsIndex.set(sessionData.id, {
              id: sessionData.id,
              url: sessionData.url,
              timestamp: sessionData.timestamp,
              eventCount: sessionData.events.length,
              networkRequestCount: sessionData.networkRequests.length,
              userAgent: sessionData.metadata.userAgent,
              title: sessionData.metadata.title,
              userId: sessionData.metadata.userId,
              path: sessionPath,
              size: await this.calculateSessionSize(sessionData),
            });
          } catch (error) {
            console.warn('[SessionService] Failed to process session:', dir, error);
          }
        }
      }
      
      console.log('[SessionService] Index rebuilt with', this.sessionsIndex.size, 'sessions');
    } catch (error) {
      console.error('[SessionService] Failed to rebuild index:', error);
    }
  }

  private async calculateSessionSize(sessionData: SessionData): Promise<number> {
    try {
      const jsonString = JSON.stringify(sessionData);
      return Buffer.byteLength(jsonString, 'utf8');
    } catch (error) {
      return 0;
    }
  }
}

interface SessionMetadata {
  id: string;
  url: string;
  timestamp: number;
  eventCount: number;
  networkRequestCount: number;
  userAgent: string;
  title?: string;
  userId?: string;
  path: string;
  size: number;
}