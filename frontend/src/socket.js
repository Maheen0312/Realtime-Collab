// src/socket.js
import { io } from 'socket.io-client';

let socket = null;

export const initSocket = async (auth = {}) => {
  if (socket) return socket; // Prevent multiple connections

  const options = {
    forceNew: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ['websocket'], // Removed 'polling' for stricter WebSocket use
    pingInterval: 25000,
    auth, // Optional auth (e.g., username or token)
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

// Optional: to access socket instance later (e.g., to emit events)
export const getSocket = () => socket;

export default initSocket;
