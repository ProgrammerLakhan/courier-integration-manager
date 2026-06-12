import { type Router, Router as ExpressRouter } from 'express';
import { orderController } from './order.controller';
import { jwtAuthMiddleware, rbac } from '../auth/auth.middleware';
import { UserRole } from '@database/entities';
import { courierRateLimiter } from '@shared/middleware/rate-limiter.middleware';

export const orderRouter: Router = ExpressRouter();

// All order routes require authentication
orderRouter.use(jwtAuthMiddleware);

/**
 * POST /api/v1/orders/bulk
 * Must be defined BEFORE /:order_id routes to avoid Express matching "bulk" as a param
 * Roles: ADMIN, OPS
 */
orderRouter.post(
  '/bulk',
  rbac(UserRole.ADMIN, UserRole.OPS),
  courierRateLimiter,
  (req, res, next) => {
    void orderController.bulkCreateOrders(req, res, next);
  },
);

/**
 * POST /api/v1/orders
 * Roles: ADMIN, OPS, CLIENT
 */
orderRouter.post(
  '/',
  rbac(UserRole.ADMIN, UserRole.OPS, UserRole.CLIENT),
  courierRateLimiter,
  (req, res, next) => {
    void orderController.createOrder(req, res, next);
  },
);

/**
 * GET /api/v1/orders/partner/:partner_code
 * Roles: ADMIN, OPS, CLIENT
 */
orderRouter.get(
  '/partner/:partner_code',
  rbac(UserRole.ADMIN, UserRole.OPS, UserRole.CLIENT),
  courierRateLimiter,
  (req, res, next) => {
    void orderController.getOrdersByCourier(req, res, next);
  },
);

/**
 * GET /api/v1/orders/:order_id/track
 * Roles: ADMIN, OPS, CLIENT (CLIENT sees own orders — enforced in service layer)
 */
orderRouter.get(
  '/:order_id/track',
  rbac(UserRole.ADMIN, UserRole.OPS, UserRole.CLIENT),
  courierRateLimiter,
  (req, res, next) => {
    void orderController.trackOrder(req, res, next);
  },
);

/**
 * POST /api/v1/orders/:order_id/cancel
 * Roles: ADMIN, OPS
 */
orderRouter.post(
  '/:order_id/cancel',
  rbac(UserRole.ADMIN, UserRole.OPS),
  courierRateLimiter,
  (req, res, next) => {
    void orderController.cancelOrder(req, res, next);
  },
);
