import { type Request, type Response, type NextFunction } from 'express';
import { orderService } from './order.service';
import { bulkOrderService } from '../batches/batch.service';
import { createOrderSchema, cancelOrderSchema } from './order.dto';

export class OrderController {
  // POST /api/v1/orders
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = createOrderSchema.parse(req.body);
      const order = await orderService.createOrder(dto, req.user!.sub);

      res.status(201).json({
        success: true,
        data: {
          order_id: order.id,
          external_order_id: order.externalOrderId,
          courier_order_id: order.courierOrderId,
          awb_number: order.awbNumber,
          status: order.status,
          courier_partner: order.courierPartner,
          created_at: order.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/orders/:order_id/track
  async trackOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { order_id } = req.params;
      const { order, events } = await orderService.trackOrder(order_id);

      res.json({
        success: true,
        data: {
          order_id: order.id,
          external_order_id: order.externalOrderId,
          awb_number: order.awbNumber,
          courier_partner: order.courierPartner,
          current_status: order.status,
          tracking_events: events.map((e) => ({
            status: e.status,
            normalized_status: e.normalizedStatus,
            location: e.location,
            description: e.description,
            event_time: e.eventTime,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/orders/:order_id/cancel
  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { order_id } = req.params;
      const dto = cancelOrderSchema.parse(req.body);
      const order = await orderService.cancelOrder(order_id, req.user!.sub, dto);

      res.json({
        success: true,
        data: {
          order_id: order.id,
          external_order_id: order.externalOrderId,
          awb_number: order.awbNumber,
          status: order.status,
          cancelled_at: order.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // POST /api/v1/orders/bulk
  async bulkCreateOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orders } = req.body as { orders?: unknown[] };
      if (!Array.isArray(orders) || orders.length === 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body must contain a non-empty "orders" array',
          },
        });
        return;
      }
      if (orders.length > 100) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Maximum 100 orders per bulk request' },
        });
        return;
      }

      const result = await bulkOrderService.submitBulk(orders, req.user!.sub);

      res.status(202).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/orders/partner/:partner_code
  async getOrdersByCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { partner_code } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const status = req.query.status as string | undefined;
      const sortBy = req.query.sortBy === 'updated_at' ? 'updated_at' : 'created_at';
      const sortOrder = req.query.sortOrder?.toString().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const { orders, total } = await orderService.getOrdersByCourierPartner(
        partner_code,
        req.user!.sub,
        req.user!.role,
        page,
        limit,
        status,
        sortBy,
        sortOrder,
      );

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: orders.map((o) => ({
          order_id: o.id,
          external_order_id: o.externalOrderId,
          courier_order_id: o.courierOrderId,
          awb_number: o.awbNumber,
          status: o.status,
          courier_partner: o.courierPartner,
          created_at: o.createdAt,
          updated_at: o.updatedAt,
        })),
        pagination: {
          total,
          page,
          limit,
          total_pages: totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const orderController = new OrderController();
