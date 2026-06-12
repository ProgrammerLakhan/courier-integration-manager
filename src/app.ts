import 'reflect-metadata';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import {
  requestContextMiddleware,
  requestLoggerMiddleware,
} from '@shared/middleware/request-logger.middleware';
import { globalRateLimiter } from '@shared/middleware/rate-limiter.middleware';
import { errorHandler } from '@shared/middleware/error-handler.middleware';
import { notFoundHandler } from '@shared/middleware/not-found.middleware';

const app = express();

app.use(helmet());
app.set('trust proxy', 1);

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(requestContextMiddleware);
app.use(requestLoggerMiddleware);

app.use('/api/', globalRateLimiter);

// Health check endpoint (unauthenticated)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

export { app, notFoundHandler, errorHandler };
