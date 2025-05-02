// src/socket.js
import { io } from 'socket.io-client';

let socket = null;

export const initSocket = async () => {
  if (socket) return socket; // Prevent multiple socket connections

  const options = {
    forceNew: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ['websocket', 'polling'],
    pingInterval: 25000, // default is 25000
  };

  socket = io('https://realtime-collab-backend-mysh.onrender.com', options);

  socket.on('connect', () => {
    console.log('✅ Connected to server:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
  });

  socket.on('connect_error', (err) => {
    console.error('⚠️ Connection error:', err.message);
  });

  socket.on('reconnect_error', (err) => {
    console.error('⚠️ Reconnect error:', err.message);
  });

  socket.on('reconnect_failed', () => {
    console.error('⚠️ Reconnect failed');
  });

  return socket;
};

export default initSocket;
