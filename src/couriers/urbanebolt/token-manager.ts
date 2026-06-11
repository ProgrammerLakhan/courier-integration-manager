import axios from 'axios';
import { type CourierProvider } from '@database/entities';
import { CourierAuthError } from '@shared/errors';
import { logger } from '@shared/logger';
import { type ITokenManager } from '@shared/http.client';

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

/**
 * UrbaneBolt token manager.
 *
 * Caches the Bearer token in memory and refreshes it automatically when:
 *   1. The cache is empty / expired (proactive)
 *   2. The Axios interceptor receives a 401 (reactive)
 *
 * Token TTL is set conservatively to 55 minutes to avoid race conditions
 * near the 60-minute expiry window.
 */
export class UrbaneBoltTokenManager implements ITokenManager {
  private cache: TokenCache | null = null;
  private refreshPromise: Promise<void> | null = null;

  // Conservative TTL: 55 min (tokens typically valid 60 min)
  private readonly TOKEN_TTL_MS = 55 * 60 * 1000;

  constructor(private readonly provider: CourierProvider) {}

  async getToken(): Promise<string> {
    if (this.isValid()) {
      return this.cache!.token;
    }
    await this.refreshToken();
    return this.cache!.token;
  }

  async refreshToken(): Promise<void> {
    // Deduplicate concurrent refresh calls — only one HTTP request at a time
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private isValid(): boolean {
    return !!this.cache && Date.now() < this.cache.expiresAt;
  }

  private async doRefresh(): Promise<void> {
    const creds = this.provider.authCredentials;
    if (!creds?.username || !creds?.password) {
      throw new CourierAuthError(this.provider.code, 'Missing UrbaneBolt credentials in DB');
    }

    const authUrl = `${this.provider.baseUrl}${this.provider.authEndpoint}`;

    try {
      logger.info('UrbaneBolt: fetching auth token', { courierPartner: 'urbanebolt' });

      const resp = await axios.post<{ data?: { token?: string }; token?: string }>(
        authUrl,
        { username: creds.username, password: creds.password },
        { timeout: this.provider.timeoutMs },
      );

      // UrbaneBolt returns token in either resp.data.data.token or resp.data.token
      const token = resp.data?.data?.token ?? (resp.data as Record<string, unknown>)?.token;

      if (!token || typeof token !== 'string') {
        throw new Error('Token not found in auth response');
      }

      this.cache = { token, expiresAt: Date.now() + this.TOKEN_TTL_MS };
      logger.info('UrbaneBolt: token refreshed successfully', { courierPartner: 'urbanebolt' });
    } catch (err) {
      this.cache = null;
      logger.error('UrbaneBolt: token refresh failed', {
        courierPartner: 'urbanebolt',
        error: err instanceof Error ? err.message : String(err),
      });
      throw new CourierAuthError(this.provider.code, 'Failed to obtain UrbaneBolt auth token');
    }
  }
}
