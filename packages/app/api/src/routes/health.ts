import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.1.0',
  });
});

router.get('/ready', async (req, res) => {
  try {
    // Check if services are ready
    const stats = await req.sessionService.getSessionStats();
    
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        sessions: 'ready',
        tests: 'ready',
      },
      stats,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export { router as healthRoutes };