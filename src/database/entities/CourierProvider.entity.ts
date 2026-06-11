import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CourierAuthType {
  BEARER_TOKEN = 'BEARER_TOKEN',
  API_KEY = 'API_KEY',
  NONE = 'NONE',
}

@Entity('courier_providers')
export class CourierProvider {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName!: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 500, name: 'base_url' })
  baseUrl!: string;

  @Column({
    type: 'enum',
    enum: CourierAuthType,
    default: CourierAuthType.BEARER_TOKEN,
    name: 'auth_type',
  })
  authType!: CourierAuthType;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'auth_endpoint' })
  authEndpoint!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'auth_credentials' })
  authCredentials!: Record<string, string> | null;

  @Column({ type: 'int', default: 10000, name: 'timeout_ms' })
  timeoutMs!: number;

  @Column({ type: 'int', default: 3, name: 'max_retries' })
  maxRetries!: number;

  @Column({ type: 'int', default: 1000, name: 'retry_backoff_ms' })
  retryBackoffMs!: number;

  @Column({ type: 'float', default: 2.0, name: 'retry_backoff_multiplier' })
  retryBackoffMultiplier!: number;

  @Column({ type: 'int', default: 30000, name: 'max_backoff_ms' })
  maxBackoffMs!: number;

  @Column({ type: 'jsonb', nullable: true, name: 'extra_config' })
  extraConfig!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
