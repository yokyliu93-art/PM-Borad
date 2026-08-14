import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';
import { setupSocket } from './socket/index.js';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/teams.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import templateRoutes from './routes/templates.js';
import dashboardRoutes from './routes/dashboard.js';
import agentRoutes from './routes/agent.js';
import contentRoutes from './routes/content.js';
import teamContentRoutes from './routes/teamContent.js';
import { feishuRouter, projectFeishuRouter } from './routes/feishu.js';
import { startReminderWorker } from './services/reminder.js';
import { startProjectProgressSyncWorker } from './services/feishuProgress.js';
import { startLoopWorker } from './services/loop.js';
import { startFeishuDocSyncWorker } from './services/feishu.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: config.clientUrl, credentials: true },
});

app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(config.uploadsDir));

// Attach io to req so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/tasks', taskRoutes);
app.use('/api/projects/:projectId/content', contentRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/content', teamContentRoutes);
app.use('/api/feishu', feishuRouter);
app.use('/api/projects/:projectId/feishu', projectFeishuRouter);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Single-port hosting: when a built frontend exists at <project>/dist, serve it
// alongside the API + Socket.IO so no reverse proxy is required. SPA fallback
// only handles GETs that aren't API/socket/upload paths.
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('[server] Error:', err);
  const status = err.status || err.statusCode || 500;
  const error = err.type === 'entity.too.large'
    ? '提交内容太大，请缩短输入内容或拆分后再试'
    : err.message || 'Internal server error';
  res.status(status).json({ ok: false, error });
});

migrate();
seed();
setupSocket(io);
startReminderWorker();
startProjectProgressSyncWorker();
startLoopWorker();
startFeishuDocSyncWorker();

server.listen(config.port, () => {
  console.log(`[server] Running on http://localhost:${config.port}`);
});

export { app, server, io };
