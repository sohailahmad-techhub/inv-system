import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export function loadEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'api', '.env'),
    path.resolve(__dirname, '../../.env')
  ];

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return envPath;
    }
  }

  dotenv.config();
  return null;
}
