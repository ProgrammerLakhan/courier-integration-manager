import { type Request, type Response, type NextFunction } from 'express';
import { type UserRole } from '@database/entities';
import { AppError, ErrorCode } from '@shared/errors';
import { RequestContext } from '@shared/context';
import { JwtUtils, type AccessTokenPayload } from './jwt.utils';

// Extend Express Request to carry the authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Verifies the Authorization: Bearer <token> header.
 * Attaches decoded payload to req.user and enriches RequestContext.
 */
export function jwtAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError(ErrorCode.UNAUTHORIZED, 'Missing or invalid Authorization header'));
  }

  const token = header.slice(7);
  try {
    const payload = JwtUtils.verifyAccessToken(token);
    req.user = payload;
    // Enrich RequestContext so all downstream logs include user info
    RequestContext.set({ userId: payload.sub, userRole: payload.role });
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * RBAC middleware factory — restrict a route to specific roles.
 * Always used AFTER jwtAuthMiddleware.
 *
 * Usage: router.post('/bulk', jwtAuthMiddleware, rbac(UserRole.ADMIN, UserRole.OPS), controller)
 */
export function rbac(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(ErrorCode.UNAUTHORIZED, 'Unauthenticated request'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          ErrorCode.FORBIDDEN,
          `Role '${req.user.role}' is not permitted to access this resource`,
        ),
      );
    }
    next();
  };
}
