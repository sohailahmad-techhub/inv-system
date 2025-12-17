import { Router } from 'express';

import { getDatabaseStatus } from '../db/mongoose';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    db: getDatabaseStatus(),
    timestamp: new Date().toISOString()
  });
});
