const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'Telegram WebSocket Clone Server is running.' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for free-tier deployment flexibility
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
    // If user was in a different room, clean up first
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

  // 2. Message Event
  socket.on('send-message', ({ text, room }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const messageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username: user.username,
      text: text,
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

    // Broadcast message to everyone in the room (including sender)
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
