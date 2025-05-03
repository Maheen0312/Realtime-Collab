require('dotenv').config();
const express = require("express");
const http = require("http");
const cors = require('cors');
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const { ACTIONS } = require('./action');

// Route imports
const authRoutes = require('./src/routes/auth');
const protectedRoutes = require("./auth/protected.routes");
const room = require("./src/models/Room");

// === Initialize ===
const app = express();
const server = http.createServer(app);

// === Global Helpers ===
const participants = {};
const userSocketMap = {}; // socketId --> username mapping
const rooms = new Map(); // Map<roomId, Map<socketId, userData>>
const roomTimers = new Map(); // Track room cleanup timers

// === Middlewares ===
app.use(express.json());

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.options('*', cors(corsOptions));

// === MongoDB Connection ===
mongoose.connect(process.env.MONGO_URI_USERS || "mongodb://localhost:27017/codeauth", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on("connected", () => console.log("✅ MongoDB connected successfully"));
mongoose.connection.on("error", (err) => console.error("❌ MongoDB connection error:", err));

// === Routes ===
app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);

// === Socket.IO Setup ===
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Add socket.io configuration for better connection handling
  pingTimeout: 60000,
  pingInterval: 25000
});

// Helper function to handle user leaving
function handleUserLeaving(socket, roomId) {
  if (!roomId || !rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  const userData = room.get(socket.id);
  room.delete(socket.id);

  // Clear any existing timer for this room
  if (roomTimers.has(roomId)) {
    clearTimeout(roomTimers.get(roomId));
    roomTimers.delete(roomId);
  }

  if (room.size === 0) {
    // Instead of deleting room immediately, set a grace period
    console.log(`Last user left room ${roomId}, setting deletion timer`);
    const timer = setTimeout(() => {
      if (rooms.has(roomId) && rooms.get(roomId).size === 0) {
        console.log(`Room ${roomId} deletion timer expired, removing room`);
        rooms.delete(roomId);
        roomTimers.delete(roomId);
      }
    }, 120000); // 2 minutes grace period
    
    roomTimers.set(roomId, timer);
  } else {
    const updatedParticipants = Array.from(room.entries()).map(([id, info]) => ({
      socketId: id,
      ...info,
    }));
    
    // Notify users that someone left
    if (userData) {
      io.to(roomId).emit("user-left", {
        socketId: socket.id,
        name: userData.name || userSocketMap[socket.id]?.username
      });
    }
    
    // Update participant list for everyone
    io.to(roomId).emit("room-participants", updatedParticipants);
  }

  socket.leave(roomId);
  console.log(`User left room: ${roomId}`);
}

// Unified function to get or create a room
function getOrCreateRoom(roomId, isHost = false) {
  if (!rooms.has(roomId)) {
    if (!isHost) {
      return { exists: false, room: null };
    }
    console.log(`Creating new room: ${roomId}`);
    rooms.set(roomId, new Map());
    
    // Clear any existing timer for this room
    if (roomTimers.has(roomId)) {
      clearTimeout(roomTimers.get(roomId));
      roomTimers.delete(roomId);
    }
  }
  
  return { exists: true, room: rooms.get(roomId) };
}

// === SINGLE SOCKET.IO CONNECTION HANDLER ===
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);
  socket.data = {};

  // Handle joining room
  socket.on("join-room", ({ roomId, user }) => {
    console.log(`Attempting to join room: ${roomId}`, user);
    
    if (!roomId || !user) {
      console.log("Invalid room or user data");
      return socket.emit("error", { message: "Invalid room or user data" });
    }
    socket.on('join-room', (roomId, peerId) => {
      socket.join(roomId);
      socket.to(roomId).broadcast.emit('user-connected', peerId);
    });

    // Use unified function to get or create room
    const { exists, room } = getOrCreateRoom(roomId, user.isHost);
    
    if (!exists) {
      console.log(`Room ${roomId} not found and user is not host`);
      return socket.emit("room-not-found");
    }

    // Add user to room
    room.set(socket.id, {
      name: user.name,
      isHost: user.isHost || false,
      video: user.video || false,
      audio: user.audio || false,
    });

    // Also update the userSocketMap for code editor
    userSocketMap[socket.id] = { username: user.name };

    socket.join(roomId);
    socket.data.roomId = roomId;

    // Emit participant list
    const participants = Array.from(room.entries()).map(([id, info]) => ({
      socketId: id,
      ...info,
    }));
    
    console.log(`User ${user.name} joined room ${roomId}. Current participants:`, participants);
    
    // Confirm to the user that they've joined
    socket.emit("room-joined", { 
      roomId,
      success: true,
      participants
    });
    
    // Notify everyone about the new user
    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      name: user.name,
      isHost: user.isHost
    });
    
    // Update participant list for everyone
    io.to(roomId).emit("room-participants", participants);
  });

  // --- Code editor events ---
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = { username };
    
    // Use unified function to get or create room
    const { exists, room } = getOrCreateRoom(roomId, true); // Allow creation
    
    socket.join(roomId);
    socket.data.roomId = roomId;

    // Add user to room if not already present
    if (!room.has(socket.id)) {
      room.set(socket.id, {
        name: username,
        isHost: room.size === 0, // First user is host
      });
    }

    const clients = Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => ({
      socketId,
      username: userSocketMap[socketId]?.username || room.get(socketId)?.name,
    }));
    
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, { clients, username, socketId: socket.id });
    });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
    socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code, language }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    io.to(socketId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
  });

  // --- WebRTC signaling ---
  socket.on('send-signal', ({ userToSignal, from, signal }) => {
    io.to(userToSignal).emit('receive-signal', { from, signal });
  });

  // --- Leave room ---
  socket.on("leave-room", ({ roomId }) => {
    handleUserLeaving(socket, roomId);
  });

  // --- Handle disconnection ---
  socket.on('disconnecting', () => {
    const roomsJoined = [...socket.rooms];
    roomsJoined.forEach((roomId) => {
      if (roomId !== socket.id) { // Skip the default room (socket.id)
        socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
          socketId: socket.id,
          username: userSocketMap[socket.id]?.username,
        });
        
        // Also handle user leaving from rooms map
        handleUserLeaving(socket, roomId);
      }
    });
  });

  socket.on("disconnect", () => {
    const { roomId } = socket.data || {};
    if (roomId) {
      handleUserLeaving(socket, roomId);
    }
    
    delete userSocketMap[socket.id];
    console.log(`❌ Disconnected: ${socket.id}`);
  });

  socket.on("error", (err) => {
    console.error(`⚠️ Socket error: ${err.message}`);
  });
});

// Room validation with grace period for temporarily empty rooms
app.get("/api/check-room/:roomId", (req, res) => {
  const { roomId } = req.params;
  
  if (rooms.has(roomId)) {
    const room = rooms.get(roomId);
    const participants = Array.from(room.entries()).map(([id, info]) => ({
      socketId: id,
      ...info,
    }));
    
    res.status(200).json({ 
      exists: true,
      participants: participants,
      count: participants.length
    });
  } else {
    res.status(404).json({ 
      exists: false,
      message: "Room not found" 
    });
  }
});

// === AI Chatbot Endpoint ===
app.post("/api/chatbot", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    const ollama = spawn("ollama", ["run", "phi"]);
    const prompt = `You are a helpful assistant. Give a short and working code snippet in JavaScript for: ${message}`;
    let response = "";
    let responded = false;

    const safeSend = (data) => {
      if (responded) return;
      res.status(200).json({ response: data });
      responded = true;
    };

    ollama.stdout.on('data', (data) => {
      response += data.toString();
    });

    ollama.on("close", () => safeSend(response));
    ollama.stdin.write(prompt);
    ollama.stdin.end();
  } catch (err) {
    res.status(500).json({ error: "Something went wrong with the AI request" });
  }
});

// === Start the server ===
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
