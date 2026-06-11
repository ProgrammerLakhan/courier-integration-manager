import { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../errors';
import { logger } from '../logger';
import { RequestContext } from '../context';

/**
 * Central error handler middleware — must be registered LAST in Express.
 * All errors are normalized to the same response shape.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const ctx = RequestContext.get();
  const requestId = ctx?.requestId ?? 'unknown';

  // Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    const appErr = new AppError(ErrorCode.VALIDATION_ERROR, 'Request validation failed', details);
    logger.warn('Validation error', { requestId, details });
    res.status(400).json(appErr.toResponse(requestId));
    return;
  }

  // Known Operational Error
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, {
        errorType: err.code,
        stack: err.stack,
        requestId,
      });
    } else {
      logger.warn(err.message, { errorType: err.code, requestId });
    }
    res.status(err.statusCode).json(err.toResponse(requestId));
    return;
  }

  // Unknown / Programming Error
  logger.error('Unhandled error', {
    errorType: ErrorCode.INTERNAL_ERROR,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    requestId,
  });

  const internal = new AppError(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred');
  res.status(500).json(internal.toResponse(requestId));
}
