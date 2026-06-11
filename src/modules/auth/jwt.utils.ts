import jwt from 'jsonwebtoken';
import { config } from '@config';
import { type UserRole } from '@database/entities';
import { AppError, ErrorCode } from '@shared/errors';

export interface AccessTokenPayload {
  sub: string; // user ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  jti: string; // JWT ID — matches refresh_tokens.id
}

export const JwtUtils = {
  signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });
  },

  signRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      return jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Access token has expired');
      }
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid access token');
    }
  },

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token has expired');
      }
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token');
    }
  },

  /**
   * Returns the expiry Date for a refresh token based on config.
   */
  getRefreshTokenExpiry(): Date {
    const ms = parseDuration(config.jwt.refreshExpiresIn);
    return new Date(Date.now() + ms);
  },
};

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}
