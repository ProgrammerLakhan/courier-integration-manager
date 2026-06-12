import { Queue } from 'bullmq';
import { type ZodError } from 'zod';
import { AppDataSource } from '@database/datasource';
import { BatchJob, BatchJobStatus, Order } from '@database/entities';
import { AppError, ErrorCode } from '@shared/errors';
import { logger } from '@shared/logger';
import { bullmqConnection } from '@infrastructure/queue/bullmq.connection';
import { createOrderSchema, type CreateOrderDto } from '../orders/order.dto';

export const BULK_QUEUE_NAME = 'bulk-orders';

// Lazy-initialized queue
let _queue: Queue | null = null;
export function getBulkQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(BULK_QUEUE_NAME, {
      connection: bullmqConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

export interface BulkOrderJobData {
  orderDto: CreateOrderDto;
  userId: string;
  batchId: string;
}

export interface BulkOrderResult {
  externalOrderId: string;
  status: 'SUCCESS' | 'FAILED' | 'DUPLICATE' | 'INVALID' | 'PENDING';
  orderId?: string;
  awbNumber?: string;
  reason?: string;
  validationErrors?: Array<{ field: string; message: string }>;
}

export class BulkOrderService {
  private get batchRepo() {
    return AppDataSource.getRepository(BatchJob);
  }

  /**
   * Entry point: validates all orders, marks invalid ones immediately,
   * enqueues valid ones to BullMQ, returns batch_id + immediate results.
   */
  async submitBulk(
    rawOrders: unknown[],
    userId: string,
  ): Promise<{
    batchId: string;
    totalCount: number;
    validCount: number;
    invalidCount: number;
    invalidResults: BulkOrderResult[];
    message: string;
  }> {
    const validOrders: CreateOrderDto[] = [];
    const invalidResults: BulkOrderResult[] = [];

    // 1. Validate ALL orders synchronously
    for (const raw of rawOrders) {
      const parsed = createOrderSchema.safeParse(raw);
      if (!parsed.success) {
        const errors = parsed.error.errors.map((e: ZodError['errors'][number]) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        const orderId = ((raw as Record<string, unknown>)?.order_id as string) ?? 'unknown';
        invalidResults.push({
          externalOrderId: orderId,
          status: 'INVALID',
          reason: 'Validation failed',
          validationErrors: errors,
        });
      } else {
        validOrders.push(parsed.data);
      }
    }

    // 2. Create BatchJob record
    const batch = this.batchRepo.create({
      createdById: userId,
      totalCount: rawOrders.length,
      successCount: 0,
      failureCount: invalidResults.length,
      pendingCount: validOrders.length,
      status: validOrders.length > 0 ? BatchJobStatus.PROCESSING : BatchJobStatus.COMPLETED,
      results: invalidResults as BatchJob['results'],
    });
    await this.batchRepo.save(batch);

    logger.info('Bulk batch created', {
      batchId: batch.id,
      total: rawOrders.length,
      valid: validOrders.length,
      invalid: invalidResults.length,
    });

    // 3. Enqueue valid orders to BullMQ
    if (validOrders.length > 0) {
      const queue = getBulkQueue();
      const jobs = validOrders.map((dto) => ({
        name: 'process-order',
        data: { orderDto: dto, userId, batchId: batch.id },
        opts: { jobId: `${batch.id}-${dto.order_id}` }, // prevent duplicate jobs
      }));
      await queue.addBulk(jobs);
      logger.info(`Enqueued ${jobs.length} orders to BullMQ`, { batchId: batch.id });
    }

    return {
      batchId: batch.id,
      totalCount: rawOrders.length,
      validCount: validOrders.length,
      invalidCount: invalidResults.length,
      invalidResults,
      message: `Batch submitted. ${validOrders.length} orders are being processed. Poll GET /api/v1/batches/${batch.id} for status.`,
    };
  }

  // Get batch status
  async getBatchStatus(batchId: string): Promise<BatchJob> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) {
      throw new AppError(ErrorCode.BATCH_NOT_FOUND, `Batch not found: ${batchId}`);
    }
    return batch;
  }

  // Reference Order entity so TypeORM includes it in metadata scans
  private readonly _orderRef = Order;
}

export const bulkOrderService = new BulkOrderService();
