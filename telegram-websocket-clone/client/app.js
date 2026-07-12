// ----------------------------------------------------
// TELEGRAM CLONE WEB-SOCKET CLIENT CONTROLLER
// ----------------------------------------------------

// Server Configuration - Auto Detect Local vs Remote
const DEV_SERVER_URL = 'http://localhost:3000';
// USER ACTION: Paste your deployed free-tier backend URL (e.g., Render/Glitch) here
const PROD_SERVER_URL = 'https://aptronixchat.onrender.com'; 

const SOCKET_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? DEV_SERVER_URL
  : (PROD_SERVER_URL || window.location.origin);

// Polyfill localStorage if it's blocked by browser settings
try {
  const testKey = '__test_local_storage__';
  localStorage.setItem(testKey, 'test');
  localStorage.removeItem(testKey);
} catch (e) {
  console.warn('LocalStorage is blocked or unavailable. Polyfilling with memory storage.');
  const memoryStorage = {};
  const mockLocalStorage = {
    getItem: (key) => (key in memoryStorage ? memoryStorage[key] : null),
    setItem: (key, value) => { memoryStorage[key] = String(value); },
    removeItem: (key) => { delete memoryStorage[key]; },
    clear: () => { for (let key in memoryStorage) delete memoryStorage[key]; }
  };
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true
  });
}

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

// File Upload Elements
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadFilename = document.getElementById('upload-filename');
const uploadProgressBar = document.getElementById('upload-progress-bar');
const cancelUploadBtn = document.getElementById('cancel-upload-btn');
let currentUploadXHR = null;

// WebRTC Calling Variables
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallerName = document.getElementById('incoming-caller-name');
const incomingCallerAvatar = document.getElementById('incoming-caller-avatar');
const incomingCallTypeLabel = document.getElementById('incoming-call-type-label');
const acceptCallBtn = document.getElementById('accept-call-btn');
const declineCallBtn = document.getElementById('decline-call-btn');

const activeCallOverlay = document.getElementById('active-call-overlay');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const videoStreamsContainer = document.getElementById('video-streams-container');
const audioCallPlaceholder = document.getElementById('audio-call-placeholder');
const activeCallAvatar = document.getElementById('active-call-avatar');
const activeCallPeerName = document.getElementById('active-call-peer-name');
const activeCallStatus = document.getElementById('active-call-status');
const callTimerDisp = document.getElementById('call-timer');

const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const hangupCallBtn = document.getElementById('hangup-call-btn');

const dialingSound = document.getElementById('dialing-sound');
const ringtoneSound = document.getElementById('ringtone-sound');

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let activeCallTargetSocketId = null; 
let callType = null; 
let callTimer = null;
let callDurationSeconds = 0;
let isMicMuted = false;
let isVideoPaused = false;

// STUN Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// --- Initialization & Theme Setup ---
document.addEventListener('DOMContentLoaded', () => {
  // Dynamic Viewport height recalculation to support mobile layout adjustments
  const calculateVH = () => {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };
  calculateVH();
  window.addEventListener('resize', calculateVH);
  window.addEventListener('orientationchange', calculateVH);

  // Focus and virtual keyboard adjustments for dynamic zoom prevention
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      let vh = window.visualViewport.height * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      // Scroll active inputs into view if keyboard opens
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
        setTimeout(() => {
          document.activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 100);
      }
    });
  }

  // Detect touch device properties for pointer adjustments
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    document.body.classList.add('touch-device');
  } else {
    document.body.classList.add('desktop-device');
  }

  // Load Theme Preference
  const savedTheme = localStorage.getItem('tg-theme') || 'dark-theme';
  document.body.classList.add(savedTheme);
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
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  if (theme === 'dark-theme') {
    button.innerHTML = `
      <svg id="theme-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1s-1-.45-1-1V3c0-.55.45-1 1-1zm0 14c.55 0 1 .45 1 1v2c0 .55-.45 1-1 1s-1-.45-1-1v-2c0-.55.45-1 1-1zM5.22 6.64L6.64 5.22c.39-.39 1.02-.39 1.41 0s.39 1.02 0 1.41L6.64 8.05c-.39.39-1.02.39-1.41 0s-.39-1.02 0-1.41zm10.74 10.74l1.42-1.42c.39-.39 1.02-.39 1.41 0s.39 1.02 0 1.41l-1.42 1.42c-.39.39-1.02.39-1.41 0s-.39-1.02 0-1.41zM3 13c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1H3zm14 0c-.55 0-1-.45-1-1s.45-1 1-1h2c.55 0 1 .45 1 1s-.45 1-1 1h-2zM6.64 18.78l-1.42-1.42c-.39-.39-.39-1.02 0-1.41s1.02-.39 1.41 0l1.42 1.42c.39.39.39 1.02 0 1.41s-1.02.39-1.41 0zm10.74-10.74l-1.42-1.42c-.39-.39-.39-1.02 0-1.41s1.02-.39 1.41 0l1.42 1.42c.39.39.39 1.02 0 1.41s-1.02.39-1.41 0z"/>
      </svg>
    `;
  } else {
    button.innerHTML = `
      <svg id="theme-icon-svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10C2.2 6.8 6.4 2.5 11.7 2.1c.5-.1.9.3.9.8v.2c-.2 1.3.2 2.6 1.1 3.5.9.9 2.2 1.3 3.5 1.1.4-.1.8.2.9.7v.2c0 5.5-4.5 10-10 10.4zm-1.1-17.9c-3.7.6-6.6 3.6-7.1 7.3-.6 4.3 2.2 8.2 6.5 8.8 4.3.6 8.2-2.2 8.8-6.5.1-.9-.1-1.8-.6-2.5-1 .5-2.2.6-3.2.3-1.7-.5-3-1.8-3.5-3.5-.3-1-.2-2.2.3-3.2-.4-.3-.8-.6-1.2-.7z"/>
      </svg>
    `;
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
  // Switch Screen immediately to provide visual feedback and enter the messenger layout
  loginContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');

  console.log(`Connecting to WebSocket server at: ${SOCKET_URL}`);
  
  // Update UI loading state
  activeRoomTitle.textContent = currentRoom;
  roomMembersCount.textContent = 'Connecting to server...';

  // Defensive check: if socket.io script fails to load from CDN, load from server fallback
  if (typeof io === 'undefined') {
    roomMembersCount.textContent = 'Fetching connection library...';
    console.warn('io is not defined. Attempting to load client script directly from the backend server...');
    
    if (!document.getElementById('socket-io-fallback')) {
      const script = document.createElement('script');
      script.id = 'socket-io-fallback';
      script.src = `${SOCKET_URL}/socket.io/socket.io.js`;
      script.onload = () => {
        console.log('Socket.IO script successfully loaded from server fallback.');
        initializeSocket(); // Retry
      };
      script.onerror = (err) => {
        console.error('Failed to load socket.io from server fallback:', err);
        alert('Could not load the connection library. Please check your internet connection or make sure the server is online.');
        roomMembersCount.textContent = 'Connection library loading failed';
      };
      document.head.appendChild(script);
    }
    return;
  }

  // Set timeout to 45 seconds to allow Render free tier to wake up (takes ~30-50s)
  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    timeout: 45000,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });

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
    cleanupCallConnection(); // End calls if connection drops
  });

  // --- WebRTC Calling Socket Listeners ---
  socket.on('incoming-call', ({ from, username, offer, type }) => {
    console.log(`Incoming ${type} call from ${username}`);
    
    // Auto-reject if busy
    if (peerConnection || localStream) {
      socket.emit('reject-call', { to: from });
      return;
    }

    activeCallTargetSocketId = from;
    callType = type;

    // Prefill Ringing UI
    incomingCallerName.textContent = username;
    incomingCallerAvatar.textContent = username.substring(0, 2).toUpperCase();
    incomingCallerAvatar.style.backgroundColor = getAvatarColor(username);
    incomingCallTypeLabel.textContent = `Incoming ${type === 'video' ? 'Video' : 'Voice'} Call...`;

    // Show Ringing Overlay and play sound
    incomingCallOverlay.classList.remove('hidden');
    ringtoneSound.currentTime = 0;
    ringtoneSound.play().catch(e => console.log('Audio autoplay blocked:', e.message));

    // Store Offer details
    incomingCallOverlay.dataset.offer = JSON.stringify(offer);
  });

  socket.on('call-accepted', async ({ answer }) => {
    console.log('Call accepted by remote peer.');
    dialingSound.pause();
    dialingSound.currentTime = 0;

    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        startCallTimer();
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    }
  });

  socket.on('ice-candidate', async ({ candidate }) => {
    if (peerConnection) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    }
  });

  socket.on('call-rejected', () => {
    console.log('Call was declined.');
    dialingSound.pause();
    dialingSound.currentTime = 0;
    alert('The user declined your call request.');
    cleanupCallConnection();
  });

  socket.on('call-ended', () => {
    console.log('Call ended by peer.');
    cleanupCallConnection();
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
      
      const callingActionsHTML = isSelf 
        ? `<div class="online-indicator-dot"></div>` 
        : `<div class="user-call-actions">
             <button type="button" class="btn-user-call start-audio-call" data-id="${user.id}" data-name="${user.username}" title="Voice Call">
               <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                 <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.57a.998.998 0 00-1.01.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21a.99.99 0 00.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.62c0-.55-.45-1-1-1z"/>
               </svg>
             </button>
             <button type="button" class="btn-user-call start-video-call" data-id="${user.id}" data-name="${user.username}" title="Video Call">
               <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                 <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
               </svg>
             </button>
           </div>`;

      li.innerHTML = `
        <div class="avatar" style="background-color: ${getAvatarColor(user.username)}; width: 32px; height: 32px; font-size: 0.8rem;">
          ${user.username.substring(0, 2).toUpperCase()}
        </div>
        <div class="user-details">
          <div class="user-name-list">${user.username} ${isSelf ? '(you)' : ''}</div>
          <div class="sub-text">online</div>
        </div>
        ${callingActionsHTML}
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
  const ticksHTML = isOutgoing 
    ? `<span class="ticks" style="display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; color: var(--bubble-meta-out);">
         <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
           <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17l-4.24-4.24-1.41 1.41 5.66 5.66L23.66 7l-1.42-1.41zM1 12.5l5.66 5.66 1.41-1.41L2.41 11.09 1 12.5z"/>
         </svg>
       </span>` 
    : '';
  
  let bubbleContentHTML = '';
  if (msg.file) {
    const fileSizeFormatted = formatBytes(msg.file.size);
    bubbleContentHTML = `
      <a href="${msg.file.url}" target="_blank" class="file-card" download="${msg.file.name}">
        <div class="file-icon-wrapper">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
          </svg>
        </div>
        <div class="file-info">
          <div class="file-name" title="${msg.file.name}">${escapeHTML(msg.file.name)}</div>
          <div class="file-meta-info">
            <span>${fileSizeFormatted}</span>
            <span class="file-warning">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="display: inline-block; vertical-align: middle;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
              Auto-deletes in 5m
            </span>
          </div>
        </div>
      </a>
    `;
  } else {
    bubbleContentHTML = `<div class="msg-text">${escapeHTML(msg.text)}</div>`;
  }

  wrapper.innerHTML = `
    <div class="bubble">
      ${!isOutgoing ? `<div class="msg-sender">${msg.username}</div>` : ''}
      ${bubbleContentHTML}
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

// --- File Upload & Sharing Event Handlers ---
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  const MAX_SIZE = 10 * 1024 * 1024; // 10MB limit
  if (file.size > MAX_SIZE) {
    alert(`The file "${file.name}" exceeds the maximum size limit of 10MB. Please choose a smaller file.`);
    fileInput.value = '';
    return;
  }

  // Initialize Progress UI
  uploadFilename.textContent = file.name;
  uploadProgressBar.style.width = '0%';
  uploadProgressContainer.classList.remove('hidden');

  const formData = new FormData();
  formData.append('file', file);

  currentUploadXHR = new XMLHttpRequest();
  
  // Track upload progress
  currentUploadXHR.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      uploadProgressBar.style.width = `${percent}%`;
    }
  });

  // Handle completion
  currentUploadXHR.onload = () => {
    uploadProgressContainer.classList.add('hidden');
    fileInput.value = '';

    if (currentUploadXHR.status === 200) {
      try {
        const response = JSON.parse(currentUploadXHR.responseText);
        console.log('File uploaded successfully:', response);

        // Broadcast attachment link via Socket.IO
        if (socket) {
          socket.emit('send-message', {
            text: `📎 Shared file: ${response.name}`,
            room: currentRoom,
            file: {
              name: response.name,
              size: response.size,
              url: response.url
            }
          });
        }
      } catch (err) {
        console.error('Error parsing upload response:', err);
        alert('Failed to process file upload response.');
      }
    } else {
      console.error('File upload failed with status:', currentUploadXHR.status);
      alert('File upload failed. Please verify the server is running and matches size boundaries.');
    }
    currentUploadXHR = null;
  };

  // Handle upload errors
  currentUploadXHR.onerror = () => {
    uploadProgressContainer.classList.add('hidden');
    fileInput.value = '';
    alert('Network error occurred during file upload. Make sure the backend server is reachable.');
    currentUploadXHR = null;
  };

  // Handle upload cancellation
  currentUploadXHR.onabort = () => {
    uploadProgressContainer.classList.add('hidden');
    fileInput.value = '';
    console.log('File upload aborted by user.');
    currentUploadXHR = null;
  };

  // Open and send POST request
  currentUploadXHR.open('POST', `${SOCKET_URL}/upload`);
  currentUploadXHR.send(formData);
});

cancelUploadBtn.addEventListener('click', () => {
  if (currentUploadXHR) {
    currentUploadXHR.abort();
  }
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

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- WebRTC Peer-to-Peer Calling Logic ---
async function initiateUserCall(toSocketId, peerName, type) {
  if (peerConnection || localStream) {
    alert('You are already in an active calling session.');
    return;
  }

  console.log(`Initiating ${type} call to user ID ${toSocketId} (${peerName})`);
  activeCallTargetSocketId = toSocketId;
  callType = type;

  // Show active call overlay
  activeCallOverlay.classList.remove('hidden');
  
  if (type === 'video') {
    videoStreamsContainer.classList.remove('hidden');
    audioCallPlaceholder.classList.add('hidden');
    toggleVideoBtn.classList.remove('hidden');
  } else {
    videoStreamsContainer.classList.add('hidden');
    audioCallPlaceholder.classList.remove('hidden');
    toggleVideoBtn.classList.add('hidden'); // Hide camera control in audio calls
    
    activeCallPeerName.textContent = peerName;
    activeCallAvatar.textContent = peerName.substring(0, 2).toUpperCase();
    activeCallAvatar.style.backgroundColor = getAvatarColor(peerName);
    activeCallStatus.textContent = 'Calling...';
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
    });

    if (type === 'video') {
      localVideo.srcObject = localStream;
    }

    createPeerConnection();

    // Create RTC Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Play Dialer sound and send socket call event
    dialingSound.currentTime = 0;
    dialingSound.play().catch(e => console.log('Audio autoplay blocked:', e.message));

    if (socket) {
      socket.emit('call-user', {
        to: toSocketId,
        offer: offer,
        type: type
      });
    }

  } catch (err) {
    console.error('Failed to get media devices:', err);
    alert('Could not access microphone or camera. Please verify permission states.');
    cleanupCallConnection();
  }
}

async function acceptIncomingCall() {
  const offerData = incomingCallOverlay.dataset.offer;
  if (!offerData || !socket) return;
  const offer = JSON.parse(offerData);

  incomingCallOverlay.classList.add('hidden');
  ringtoneSound.pause();
  ringtoneSound.currentTime = 0;

  activeCallOverlay.classList.remove('hidden');
  
  const peerName = incomingCallerName.textContent;

  if (callType === 'video') {
    videoStreamsContainer.classList.remove('hidden');
    audioCallPlaceholder.classList.add('hidden');
    toggleVideoBtn.classList.remove('hidden');
  } else {
    videoStreamsContainer.classList.add('hidden');
    audioCallPlaceholder.classList.remove('hidden');
    toggleVideoBtn.classList.add('hidden');
    
    activeCallPeerName.textContent = peerName;
    activeCallAvatar.textContent = peerName.substring(0, 2).toUpperCase();
    activeCallAvatar.style.backgroundColor = getAvatarColor(peerName);
    activeCallStatus.textContent = 'Connecting...';
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
    });

    if (callType === 'video') {
      localVideo.srcObject = localStream;
    }

    createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Create SDP Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('make-answer', {
      to: activeCallTargetSocketId,
      answer: answer
    });

    if (callType === 'audio') {
      activeCallStatus.textContent = 'Voice Call Connected';
    }

    startCallTimer();

  } catch (err) {
    console.error('Failed to accept WebRTC call:', err);
    alert('Failed to connect call: Media access error.');
    socket.emit('end-call', { to: activeCallTargetSocketId });
    cleanupCallConnection();
  }
}

function declineIncomingCall() {
  incomingCallOverlay.classList.add('hidden');
  ringtoneSound.pause();
  ringtoneSound.currentTime = 0;

  if (socket && activeCallTargetSocketId) {
    socket.emit('reject-call', { to: activeCallTargetSocketId });
  }

  activeCallTargetSocketId = null;
  callType = null;
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add media tracks
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle network ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket && activeCallTargetSocketId) {
      socket.emit('ice-candidate', {
        to: activeCallTargetSocketId,
        candidate: event.candidate
      });
    }
  };

  // Handle incoming stream
  peerConnection.ontrack = (event) => {
    console.log('Received remote media stream track.');
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;
    
    if (callType === 'audio') {
      activeCallStatus.textContent = 'Voice Call Active';
    }
  };

  // ICE state monitor
  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      console.log('ICE Connection state:', peerConnection.iceConnectionState);
      if (
        peerConnection.iceConnectionState === 'disconnected' ||
        peerConnection.iceConnectionState === 'failed' ||
        peerConnection.iceConnectionState === 'closed'
      ) {
        cleanupCallConnection();
      }
    }
  };
}

function toggleLocalMicrophone() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMicMuted = !isMicMuted;
      audioTrack.enabled = !isMicMuted;
      
      toggleMicBtn.classList.toggle('muted', isMicMuted);
      toggleMicBtn.title = isMicMuted ? 'Unmute Microphone' : 'Mute Microphone';
      
      // Update Mic toggle icon (active vs muted)
      if (isMicMuted) {
        toggleMicBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l-1.98-1.98V5c0-1.66-1.34-3-3-3S7 3.34 7 5v6c0 .17.02.33.05.5L4.08 8.53C4.03 8.03 4 7.52 4 7c0-.55-.45-1-1-1s-1 .45-1 1c0 1.25.26 2.45.72 3.53L1.39 12.22l1.42 1.42 18.38 18.38 1.42-1.42-7.63-7.63zM9 5c0-.55.45-1 1-1s1 .45 1 1v4.17L9 7.17V5zm2 12.92v3.08h2v-3.08c3.28-.48 6-3.3 6-6.72h-1.7c0 3-2.54 5.1-5.3 5.1-.73 0-1.4-.15-2.01-.43l-1.25 1.25c.98.54 2.1.88 3.26.92z"/>
          </svg>
        `;
      } else {
        toggleMicBtn.innerHTML = `
          <svg id="mic-active-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.34 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
          </svg>
        `;
      }
    }
  }
}

function toggleLocalVideo() {
  if (localStream && callType === 'video') {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      isVideoPaused = !isVideoPaused;
      videoTrack.enabled = !isVideoPaused;
      
      toggleVideoBtn.classList.toggle('camera-off', isVideoPaused);
      toggleVideoBtn.title = isVideoPaused ? 'Enable Camera' : 'Disable Camera';
      localVideo.classList.toggle('hidden', isVideoPaused);

      // Update Camera toggle icon (active vs off)
      if (isVideoPaused) {
        toggleVideoBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M18 10.48V6c0-1.1-.9-2-2-2H6.83l2 2H16v7.17l2 2v-4.69l4 4v-11l-4 4zM2.81 2.81L1.39 4.22l3.41 3.41C4.3 7.8 4 8.37 4 9v10c0 1.1.9 2 2 2h12c.34 0 .67-.09.96-.24l2.82 2.82 1.41-1.41L2.81 2.81zM6 19v-9.17l9.17 9.17H6z"/>
          </svg>
        `;
      } else {
        toggleVideoBtn.innerHTML = `
          <svg id="video-active-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 16H5V8h9v8z"/>
          </svg>
        `;
      }
    }
  }
}

function stopUserCall() {
  if (socket && activeCallTargetSocketId) {
    socket.emit('end-call', { to: activeCallTargetSocketId });
  }
  cleanupCallConnection();
}

function cleanupCallConnection() {
  console.log('Cleaning up WebRTC calling states.');
  
  // Stop sound notifications
  dialingSound.pause();
  dialingSound.currentTime = 0;
  ringtoneSound.pause();
  ringtoneSound.currentTime = 0;

  // Clear timers
  stopCallTimer();

  // Close media tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Clear peer connection
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  remoteStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  // Reset Control buttons
  isMicMuted = false;
  isVideoPaused = false;
  toggleMicBtn.classList.remove('muted');
  toggleMicBtn.title = 'Mute Microphone';
  toggleMicBtn.innerHTML = `
    <svg id="mic-active-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.34 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
    </svg>
  `;
  
  toggleVideoBtn.classList.remove('camera-off');
  toggleVideoBtn.title = 'Disable Camera';
  toggleVideoBtn.innerHTML = `
    <svg id="video-active-svg" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 16H5V8h9v8z"/>
    </svg>
  `;
  localVideo.classList.remove('hidden');

  // Hide Overlays
  incomingCallOverlay.classList.add('hidden');
  activeCallOverlay.classList.add('hidden');
  
  activeCallTargetSocketId = null;
  callType = null;
}

// Call Timer Helpers
function startCallTimer() {
  stopCallTimer();
  callDurationSeconds = 0;
  callTimerDisp.textContent = '00:00';
  callTimer = setInterval(() => {
    callDurationSeconds++;
    const minutes = Math.floor(callDurationSeconds / 60).toString().padStart(2, '0');
    const seconds = (callDurationSeconds % 60).toString().padStart(2, '0');
    callTimerDisp.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
}

// Bind Button Listeners
acceptCallBtn.addEventListener('click', acceptIncomingCall);
declineCallBtn.addEventListener('click', declineIncomingCall);
hangupCallBtn.addEventListener('click', stopUserCall);
toggleMicBtn.addEventListener('click', toggleLocalMicrophone);
toggleVideoBtn.addEventListener('click', toggleLocalVideo);

// Event delegation on sidebar user list call buttons
onlineUsersList.addEventListener('click', (e) => {
  const audioBtn = e.target.closest('.start-audio-call');
  const videoBtn = e.target.closest('.start-video-call');

  if (audioBtn) {
    const socketId = audioBtn.getAttribute('data-id');
    const name = audioBtn.getAttribute('data-name');
    initiateUserCall(socketId, name, 'audio');
  } else if (videoBtn) {
    const socketId = videoBtn.getAttribute('data-id');
    const name = videoBtn.getAttribute('data-name');
    initiateUserCall(socketId, name, 'video');
  }
});
