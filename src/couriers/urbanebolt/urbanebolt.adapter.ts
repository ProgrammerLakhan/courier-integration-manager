import { type AxiosInstance } from 'axios';
import { type CourierProvider, type UrbaneBoltConfig, OrderStatus } from '@database/entities';
import {
  type ICourierAdapter,
  type CreateOrderRequest,
  type TrackingEventDto,
} from '../courier-adapter.interface';
import { createCourierHttpClient } from '@shared/http.client';
import { UrbaneBoltTokenManager } from './token-manager';
import { RequestContext } from '@shared/context';
import { logger } from '@shared/logger';
import { AppError, ErrorCode } from '@shared/errors';

interface UBManifestPayload {
  customerCode: string;
  serviceType: string;
  payMode: string;
  declaredValue: number;
  collectableValue: number;
  itemDescription: string;
  itemQuantity: number;
  weight: number;
  length: number;
  breadth: number;
  height: number;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  shprName: string;
  shprEmail: string;
  shprMobile: string;
  shprAddress: string;
  shprAddressType: string;
  shprCity: string;
  shprState: string;
  shprPincode: string;
  shprCountry: string;
  consName: string;
  consEmail: string;
  consMobile: string;
  consAddress: string;
  consAddressType: string;
  consCity: string;
  consState: string;
  consPincode: string;
  consCountry: string;
  rtnName: string;
  rtnEmail: string;
  rtnMobile: string;
  rtnAddress: string;
  rtnAddressType: string;
  rtnCity: string;
  rtnState: string;
  rtnPincode: string;
  rtnCountry: string;
  orderNumber: string;
  pieces: number;
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
    const config = provider.courierConfig as UrbaneBoltConfig | null;
    if (!config?.customerCode) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Missing required 'customerCode' in UrbaneBolt provider configuration",
      );
    }
    this.customerCode = config.customerCode;
  }

  async createOrder(req: CreateOrderRequest): Promise<{
    courierOrderId: string;
    awbNumber: string;
    rawResponse: Record<string, unknown>;
  }> {
    RequestContext.set({ courierPartner: this.courierCode });

    const payload: UBManifestPayload = {
      customerCode: this.customerCode,
      serviceType: req.service_type,
      payMode: req.payment_mode,
      declaredValue: req.declared_value,
      collectableValue: req.collectable_value,
      itemDescription: req.item_description,
      itemQuantity: req.item_quantity,
      weight: req.weight,
      length: req.dimensions.length,
      breadth: req.dimensions.breadth,
      height: req.dimensions.height,
      invoiceNumber: req.invoice.number,
      invoiceDate: req.invoice.date,
      invoiceValue: req.invoice.value,
      shprName: req.shipper.name,
      shprEmail: req.shipper.email,
      shprMobile: req.shipper.mobile,
      shprAddress: req.shipper.address,
      shprAddressType: req.shipper.address_type,
      shprCity: req.shipper.city,
      shprState: req.shipper.state,
      shprPincode: req.shipper.pincode,
      shprCountry: req.shipper.country,
      consName: req.consignee.name,
      consEmail: req.consignee.email,
      consMobile: req.consignee.mobile,
      consAddress: req.consignee.address,
      consAddressType: req.consignee.address_type,
      consCity: req.consignee.city,
      consState: req.consignee.state,
      consPincode: req.consignee.pincode,
      consCountry: req.consignee.country,
      rtnName: req.return_address.name,
      rtnEmail: req.return_address.email,
      rtnMobile: req.return_address.mobile,
      rtnAddress: req.return_address.address,
      rtnAddressType: req.return_address.address_type,
      rtnCity: req.return_address.city,
      rtnState: req.return_address.state,
      rtnPincode: req.return_address.pincode,
      rtnCountry: req.return_address.country,
      orderNumber: req.order_id,
      pieces: req.item_quantity,
    };

    logger.info('UrbaneBolt: creating order', { externalOrderId: req.order_id });

    const resp = await this.http.post<{
      successResponse?: Array<{ awbNumber?: number | string; orderNumber?: string }>;
      errorResponse?: Array<{ status?: string; message?: string }>;
    }>('/services/manifest/', [payload]);

    const raw = resp.data as Record<string, unknown>;
    const entry = resp.data?.successResponse?.[0];
    const awb = entry?.awbNumber ? String(entry.awbNumber) : undefined;

    if (!entry || !awb) {
      throw new Error(`UrbaneBolt manifest response missing AWB. Raw: ${JSON.stringify(raw)}`);
    }

    return {
      courierOrderId: entry.orderNumber ?? awb,
      awbNumber: awb,
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
