import { Worker, type Job } from 'bullmq';
import { AppDataSource } from '@database/datasource';
import { BatchJob, BatchJobStatus } from '@database/entities';
import { config } from '@config';
import { orderService } from '../orders/order.service';
import { BULK_QUEUE_NAME, type BulkOrderJobData, type BulkOrderResult } from './batch.service';
import { logger } from '@shared/logger';
import { AppError, ErrorCode } from '@shared/errors';
import { bullmqConnection } from '@infrastructure/queue/bullmq.connection';

let worker: Worker | null = null;

export function startBulkOrderWorker(): void {
  if (worker) return; // Already started

  worker = new Worker<BulkOrderJobData>(
    BULK_QUEUE_NAME,
    async (job: Job<BulkOrderJobData>) => {
      const { orderDto, userId, batchId } = job.data;

      logger.info('Processing bulk order job', {
        jobId: job.id,
        externalOrderId: orderDto.order_id,
        batchId,
        courierPartner: orderDto.courier_partner,
      });

      const batchRepo = AppDataSource.getRepository(BatchJob);
      const batch = await batchRepo.findOne({ where: { id: batchId } });
      if (!batch) {
        throw new Error(`Batch ${batchId} not found`);
      }

      let result: BulkOrderResult;

      try {
        const order = await orderService.createOrder(orderDto, userId, batchId);

        result = {
          externalOrderId: orderDto.order_id,
          status: 'SUCCESS',
          orderId: order.id,
          awbNumber: order.awbNumber ?? undefined,
        };

        batch.successCount += 1;
      } catch (err) {
        const isDuplicate = err instanceof AppError && err.code === ErrorCode.DUPLICATE_ORDER;

        result = {
          externalOrderId: orderDto.order_id,
          status: isDuplicate ? 'DUPLICATE' : 'FAILED',
          reason: err instanceof Error ? err.message : String(err),
        };

        batch.failureCount += 1;

        logger.error('Bulk order job failed', {
          jobId: job.id,
          externalOrderId: orderDto.order_id,
          batchId,
          errorType: err instanceof AppError ? err.code : 'UNKNOWN',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Append result and decrement pending count
      batch.results = [...batch.results, result] as BatchJob['results'];
      batch.pendingCount = Math.max(0, batch.pendingCount - 1);

      if (batch.pendingCount === 0) {
        batch.status = BatchJobStatus.COMPLETED;
      }

      await batchRepo.save(batch);
    },
    {
      connection: bullmqConnection,
      concurrency: config.bullmq.concurrency,
    },
  );

  worker.on('completed', (job) => {
    logger.info('Bulk order job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Bulk order job permanently failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  logger.info('BulkOrderWorker started', { concurrency: config.bullmq.concurrency });
}

export async function stopBulkOrderWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('BulkOrderWorker stopped');
  }
}
