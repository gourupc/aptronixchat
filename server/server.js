const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 — Render's network blocks IPv6 SMTP connections
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());
app.use(express.json());

// =============================================================
// ADMIN LOGIN ALERT EMAIL CONFIG
// Uses Gmail App Password — no Google Cloud setup needed.
// =============================================================
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ncnicola837@gmail.com';
const ADMIN_PASS  = process.env.ADMIN_EMAIL_APP_PASS || 'eubr cfap rhmh lvba';
const NOTIFY_TO   = process.env.NOTIFY_TO || ADMIN_EMAIL;

// Track last email attempt for diagnostics
let lastEmailStatus = { status: 'no attempts yet', error: null, time: null };

// Gmail transporter — port 587 + STARTTLS + IPv4 forced above
const mailTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: ADMIN_EMAIL,
    pass: ADMIN_PASS
  },
  tls: { rejectUnauthorized: false }
});

// Called on every successful login — sends alert email to admin
function sendLoginAlertEmail(ip, userAgent) {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  mailTransporter.sendMail({
    from: `"Doremon Messenger" <${ADMIN_EMAIL}>`,
    to: NOTIFY_TO,
    subject: '\uD83D\uDD10 Doremon Messenger - New Login Alert',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;padding:20px;border:1px solid #ddd;border-radius:10px;">
        <h2 style="color:#2481cc;margin-top:0;">\uD83D\uDD10 New Login Detected</h2>
        <p>Someone has successfully unlocked the Doremon Messenger gateway.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:15px;">
          <tr><td style="padding:8px;font-weight:bold;color:#555;">Time</td><td style="padding:8px;">${timestamp}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;color:#555;">IP Address</td><td style="padding:8px;"><code>${ip}</code></td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#555;">Browser</td><td style="padding:8px;font-size:0.85em;">${userAgent}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:0.8em;color:#999;">Automated security alert from Doremon Messenger.</p>
      </div>`
  }, (err, info) => {
    if (err) {
      console.error('[LOGIN ALERT] Email failed:', err.message);
      lastEmailStatus = { status: 'error', error: err.message, time: new Date().toISOString() };
    } else {
      console.log('[LOGIN ALERT] Email sent:', info.messageId);
      lastEmailStatus = { status: 'success', error: null, time: new Date().toISOString() };
    }
  });
}

// Basic health check
app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'Telegram WebSocket Clone Server is running.' });
});

// Diagnostic endpoint
app.get('/api/email-status', (req, res) => {
  res.json({
    config: {
      from: ADMIN_EMAIL,
      to: NOTIFY_TO,
      appPasswordConfigured: !!ADMIN_PASS,
      transport: 'smtp.gmail.com:587 (STARTTLS + IPv4)'
    },
    lastEmailStatus
  });
});


// --- File Attachment Setup ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Multer Disk Storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// 10MB strict limit
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Serve uploads static assets
app.use('/uploads', express.static(UPLOADS_DIR));

// POST /upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ error: 'No file uploaded.' });
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  
  res.send({
    name: req.file.originalname,
    size: req.file.size,
    url: fileUrl,
    filename: req.file.filename
  });

  // Dynamic self-destruct for uploads (exactly 5 minutes)
  setTimeout(() => {
    const filePath = path.join(UPLOADS_DIR, req.file.filename);
    fs.unlink(filePath, (err) => {
      if (err) console.log(`Auto-prune upload setTimeout unlink error:`, err.message);
      else console.log(`Successfully auto-pruned uploaded file from disk: ${req.file.filename}`);
    });
  }, 5 * 60 * 1000);
});

// --- Passcode Verification with IP Rate Limiting ---
const loginTracker = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION = 60 * 60 * 1000; // 1 hour

app.post('/api/verify-passcode', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { passcode } = req.body;
  console.log(`[PASSCODE ATTEMPT] Received passcode check from IP: ${clientIp} | Input: "${passcode}"`);

  // Clean up expired blocks
  const record = loginTracker.get(clientIp);
  if (record && record.blockedUntil && record.blockedUntil < Date.now()) {
    loginTracker.delete(clientIp);
  }

  const currentRecord = loginTracker.get(clientIp);

  // Check if currently blocked
  if (currentRecord && currentRecord.blockedUntil) {
    const waitTimeMinutes = Math.ceil((currentRecord.blockedUntil - Date.now()) / 60000);
    return res.status(423).json({
      error: `Too many wrong passcode entries. This IP is blocked for ${waitTimeMinutes} minutes.`
    });
  }

  const isCorrect = (passcode && passcode.toString().trim().toLowerCase() === 'golu0805');

  if (isCorrect) {
    loginTracker.delete(clientIp); // Reset on success

    // Send admin login alert email (non-blocking)
    const userAgent = req.headers['user-agent'] || 'Unknown';
    sendLoginAlertEmail(clientIp, userAgent);
    console.log(`[LOGIN SUCCESS] IP: ${clientIp} | Time: ${new Date().toISOString()}`);

    return res.json({ success: true });
  } else {
    let attempts = 1;
    if (currentRecord) {
      currentRecord.failedAttempts += 1;
      attempts = currentRecord.failedAttempts;
    } else {
      loginTracker.set(clientIp, { failedAttempts: 1, blockedUntil: null });
    }

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const blockedUntil = Date.now() + BLOCK_DURATION;
      loginTracker.set(clientIp, { failedAttempts: attempts, blockedUntil: blockedUntil });
      return res.status(423).json({
        error: "Too many failed attempts. This IP has been blocked for 1 hour."
      });
    } else {
      const remaining = MAX_FAILED_ATTEMPTS - attempts;
      return res.json({
        success: false,
        remainingAttempts: remaining,
        message: `Incorrect passcode. You have ${remaining} attempt(s) remaining.`
      });
    }
  }
});

// Endpoint to notify when a user enters the messenger using an existing session
app.post('/api/notify-session-entry', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  console.log(`[SESSION ENTRY] Pre-authenticated user entered the app. IP: ${clientIp}`);
  sendLoginAlertEmail(clientIp, userAgent);
  res.json({ success: true });
});

// 60-Second Background Clean Up Cron (across container sleeps/restarts)
setInterval(() => {
  const cutoffTime = Date.now() - (5 * 60 * 1000); // 5 minutes ago
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) return console.error('Uploads cleaner directory read error:', err.message);
    
    files.forEach(file => {
      const filePath = path.join(UPLOADS_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (stats.mtimeMs < cutoffTime) {
          fs.unlink(filePath, (err) => {
            if (err) console.log(`Unlink cleaner error for ${file}:`, err.message);
            else console.log(`Cleaner pruned file: ${file}`);
          });
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

// Persistent status tracker mapping: username -> { username, lastSeen, status, socketId }
const persistentUsers = new Map();

// Self-destruct chat timer configurations: roomName -> durationSeconds
const roomSelfDestructTimers = new Map();

// In-memory message cache for each room (roomName -> array of messages)
const messageHistory = new Map();
const MAX_HISTORY_PER_ROOM = 100;

// Predefined channels/rooms
const DEFAULT_ROOMS = ['Doremon General', 'Tech Talk', 'Meme Zone', 'Project Updates'];
const activeRooms = new Set(DEFAULT_ROOMS);

// Initialize message history for default rooms
DEFAULT_ROOMS.forEach(room => {
  messageHistory.set(room, []);
});

io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
  const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';
  console.log(`[SOCKET CONNECT] New WebSocket client connected. IP: ${clientIp}`);
  sendLoginAlertEmail(clientIp, userAgent);

  console.log(`User connected: ${socket.id}`);

  // Broadcast current rooms list to the connected client
  socket.emit('rooms-list', Array.from(activeRooms));

  // 1. Join Room Event
  socket.on('join-room', ({ username, room }) => {
    const existingUser = users.get(socket.id);
    let isDM = room.startsWith('dm:');

    if (existingUser && existingUser.room !== room) {
      socket.leave(existingUser.room);
      // Notify previous room
      if (!existingUser.room.startsWith('dm:')) {
        socket.to(existingUser.room).emit('message', {
          id: `sys-${Date.now()}`,
          username: 'Doremon Bot',
          text: `${existingUser.username} left the chat`,
          timestamp: new Date().toISOString(),
          system: true
        });
      }
    }

    // Join new room
    socket.join(room);
    socket.join(`user:${username}`); // Join private channel room
    users.set(socket.id, { username, room, joinedAt: Date.now() });

    // Track user presence in persistentUsers list
    persistentUsers.set(username, {
      username: username,
      status: 'online',
      lastSeen: Date.now(),
      socketId: socket.id
    });

    console.log(`${username} joined room: ${room}`);

    // Send self-destruct configuration state to the client
    const currentTimer = roomSelfDestructTimers.get(room) || 0;
    socket.emit('self-destruct-timer-updated', { room, duration: currentTimer });

    // Suppress welcome/join text inside private DMs
    if (!isDM) {
      // Welcome message to the user who joined
      socket.emit('message', {
        id: `sys-${Date.now()}`,
        username: 'Doremon Bot',
        text: `Welcome to ${room}, ${username}!`,
        timestamp: new Date().toISOString(),
        system: true
      });

      // Broadcast to other users in the room
      socket.to(room).emit('message', {
        id: `sys-${Date.now()}`,
        username: 'Doremon Bot',
        text: `${username} joined the chat`,
        timestamp: new Date().toISOString(),
        system: true
      });

      // Send updated user list for this room
      sendRoomUsers(room);
    }

    // Send chat history for this room to the joining user
    const history = messageHistory.get(room) || [];
    socket.emit('chat-history', history);

    // Send global users list update
    sendGlobalUsers();
  });

  // 2. Message Event (supports text, file attachments, and status ticks)
  socket.on('send-message', ({ text, room, file }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const messageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      username: user.username,
      text: text,
      file: file || null,
      timestamp: new Date().toISOString(),
      system: false,
      room: room,
      status: 'sent'
    };

    // Calculate self destruct if configured
    const destructDuration = roomSelfDestructTimers.get(room);
    if (destructDuration && destructDuration > 0) {
      messageData.selfDestructAt = new Date(Date.now() + destructDuration * 1000).toISOString();
    }

    // Determine delivery status for DM chats
    let isDM = room.startsWith('dm:');
    let recipientName = null;
    if (isDM) {
      const parts = room.split(':');
      recipientName = (user.username === parts[1]) ? parts[2] : parts[1];
      
      const recipientUser = persistentUsers.get(recipientName);
      if (recipientUser && recipientUser.status === 'online') {
        messageData.status = 'delivered';
      }
    }

    // Store in message history
    if (!messageHistory.has(room)) {
      messageHistory.set(room, []);
    }
    const history = messageHistory.get(room);
    history.push(messageData);
    if (history.length > MAX_HISTORY_PER_ROOM) {
      history.shift();
    }

    // Route messages
    if (isDM) {
      const parts = room.split(':');
      // Broadcast to both user chambers
      io.to(`user:${parts[1]}`).to(`user:${parts[2]}`).emit('message', messageData);
    } else {
      io.to(room).emit('message', messageData);
    }
  });

  // 3. Mark Read Receipt Event
  socket.on('mark-read', ({ room, username }) => {
    const history = messageHistory.get(room);
    if (!history) return;

    const readIds = [];
    history.forEach(msg => {
      if (msg.username !== username && msg.status !== 'seen' && !msg.system) {
        msg.status = 'seen';
        readIds.push(msg.id);
      }
    });

    if (readIds.length > 0) {
      // Notify sender that messages were seen
      if (room.startsWith('dm:')) {
        const parts = room.split(':');
        const peerName = (username === parts[1]) ? parts[2] : parts[1];
        io.to(`user:${peerName}`).emit('messages-read', { room, ids: readIds });
      } else {
        io.to(room).emit('messages-read', { room, ids: readIds });
      }
    }
  });

  // 4. Update Self-Destruct Timer
  socket.on('update-self-destruct-timer', ({ room, duration, username }) => {
    if (duration > 0) {
      roomSelfDestructTimers.set(room, duration);
    } else {
      roomSelfDestructTimers.delete(room);
    }

    // Broadcast self-destruct changes
    const eventData = { room, duration };
    if (room.startsWith('dm:')) {
      const parts = room.split(':');
      io.to(`user:${parts[1]}`).to(`user:${parts[2]}`).emit('self-destruct-timer-updated', eventData);
    } else {
      io.to(room).emit('self-destruct-timer-updated', eventData);
    }

    const durationLabel = duration === 60 ? '1 minute' : duration === 300 ? '5 minutes' : duration === 3600 ? '1 hour' : `${duration}s`;
    const noticeText = duration > 0 
      ? `⏳ ${username} set chat self-destruct timer to ${durationLabel}.`
      : `⏳ ${username} turned off the chat self-destruct timer.`;

    const systemMsg = {
      id: `sys-${Date.now()}`,
      username: 'Telegram Bot',
      text: noticeText,
      timestamp: new Date().toISOString(),
      system: true,
      room: room
    };

    const history = messageHistory.get(room) || [];
    history.push(systemMsg);
    messageHistory.set(room, history);

    if (room.startsWith('dm:')) {
      const parts = room.split(':');
      io.to(`user:${parts[1]}`).to(`user:${parts[2]}`).emit('message', systemMsg);
    } else {
      io.to(room).emit('message', systemMsg);
    }
  });

  // 5. Activity/Typing Indicator Event
  socket.on('typing', ({ isTyping, room }) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (room.startsWith('dm:')) {
      const parts = room.split(':');
      const targetUser = (user.username === parts[1]) ? parts[2] : parts[1];
      io.to(`user:${targetUser}`).emit('user-typing', {
        username: user.username,
        isTyping: isTyping,
        room: room
      });
    } else {
      socket.to(room).emit('user-typing', {
        username: user.username,
        isTyping: isTyping,
        room: room
      });
    }
  });

  // 6. Disconnect Event
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      const { username, room } = user;
      users.delete(socket.id);
      console.log(`${username} disconnected`);

      // Update persistent presence logs
      persistentUsers.set(username, {
        username: username,
        status: 'offline',
        lastSeen: Date.now(),
        socketId: null
      });

      // Notify the room
      if (!room.startsWith('dm:')) {
        io.to(room).emit('message', {
          id: `sys-${Date.now()}`,
          username: 'Telegram Bot',
          text: `${username} left the chat`,
          timestamp: new Date().toISOString(),
          system: true
        });
        sendRoomUsers(room);
      }

      // Update global users sidebar state
      sendGlobalUsers();
    }
  });

  // 7. WebRTC Signaling Relays
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

  // Create Custom Room
  socket.on('create-room', ({ room }) => {
    if (!room) return;
    const trimmed = room.trim();
    if (trimmed.length > 0 && !activeRooms.has(trimmed)) {
      activeRooms.add(trimmed);
      messageHistory.set(trimmed, []);
      io.emit('rooms-list', Array.from(activeRooms));
    }
  });

  // Delete Custom Room
  socket.on('delete-room', ({ room }) => {
    if (room === 'Doremon General') return;
    if (activeRooms.has(room)) {
      activeRooms.delete(room);
      messageHistory.delete(room);
      roomSelfDestructTimers.delete(room);
      
      io.emit('rooms-list', Array.from(activeRooms));

      // Redirect connected clients back to Doremon General lobby
      users.forEach((value, key) => {
        if (value.room === room) {
          io.to(key).emit('force-lobby-redirect', { room });
        }
      });
    }
  });
});

// Helper to compile global users and emit update
function sendGlobalUsers() {
  const list = Array.from(persistentUsers.values()).map(u => ({
    username: u.username,
    status: u.status,
    lastSeen: u.lastSeen,
    id: u.socketId
  }));
  io.emit('global-users', list);
}

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

// Background loop to prune self-destructing messages (runs every 3 seconds)
setInterval(() => {
  const now = Date.now();
  messageHistory.forEach((history, room) => {
    const expiredIds = [];
    const activeMessages = [];

    history.forEach(msg => {
      if (msg.selfDestructAt && new Date(msg.selfDestructAt).getTime() < now) {
        expiredIds.push(msg.id);
        // If it contains a file, delete it from disk!
        if (msg.file && msg.file.url) {
          const filename = msg.file.url.split('/').pop();
          const filePath = path.join(UPLOADS_DIR, filename);
          fs.unlink(filePath, (err) => {
            if (err) console.log(`Self-destruct file unlink error:`, err.message);
            else console.log(`Expired message file deleted: ${filename}`);
          });
        }
      } else {
        activeMessages.push(msg);
      }
    });

    if (expiredIds.length > 0) {
      messageHistory.set(room, activeMessages);
      
      // Notify clients of deletion triggers
      if (room.startsWith('dm:')) {
        const parts = room.split(':');
        io.to(`user:${parts[1]}`).to(`user:${parts[2]}`).emit('messages-deleted', { room, ids: expiredIds });
      } else {
        io.to(room).emit('messages-deleted', { room, ids: expiredIds });
      }
    }
  });
}, 3000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
