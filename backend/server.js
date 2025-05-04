require('dotenv').config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const setupWSConnection = require('y-websocket/bin/utils.js').setupWSConnection; // ✅ fixed
const WebSocket = require('ws');


// === Setup Express & HTTP Server ===
const app = express();
const server = http.createServer(app); // For WebSocket and Express

// === MongoDB Setup ===
mongoose.connect(process.env.MONGO_URI_USERS || "mongodb://localhost:27017/codeauth", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on("connected", () => console.log("✅ MongoDB connected successfully"));
mongoose.connection.on("error", (err) => console.error("❌ MongoDB connection error:", err));

// === Yjs WebSocket Server (Correct Setup) ===
const yjsWSS = new WebSocket.Server({ server }); // Attach to HTTP server
yjsWSS.on("connection", (conn, req) => {
  setupWSConnection(conn, req);
});


// === Middleware ===
app.use(express.json());
const corsOptions = {
  origin: function (origin, callback) {
    const allowed = ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean);
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// === Routes ===
const authRoutes = require("./src/routes/auth");
const protectedRoutes = require("./auth/protected.routes");
const roomModel = require("./src/models/Room");

app.use("/api/auth", authRoutes);
app.use("/api", protectedRoutes);

// === Socket.IO Setup ===
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});
const {
  setupSocketHandlers,
  setupRoomAPI,
  startRoomCleanupJob,
} = require("./socket.handlers");
setupSocketHandlers(io);
setupRoomAPI(app);
startRoomCleanupJob();

// === AI Chatbot Route ===
app.post("/api/chatbot", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    const ollama = spawn("ollama", ["run", "phi"]);
    const prompt = `You are a helpful assistant. Give a short and working code snippet in JavaScript for: ${message}`;
    let response = "", responded = false;

    const safeSend = (data) => {
      if (!responded) {
        res.status(200).json({ response: data });
        responded = true;
      }
    };

    ollama.stdout.on("data", data => response += data.toString());
    ollama.on("close", () => safeSend(response));
    ollama.on("error", err => {
      console.error("Ollama error:", err);
      if (!responded) res.status(500).json({ error: "AI service unavailable" });
    });

    setTimeout(() => {
      if (!responded) {
        ollama.kill();
        res.status(504).json({ error: "AI request timed out" });
      }
    }, 15000);

    ollama.stdin.write(prompt);
    ollama.stdin.end();
  } catch (err) {
    console.error("Chatbot error:", err);
    res.status(500).json({ error: "Something went wrong with the AI request" });
  }
});

// === Room Save/Load APIs ===
app.post("/api/room/save", async (req, res) => {
  try {
    const { roomId, code, language, owner } = req.body;
    if (!roomId) return res.status(400).json({ error: "Room ID is required" });

    let room = await roomModel.findOne({ roomId });
    if (room) {
      room.code = code || room.code;
      room.language = language || room.language;
      room.lastUpdated = new Date();
    } else {
      room = new roomModel({
        roomId,
        code: code || "",
        language: language || "javascript",
        owner: owner || "anonymous",
        created: new Date(),
        lastUpdated: new Date(),
      });
    }

    await room.save();
    res.status(200).json({ success: true, roomId: room.roomId });
  } catch (err) {
    console.error("Error saving room:", err);
    res.status(500).json({ error: "Failed to save room state" });
  }
});

app.get("/api/room/load/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await roomModel.findOne({ roomId });
    if (!room) return res.status(404).json({ error: "Room not found" });

    res.status(200).json({
      roomId: room.roomId,
      code: room.code,
      language: room.language,
      lastUpdated: room.lastUpdated,
    });
  } catch (err) {
    console.error("Error loading room:", err);
    res.status(500).json({ error: "Failed to load room state" });
  }
});

// === Health Check ===
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    mongoConnection: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString(),
  });
});

// === Start the Server ===
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});

// === Graceful Shutdown ===
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed");
      process.exit(0);
    });
  });
});
