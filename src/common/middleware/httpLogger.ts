import pinoHttp from 'pino-http';
import { logger } from '../logger';
import { Request } from 'express';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).requestId,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({
    userId: (req as Request).userId,
  }),
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
