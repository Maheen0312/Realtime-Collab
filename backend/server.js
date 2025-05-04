// server.js - main server file with improved structure
require('dotenv').config();
const express = require("express");
const https = require("https");
const cors = require('cors');
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const setupWSConnection = require('y-websocket').setupWSConnection; // ✅ IF it's officially exported
// Import socket handlers and API setup
const {
  setupSocketHandlers,
  setupRoomAPI,
  startRoomCleanupJob
} = require('./socket.handlers');

// Route imports
const authRoutes = require('./src/routes/auth');
const protectedRoutes = require("./auth/protected.routes");
const roomModel = require("./src/models/Room");

// === Initialize ===
const app = express();
// Load SSL certificates (use your own in production)
const sslOptions = {
  key: fs.readFileSync("path/to/your/ssl/key.pem"),
  cert: fs.readFileSync("path/to/your/ssl/cert.pem"),
  ca: fs.readFileSync("path/to/your/ssl/ca.pem")  // optional, if you have CA certificate
};
const server = https.createServer(sslOptions, app);
// === WebSocket Server Setup (Yjs) ===
const wsServer = new Server({
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

wsServer.on('connection', (conn, req) => {
  setupWSConnection(conn, req);  // Setup Yjs WebSocket Connection
});

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
  // Socket.IO configuration for better connection handling
  pingTimeout: 60000,
  pingInterval: 25000
});

// Setup socket handlers
setupSocketHandlers(io);

// Setup room-related API endpoints
setupRoomAPI(app);

// Start the room cleanup job
startRoomCleanupJob();

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
    ollama.on("error", (err) => {
      console.error("Ollama error:", err);
      if (!responded) {
        res.status(500).json({ error: "AI service unavailable" });
        responded = true;
      }
    });

    // Add timeout to prevent hanging requests
    setTimeout(() => {
      if (!responded) {
        ollama.kill();
        res.status(504).json({ error: "AI request timed out" });
        responded = true;
      }
    }, 15000);

    ollama.stdin.write(prompt);
    ollama.stdin.end();
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Something went wrong with the AI request" });
  }
});

// MongoDB persistence for rooms (optional functionality)
app.post("/api/room/save", async (req, res) => {
  try {
    const { roomId, code, language, owner } = req.body;
    
    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }
    
    // Find room or create if it doesn't exist
    let room = await roomModel.findOne({ roomId });
    
    if (room) {
      // Update existing room
      room.code = code || room.code;
      room.language = language || room.language;
      room.lastUpdated = new Date();
    } else {
      // Create new room
      room = new roomModel({
        roomId,
        code: code || "",
        language: language || "javascript",
        owner: owner || "anonymous",
        created: new Date(),
        lastUpdated: new Date()
      });
    }
    
    await room.save();
    res.status(200).json({ success: true, roomId: room.roomId });
  } catch (err) {
    console.error("Error saving room:", err);
    res.status(500).json({ error: "Failed to save room state" });
  }
});

// Retrieve room from database
app.get("/api/room/load/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await roomModel.findOne({ roomId });
    
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    res.status(200).json({
      roomId: room.roomId,
      code: room.code,
      language: room.language,
      lastUpdated: room.lastUpdated
    });
  } catch (err) {
    console.error("Error loading room:", err);
    res.status(500).json({ error: "Failed to load room state" });
  }
});

// === Health check endpoint ===
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    mongoConnection: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString()
  });
});

// === Start the server ===
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});