// src/socket.js
import { io } from 'socket.io-client';

let socket = null; // define it globally

export const initSocket = async () => {
  const options = {
    'force new connection': true,
    reconnectionAttempt: 'Infinity',
    timeout: 10000,
    transports: ['websocket'],
  };

  socket = io('https://online-code-ollab-backend.onrender.com', options);

  // Now safely listen to events AFTER creating socket
  socket.on('connect', () => {
    console.log('✅ Connected to server:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
  });

  socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
  });

  return socket;
};

export default initSocket;
