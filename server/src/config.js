import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  feishuAppId: process.env.FEISHU_APP_ID || '',
  feishuAppSecret: process.env.FEISHU_APP_SECRET || '',
  defaultTeamId: process.env.DEFAULT_TEAM_ID || '',
  // Dev-only login + user management. Off by default; enable explicitly for
  // local development via ENABLE_DEV_LOGIN=true. Never set in production.
  devLoginEnabled: process.env.ENABLE_DEV_LOGIN === 'true',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || 'sqlite:./data/pm-board.db',
  uploadsDir: process.env.UPLOADS_DIR || path.join(serverRoot, '../data/uploads'),
  aiBaseUrl: process.env.AI_BASE_URL || '',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro',
  feishuBossChatId: process.env.FEISHU_BOSS_CHAT_ID || '',
  feishuDocSyncMinutes: Number(process.env.FEISHU_DOC_SYNC_MINUTES || 10),
};
