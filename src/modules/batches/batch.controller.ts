import { type Request, type Response, type NextFunction } from 'express';
import { bulkOrderService } from './batch.service';

/**
 * Handles batch-related HTTP operations.
 * Decoupled from OrderController — batch is its own domain.
 */
export class BatchController {
  // GET /api/v1/batches/:batch_id
  async getBatchStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batch_id } = req.params;
      const batch = await bulkOrderService.getBatchStatus(batch_id);

      res.json({
        success: true,
        data: {
          batch_id: batch.id,
          status: batch.status,
          total_count: batch.totalCount,
          success_count: batch.successCount,
          failure_count: batch.failureCount,
          pending_count: batch.pendingCount,
          results: batch.results,
          created_at: batch.createdAt,
          updated_at: batch.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const batchController = new BatchController();
