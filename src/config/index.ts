import 'dotenv/config';

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export const config = {
  app: {
    port: optionalInt('PORT', 3000),
    env: optional('NODE_ENV', 'development'),
    get isDev() {
      return this.env === 'development';
    },
  },

  db: {
    host: optional('DB_HOST', 'localhost'),
    port: optionalInt('DB_PORT', 5432),
    username: optional('DB_USER', 'courier_user'),
    password: optional('DB_PASSWORD', 'courier_pass'),
    database: optional('DB_NAME', 'courier_db'),
  },

  redis: {
    host: optional('REDIS_HOST', 'localhost'),
    port: optionalInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    get url(): string {
      const auth = this.password ? `:${this.password}@` : '';
      return `redis://${auth}${this.host}:${this.port}`;
    },
  },

  jwt: {
    accessSecret: optional('JWT_ACCESS_SECRET', 'change-me-in-production'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'change-me-refresh-in-production'),
    accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
  },

  admin: {
    email: optional('ADMIN_EMAIL', 'admin@courier.com'),
    password: optional('ADMIN_PASSWORD', 'Admin@123456'),
  },

  rateLimit: {
    global: {
      windowMs: optionalInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: optionalInt('RATE_LIMIT_MAX', process.env.NODE_ENV === 'development' ? 10000 : 100),
    },
    auth: {
      windowMs: optionalInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: optionalInt('AUTH_RATE_LIMIT_MAX', process.env.NODE_ENV === 'development' ? 10000 : 10),
    },
    register: {
      windowMs: optionalInt('REGISTER_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
      max: optionalInt(
        'REGISTER_RATE_LIMIT_MAX',
        process.env.NODE_ENV === 'development' ? 10000 : 5,
      ),
    },
    courier: {
      windowMs: optionalInt('COURIER_RATE_LIMIT_WINDOW_MS', 60 * 1000),
      max: optionalInt(
        'COURIER_RATE_LIMIT_MAX',
        process.env.NODE_ENV === 'development' ? 10000 : 60,
      ),
    },
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
    dir: optional('LOG_DIR', 'logs'),
  },

  bullmq: {
    concurrency: optionalInt('BULLMQ_CONCURRENCY', 10),
  },
} as const;
