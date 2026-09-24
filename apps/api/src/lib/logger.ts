import pino from 'pino';
import { env } from '../config/env.js';

export const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL ?? (env.isTest ? 'silent' : env.isProd ? 'info' : 'debug'),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.newPassword', '*.currentPassword', '*.refreshToken', '*.code'],
    censor: '[redacted]',
  },
};

export const logger = pino(loggerOptions);
