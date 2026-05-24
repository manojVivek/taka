import express from 'express';
import type { SessionData } from '@taka/types';

const router = express.Router({ mergeParams: true });

function projectId(req: express.Request): string {
  return (req.params as { projectId: string }).projectId;
}

// POST / — Create/upload session
router.post('/', async (req, res) => {
  try {
    const sessionData: SessionData = req.body;

    if (!sessionData.id || !sessionData.url || !sessionData.events) {
      return res.status(400).json({
        error: 'Invalid session data',
        message: 'Missing required fields: id, url, events',
      });
    }

    await req.sessionService.saveSession(projectId(req), sessionData);

    res.status(201).json({
      success: true,
      sessionId: sessionData.id,
      message: 'Session saved successfully',
    });
  } catch (error) {
    console.error('[Sessions API] Failed to save session:', error);
    res.status(500).json({
      error: 'Failed to save session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET / — List sessions
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sortBy = (req.query.sortBy as string) || 'timestamp';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    if (!['timestamp', 'eventCount'].includes(sortBy)) {
      return res.status(400).json({
        error: 'Invalid sortBy parameter',
        message: 'Must be one of: timestamp, eventCount',
      });
    }

    if (!['asc', 'desc'].includes(sortOrder)) {
      return res.status(400).json({
        error: 'Invalid sortOrder parameter',
        message: 'Must be one of: asc, desc',
      });
    }

    const result = await req.sessionService.getAllSessions(projectId(req), {
      limit,
      offset,
      sortBy: sortBy as 'timestamp' | 'eventCount',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json(result);
  } catch (error) {
    console.error('[Sessions API] Failed to get sessions:', error);
    res.status(500).json({
      error: 'Failed to retrieve sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /stats — Session statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await req.sessionService.getSessionStats(projectId(req));
    res.json(stats);
  } catch (error) {
    console.error('[Sessions API] Failed to get stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /search?q=
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q as string;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Provide a search query with ?q=<query>',
      });
    }

    const results = await req.sessionService.searchSessions(projectId(req), query);
    res.json({
      query,
      results,
      total: results.length,
    });
  } catch (error) {
    console.error('[Sessions API] Search failed:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /:id — Get specific session
router.get('/:id', async (req, res) => {
  try {
    const session = await req.sessionService.getSession(projectId(req), req.params.id);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with ID ${req.params.id} does not exist`,
      });
    }

    res.json(session);
  } catch (error) {
    console.error('[Sessions API] Failed to get session:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await req.sessionService.deleteSession(projectId(req), req.params.id);

    if (!deleted) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with ID ${req.params.id} does not exist`,
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    console.error('[Sessions API] Failed to delete session:', error);
    res.status(500).json({
      error: 'Failed to delete session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /:id/replay — Replay session as test
router.post('/:id/replay', async (req, res) => {
  try {
    const pid = projectId(req);
    const session = await req.sessionService.getSession(pid, req.params.id);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        message: `Session with ID ${req.params.id} does not exist`,
      });
    }

    const testOptions = {
      baseCommit: req.body.baseCommit,
      headCommit: req.body.headCommit,
      timeout: req.body.timeout,
      viewport: req.body.viewport,
    };

    const testId = await req.testService.runTest(pid, session, testOptions);

    res.status(202).json({
      success: true,
      testId,
      message: 'Test started successfully',
      statusUrl: `/api/projects/${pid}/tests/${testId}`,
    });
  } catch (error) {
    console.error('[Sessions API] Failed to start test:', error);
    res.status(500).json({
      error: 'Failed to start test',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as sessionRoutes };
