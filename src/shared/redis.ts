import Redis from 'ioredis';
import { config } from '@config';
import { logger } from './logger';

export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
});

redisClient.on('connect', () => logger.info('Redis connected'));
redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));

export async function initRedis(): Promise<void> {
  if (redisClient.status === 'wait') {
    await redisClient.connect();
  }
}
