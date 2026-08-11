import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  feishuAppId: process.env.FEISHU_APP_ID || '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET || '',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'sqlite:./data/pm-board.db',
  uploadsDir: process.env.UPLOADS_DIR || path.join(serverRoot, '../data/uploads'),
  aiBaseUrl: process.env.AI_BASE_URL || '',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
};
