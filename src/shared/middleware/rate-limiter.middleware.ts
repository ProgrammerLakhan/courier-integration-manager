import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { type Request, type Response } from 'express';
import { config } from '@config';
import { AppError, ErrorCode } from '../errors';
import { RequestContext } from '../context';
import { redisClient } from '../redis';

function rateLimitHandler(req: Request, res: Response): void {
  const ctx = RequestContext.get();
  const requestId = ctx?.requestId ?? 'unknown';
  const retryAfter = Math.ceil(config.rateLimit.auth.windowMs / 1000);

  const err = new AppError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    'Too many requests. Please try again later.',
    [{ message: `Retry after ${retryAfter} seconds` }],
  );
  res.set('Retry-After', String(retryAfter));
  res.status(429).json(err.toResponse(requestId));
}

/**
 * Global limiter — applied to all /api/v1/* routes.
 * 100 requests per 15 minutes per IP.
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.rateLimit.global.windowMs,
  max: config.rateLimit.global.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: ((...args: string[]) => redisClient.call(args[0], ...args.slice(1))) as (
      ...args: string[]
    ) => Promise<RedisReply>,
  }),
  handler: rateLimitHandler,
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Auth limiter — applied only to POST /auth/login and POST /auth/refresh.
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.auth.windowMs,
  max: config.rateLimit.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: ((...args: string[]) => redisClient.call(args[0], ...args.slice(1))) as (
      ...args: string[]
    ) => Promise<RedisReply>,
  }),
  handler: rateLimitHandler,
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Register limiter — applied only to POST /auth/register.
 * 5 requests per hour per IP — prevents account farming.
 */
export const registerRateLimiter = rateLimit({
  windowMs: config.rateLimit.register.windowMs,
  max: config.rateLimit.register.max,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: ((...args: string[]) => redisClient.call(args[0], ...args.slice(1))) as (
      ...args: string[]
    ) => Promise<RedisReply>,
  }),
  handler: rateLimitHandler,
  keyGenerator: (req) => req.ip ?? 'unknown',
});
