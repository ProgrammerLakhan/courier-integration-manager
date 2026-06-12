import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '@database/datasource';
import { User, UserRole, RefreshToken } from '@database/entities';
import { AppError, ErrorCode } from '@shared/errors';
import { JwtUtils } from './jwt.utils';
import { logger } from '@shared/logger';
import { type RegisterDto, type LoginDto, type AuthTokens, type AuthResponse } from './auth.dto';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(User);
  }
  private get refreshTokenRepo() {
    return AppDataSource.getRepository(RefreshToken);
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Email is already registered', [
        { field: 'email', message: 'Email already in use' },
      ]);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      role: dto.role ?? UserRole.CLIENT,
      isActive: true,
    });

    await this.userRepo.save(user);
    logger.info('User registered', { userId: user.id, role: user.role });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    // Use generic error — never reveal whether email exists (user enumeration prevention)
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    const isValid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;

    if (!user || !isValid || !user.isActive) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    logger.info('User logged in', { userId: user.id, role: user.role });
    return this.buildAuthResponse(user);
  }

  async refresh(refreshTokenStr: string): Promise<Pick<AuthTokens, 'accessToken'>> {
    const payload = JwtUtils.verifyRefreshToken(refreshTokenStr);

    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { id: payload.jti, userId: payload.sub },
      relations: ['user'],
    });

    if (!tokenRecord || tokenRecord.revoked || tokenRecord.expiresAt < new Date()) {
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Refresh token is invalid or expired');
    }

    const valid = await bcrypt.compare(refreshTokenStr, tokenRecord.tokenHash);
    if (!valid) {
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Refresh token mismatch');
    }

    const accessToken = JwtUtils.signAccessToken({
      sub: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
    });

    return { accessToken };
  }

  async logout(refreshTokenStr: string): Promise<void> {
    try {
      const payload = JwtUtils.verifyRefreshToken(refreshTokenStr);
      await this.refreshTokenRepo.update({ id: payload.jti }, { revoked: true });
    } catch {
      // Silent — token is already invalid
    }
  }

  private async buildAuthResponse(user: User): Promise<AuthResponse> {
    const jti = uuidv4();
    const accessToken = JwtUtils.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = JwtUtils.signRefreshToken({ sub: user.id, jti });

    // Store hashed refresh token
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const record = this.refreshTokenRepo.create({
      id: jti,
      userId: user.id,
      tokenHash,
      expiresAt: JwtUtils.getRefreshTokenExpiry(),
      revoked: false,
    });
    await this.refreshTokenRepo.save(record);

    return {
      user: { id: user.id, email: user.email, role: user.role },
      tokens: { accessToken, refreshToken },
    };
  }
}

export const authService = new AuthService();
