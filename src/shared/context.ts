import { AsyncLocalStorage } from 'async_hooks';

export interface IRequestContext {
  requestId: string;
  userId?: string;
  userRole?: string;
  orderId?: string;
  courierPartner?: string;
}

const storage = new AsyncLocalStorage<IRequestContext>();

export const RequestContext = {
  /**
   * Run a function within a request context.
   */
  run<T>(ctx: IRequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },

  /**
   * Get the current request context (may be undefined outside of a request).
   */
  get(): IRequestContext | undefined {
    return storage.getStore();
  },

  /**
   * Patch the current context with additional fields.
   * Useful for enriching context mid-request (e.g. when orderId is known).
   */
  set(patch: Partial<IRequestContext>): void {
    const ctx = storage.getStore();
    if (ctx) Object.assign(ctx, patch);
  },
};
