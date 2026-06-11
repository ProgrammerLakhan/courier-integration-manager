import { AppDataSource } from '@database/datasource';
import { CourierProvider } from '@database/entities';
import { CourierFactory } from './factory';
import { UrbaneBoltAdapter } from './urbanebolt/urbanebolt.adapter';
import { MockCourierAdapter } from './mock/mock.adapter';
import { logger } from '@shared/logger';

/**
 * Loads all active CourierProvider rows from DB and registers the
 * corresponding adapter in CourierFactory.
 *
 * Adding a new courier:
 *   1. Create a new adapter class implementing ICourierAdapter
 *   2. Add a case in the switch below
 *   3. Insert a row into courier_providers table
 *   → No other changes needed
 */
export async function registerCourierAdapters(): Promise<void> {
  const repo = AppDataSource.getRepository(CourierProvider);
  const providers = await repo.find({ where: { isActive: true } });

  for (const provider of providers) {
    switch (provider.code) {
      case 'urbanebolt':
        CourierFactory.register(new UrbaneBoltAdapter(provider));
        break;

      case 'mock':
        CourierFactory.register(new MockCourierAdapter());
        break;

      default:
        logger.warn(`CourierFactory: no adapter found for provider '${provider.code}' — skipping`);
    }
  }

  logger.info('CourierFactory: adapters registered', {
    couriers: CourierFactory.getSupportedCouriers(),
  });
}
