// ----------------------------------------------------
// TELEGRAM CLONE WEB-SOCKET CLIENT CONTROLLER
// ----------------------------------------------------

// Server Configuration - Auto Detect Local vs Remote
const DEV_SERVER_URL = 'http://localhost:3000';
// USER ACTION: Paste your deployed free-tier backend URL (e.g., Render/Glitch) here
const PROD_SERVER_URL = ''; 

const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? DEV_SERVER_URL
  : (PROD_SERVER_URL || window.location.origin);

let socket = null;
let currentUsername = '';
let currentRoom = 'Telegram General';
let typingTimeout = null;
let isTypingState = false;
let activeTypingUsers = new Set();

// --- Select DOM Elements ---
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const roomSelect = document.getElementById('room-select');
const appContainer = document.getElementById('app-container');

// Sidebar Elements
const roomsList = document.getElementById('rooms-list');
const onlineUsersList = document.getElementById('online-users');
const userCountBadge = document.getElementById('user-count');
const currentUserNameDisp = document.getElementById('current-user-name');
const currentUserAvatarDisp = document.getElementById('current-user-avatar');
const searchInput = document.getElementById('search-input');
const themeToggleBtn = document.getElementById('theme-toggle');
const logoutBtn = document.getElementById('logout-btn');

// Chat Area Elements
const activeRoomTitle = document.getElementById('active-room-title');
const roomMembersCount = document.getElementById('room-members-count');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const typingIndicatorBar = document.getElementById('typing-indicator-bar');
const typingText = document.getElementById('typing-text');
const connectionIndicator = document.getElementById('connection-indicator');
const mobileBackBtn = document.getElementById('mobile-back-btn');
const emojiBtn = document.getElementById('emoji-btn');
const notificationSound = document.getElementById('notification-sound');

// --- Initialization & Theme Setup ---
document.addEventListener('DOMContentLoaded', () => {
  // Load Theme Preference
  const savedTheme = localStorage.getItem('tg-theme') || 'dark-theme';
  document.body.className = savedTheme;
  updateThemeIcon(savedTheme);

  // Prefill username if stored
  const savedUsername = localStorage.getItem('tg-username');
  if (savedUsername) {
    usernameInput.value = savedUsername;
  }
});

// --- Theme Toggle Action ---
themeToggleBtn.addEventListener('click', () => {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.replace('dark-theme', 'light-theme');
    localStorage.setItem('tg-theme', 'light-theme');
    updateThemeIcon('light-theme');
  } else {
    document.body.classList.replace('light-theme', 'dark-theme');
    localStorage.setItem('tg-theme', 'dark-theme');
    updateThemeIcon('dark-theme');
  }
});

function updateThemeIcon(theme) {
  const icon = themeToggleBtn.querySelector('i');
  if (theme === 'dark-theme') {
    icon.className = 'fa-solid fa-sun';
  } else {
    icon.className = 'fa-solid fa-moon';
  }
}

// --- Login Form Submission ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const username = usernameInput.value.trim();
  const selectedRoom = roomSelect.value;
  
  if (!username) return;

  currentUsername = username;
  currentRoom = selectedRoom;
  
  // Cache credentials
  localStorage.setItem('tg-username', username);
  localStorage.setItem('tg-last-room', selectedRoom);

  // Setup client info in UI
  currentUserNameDisp.textContent = username;
  currentUserAvatarDisp.textContent = username.substring(0, 2).toUpperCase();
  currentUserAvatarDisp.style.backgroundColor = getAvatarColor(username);

  // Initialize Socket.io Connection
  initializeSocket();
});

// --- Socket.IO Event Handlers ---
function initializeSocket() {
  console.log(`Connecting to WebSocket server at: ${SOCKET_URL}`);
  
  // Update UI loading state
  activeRoomTitle.textContent = currentRoom;
  roomMembersCount.textContent = 'Connecting to server...';

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    timeout: 10000
  });

  // Switch Screen
  loginContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');

  // Connection successful
  socket.on('connect', () => {
    console.log('Connected to server');
    connectionIndicator.className = 'connection-status-dot connected';
    connectionIndicator.title = 'Connected to real-time server';
    
    // Join chosen room
    socket.emit('join-room', {
      username: currentUsername,
      room: currentRoom
    });
  });

  // Connection dropped
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connectionIndicator.className = 'connection-status-dot disconnected';
    connectionIndicator.title = 'Disconnected. Attempting reconnect...';
    roomMembersCount.textContent = 'Disconnected';
  });

  // Load message logs
  socket.on('chat-history', (history) => {
    messagesContainer.innerHTML = ''; // Clear previous messages
    
    // Render historical messages
    if (history.length === 0) {
      // Default welcome text
      const welcome = document.createElement('div');
      welcome.className = 'welcome-box';
      welcome.innerHTML = `
        <i class="fa-solid fa-lock"></i>
        <p>Welcome to <strong>${currentRoom}</strong>! There are no recent logs. Send a message to start the conversation.</p>
      `;
      messagesContainer.appendChild(welcome);
    } else {
      history.forEach(msg => {
        renderMessage(msg);
      });
    }
    scrollToBottom();
  });

  // Receive message
  socket.on('message', (message) => {
    // Remove welcome box if still there
    const welcomeBox = messagesContainer.querySelector('.welcome-box');
    if (welcomeBox) welcomeBox.remove();

    renderMessage(message);
    scrollToBottom();

    // Play sound if incoming and not system message, and tab not focused or message is from someone else
    if (!message.system && message.username !== currentUsername) {
      playNotificationSound();
    }
  });

  // Receive typing broadcast
  socket.on('user-typing', ({ username, isTyping }) => {
    if (isTyping) {
      activeTypingUsers.add(username);
    } else {
      activeTypingUsers.delete(username);
    }
    updateTypingIndicator();
  });

  // Receive room members list updates
  socket.on('room-users', ({ room, users }) => {
    if (room !== currentRoom) return;
    
    // Update count in header
    const count = users.length;
    roomMembersCount.textContent = `${count} subscriber${count !== 1 ? 's' : ''} online`;
    userCountBadge.textContent = count;

    // Repopulate Online Users sidebar list
    onlineUsersList.innerHTML = '';
    users.forEach(user => {
      const isSelf = user.username === currentUsername;
      const li = document.createElement('li');
      li.className = 'user-item';
      li.innerHTML = `
        <div class="avatar" style="background-color: ${getAvatarColor(user.username)}; width: 32px; height: 32px; font-size: 0.8rem;">
          ${user.username.substring(0, 2).toUpperCase()}
        </div>
        <div class="user-details">
          <div class="user-name-list">${user.username} ${isSelf ? '(you)' : ''}</div>
          <div class="sub-text">online</div>
        </div>
        <div class="online-indicator-dot"></div>
      `;
      onlineUsersList.appendChild(li);
    });
  });
}

// --- Message Rendering Helpers ---
function renderMessage(msg) {
  if (msg.system) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = msg.text;
    messagesContainer.appendChild(div);
    return;
  }

  const isOutgoing = msg.username === currentUsername;
  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`;

  // Formatting timestamp
  const date = new Date(msg.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Bubble Content
  const ticksHTML = isOutgoing ? `<span class="ticks"><i class="fa-solid fa-check-double"></i></span>` : '';
  
  wrapper.innerHTML = `
    <div class="bubble">
      ${!isOutgoing ? `<div class="msg-sender">${msg.username}</div>` : ''}
      <div class="msg-text">${escapeHTML(msg.text)}</div>
      <div class="msg-meta">
        <span class="msg-time">${timeStr}</span>
        ${ticksHTML}
      </div>
    </div>
  `;

  messagesContainer.appendChild(wrapper);
}

// --- Send Message Action ---
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const text = messageInput.value.trim();
  if (!text || !socket) return;

  // Send message through socket
  socket.emit('send-message', {
    text: text,
    room: currentRoom
  });

  // Reset Input
  messageInput.value = '';
  messageInput.focus();

  // Clear typing state
  clearTimeout(typingTimeout);
  handleStopTyping();
});

// --- Typing Indicator Events ---
messageInput.addEventListener('keypress', () => {
  if (!socket) return;
  
  if (!isTypingState) {
    isTypingState = true;
    socket.emit('typing', { isTyping: true, room: currentRoom });
  }

  // Clear existing timeout
  clearTimeout(typingTimeout);
  
  // Set new timeout to stop typing after 2 seconds
  typingTimeout = setTimeout(() => {
    handleStopTyping();
  }, 2000);
});

function handleStopTyping() {
  if (isTypingState && socket) {
    isTypingState = false;
    socket.emit('typing', { isTyping: false, room: currentRoom });
  }
}

function updateTypingIndicator() {
  const usersArray = Array.from(activeTypingUsers);
  if (usersArray.length === 0) {
    typingIndicatorBar.classList.add('hidden');
    return;
  }

  let text = '';
  if (usersArray.length === 1) {
    text = `<strong>${usersArray[0]}</strong> is typing`;
  } else if (usersArray.length === 2) {
    text = `<strong>${usersArray[0]}</strong> and <strong>${usersArray[1]}</strong> are typing`;
  } else {
    text = `Multiple people are typing`;
  }

  typingText.innerHTML = text;
  typingIndicatorBar.classList.remove('hidden');
}

// --- Channel Switching ---
roomsList.querySelectorAll('.room-item').forEach(item => {
  item.addEventListener('click', () => {
    const room = item.getAttribute('data-room');
    if (room === currentRoom) {
      // Toggle for mobile sliding
      if (window.innerWidth <= 768) {
        document.body.classList.add('active-chat');
      }
      return;
    }

    // Switch selection visually
    roomsList.querySelectorAll('.room-item').forEach(ri => ri.classList.remove('active'));
    item.classList.add('active');

    currentRoom = room;
    activeRoomTitle.textContent = room;
    roomMembersCount.textContent = 'Connecting...';
    
    // Clear typing states
    activeTypingUsers.clear();
    updateTypingIndicator();

    if (socket) {
      // Emit room change
      socket.emit('join-room', {
        username: currentUsername,
        room: currentRoom
      });
    }

    // Slide over layout on mobile
    if (window.innerWidth <= 768) {
      document.body.classList.add('active-chat');
    }
  });
});

// Mobile Back Button slide back
mobileBackBtn.addEventListener('click', () => {
  document.body.classList.remove('active-chat');
});

// --- Search Filter for Sidebar ---
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  roomsList.querySelectorAll('.room-item').forEach(item => {
    const roomName = item.querySelector('.room-name').textContent.toLowerCase();
    if (roomName.includes(query)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
});

// --- Emoji Popover Quick Trigger ---
emojiBtn.addEventListener('click', () => {
  const quickEmojis = ['👍', '❤️', '😂', '🔥', '👏', '🎉', '🚀', '😮', '🤔'];
  const randomEmoji = quickEmojis[Math.floor(Math.random() * quickEmojis.length)];
  
  // Insert emoji at cursor position
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  const text = messageInput.value;
  messageInput.value = text.substring(0, start) + randomEmoji + text.substring(end);
  messageInput.focus();
  messageInput.selectionStart = messageInput.selectionEnd = start + randomEmoji.length;
});

// --- Logout ---
logoutBtn.addEventListener('click', () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  // Reset states
  currentUsername = '';
  localStorage.removeItem('tg-username');
  localStorage.removeItem('tg-last-room');

  // Go back to login screen
  appContainer.classList.add('hidden');
  loginContainer.classList.remove('hidden');
});

// --- Utility Functions ---
function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function playNotificationSound() {
  notificationSound.currentTime = 0;
  notificationSound.play().catch(err => {
    // Browsers block autoplay audio until a user interaction occurred
    console.log('Audio autoplay blocked or failed:', err.message);
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Generate pleasing avatar background colors based on username strings
function getAvatarColor(username) {
  const colors = [
    '#2481cc', '#34c759', '#ff9500', '#af52de', 
    '#ff2d55', '#5ac8fa', '#5856d6', '#ffcc00'
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}
