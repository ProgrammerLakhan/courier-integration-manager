import { type UserRole } from '@database/entities';

export interface RegisterDto {
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
  tokens: AuthTokens;
}
