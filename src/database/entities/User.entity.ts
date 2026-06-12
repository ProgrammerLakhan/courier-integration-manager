import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type RefreshToken } from './RefreshToken.entity';

export enum UserRole {
  ADMIN = 'ADMIN',
  OPS = 'OPS',
  CLIENT = 'CLIENT',
}

/**
 * @OneToMany → Order, BatchJob removed to break circular imports.
 * TypeORM only requires @ManyToOne on the child side to establish FKs.
 * Query user's orders/batches via repository: orderRepo.find({ where: { createdById: userId } })
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT })
  role!: UserRole;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // refreshTokens kept — RefreshToken only imports User (no cycle)
  refreshTokens!: RefreshToken[];
}
