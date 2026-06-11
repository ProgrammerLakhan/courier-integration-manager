import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order, OrderStatus } from './Order.entity';

@Entity('tracking_events')
export class TrackingEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @Column({ type: 'varchar', length: 100 })
  status!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    nullable: true,
    name: 'normalized_status',
  })
  normalizedStatus!: OrderStatus | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'raw_payload' })
  rawPayload!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'event_time' })
  eventTime!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Order, (o) => o.trackingEvents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;
}
