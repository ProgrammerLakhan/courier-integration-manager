import { AppDataSource } from '@database/datasource';
import { Order, OrderStatus, TrackingEvent } from '@database/entities';
import { CourierFactory } from '@couriers/factory';
import { type CreateOrderDto, type CancelOrderDto } from './order.dto';
import { AppError, ErrorCode } from '@shared/errors';
import { RequestContext } from '@shared/context';
import { logger, logCourierError } from '@shared/logger';
import type { CreateOrderRequest } from '@couriers/courier-adapter.interface';

export class OrderService {
  private get orderRepo() {
    return AppDataSource.getRepository(Order);
  }
  private get trackRepo() {
    return AppDataSource.getRepository(TrackingEvent);
  }

  // Create single order
  async createOrder(dto: CreateOrderDto, userId: string, batchId?: string): Promise<Order> {
    // 1. Idempotency check — DB-level UNIQUE constraint is the safety net,
    //    but we check first to return a clean 409 with the existing record.
    const existing = await this.orderRepo.findOne({
      where: { externalOrderId: dto.order_id },
    });
    if (existing) {
      throw new AppError(ErrorCode.DUPLICATE_ORDER, `Order '${dto.order_id}' already exists`, {
        orderId: existing.id,
        status: existing.status,
      });
    }

    // 2. Validate courier is registered and active
    const adapter = CourierFactory.getAdapter(dto.courier_partner);
    RequestContext.set({ courierPartner: dto.courier_partner });

    // 3. Build internal request payload
    const courierRequest: CreateOrderRequest = { ...dto };

    // 4. Persist order in CREATED state (before calling courier)
    const order = this.orderRepo.create({
      externalOrderId: dto.order_id,
      courierPartner: dto.courier_partner,
      status: OrderStatus.CREATED,
      courierRequestPayload: courierRequest as unknown as Record<string, unknown>,
      createdById: userId,
      batchId: batchId ?? null,
    });
    await this.orderRepo.save(order);
    RequestContext.set({ orderId: order.id });

    // 5. Call courier adapter
    try {
      const result = await adapter.createOrder(courierRequest);

      order.courierOrderId = result.courierOrderId;
      order.awbNumber = result.awbNumber;
      order.status = OrderStatus.CREATED;
      order.courierResponsePayload = result.rawResponse;
      await this.orderRepo.save(order);

      // 6. Append initial tracking event
      await this.appendTrackingEvent(order.id, {
        status: 'ORDER PLACED',
        normalizedStatus: OrderStatus.CREATED,
        description: 'Order created and shipment manifested',
        rawPayload: result.rawResponse,
      });

      logger.info('Order created successfully', {
        orderId: order.id,
        externalOrderId: order.externalOrderId,
        awbNumber: order.awbNumber,
        courierPartner: dto.courier_partner,
      });

      return order;
    } catch (err) {
      // 7. Persist failure for later reconciliation
      order.status = OrderStatus.FAILED;
      order.failureReason = err instanceof Error ? err.message : String(err);
      await this.orderRepo.save(order);

      logCourierError('Order creation failed', 'COURIER_API_ERROR', err, {
        externalOrderId: dto.order_id,
      });
      throw err;
    }
  }

  // Track order
  async trackOrder(internalOrderId: string): Promise<{
    order: Order;
    events: TrackingEvent[];
  }> {
    const order = await this.orderRepo.findOne({ where: { id: internalOrderId } });
    if (!order)
      throw new AppError(ErrorCode.ORDER_NOT_FOUND, `Order not found: ${internalOrderId}`);

    RequestContext.set({ orderId: order.id, courierPartner: order.courierPartner });

    // If no AWB yet, return DB state only
    if (!order.awbNumber) {
      const events = await this.trackRepo.find({
        where: { orderId: order.id },
        order: { eventTime: 'ASC' },
      });
      return { order, events };
    }

    // Fetch live tracking from courier
    try {
      const adapter = CourierFactory.getAdapter(order.courierPartner);
      const result = await adapter.trackOrder(order.awbNumber);

      // Append new events (append-only — never overwrite existing rows)
      for (const ev of result.events) {
        await this.appendTrackingEvent(order.id, {
          status: ev.status,
          normalizedStatus: ev.normalizedStatus,
          location: ev.location,
          description: ev.description,
          eventTime: ev.eventTime ? new Date(ev.eventTime) : undefined,
          rawPayload: ev.rawPayload ?? {},
        });
      }

      // Update order status if it has progressed
      if (order.status !== result.currentStatus && order.status !== OrderStatus.CANCELLED) {
        order.status = result.currentStatus;
        await this.orderRepo.save(order);
      }
    } catch (err) {
      logCourierError('Track order failed', 'COURIER_TRACK_ERROR', err);
      // Return DB state on courier failure — don't throw, degraded mode is acceptable
    }

    const events = await this.trackRepo.find({
      where: { orderId: order.id },
      order: { eventTime: 'ASC' },
    });

    return { order, events };
  }

  // Cancel order
  async cancelOrder(internalOrderId: string, userId: string, _dto: CancelOrderDto): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: internalOrderId } });
    if (!order)
      throw new AppError(ErrorCode.ORDER_NOT_FOUND, `Order not found: ${internalOrderId}`);

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Order is already cancelled');
    }
    if ([OrderStatus.DELIVERED, OrderStatus.FAILED].includes(order.status)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot cancel order in status: ${order.status}`,
      );
    }

    RequestContext.set({ orderId: order.id, courierPartner: order.courierPartner });

    if (order.awbNumber) {
      try {
        const adapter = CourierFactory.getAdapter(order.courierPartner);
        const result = await adapter.cancelOrder(order.awbNumber);
        order.courierResponsePayload = result.rawResponse;
      } catch (err) {
        logCourierError('Courier cancel call failed', 'COURIER_CANCEL_ERROR', err);
        // Persist failure but still update local status
      }
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelledById = userId;
    await this.orderRepo.save(order);

    await this.appendTrackingEvent(order.id, {
      status: 'CANCELLED',
      normalizedStatus: OrderStatus.CANCELLED,
      description: 'Order cancelled by user',
      rawPayload: {},
    });

    logger.info('Order cancelled', { orderId: order.id, cancelledBy: userId });
    return order;
  }

  // Get orders by courier partner
  async getOrdersByCourierPartner(
    courierPartner: string,
    userId: string,
    userRole: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    sortBy: string = 'created_at',
    sortOrder: string = 'DESC',
  ): Promise<{ orders: Order[]; total: number }> {
    const query: Record<string, unknown> = { courierPartner };

    // If client, restrict to their own created orders
    if (userRole === 'CLIENT') {
      query.createdById = userId;
    }

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    const take = Math.min(Math.max(1, limit), 100);
    const skip = (Math.max(1, page) - 1) * take;

    // Sorting fields mapping
    const sortField = sortBy === 'updated_at' ? 'updatedAt' : 'createdAt';
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [orders, total] = await this.orderRepo.findAndCount({
      where: query,
      order: { [sortField]: orderDirection },
      take,
      skip,
    });

    return { orders, total };
  }

  // Internal helper
  private async appendTrackingEvent(
    orderId: string,
    data: {
      status: string;
      normalizedStatus: OrderStatus;
      location?: string | null | undefined;
      description?: string | null | undefined;
      eventTime?: Date;
      rawPayload: Record<string, unknown>;
    },
  ): Promise<void> {
    const event = this.trackRepo.create({
      orderId,
      status: data.status,
      normalizedStatus: data.normalizedStatus,
      location: data.location ?? null,
      description: data.description ?? null,
      eventTime: data.eventTime ?? new Date(),
      rawPayload: data.rawPayload,
    });
    await this.trackRepo.save(event);
  }
}

export const orderService = new OrderService();
