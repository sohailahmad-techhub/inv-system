import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { getEnv } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';

export function createApp() {
  const env = getEnv();

  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true
    })
  );
  app.use(express.json());

  app.use(healthRouter);

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        message: 'Not Found'
      }
    });
  });

  app.use(errorHandler);

  return app;
}
