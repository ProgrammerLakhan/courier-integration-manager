import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { type CourierProvider } from '@database/entities';
import { CourierError, CourierAuthError } from './errors';
import { logger } from './logger';
import { RequestContext } from './context';

export interface ITokenManager {
  getToken(): Promise<string>;
  refreshToken(): Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _authRetried?: boolean;
}

/**
 * Factory that creates a configured Axios instance for a courier partner.
 *
 * Features:
 * - Base URL + timeout read from CourierProvider DB row (fully config-driven)
 * - Request interceptor: attaches Bearer token from ITokenManager
 * - Response interceptor:
 *     - 401 → refresh token once, retry (handles expired tokens automatically)
 *     - 5xx / network error → exponential backoff retry (configurable per courier)
 * - All retries logged with orderId and courierPartner from RequestContext
 */
export function createCourierHttpClient(
  provider: CourierProvider,
  tokenManager?: ITokenManager,
): AxiosInstance {
  const instance = axios.create({
    baseURL: provider.baseUrl,
    timeout: provider.timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });

  // Attach auth token to request
  instance.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
    if (tokenManager) {
      const token = await tokenManager.getToken();
      cfg.headers.set('Authorization', `Bearer ${token}`);
    }
    return cfg;
  });

  // Handle response retries on 401 and 5xx errors
  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as RetryConfig;
      if (!config) throw error;

      const ctx = RequestContext.get();

      // Refresh token and retry on 401 once
      if (error.response?.status === 401 && tokenManager && !config._authRetried) {
        config._authRetried = true;
        logger.warn('Courier auth failed — refreshing token', {
          courierPartner: provider.code,
          ...ctx,
        });
        try {
          await tokenManager.refreshToken();
        } catch {
          throw new CourierAuthError(provider.code);
        }
        return instance(config);
      }

      // Exponential backoff retry on 5xx or network issues
      const isRetryable = !error.response || error.response.status >= 500;
      config._retryCount = config._retryCount ?? 0;

      if (isRetryable && config._retryCount < provider.maxRetries) {
        config._retryCount += 1;
        const delay = Math.min(
          provider.retryBackoffMs *
            Math.pow(provider.retryBackoffMultiplier, config._retryCount - 1),
          provider.maxBackoffMs,
        );

        logger.warn('Courier request failed — retrying', {
          courierPartner: provider.code,
          attempt: config._retryCount,
          maxRetries: provider.maxRetries,
          delayMs: delay,
          status: error.response?.status,
          ...ctx,
        });

        await sleep(delay);
        return instance(config);
      }

      // Hand over error when all retries are exhausted
      const isClientError = error.response && error.response.status < 500;
      throw new CourierError({
        courierCode: provider.code,
        message: isClientError
          ? `Courier rejected the request: ${error.response?.data?.message ?? error.message}`
          : `Courier service unavailable after ${provider.maxRetries} retries`,
        courierStatusCode: error.response?.status,
        rawResponse: error.response?.data,
        isClientError: !!isClientError,
      });
    },
  );

  return instance;
}
