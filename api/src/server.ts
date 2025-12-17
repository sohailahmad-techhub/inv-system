import mongoose from 'mongoose';

import { createApp } from './app';
import { getEnv } from './config/env';
import { loadEnv } from './config/loadEnv';
import { connectToDatabase } from './db/mongoose';

loadEnv();

async function start() {
  const env = getEnv();

  await connectToDatabase({
    uri: env.mongoDbUri,
    maxPoolSize: env.mongoDbMaxPoolSize
  });

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.disconnect();
  process.exit(0);
});
