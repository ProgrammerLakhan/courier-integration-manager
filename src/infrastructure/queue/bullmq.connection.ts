import { config } from '@config';

/**
 * Shared BullMQ connection options.
 * Single source of truth — used by both batch.service.ts and batch.worker.ts.
 */
export const bullmqConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};
