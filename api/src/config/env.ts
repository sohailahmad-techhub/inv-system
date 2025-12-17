function numberFromEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export type Env = {
  port: number;
  mongoDbUri: string;
  mongoDbMaxPoolSize: number;
  corsOrigin: string;
  jwtSecret: string;
};

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  cachedEnv = {
    port: numberFromEnv(process.env.PORT, 5000),
    mongoDbUri:
      process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice_system',
    mongoDbMaxPoolSize: numberFromEnv(process.env.MONGODB_MAX_POOL_SIZE, 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me'
  };

  return cachedEnv;
}
