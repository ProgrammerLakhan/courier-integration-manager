import { type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { RequestContext } from '../context';
import { logger } from '../logger';

/**
 * Seeds the AsyncLocalStorage RequestContext for every incoming request.
 * Must be one of the very first middlewares registered.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  res.setHeader('X-Request-Id', requestId);

  RequestContext.run({ requestId }, () => {
    next();
  });
}

/**
 * Logs every incoming request and its completion status/duration.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const ctx = RequestContext.get();
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: ctx?.requestId,
    });
  });

  next();
}
