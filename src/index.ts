import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/database';

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Amrutam Telemedicine API running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`   Health check: http://localhost:${env.PORT}/health/live`);
  console.log(`   Readiness check: http://localhost:${env.PORT}/health/ready`);
});

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\nReceived ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('Database connections closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if hanging
  setTimeout(() => {
    console.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
