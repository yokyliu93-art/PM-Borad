import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.request.headers.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('token='))
      ?.split('=')[1];
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      socket.userId = payload.sub;
      socket.userName = payload.name;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[ws] ${socket.userName} connected`);

    socket.on('join:project', ({ projectId }) => {
      socket.join(`project:${projectId}`);
      console.log(`[ws] ${socket.userName} joined project:${projectId}`);
    });

    socket.on('leave:project', ({ projectId }) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[ws] ${socket.userName} disconnected`);
    });
  });
}

export function emit(io, projectId, event, data) {
  io.to(`project:${projectId}`).emit(event, data);
}
