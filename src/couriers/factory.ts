import { type ICourierAdapter } from './courier-adapter.interface';
import { AppError, ErrorCode } from '@shared/errors';
import { logger } from '@shared/logger';

/**
 * CourierFactory — Strategy + Factory pattern implementation.
 *
 * Resolves a courier_partner string to the corresponding ICourierAdapter at runtime.
 * Adding a new courier = register one adapter here. Zero other changes needed.
 *
 * Interview explanation:
 *   "We use the Strategy pattern so each courier adapter is interchangeable
 *    behind a common ICourierAdapter interface, and the Factory pattern to
 *    resolve adapters by code at runtime — open/closed extensibility."
 */
class CourierFactoryClass {
  private readonly adapters = new Map<string, ICourierAdapter>();

  /**
   * Register a courier adapter. Called once at app startup.
   */
  register(adapter: ICourierAdapter): void {
    this.adapters.set(adapter.courierCode, adapter);
    logger.info(`CourierFactory: registered adapter`, { courierCode: adapter.courierCode });
  }

  /**
   * Resolve an adapter by courier code.
   * Throws UNKNOWN_COURIER with list of supported couriers if not found.
   */
  getAdapter(courierCode: string): ICourierAdapter {
    const adapter = this.adapters.get(courierCode);
    if (!adapter) {
      const supported = this.getSupportedCouriers();
      throw new AppError(
        ErrorCode.UNKNOWN_COURIER,
        `Unknown courier partner: '${courierCode}'. Supported: [${supported.join(', ')}]`,
      );
    }
    return adapter;
  }

  /**
   * Returns the list of all registered courier codes.
   */
  getSupportedCouriers(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Checks if a courier code is registered and active.
   */
  has(courierCode: string): boolean {
    return this.adapters.has(courierCode);
  }
}

// Singleton export
export const CourierFactory = new CourierFactoryClass();
