const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'Telegram WebSocket Clone Server is running.' });
});

// --- File Attachment Setup ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Create uploads directory on startup if it doesn't exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Serve uploaded files statically so they can be downloaded
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions: timestamp + random + original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Configure Multer limits (10MB maximum size)
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB in bytes
});

// File Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ error: 'No file uploaded or file exceeds 10MB limit.' });
    }

    // Generate absolute download URL
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    console.log(`Uploaded file: ${req.file.filename} (${req.file.size} bytes)`);

    // Dynamic self-destruct timer: Delete file after 5 minutes (300,000 ms)
    const filePath = req.file.path;
    const fileName = req.file.filename;
    setTimeout(() => {
      deleteFile(filePath, fileName);
    }, 5 * 60 * 1000);

    // Return file details to client
    res.send({
      name: req.file.originalname,
      size: req.file.size,
      url: fileUrl,
      filename: fileName
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).send({ error: 'Internal Server Error during upload.' });
  }
});

// Helper function to delete file
function deleteFile(filePath, fileName) {
  fs.exists(filePath, (exists) => {
    if (exists) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Error deleting file ${fileName}:`, err.message);
        } else {
          console.log(`Auto-deleted file: ${fileName} after 5 minutes.`);
        }
      });
    }
  });
}

// Background Cron-like Pruner: runs every 60 seconds
// Scans the uploads folder and unlinks any file older than 5 minutes.
// This is essential to clean up files after server restarts/wake-ups.
setInterval(() => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(UPLOADS_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        // Check if file is older than 5 minutes (300,000 ms)
        if (now - stats.mtimeMs > 5 * 60 * 1000) {
          deleteFile(filePath, file);
        }
      });
    });
  });
}, 60 * 1000);

// --- WebSocket & Server Initialization ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory state
// Map of socket.id -> { username, room, joinedAt }
const users = new Map();

// In-memory message cache for each room
// roomName -> array of messages
const messageHistory = new Map();
const MAX_HISTORY_PER_ROOM = 50;

// Predefined channels/rooms
const DEFAULT_ROOMS = ['Telegram General', 'Tech Talk', 'Meme Zone', 'Project Updates'];

// Initialize message history for default rooms
DEFAULT_ROOMS.forEach(room => {
  messageHistory.set(room, []);
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Join Room Event
  socket.on('join-room', ({ username, room }) => {
    const existingUser = users.get(socket.id);
    if (existingUser && existingUser.room !== room) {
      socket.leave(existingUser.room);
      // Notify previous room
      socket.to(existingUser.room).emit('user-left', {
        username: existingUser.username,
        system: true,
        message: `${existingUser.username} left the chat`
      });
    }

    // Join new room
    socket.join(room);
    users.set(socket.id, { username, room, joinedAt: Date.now() });

    console.log(`${username} joined room: ${room}`);

    // Welcome message to the user who joined
    socket.emit('message', {
      id: `sys-${Date.now()}`,
      username: 'Telegram Bot',
      text: `Welcome to ${room}, ${username}!`,
      timestamp: new Date().toISOString(),
      system: true
    });

    // Broadcast to other users in the room
    socket.to(room).emit('message', {
      id: `sys-${Date.now()}`,
      username: 'Telegram Bot',
      text: `${username} joined the chat`,
      timestamp: new Date().toISOString(),
      system: true
    });

    // Send chat history for this room to the joining user
    const history = messageHistory.get(room) || [];
    socket.emit('chat-history', history);

    // Send updated user list for this room
    sendRoomUsers(room);
  });

  // 2. Message Event (supports text and file attachments)
  socket.on('send-message', ({ text, room, file }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const messageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username: user.username,
      text: text,
      file: file || null, // Optional attachment meta: { name, size, url }
      timestamp: new Date().toISOString(),
      system: false
    };

    // Store in history
    if (!messageHistory.has(room)) {
      messageHistory.set(room, []);
    }
    const history = messageHistory.get(room);
    history.push(messageData);
    if (history.length > MAX_HISTORY_PER_ROOM) {
      history.shift(); // Keep history bounded
    }

    // Broadcast message to everyone in the room
    io.to(room).emit('message', messageData);
  });

  // 3. Typing Indicator Event
  socket.on('typing', ({ isTyping, room }) => {
    const user = users.get(socket.id);
    if (!user) return;

    socket.to(room).emit('user-typing', {
      username: user.username,
      isTyping: isTyping
    });
  });

  // 4. Disconnect Event
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const { username, room } = user;
      users.delete(socket.id);
      console.log(`${username} disconnected`);

      // Notify the room
      io.to(room).emit('message', {
        id: `sys-${Date.now()}`,
        username: 'Telegram Bot',
        text: `${username} left the chat`,
        timestamp: new Date().toISOString(),
        system: true
      });

      // Update room users list
      sendRoomUsers(room);
    }
  });

  // 5. WebRTC Signaling Relays
  socket.on('call-user', ({ to, offer, type }) => {
    io.to(to).emit('incoming-call', {
      from: socket.id,
      username: users.get(socket.id)?.username || 'Guest',
      offer: offer,
      type: type
    });
  });

  socket.on('make-answer', ({ to, answer }) => {
    io.to(to).emit('call-accepted', {
      from: socket.id,
      answer: answer
    });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', {
      from: socket.id,
      candidate: candidate
    });
  });

  socket.on('reject-call', ({ to }) => {
    io.to(to).emit('call-rejected', {
      from: socket.id
    });
  });

  socket.on('end-call', ({ to }) => {
    io.to(to).emit('call-ended', {
      from: socket.id
    });
  });
});

// Helper to get all users in a specific room and emit to that room
function sendRoomUsers(room) {
  const roomUsers = [];
  users.forEach((value, key) => {
    if (value.room === room) {
      roomUsers.push({
        id: key,
        username: value.username
      });
    }
  });
  io.to(room).emit('room-users', {
    room: room,
    users: roomUsers
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
