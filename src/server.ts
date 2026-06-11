import 'reflect-metadata';
import { config } from '@config';
import { app, notFoundHandler, errorHandler } from './app';
import { initDatabase } from '@database/datasource';
import { initRedis } from '@shared/redis';
import { logger } from '@shared/logger';

async function bootstrap(): Promise<void> {
  try {
    await initRedis();
    logger.info('Redis connection established');

    await initDatabase();
    logger.info('Database connection established and migrations applied');

    const { registerCourierAdapters } = await import('./couriers/register-adapters');
    await registerCourierAdapters();
    logger.info('Courier adapters registered');

    const { authRouter } = await import('./modules/auth/auth.routes');
    const { orderRouter } = await import('./modules/orders/order.routes');
    const { batchRouter } = await import('./modules/batches/batch.routes');

    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1/orders', orderRouter);
    app.use('/api/v1/batches', batchRouter);

    const { startBulkOrderWorker } = await import('./modules/batches/batch.worker');
    startBulkOrderWorker();

    app.use(notFoundHandler);
    app.use(errorHandler);

    const server = app.listen(config.app.port, () => {
      logger.info(`Server started`, {
        port: config.app.port,
        env: config.app.env,
      });
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal} — shutting down gracefully`);
      server.close(() => {
        void (async () => {
          const { AppDataSource } = await import('@database/datasource');
          const { redisClient } = await import('@shared/redis');
          const { stopBulkOrderWorker } = await import('./modules/batches/batch.worker');
          await stopBulkOrderWorker();
          if (AppDataSource.isInitialized) await AppDataSource.destroy();
          await redisClient.quit();
          logger.info('Shutdown complete');
          process.exit(0);
        })();
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason });
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });
  } catch (err) {
    logger.error('Fatal bootstrap error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

void bootstrap();
// Reload trigger
