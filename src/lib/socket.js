import { io } from 'socket.io-client';

const socket = io({ withCredentials: true, autoConnect: false });

export function connect() { if (!socket.connected) socket.connect(); }
export function disconnect() { socket.disconnect(); }

export function joinProject(projectId) { socket.emit('join:project', { projectId }); }
export function leaveProject(projectId) { socket.emit('leave:project', { projectId }); }

export function on(event, handler) { socket.on(event, handler); }
export function off(event, handler) { socket.off(event, handler); }

export default socket;
