import { v4 as uuidv4 } from 'uuid';
import { OrderStatus } from '@database/entities';
import {
  type ICourierAdapter,
  type CreateOrderRequest,
  type TrackingEventDto,
} from '../courier-adapter.interface';
import { logger } from '@shared/logger';

/**
 * MockCourierAdapter — bonus adapter demonstrating the pluggable architecture.
 *
 * Simulates realistic courier responses with deterministic behaviour:
 *   - createOrder  → always succeeds, returns a fake AWB
 *   - trackOrder   → returns a progression of tracking events
 *   - cancelOrder  → always succeeds
 *
 * Special test cases (controlled by external_order_id prefix):
 *   - "FAIL_*"     → createOrder throws a simulated courier error
 *   - "TIMEOUT_*"  → createOrder simulates a slow response (2 s)
 */
export class MockCourierAdapter implements ICourierAdapter {
  readonly courierCode = 'mock';

  async createOrder(req: CreateOrderRequest): Promise<{
    courierOrderId: string;
    awbNumber: string;
    rawResponse: Record<string, unknown>;
  }> {
    logger.info('MockCourier: createOrder called', { externalOrderId: req.order_id });

    // Special test case: simulate failure
    if (req.order_id.startsWith('FAIL_')) {
      throw new Error('MockCourier: simulated courier failure');
    }

    // Special test case: simulate slow response
    if (req.order_id.startsWith('TIMEOUT_')) {
      await sleep(2000);
    }

    const awb = `MOCK${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const courierOrderId = `MCK-${Date.now()}`;

    return {
      courierOrderId,
      awbNumber: awb,
      rawResponse: {
        status: 'SUCCESS',
        order_id: courierOrderId,
        awb,
        message: 'Shipment created successfully',
        timestamp: new Date().toISOString(),
      },
    };
  }

  trackOrder(awbNumber: string): Promise<{
    currentStatus: OrderStatus;
    events: TrackingEventDto[];
    rawResponse: Record<string, unknown>;
  }> {
    logger.info('MockCourier: trackOrder called', { awbNumber });

    // Deterministic events based on AWB hash — stable across calls
    const seed = awbNumber.charCodeAt(awbNumber.length - 1) % 4;
    const stages: Array<[OrderStatus, string, string]> = [
      [OrderStatus.CREATED, 'Order Placed', 'Mumbai Hub'],
      [OrderStatus.PICKED_UP, 'Pickup Done', 'Mumbai Hub'],
      [OrderStatus.IN_TRANSIT, 'In Transit', 'Delhi Hub'],
      [OrderStatus.DELIVERED, 'Delivered', 'Customer Location'],
    ];

    const events: TrackingEventDto[] = stages
      .slice(0, seed + 2)
      .map(([status, desc, location], idx) => ({
        status: status,
        normalizedStatus: status,
        location,
        description: desc,
        eventTime: new Date(Date.now() - (stages.length - idx) * 3600000).toISOString(),
        rawPayload: { status, description: desc, location },
      }));

    const currentStatus = events[events.length - 1].normalizedStatus;

    return Promise.resolve({
      currentStatus,
      events,
      rawResponse: { awb: awbNumber, events, status: 'SUCCESS' },
    });
  }

  cancelOrder(awbNumber: string): Promise<{
    success: boolean;
    rawResponse: Record<string, unknown>;
  }> {
    logger.info('MockCourier: cancelOrder called', { awbNumber });

    return Promise.resolve({
      success: true,
      rawResponse: {
        status: 'SUCCESS',
        awb: awbNumber,
        message: 'Shipment cancelled successfully',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
