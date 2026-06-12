import { type OrderStatus } from '@database/entities';

export interface AddressDto {
  name: string;
  email: string;
  mobile: string;
  address: string;
  address_type: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface CreateOrderRequest {
  order_id: string; // caller's idempotency key
  courier_partner: string;
  service_type: string; // e.g. "SDD", "NDD"
  payment_mode: string; // e.g. "COD", "PREPAID"
  declared_value: number;
  collectable_value: number;
  item_description: string;
  item_quantity: number;
  weight: number; // kg
  dimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  invoice: {
    number: string;
    date: string;
    value: number;
  };
  shipper: AddressDto;
  consignee: AddressDto;
  return_address: AddressDto;
}

export interface CreateOrderResponse {
  internalOrderId: string;
  externalOrderId: string;
  courierOrderId: string;
  awbNumber: string;
  status: OrderStatus;
  courierPartner: string;
  createdAt: string;
}

export interface TrackOrderResponse {
  internalOrderId: string;
  externalOrderId: string;
  awbNumber: string;
  courierPartner: string;
  currentStatus: OrderStatus;
  trackingEvents: TrackingEventDto[];
}

export interface TrackingEventDto {
  status: string;
  normalizedStatus: OrderStatus;
  location?: string;
  description?: string;
  eventTime?: string;
  rawPayload?: Record<string, unknown>;
}

export interface CancelOrderResponse {
  internalOrderId: string;
  externalOrderId: string;
  awbNumber: string | null;
  status: OrderStatus;
  cancelledAt: string;
}

export interface ICourierAdapter {
  readonly courierCode: string;

  /**
   * Create a shipment with the courier and return normalized response.
   */
  createOrder(request: CreateOrderRequest): Promise<{
    courierOrderId: string;
    awbNumber: string;
    rawResponse: Record<string, unknown>;
  }>;

  /**
   * Fetch tracking information from the courier.
   */
  trackOrder(awbNumber: string): Promise<{
    currentStatus: OrderStatus;
    events: TrackingEventDto[];
    rawResponse: Record<string, unknown>;
  }>;

  /**
   * Cancel a shipment with the courier.
   */
  cancelOrder(awbNumber: string): Promise<{
    success: boolean;
    rawResponse: Record<string, unknown>;
  }>;
}
