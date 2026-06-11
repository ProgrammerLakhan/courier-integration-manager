import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User.entity';
import { type Order } from './Order.entity';

export enum BatchJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}

/**
 * @OneToMany → Order removed to break the circular import:
 *   BatchJob → Order → BatchJob
 * The FK lives on orders.batch_id (@ManyToOne in Order). Query batch orders via:
 *   orderRepo.find({ where: { batchId: batchId } })
 */
@Entity('batch_jobs')
export class BatchJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'created_by' })
  createdById!: string;

  @Column({ type: 'int', default: 0, name: 'total_count' })
  totalCount!: number;

  @Column({ type: 'int', default: 0, name: 'success_count' })
  successCount!: number;

  @Column({ type: 'int', default: 0, name: 'failure_count' })
  failureCount!: number;

  @Column({ type: 'int', default: 0, name: 'pending_count' })
  pendingCount!: number;

  @Column({ type: 'enum', enum: BatchJobStatus, default: BatchJobStatus.PENDING })
  status!: BatchJobStatus;

  @Column({ type: 'jsonb', default: '[]' })
  results!: Array<{
    externalOrderId: string;
    status: 'SUCCESS' | 'FAILED' | 'DUPLICATE' | 'PENDING' | 'INVALID';
    orderId?: string;
    awbNumber?: string;
    reason?: string;
    validationErrors?: Array<{ field: string; message: string }>;
  }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User;

  // orders navigation removed — type-only import to keep IDE type hints
  orders!: Order[];
}
