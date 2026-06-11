import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { config } from '@config';
import { RequestContext } from './context';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

// Inject RequestContext into every log entry automatically
const contextFormat = winston.format((info) => {
  const ctx = RequestContext.get();
  if (ctx) {
    if (ctx.requestId) info['requestId'] = ctx.requestId;
    if (ctx.userId) info['userId'] = ctx.userId;
    if (ctx.userRole) info['userRole'] = ctx.userRole;
    if (ctx.orderId) info['orderId'] = ctx.orderId;
    if (ctx.courierPartner) info['courierPartner'] = ctx.courierPartner;
  }
  return info;
})();

const jsonFormat = combine(
  timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  errors({ stack: true }),
  contextFormat,
  json(),
);

const logDir = path.isAbsolute(config.logging.dir)
  ? config.logging.dir
  : path.join(process.cwd(), config.logging.dir);

const transports: winston.transport[] = [
  // All logs rotate daily
  new DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
    format: jsonFormat,
  }),
  // Error logs only
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '30d',
    zippedArchive: true,
    format: jsonFormat,
  }),
];

// Console logger for dev environment
if (config.app.isDev) {
  transports.push(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    }),
  );
}

export const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false,
});

export const logCourierError = (
  message: string,
  errorType: string,
  err: unknown,
  extra?: Record<string, unknown>,
) => {
  const ctx = RequestContext.get();
  logger.error(message, {
    errorType,
    stack: err instanceof Error ? err.stack : undefined,
    ...(ctx ?? {}),
    ...extra,
  });
};
