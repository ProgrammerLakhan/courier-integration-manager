import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '@config';
import { User, RefreshToken, CourierProvider, Order, TrackingEvent, BatchJob } from './entities';
import { InitialSchema1749600000000 } from './migrations/1749600000000-InitialSchema';
import { ConsolidateAndIndex1749600010000 } from './migrations/1749600010000-ConsolidateAndIndex';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  synchronize: false,
  logging: config.app.isDev ? ['query', 'error'] : ['error'],
  entities: [User, RefreshToken, CourierProvider, Order, TrackingEvent, BatchJob],
  migrations: [InitialSchema1749600000000, ConsolidateAndIndex1749600010000],
  migrationsRun: false,
  migrationsTableName: 'typeorm_migrations',
  ssl: false,
});

export async function initDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}
