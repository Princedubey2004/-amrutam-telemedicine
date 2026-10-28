import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';

describe('Health Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health/live', () => {
    it('should return 200 OK with process uptime and ISO timestamp', async () => {
      const response = await request(app).get('/health/live');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(typeof response.body.uptime).toBe('number');
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 OK when database connection is healthy', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }]);

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ready',
        database: 'connected',
        timestamp: expect.any(String)
      });
    });

    it('should return 503 Service Unavailable when database connection fails', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('Connection refused'));

      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'not_ready',
        database: 'disconnected',
        error: 'Connection refused'
      });
    });
  });

  describe('404 Route Handling', () => {
    it('should return 404 for undefined routes in standard error format', async () => {
      const response = await request(app).get('/api/v1/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('Route not found');
    });
  });
});
