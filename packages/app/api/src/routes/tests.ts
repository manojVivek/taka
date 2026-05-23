import express from 'express';

const router = express.Router();

// GET /api/tests - List all tests
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as string;

    const validStatuses = ['pending', 'running', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status parameter',
        message: `Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const result = await req.testService.getAllTests({
      limit,
      offset,
      status: status as any,
    });

    res.json(result);
  } catch (error) {
    console.error('[Tests API] Failed to get tests:', error);
    res.status(500).json({
      error: 'Failed to retrieve tests',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/tests/queue - Get queue status
router.get('/queue', async (req, res) => {
  try {
    const queueStatus = await req.testService.getQueueStatus();
    res.json(queueStatus);
  } catch (error) {
    console.error('[Tests API] Failed to get queue status:', error);
    res.status(500).json({
      error: 'Failed to retrieve queue status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/tests/:id - Get specific test status
router.get('/:id', async (req, res) => {
  try {
    const testId = req.params.id;
    const testExecution = await req.testService.getTestStatus(testId);

    if (!testExecution) {
      return res.status(404).json({
        error: 'Test not found',
        message: `Test with ID ${testId} does not exist`,
      });
    }

    res.json(testExecution);
  } catch (error) {
    console.error('[Tests API] Failed to get test status:', error);
    res.status(500).json({
      error: 'Failed to retrieve test status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/tests/:id/result - Get test result
router.get('/:id/result', async (req, res) => {
  try {
    const testId = req.params.id;
    const result = await req.testService.getTestResult(testId);

    if (!result) {
      return res.status(404).json({
        error: 'Test result not found',
        message: `Test result for ID ${testId} does not exist`,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('[Tests API] Failed to get test result:', error);
    res.status(500).json({
      error: 'Failed to retrieve test result',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/tests/compare - Compare screenshots between sessions
router.post('/compare', async (req, res) => {
  try {
    const { baseSessionId, headSessionId, threshold, ignoreRegions } = req.body;

    if (!baseSessionId || !headSessionId) {
      return res.status(400).json({
        error: 'Invalid comparison request',
        message: 'Missing required fields: baseSessionId, headSessionId',
      });
    }

    const options = {
      threshold: threshold ? parseFloat(threshold) : undefined,
      ignoreRegions,
    };

    const comparisonId = await req.testService.compareScreenshots(
      baseSessionId,
      headSessionId,
      options
    );

    res.status(202).json({
      success: true,
      comparisonId,
      message: 'Comparison started successfully',
    });
  } catch (error) {
    console.error('[Tests API] Failed to start comparison:', error);
    res.status(500).json({
      error: 'Failed to start comparison',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// POST /api/tests/run - Run test for session data
router.post('/run', async (req, res) => {
  try {
    const sessionData = req.body.sessionData;
    const options = req.body.options || {};

    if (!sessionData || !sessionData.id || !sessionData.events) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing sessionData with required fields: id, events',
      });
    }

    const testId = await req.testService.runTest(sessionData, options);

    res.status(202).json({
      success: true,
      testId,
      message: 'Test started successfully',
      statusUrl: `/api/tests/${testId}`,
    });
  } catch (error) {
    console.error('[Tests API] Failed to run test:', error);
    res.status(500).json({
      error: 'Failed to run test',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as testRoutes };