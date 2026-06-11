import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './User.entity';
import { CourierProvider } from './CourierProvider.entity';
import { type TrackingEvent } from './TrackingEvent.entity';
import { type BatchJob } from './BatchJob.entity';

export enum OrderStatus {
  CREATED = 'CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

/**
 * Order is the central entity.
 * It holds all @ManyToOne FK columns (child side).
 * @OneToMany → TrackingEvent kept here because TrackingEvent only imports Order (no cycle).
 * BatchJob and User @ManyToOne inverse references removed since those parents no longer
 * have the matching @OneToMany properties.
 */
@Entity('orders')
@Index(['externalOrderId'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true, name: 'external_order_id' })
  externalOrderId!: string;

  @Column({ type: 'varchar', length: 50, name: 'courier_partner' })
  courierPartner!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'courier_order_id' })
  courierOrderId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'awb_number' })
  awbNumber!: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.CREATED })
  status!: OrderStatus;

  @Column({ type: 'jsonb', nullable: true, name: 'courier_request_payload' })
  courierRequestPayload!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, name: 'courier_response_payload' })
  courierResponsePayload!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true, name: 'failure_reason' })
  failureReason!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'batch_id' })
  batchId!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @Column({ type: 'uuid', nullable: true, name: 'cancelled_by' })
  cancelledById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancelled_by' })
  cancelledBy!: User | null;

  @ManyToOne(() => CourierProvider, { nullable: true, eager: false })
  @JoinColumn({ name: 'courier_partner', referencedColumnName: 'code' })
  courierProviderRef!: CourierProvider | null;

  @ManyToOne('BatchJob', { nullable: true })
  @JoinColumn({ name: 'batch_id' })
  batchJob!: BatchJob | null;

  // TrackingEvent only imports Order → no cycle, @OneToMany is safe here
  @OneToMany('TrackingEvent', 'order')
  trackingEvents!: TrackingEvent[];
}
