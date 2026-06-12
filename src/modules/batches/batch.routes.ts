import { Router } from 'express';
import { jwtAuthMiddleware, rbac } from '../auth/auth.middleware';
import { UserRole } from '@database/entities';
import { batchController } from './batch.controller';

export const batchRouter = Router();

batchRouter.use(jwtAuthMiddleware);

/**
 * GET /api/v1/batches/:batch_id
 * Roles: ADMIN, OPS, CLIENT
 */
batchRouter.get(
  '/:batch_id',
  rbac(UserRole.ADMIN, UserRole.OPS, UserRole.CLIENT),
  (req, res, next) => {
    void batchController.getBatchStatus(req, res, next);
  },
);
