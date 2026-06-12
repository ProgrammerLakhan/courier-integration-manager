import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  type ValueTransformer,
} from 'typeorm';
import { CryptoUtils } from '@shared/utils/crypto';

export enum CourierAuthType {
  BEARER_TOKEN = 'BEARER_TOKEN',
  API_KEY = 'API_KEY',
  NONE = 'NONE',
}

export interface UrbaneBoltConfig {
  authType: CourierAuthType.BEARER_TOKEN;
  authEndpoint: string;
  authCredentials: {
    username: string;
    password?: string;
  };
  customerCode?: string;
}

export interface MockCourierConfig {
  authType: CourierAuthType.NONE;
  authEndpoint?: null;
  authCredentials?: null;
}

export type CourierConfig = UrbaneBoltConfig | MockCourierConfig | Record<string, unknown>;

export const credentialsTransformer: ValueTransformer = {
  to(value: unknown) {
    if (!value) return value;
    return CryptoUtils.encrypt(value);
  },
  from(value: unknown) {
    if (!value) return value;
    return CryptoUtils.decrypt(value);
  },
};

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
    type: 'jsonb',
    name: 'courier_config',
    nullable: true,
    transformer: credentialsTransformer,
  })
  courierConfig!: CourierConfig | null;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
