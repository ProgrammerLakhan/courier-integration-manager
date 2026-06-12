import { type Request, type Response, type NextFunction } from 'express';
import { AppError, ErrorCode } from '../errors';

/**
 * 404 handler — must be registered AFTER all routes.
 * Passes a typed AppError to the global error handler.
 */
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(ErrorCode.INTERNAL_ERROR, `Route not found: ${_req.method} ${_req.path}`));
}
