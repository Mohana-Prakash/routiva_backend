import path from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
    cwd: path.resolve(__dirname, '..'),
  });
}
