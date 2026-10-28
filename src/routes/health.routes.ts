import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';

export const healthRouter = Router();

/**
 * Liveness probe: returns 200 if the process is up and running.
 */
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * Readiness probe: returns 200 if database connectivity is verified,
 * or 503 if the database is unreachable.
 */
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    // Execute a lightweight query to verify active database connectivity
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database ping failed';
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: message,
      timestamp: new Date().toISOString()
    });
  }
});
