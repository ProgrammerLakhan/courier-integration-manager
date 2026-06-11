import { type AxiosInstance } from 'axios';
import { type CourierProvider, OrderStatus } from '@database/entities';
import {
  type ICourierAdapter,
  type CreateOrderRequest,
  type TrackingEventDto,
} from '../courier-adapter.interface';
import { createCourierHttpClient } from '@shared/http.client';
import { UrbaneBoltTokenManager } from './token-manager';
import { RequestContext } from '@shared/context';
import { logger } from '@shared/logger';

interface UBManifestPayload {
  customer_code: string;
  service_type: string;
  payment_mode: string;
  declared_value: number;
  collectable_value: number;
  item_description: string;
  item_quantity: number;
  weight: number;
  length: number;
  breadth: number;
  height: number;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  shipper_name: string;
  shipper_email: string;
  shipper_mobile: string;
  shipper_address: string;
  shipper_address_type: string;
  shipper_city: string;
  shipper_state: string;
  shipper_pincode: string;
  shipper_country: string;
  consignee_name: string;
  consignee_email: string;
  consignee_mobile: string;
  consignee_address: string;
  consignee_address_type: string;
  consignee_city: string;
  consignee_state: string;
  consignee_pincode: string;
  consignee_country: string;
  return_name: string;
  return_email: string;
  return_mobile: string;
  return_address: string;
  return_address_type: string;
  return_city: string;
  return_state: string;
  return_pincode: string;
  return_country: string;
  order_id: string;
}

const UB_STATUS_MAP: Record<string, OrderStatus> = {
  'ORDER PLACED': OrderStatus.CREATED,
  MANIFESTED: OrderStatus.CREATED,
  'PICKED UP': OrderStatus.PICKED_UP,
  'PICKUP DONE': OrderStatus.PICKED_UP,
  'IN TRANSIT': OrderStatus.IN_TRANSIT,
  'OUT FOR DELIVERY': OrderStatus.IN_TRANSIT,
  DELIVERED: OrderStatus.DELIVERED,
  CANCELLED: OrderStatus.CANCELLED,
  RTO: OrderStatus.FAILED,
  LOST: OrderStatus.FAILED,
};

function normalizeStatus(raw: string): OrderStatus {
  return UB_STATUS_MAP[raw?.toUpperCase()] ?? OrderStatus.IN_TRANSIT;
}

/**
 * UrbaneBolt courier adapter.
 *
 * Maps our internal normalized DTOs ↔ UrbaneBolt's raw API format.
 * All HTTP config (base URL, timeout, retries) is read from the
 * CourierProvider DB row — nothing is hardcoded.
 */
export class UrbaneBoltAdapter implements ICourierAdapter {
  readonly courierCode = 'urbanebolt';

  private readonly http: AxiosInstance;
  private readonly tokenManager: UrbaneBoltTokenManager;
  private readonly customerCode: string;

  constructor(provider: CourierProvider) {
    this.tokenManager = new UrbaneBoltTokenManager(provider);
    this.http = createCourierHttpClient(provider, this.tokenManager);
    this.customerCode = (provider.extraConfig?.customerCode as string) ?? 'UEBCUS0008';
  }

  async createOrder(req: CreateOrderRequest): Promise<{
    courierOrderId: string;
    awbNumber: string;
    rawResponse: Record<string, unknown>;
  }> {
    RequestContext.set({ courierPartner: this.courierCode });

    const payload: UBManifestPayload = {
      customer_code: this.customerCode,
      service_type: req.service_type,
      payment_mode: req.payment_mode,
      declared_value: req.declared_value,
      collectable_value: req.collectable_value,
      item_description: req.item_description,
      item_quantity: req.item_quantity,
      weight: req.weight,
      length: req.dimensions.length,
      breadth: req.dimensions.breadth,
      height: req.dimensions.height,
      invoice_number: req.invoice.number,
      invoice_date: req.invoice.date,
      invoice_value: req.invoice.value,
      shipper_name: req.shipper.name,
      shipper_email: req.shipper.email,
      shipper_mobile: req.shipper.mobile,
      shipper_address: req.shipper.address,
      shipper_address_type: req.shipper.address_type,
      shipper_city: req.shipper.city,
      shipper_state: req.shipper.state,
      shipper_pincode: req.shipper.pincode,
      shipper_country: req.shipper.country,
      consignee_name: req.consignee.name,
      consignee_email: req.consignee.email,
      consignee_mobile: req.consignee.mobile,
      consignee_address: req.consignee.address,
      consignee_address_type: req.consignee.address_type,
      consignee_city: req.consignee.city,
      consignee_state: req.consignee.state,
      consignee_pincode: req.consignee.pincode,
      consignee_country: req.consignee.country,
      return_name: req.return_address.name,
      return_email: req.return_address.email,
      return_mobile: req.return_address.mobile,
      return_address: req.return_address.address,
      return_address_type: req.return_address.address_type,
      return_city: req.return_address.city,
      return_state: req.return_address.state,
      return_pincode: req.return_address.pincode,
      return_country: req.return_address.country,
      order_id: req.order_id,
    };

    logger.info('UrbaneBolt: creating order', { externalOrderId: req.order_id });

    const resp = await this.http.post<{
      data?: Array<{ awb?: string; order_id?: string; reference_number?: string }>;
    }>('/services/manifest/', [payload]);

    const raw = resp.data as Record<string, unknown>;
    const entry = resp.data?.data?.[0];

    if (!entry?.awb) {
      throw new Error(`UrbaneBolt manifest response missing AWB. Raw: ${JSON.stringify(raw)}`);
    }

    return {
      courierOrderId: entry.order_id ?? entry.reference_number ?? entry.awb,
      awbNumber: entry.awb,
      rawResponse: raw,
    };
  }

  async trackOrder(awbNumber: string): Promise<{
    currentStatus: OrderStatus;
    events: TrackingEventDto[];
    rawResponse: Record<string, unknown>;
  }> {
    RequestContext.set({ courierPartner: this.courierCode });

    const resp = await this.http.get<{
      data?: Array<{
        status?: string;
        location?: string;
        remark?: string;
        timestamp?: string;
      }>;
    }>(`/services/tracking-pub/?awb=${awbNumber}`);

    const raw = resp.data as Record<string, unknown>;
    const events = resp.data?.data ?? [];

    const trackingEvents: TrackingEventDto[] = events.map((e) => ({
      status: e.status ?? 'UNKNOWN',
      normalizedStatus: normalizeStatus(e.status ?? ''),
      location: e.location,
      description: e.remark,
      eventTime: e.timestamp,
      rawPayload: e,
    }));

    const latestStatus =
      trackingEvents.length > 0
        ? trackingEvents[trackingEvents.length - 1].normalizedStatus
        : OrderStatus.IN_TRANSIT;

    return { currentStatus: latestStatus, events: trackingEvents, rawResponse: raw };
  }

  async cancelOrder(awbNumber: string): Promise<{
    success: boolean;
    rawResponse: Record<string, unknown>;
  }> {
    RequestContext.set({ courierPartner: this.courierCode });

    logger.info('UrbaneBolt: cancelling order', { awbNumber });

    const resp = await this.http.post<{ status?: string; message?: string }>('/services/cancel/', {
      awbs: awbNumber,
    });

    const raw = resp.data as Record<string, unknown>;
    const success = resp.status === 200;

    return { success, rawResponse: raw };
  }
}
