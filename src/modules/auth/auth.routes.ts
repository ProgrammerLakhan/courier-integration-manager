import { type Router, Router as ExpressRouter } from 'express';
import { authController } from './auth.controller';
import { authRateLimiter, registerRateLimiter } from '@shared/middleware/rate-limiter.middleware';

import { jwtAuthMiddleware, rbac } from './auth.middleware';
import { UserRole } from '@database/entities';

export const authRouter: Router = ExpressRouter();

/**
 * POST /api/v1/auth/register
 * Enforced: Only ADMIN role can register new users
 * Rate limited: 5 requests / hour / IP
 */
authRouter.post(
  '/register',
  jwtAuthMiddleware,
  rbac(UserRole.ADMIN),
  registerRateLimiter,
  (req, res, next) => {
    void authController.register(req, res, next);
  },
);

/**
 * POST /api/v1/auth/login
 * Rate limited: 10 requests / 15 min / IP
 */
authRouter.post('/login', authRateLimiter, (req, res, next) => {
  void authController.login(req, res, next);
});

/**
 * POST /api/v1/auth/refresh
 * Rate limited: 10 requests / 15 min / IP
 */
authRouter.post('/refresh', authRateLimiter, (req, res, next) => {
  void authController.refresh(req, res, next);
});

/**
 * POST /api/v1/auth/logout
 */
authRouter.post('/logout', (req, res, next) => {
  void authController.logout(req, res, next);
});
