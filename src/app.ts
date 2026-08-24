import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { corsAllowedOrigins } from './config/env';
import { requestIdMiddleware } from './common/middleware/requestId';
import { httpLogger } from './common/middleware/httpLogger';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { healthRouter } from './routes/health.routes';
import { apiRouter } from './routes';
import { openApiDocument } from './docs/openapi';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Exact request body bytes, captured before JSON parsing — QStash's signature is
       *  computed over the raw body, so verification needs this rather than the parsed object. */
      rawBody?: Buffer;
    }
  }
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || corsAllowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(httpLogger);

  app.get('/healthz', (_req, res) => res.status(200).json({ success: true, data: { status: 'live' } }));
  app.use('/health', healthRouter);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/docs.json', (_req, res) => res.json(openApiDocument));

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
