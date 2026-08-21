import pino from 'pino';
import { env, isProduction } from '../../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
      '*.token',
      '*.newPassword',
      '*.currentPassword',
      '*.p256dh',
      '*.auth',
    ],
    censor: '[REDACTED]',
  },
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});

export type Logger = typeof logger;
