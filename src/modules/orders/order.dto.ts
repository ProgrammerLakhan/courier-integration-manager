import { z } from 'zod';

// Shared sub-schemas
const addressSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  mobile: z.string().min(7).max(15),
  address: z.string().min(1),
  address_type: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(4).max(10),
  country: z.string().min(1),
});

const dimensionsSchema = z.object({
  length: z.number().positive(),
  breadth: z.number().positive(),
  height: z.number().positive(),
});

const invoiceSchema = z.object({
  number: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invoice date must be YYYY-MM-DD'),
  value: z.number().positive(),
});

// Create single order
export const createOrderSchema = z.object({
  order_id: z.string().min(1, 'order_id is required'),
  courier_partner: z.string().min(1, 'courier_partner is required'),
  service_type: z.string().min(1),
  payment_mode: z.enum(['COD', 'PREPAID']),
  declared_value: z.number().positive(),
  collectable_value: z.number().min(0),
  item_description: z.string().min(1),
  item_quantity: z.number().int().positive(),
  weight: z.number().positive(),
  dimensions: dimensionsSchema,
  invoice: invoiceSchema,
  shipper: addressSchema,
  consignee: addressSchema,
  return_address: addressSchema,
});

export type CreateOrderDto = z.infer<typeof createOrderSchema>;

// Bulk order
export const bulkOrderSchema = z.object({
  orders: z
    .array(createOrderSchema)
    .min(1, 'At least one order is required')
    .max(100, 'Maximum 100 orders per bulk request'),
});

export type BulkOrderDto = z.infer<typeof bulkOrderSchema>;

// Cancel order
export const cancelOrderSchema = z.object({
  reason: z.string().optional(),
});

export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;
