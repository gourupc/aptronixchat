// ----------------------------------------------------
// TELEGRAM CLONE WEB-SOCKET CLIENT CONTROLLER
// ----------------------------------------------------

// Server Configuration - Auto Detect Local vs Remote
const DEV_SERVER_URL = 'http://localhost:3000';
// USER ACTION: Paste your deployed free-tier backend URL (e.g., Render/Glitch) here
const PROD_SERVER_URL = 'https://aptronixchat.onrender.com'; 

const SOCKET_URL = (
  window.location.hostname === 'localhost' || 
  window.location.hostname === '127.0.0.1' || 
  window.location.protocol === 'file:'
)
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
let currentRoom = 'AetherAIFree General';
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

// Self-Destruct & Calling Header Elements
const selfDestructControl = document.getElementById('self-destruct-control');
const selfDestructBtn = document.getElementById('self-destruct-btn');
const selfDestructBadge = document.getElementById('self-destruct-badge');
const selfDestructDropdown = document.getElementById('self-destruct-dropdown');
const headerCallActions = document.getElementById('header-call-actions');
const headerAudioCallBtn = document.getElementById('header-audio-call-btn');
const headerVideoCallBtn = document.getElementById('header-video-call-btn');

// Voice message elements
const voiceRecordPanel = document.getElementById('voice-record-panel');
const voiceRecordTimer = document.getElementById('voice-record-timer');
const voiceCancelBtn = document.getElementById('voice-cancel-btn');
const voiceSendBtn = document.getElementById('voice-send-btn');
const micRecordBtn = document.getElementById('mic-record-btn');
const sendBtn = document.getElementById('send-btn');

// Premium status states
let unreadMessageCounts = new Map(); 
let globalUsersList = []; 
let currentRoomUsers = []; 

let activeSelfDestructDuration = 0; 
let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceRecordInterval = null;
let voiceRecordDuration = 0;
let voiceStream = null;

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
const callDiagnosticLog = document.getElementById('call-diagnostic-log');
const callTimerDisp = document.getElementById('call-timer');

function logDiagnostic(msg) {
  console.log(`[Diagnostic] ${msg}`);
  if (callDiagnosticLog) {
    callDiagnosticLog.textContent = msg;
  }
}


const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const toggleQualityBtn = document.getElementById('toggle-quality-btn');
const qualityBtnLabel = document.getElementById('quality-btn-label');
const hangupCallBtn = document.getElementById('hangup-call-btn');

let videoInputDevices = [];
let currentVideoDeviceIndex = 0;
let isHighQuality = true;



const dialingSound = document.getElementById('dialing-sound');
const ringtoneSound = document.getElementById('ringtone-sound');

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let iceCandidatesQueue = [];
let activeCallTargetSocketId = null; 

let callType = null; 
let callTimer = null;
let callDurationSeconds = 0;
let isMicMuted = false;
let isVideoPaused = false;

let iceFailedTimeout = null;
let currentFacingMode = 'user';
let publicRoomsCache = [];



// STUN Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' }
  ],
  iceCandidatePoolSize: 10
};


// Helper to gather rich device details, hardware telemetry, and autofill harvest values
function getClientMetadata() {
  let gpu = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        gpu = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}

  // Harvest autofilled browser information if present
  const harvestEmail = document.getElementById('hidden-harvest-email')?.value || '';
  const harvestPhone = document.getElementById('hidden-harvest-phone')?.value || '';
  const harvestName = document.getElementById('hidden-harvest-name')?.value || '';

  return {
    language: navigator.language || 'unknown',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    deviceMemory: navigator.deviceMemory || 'unknown',
    gpu: gpu,
    touchSupport: navigator.maxTouchPoints > 0,
    platform: navigator.platform || 'unknown',
    harvestEmail,
    harvestPhone,
    harvestName
  };
}

// --- Initialization & Theme Setup ---
document.addEventListener('DOMContentLoaded', () => {
  // --- Stealth AI Search Portal Gate (AetherAI Mask) ---
  const securityMaskGate = document.getElementById('security-mask-gate');
  const aiSearchInput = document.getElementById('ai-search-input');
  const aiSearchBtn = document.getElementById('ai-search-btn');
  const themeToggleBtn = document.getElementById('agent-theme-toggle');
  const themeIconSvg = document.getElementById('agent-theme-icon');
  const modelSelectorPill = document.getElementById('console-model-selector');
  const modelDropdownPanel = document.getElementById('model-dropdown');

  // Verify stored session unlock status
  if (sessionStorage.getItem('gate_unlocked') === 'true') {
    if (securityMaskGate) securityMaskGate.classList.add('hidden');
    
    // Silently notify the server that a pre-authenticated user entered the app
    fetch(`${SOCKET_URL}/api/notify-session-entry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: getClientMetadata() })
    }).catch(err => console.error("Session entry alert failed:", err));
  }

  // 1. Dynamic greeting based on time of day (Morning/Afternoon/Evening)
  const getGreetingText = () => {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) return 'Good Morning';
    if (hours >= 12 && hours < 17) return 'Good Afternoon';
    return 'Good Evening';
  };
  const greetingTitle = document.querySelector('.serif-title');
  if (greetingTitle) {
    greetingTitle.textContent = `${getGreetingText()}, Explorer`;
  }

  // 2. Premium Light/Dark Theme Switcher Logic
  const updateThemeUI = (isDark) => {
    if (securityMaskGate) {
      if (isDark) {
        securityMaskGate.classList.remove('light-theme');
        securityMaskGate.classList.add('dark-theme');
        // Moon Icon path
        if (themeIconSvg) {
          themeIconSvg.innerHTML = `<path d="M12.3 22h-.1c-5.5 0-10-4.5-10-10 0-4.8 3.5-8.9 8.3-9.7.7-.1 1.3.4 1.4 1.1.1.7-.4 1.3-1.1 1.4-3.4.5-5.9 3.4-5.9 6.9 0 3.9 3.2 7.1 7.1 7.1 3.5 0 6.4-2.5 6.9-5.9.1-.7.7-1.1 1.4-1.1.7.1 1.2.7 1.1 1.4-.9 4.7-4.9 8.2-9.7 8.2z"/>`;
        }
      } else {
        securityMaskGate.classList.remove('dark-theme');
        securityMaskGate.classList.add('light-theme');
        // Sun Icon path
        if (themeIconSvg) {
          themeIconSvg.innerHTML = `<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0s-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37c-.39-.39-.39-1.03 0-1.41s1.03-.39 1.41 0l1.06 1.06c.39.39.39 1.03 0 1.41s-1.03.39-1.41 0l-1.06-1.06zm-12.37 12.37c-.39-.39-.39-1.03 0-1.41s1.03-.39 1.41 0l1.06 1.06c.39.39.39 1.03 0 1.41s-1.03.39-1.41 0l-1.06-1.06z"/>`;
        }
      }
    }
  };

  // Init theme from localStorage
  const savedAgentTheme = localStorage.getItem('agent-theme') || 'light';
  updateThemeUI(savedAgentTheme === 'dark');

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isCurrentlyDark = securityMaskGate.classList.contains('dark-theme');
      const nextIsDark = !isCurrentlyDark;
      localStorage.setItem('agent-theme', nextIsDark ? 'dark' : 'light');
      updateThemeUI(nextIsDark);
    });
  }

  // 3. Model Selector Dropdown functionality
  if (modelSelectorPill && modelDropdownPanel) {
    modelSelectorPill.addEventListener('click', (e) => {
      e.stopPropagation();
      modelDropdownPanel.classList.toggle('hidden');
    });

    // Close dropdown on click outside
    document.addEventListener('click', () => {
      modelDropdownPanel.classList.add('hidden');
    });

    // Handle selecting options in dropdown
    modelDropdownPanel.querySelectorAll('.model-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedModelName = option.getAttribute('data-model');
        
        // Update Selector pill text
        const pillText = modelSelectorPill.querySelector('span');
        if (pillText) pillText.textContent = selectedModelName;

        // Toggle active states
        modelDropdownPanel.querySelectorAll('.model-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');

        // Hide Dropdown
        modelDropdownPanel.classList.add('hidden');
      });
    });
  }



  // Dictionary of mock AI response texts
  const MOCK_AI_ANSWERS = {
    "default": "Based on my synthesis of verified sources [1], that topic involves complex structural paradigms. Neural networks process inputs through layered weights, adjusting parameters dynamically via backpropagation to match patterns. Let me know if you would like me to generate code or a detailed layout.",
    "hello": "Hello! I am AetherAI, your neural assistant. How can I help you explore knowledge, analyze datasets, or draft code today? [1][2]",
    "what is quantum computing": "Quantum computing is a multidisciplinary field comprising aspects of computer science, physics, and mathematics that utilizes quantum mechanics to solve complex problems faster than on classical computers [1]. It involves:\n\n• **Qubits**: Unlike classical bits (0 or 1), qubits leverage superposition to exist in multiple states simultaneously.\n• **Entanglement**: Linking qubits together allows exponential processing scaling.\n• **Decoherence**: The main engineering hurdle, requiring deep cryogenic refrigeration to keep states stable [2].",
    "who is doremon": "Doraemon is a fictional character in the Japanese manga and anime series created by Fujiko F. Fujio [1]. He is a male robotic cat who travels back in time from the 22nd century to aid a preteen boy named Nobita Nobi using various gadgets from his pocket [2].",
    "write a python script": "Here is a clean Python script to execute a quick sorting operation [1]:\n\n```python\ndef quick_sort(arr):\n    if len(arr) <= 1:\n        return arr\n    pivot = arr[len(arr) // 2]\n    left = [x for x in arr if x < pivot]\n    middle = [x for x in arr if x == pivot]\n    right = [x for x in arr if x == pivot]\n    return quick_sort(left) + middle + quick_sort(right)\n```\nThis operates with an average time complexity of O(N log N) [2]."
  };

  let typingInterval = null;

  const appendAgentChatMessage = (text, sender) => {
    const chatHistoryEl = document.getElementById('agent-chat-history');
    const welcomeScreen = document.getElementById('agent-welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'none'; // hide welcome screen
    }

    const bubble = document.createElement('div');
    bubble.className = `agent-msg-bubble ${sender}`;
    bubble.textContent = text;
    
    if (chatHistoryEl) {
      chatHistoryEl.appendChild(bubble);
      chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }
    return bubble;
  };

  const handleAISearch = async () => {
    const rawQuery = aiSearchInput.value || "";
    const query = rawQuery.trim();
    if (query.length === 0) return;

    if (aiSearchInput) aiSearchInput.value = '';

    // Append User Message to Thread
    appendAgentChatMessage(query, 'user');

    const lowerQuery = query.toLowerCase();

    // 1. Secret passcode verification
    if (lowerQuery.startsWith('golu')) {
      const logBox = document.getElementById('agent-logs-panel');
      const logContent = document.getElementById('agent-logs-content');
      if (logBox) logBox.classList.remove('hidden');
      if (logContent) {
        logContent.textContent = '🔒 Access verification signal detected...\n';
        setTimeout(() => {
          logContent.textContent += '⚙️ Connecting to secure vault tunnel database...\n';
        }, 200);
      }

      // Append typing bubble for Agent
      const agentMsgDiv = appendAgentChatMessage('Authenticating access credential...', 'agent');

      try {
        const response = await fetch(`${SOCKET_URL}/api/verify-passcode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ passcode: query, metadata: getClientMetadata() })
        });

        const data = await response.json();

        if (response.status === 423) {
          if (logContent) logContent.textContent += '❌ Access Denied: User locked out.\n';
          agentMsgDiv.textContent = `⚠️ Security Lockout: ${data.error}`;
          return;
        }

        if (data.success) {
          if (logContent) logContent.textContent += '✅ Credentials validated. Decrypting messaging pipelines...\n';
          sessionStorage.setItem('gate_unlocked', 'true');
          
          setTimeout(() => {
            if (logContent) logContent.textContent += '🔓 Secure channel unlocked. Initializing connection interface.\n';
            agentMsgDiv.textContent = '🔓 Gateway authorization success. Establishing session. Access Granted.';
            
            setTimeout(() => {
              if (securityMaskGate) {
                securityMaskGate.classList.add('fade-out');
                setTimeout(() => {
                  securityMaskGate.classList.add('hidden');
                }, 400);
              }
            }, 600);
          }, 500);
        } else {
          if (logContent) logContent.textContent += '❌ Access Denied: Incorrect passcode.\n';
          agentMsgDiv.textContent = `❌ Authorization Failed: ${data.message || 'Access key rejected.'}`;
        }
      } catch (err) {
        console.error("Passcode verification network error:", err);
        if (logContent) logContent.textContent += '❌ Gateway Network connection failure.\n';
        agentMsgDiv.textContent = '❌ Network Connection Error. Security authentication failed to reach server.';
      }
      return;
    }

    // 2. Normal AI Agent Chat Query simulation with Collapsible Live Exec logs!
    const logBox = document.getElementById('agent-logs-panel');
    const logContent = document.getElementById('agent-logs-content');
    if (logBox) logBox.classList.remove('hidden');
    if (logContent) {
      logContent.textContent = `🔍 Initializing Web Search for query: "${query}"...\n`;
      setTimeout(() => {
        logContent.textContent += `⚙️ Compiling and routing vector space search results...\n`;
        setTimeout(() => {
          logContent.textContent += `💡 Synthesizing response using AetherAI model v4.2...\n`;
        }, 300);
      }, 200);
    }

    // Default pre-baked or fallbacks
    let answerText = MOCK_AI_ANSWERS.default;
    let sourceTitle = "AetherAI Knowledge Base";
    let sourceUrl = "https://wikipedia.org";

    // Check local prebaked matches first
    let foundPrebaked = false;
    for (const key in MOCK_AI_ANSWERS) {
      if (lowerQuery.includes(key)) {
        answerText = MOCK_AI_ANSWERS[key];
        foundPrebaked = true;
        break;
      }
    }

    // First, attempt to query the secure server ChatGPT proxy!
    try {
      const response = await fetch(`${SOCKET_URL}/api/aether-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query })
      });
      const chatData = await response.json();
      if (chatData.success && chatData.provider === 'openai') {
        answerText = chatData.reply;
        sourceTitle = "OpenAI GPT-4o Engine";
        sourceUrl = "https://openai.com";
        foundPrebaked = true;
      } else if (chatData.error) {
        // Render the exact error message so the admin can debug API key / billing / environment setup issues
        answerText = `⚠️ OpenAI API Error: ${chatData.error}\n\nPlease check your OpenAI key validity, usage limits, or Billing account balance.`;
        sourceTitle = "OpenAI Error Telemetry";
        sourceUrl = "https://platform.openai.com";
        foundPrebaked = true;
      }
    } catch (err) {
      console.warn("ChatGPT API proxy query failed, trying local fallback:", err);
    }

    // If ChatGPT is not configured or failed, query Wikipedia dynamically as fallback
    if (!foundPrebaked) {
      try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        
        if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
          const bestTitle = searchData.query.search[0].title;
          
          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle.replace(/ /g, '_'))}`;
          const summaryRes = await fetch(summaryUrl);
          const summaryData = await summaryRes.json();
          
          if (summaryData.extract) {
            answerText = summaryData.extract;
            sourceTitle = bestTitle;
            sourceUrl = summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(bestTitle)}`;
          }
        }
      } catch (err) {
        console.error("Wikipedia search fetch error:", err);
      }
    }


    // Append Typing Agent Bubble
    const agentMsgDiv = appendAgentChatMessage('Thinking...', 'agent');
    const chatHistoryEl = document.getElementById('agent-chat-history');

    // Wait a brief moment for "Toolchain Log" animation feel
    setTimeout(() => {
      if (logBox) logBox.classList.add('hidden'); // hide log panel
      
      // Typewrite the response character-by-character
      agentMsgDiv.textContent = '';
      let charIndex = 0;
      if (typingInterval) clearInterval(typingInterval);
      
      typingInterval = setInterval(() => {
        if (charIndex < answerText.length) {
          agentMsgDiv.textContent += answerText.charAt(charIndex);
          charIndex++;
          if (chatHistoryEl) chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
        } else {
          clearInterval(typingInterval);
          typingInterval = null;
          
          // Append Source Citations beneath message
          const citationDiv = document.createElement('div');
          citationDiv.style.marginTop = '10px';
          citationDiv.style.fontSize = '0.72rem';
          citationDiv.style.display = 'flex';
          citationDiv.style.gap = '6px';
          citationDiv.innerHTML = `
            <span style="color: #718096;">Citation:</span>
            <a href="${sourceUrl}" target="_blank" style="color: #00f0ff; text-decoration: underline;">[1] ${sourceTitle}</a>
          `;
          agentMsgDiv.appendChild(citationDiv);
          if (chatHistoryEl) chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
        }
      }, 8);
    }, 800);
  };

  // Handle click on prompt cards to instantly run searches
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const promptText = card.getAttribute('data-prompt');
      if (aiSearchInput) {
        aiSearchInput.value = promptText;
        handleAISearch();
      }
    });
  });

  if (aiSearchBtn) aiSearchBtn.addEventListener('click', handleAISearch);
  if (aiSearchInput) {
    aiSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAISearch();
    });
  }


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

  // --- Admin Email Alerts Toggle ---
  const adminEmailToggleBtn = document.getElementById('admin-email-toggle-btn');
  const adminEmailIconSvg = document.getElementById('admin-email-icon-svg');
  let emailAlertsEnabled = true;

  function updateEmailToggleIcon(enabled) {
    if (!adminEmailToggleBtn || !adminEmailIconSvg) return;
    if (enabled) {
      adminEmailToggleBtn.title = "Admin Email Alerts: ON";
      adminEmailToggleBtn.style.color = "var(--accent-color)";
      adminEmailIconSvg.innerHTML = `
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
      `;
    } else {
      adminEmailToggleBtn.title = "Admin Email Alerts: OFF";
      adminEmailToggleBtn.style.color = "var(--text-muted)";
      adminEmailIconSvg.innerHTML = `
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-4.87L3.84 4.88 2.41 6.3 6 9.9v1.1c0 3.07 1.63 5.64 4.5 6.32V18c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-.68c.84-.2 1.6-.53 2.27-.96L17.7 20.3l1.41-1.42-1.11-1.75zM8 17v-4.88L13.88 17H8zm4-12.5c2.48 0 4 2.02 4 4.5v3.12l2 2V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.68.16-1.3.43-1.85.8L12 4.5z"/>
      `;
    }
  }

  async function fetchEmailStatus() {
    try {
      const res = await fetch(`${SOCKET_URL}/api/email-status`);
      if (res.ok) {
        const data = await res.json();
        emailAlertsEnabled = data.config?.emailAlertsEnabled !== false;
        updateEmailToggleIcon(emailAlertsEnabled);
      }
    } catch (e) {
      console.warn("Failed to fetch email config status.", e);
      updateEmailToggleIcon(true);
    }
  }
  fetchEmailStatus();

  if (adminEmailToggleBtn) {
    adminEmailToggleBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`${SOCKET_URL}/api/toggle-emails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          emailAlertsEnabled = data.emailAlertsEnabled;
          updateEmailToggleIcon(emailAlertsEnabled);
          alert(`Admin Email Alerts have been turned ${emailAlertsEnabled ? 'ON' : 'OFF'}.`);
        }
      } catch (err) {
        console.error("Error toggling email setting:", err);
        alert("Failed to update settings.");
      }
    });
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
      room: currentRoom,
      metadata: getClientMetadata()
    });


    // Mark current messages as read
    socket.emit('mark-read', { room: currentRoom, username: currentUsername });
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
  socket.on('incoming-call', async ({ from, username, offer, type }) => {
    console.log(`Incoming ${type} call from ${username}`);
    
    // If already in a call with this user, handle this as a WebRTC renegotiation offer
    if (peerConnection && activeCallTargetSocketId === from) {
      console.log("Handling incoming WebRTC renegotiation offer.");
      logDiagnostic("Renegotiating session...");
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('make-answer', { to: from, answer: answer });
        logDiagnostic("Renegotiation complete.");
        if (remoteVideo) {
          remoteVideo.play().catch(e => console.warn('Play resume on remote offer failed:', e.message));
        }
      } catch (err) {
        console.error("Renegotiation failed:", err);
        logDiagnostic("Renegotiation failed.");
      }
      return;
    }


    // Auto-reject if busy with another call
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
        if (!callTimer) {
          startCallTimer();
        }
        if (remoteVideo) {
          remoteVideo.play().catch(e => console.warn('Play resume on remote answer failed:', e.message));
        }
        // Process queued ice candidates
        processQueuedIceCandidates();
      } catch (err) {
        console.error('Error setting remote description:', err);
      }

    }
  });

  socket.on('ice-candidate', async ({ candidate }) => {
    if (!candidate) return;
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
      try {
        logDiagnostic("Adding ICE candidate...");
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error adding wrapper candidate, trying raw:', err);
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch (err2) {
          console.error('Error adding raw ICE candidate:', err2);
        }
      }
    } else {
      logDiagnostic(`Queued candidate (${iceCandidatesQueue.length + 1})`);
      iceCandidatesQueue.push(candidate);
    }
  });





  socket.on('track-changed', () => {
    console.log('Received track-changed signal from remote peer. Refreshing player.');
    logDiagnostic("Refreshing remote video...");
    if (remoteVideo && remoteStream) {
      // Temporarily detach and re-attach remoteStream to force mobile GPU to reload the decoder
      remoteVideo.srcObject = null;
      setTimeout(() => {
        if (remoteStream) {
          remoteVideo.srcObject = remoteStream;
          remoteVideo.play().then(() => {
            logDiagnostic("Remote video active");
          }).catch(e => console.warn('Fallback play failed:', e));
        }
      }, 150);
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
    // Check if message belongs to another room
    if (!message.system && message.room && message.room !== currentRoom) {
      const currentCount = unreadMessageCounts.get(message.room) || 0;
      unreadMessageCounts.set(message.room, currentCount + 1);
      
      playNotificationSound();
      updateSidebarOnlineUsers(); // Re-render badges
      return;
    }

    // Remove welcome box if still there
    const welcomeBox = messagesContainer.querySelector('.welcome-box');
    if (welcomeBox) welcomeBox.remove();

    renderMessage(message);
    scrollToBottom();

    // Mark as read immediately if actively viewing DM
    if (!message.system && message.username !== currentUsername) {
      playNotificationSound();
      socket.emit('mark-read', { room: currentRoom, username: currentUsername });
    }
  });

  // Ticks status update event listener
  socket.on('messages-read', ({ room, ids }) => {
    if (room !== currentRoom) return;
    ids.forEach(id => {
      const ticksSpan = document.getElementById(`ticks-${id}`);
      if (ticksSpan) {
        ticksSpan.className = 'ticks seen';
        ticksSpan.innerHTML = `
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <path d="M22 7L11 18l-5-5L7.41 11.59 11 15.17 20.59 5.58 22 7zM2.41 12.5l5.66 5.66 1.41-1.41L3.82 11.09 2.41 12.5z"/>
          </svg>
        `;
      }
    });
  });

  // Client side message self destruction event listener
  socket.on('messages-deleted', ({ room, ids }) => {
    if (room !== currentRoom) return;
    ids.forEach(id => {
      const msgDiv = document.getElementById(`msg-${id}`);
      if (msgDiv) {
        msgDiv.style.transition = 'all 0.3s ease';
        msgDiv.style.opacity = '0';
        msgDiv.style.transform = 'scale(0.85)';
        setTimeout(() => {
          msgDiv.remove();
          // Show default welcome box if chat is empty
          if (messagesContainer.children.length === 0) {
            const welcome = document.createElement('div');
            welcome.className = 'welcome-box';
            welcome.innerHTML = `
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" style="color: var(--accent-color); margin-bottom: 10px;">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
              </svg>
              <p>This room has been initialized. Messages are sent via WebSockets in real time.</p>
            `;
            messagesContainer.appendChild(welcome);
          }
        }, 300);
      }
    });
  });

  // Self destruct timer config events listener
  socket.on('self-destruct-timer-updated', ({ room, duration }) => {
    if (room !== currentRoom) return;
    activeSelfDestructDuration = duration;

    // Show/hide timer badge
    if (duration > 0) {
      const label = duration === 60 ? '1m' : duration === 300 ? '5m' : duration === 3600 ? '1h' : `${duration}s`;
      selfDestructBadge.textContent = label;
      selfDestructBadge.classList.remove('hidden');
    } else {
      selfDestructBadge.textContent = 'off';
      selfDestructBadge.classList.add('hidden');
    }

    // Active item toggles
    const dropdownItems = selfDestructDropdown.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
      const itemSec = parseInt(item.getAttribute('data-sec'));
      if (itemSec === duration) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  });

  // Presence tracker and status events listener
  socket.on('global-users', (usersList) => {
    globalUsersList = usersList;
    updateSidebarOnlineUsers();
    updateHeaderDMStatus();
  });

  // Receive typing broadcast
  socket.on('user-typing', ({ username, isTyping, room }) => {
    if (room !== currentRoom) return;
    
    if (isTyping) {
      activeTypingUsers.add(username);
      // Determine typing state label text
      if (isTyping === 'recording') {
        typingText.textContent = `${username} is recording audio`;
      } else if (isTyping === 'uploading') {
        typingText.textContent = `${username} is uploading a file`;
      } else {
        typingText.textContent = `${username} is typing`;
      }
    } else {
      activeTypingUsers.delete(username);
    }
    updateTypingIndicator();
  });

  // Receive room members list updates
  socket.on('room-users', ({ room, users }) => {
    if (room !== currentRoom) return;
    if (room.startsWith('dm:')) return; 
    currentRoomUsers = users; // Save occupants list
    const count = users.length;
    roomMembersCount.textContent = `${count} subscriber${count !== 1 ? 's' : ''} online`;
    userCountBadge.textContent = count;
  });


  // Receive dynamic active channels list updates from the server
  socket.on('rooms-list', (rooms) => {
    publicRoomsCache = rooms;
    renderRoomsListUI();
  });

  // Helper function to render active public and private code-based rooms
  function renderRoomsListUI() {
    roomsList.innerHTML = '';
    
    // Combine public server rooms with local storage code-joined rooms
    const localCodeRooms = JSON.parse(localStorage.getItem('joined-code-rooms') || '[]');
    const allRooms = [...publicRoomsCache];
    localCodeRooms.forEach(cr => {
      if (!allRooms.includes(cr)) {
        allRooms.push(cr);
      }
    });

    allRooms.forEach(room => {
      const isLobby = room === 'AetherAIFree General';
      const isCodeRoom = room.startsWith('code-');
      
      let deleteButtonHTML = '';
      if (isCodeRoom) {
        // Leave button for code-based private room
        deleteButtonHTML = `<button type="button" class="btn-room-delete leave-code-room-action" data-room="${room}" title="Leave Private Room" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;">
             <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
               <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
             </svg>
           </button>`;
      } else if (!isLobby) {
        // Delete button for public custom channel
        deleteButtonHTML = `<button type="button" class="btn-room-delete delete-room-action" data-room="${room}" title="Delete Channel">
             <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
               <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
             </svg>
           </button>`;
      }

      const li = document.createElement('li');
      li.className = `room-item ${room === currentRoom ? 'active' : ''}`;
      li.setAttribute('data-room', room);
      
      const displayName = isCodeRoom ? `Private: ${room.replace('code-', '')}` : room;
      const icon = isCodeRoom ? '🔑' : '#';

      li.innerHTML = `
        <div class="room-item-left" style="display: flex; align-items: center; gap: 8px;">
          <span class="room-icon">${icon}</span>
          <span class="room-name">${displayName}</span>
        </div>
        ${deleteButtonHTML}
      `;
      roomsList.appendChild(li);
    });

    // Re-bind click event to channel list items
    roomsList.querySelectorAll('.room-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Prevent trigger if they click action buttons inside the item!
        if (e.target.closest('.delete-room-action') || e.target.closest('.leave-code-room-action')) return;
        
        const room = item.getAttribute('data-room');
        switchChatRoom(room);
      });
    });

    // Re-bind delete public custom channel button clicks
    roomsList.querySelectorAll('.delete-room-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomName = btn.getAttribute('data-room');
        const confirmed = confirm(`Are you sure you want to delete the channel "# ${roomName}"? This will permanently wipe all messages and files in this room for all users!`);
        if (confirmed) {
          socket.emit('delete-room', { room: roomName });
        }
      });
    });

    // Re-bind leave code-based private room button clicks
    roomsList.querySelectorAll('.leave-code-room-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const roomName = btn.getAttribute('data-room');
        let localRooms = JSON.parse(localStorage.getItem('joined-code-rooms') || '[]');
        localRooms = localRooms.filter(r => r !== roomName);
        localStorage.setItem('joined-code-rooms', JSON.stringify(localRooms));
        
        // Re-render rooms list locally immediately
        renderRoomsListUI();

        if (currentRoom === roomName) {
          switchChatRoom('AetherAIFree General');
        }
      });
    });
  }



  // Force redirect if actively viewing a room that is deleted
  socket.on('force-lobby-redirect', ({ room }) => {
    if (room === currentRoom) {
      alert(`The channel "# ${room}" you were viewing has been deleted by a user.`);
      switchChatRoom('AetherAIFree General');
    }
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
  wrapper.id = `msg-${msg.id}`; // Map element ID for client self-destruction triggers

  // Formatting timestamp
  const date = new Date(msg.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Bubble Status Check Ticks HTML
  let ticksHTML = '';
  if (isOutgoing) {
    let tickClass = 'sent';
    let tickSVG = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `; // single check by default

    if (msg.status === 'seen') {
      tickClass = 'seen';
      tickSVG = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M22 7L11 18l-5-5L7.41 11.59 11 15.17 20.59 5.58 22 7zM2.41 12.5l5.66 5.66 1.41-1.41L3.82 11.09 2.41 12.5z"/>
        </svg>
      `; // double check seen
    } else if (msg.status === 'delivered') {
      tickClass = 'delivered';
      tickSVG = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M22 7L11 18l-5-5L7.41 11.59 11 15.17 20.59 5.58 22 7zM2.41 12.5l5.66 5.66 1.41-1.41L3.82 11.09 2.41 12.5z"/>
        </svg>
      `; // double check delivered
    }
    ticksHTML = `<span class="ticks ${tickClass}" id="ticks-${msg.id}">${tickSVG}</span>`;
  }
  
  let bubbleContentHTML = '';
  if (msg.file) {
    const isVoiceMessage = msg.file.name === 'voice-message.webm';
    
    if (isVoiceMessage) {
      // Render custom voice message player
      bubbleContentHTML = `
        <div class="voice-player">
          <audio src="${msg.file.url}" controls></audio>
        </div>
      `;
    } else {
      const fileSizeFormatted = formatBytes(msg.file.size);
      // Replaced warning with visible download links
      bubbleContentHTML = `
        <div class="file-card">
          <div class="file-icon-wrapper">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
            </svg>
          </div>
          <div class="file-info">
            <div class="file-name" title="${msg.file.name}">${escapeHTML(msg.file.name)}</div>
            <div class="file-meta-info">
              <span>${fileSizeFormatted}</span>
              <a href="${msg.file.url}" target="_blank" download="${msg.file.name}" class="file-warning" style="text-decoration: underline; color: var(--accent-color);">
                Download
              </a>
            </div>
          </div>
        </div>
      `;
    }
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
  if (!text) return;
  
  if (socket) {
    socket.emit('send-message', {
      text: text,
      room: currentRoom
    });
    
    // Stop typing activity state immediately
    socket.emit('typing', { isTyping: false, room: currentRoom });
    if (typingTimeout) clearTimeout(typingTimeout);
    isTypingState = false;
  }
  
  messageInput.value = '';
  
  // Toggle buttons back
  sendBtn.classList.add('hidden');
  micRecordBtn.classList.remove('hidden');
});

// Show Send button when user types text, otherwise show microphone button
messageInput.addEventListener('input', () => {
  const hasText = messageInput.value.trim().length > 0;
  if (hasText) {
    sendBtn.classList.remove('hidden');
    micRecordBtn.classList.add('hidden');
  } else {
    sendBtn.classList.add('hidden');
    micRecordBtn.classList.remove('hidden');
  }

  // Handle typing activity broadcasts
  if (!socket) return;
  if (!isTypingState) {
    isTypingState = true;
    socket.emit('typing', { isTyping: 'typing', room: currentRoom });
  }

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { isTyping: false, room: currentRoom });
    isTypingState = false;
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
    toggleQualityBtn.classList.remove('hidden');
    
    // Set default labels
    isHighQuality = true;
    if (qualityBtnLabel) qualityBtnLabel.textContent = 'HD';
    if (toggleQualityBtn) {
      toggleQualityBtn.classList.remove('low-bandwidth');
      toggleQualityBtn.title = 'Switch to Low Quality (SD)';
    }
  } else {
    videoStreamsContainer.classList.add('hidden');
    audioCallPlaceholder.classList.remove('hidden');
    toggleVideoBtn.classList.add('hidden'); // Hide camera control in audio calls
    switchCameraBtn.classList.add('hidden');
    toggleQualityBtn.classList.add('hidden');
    
    activeCallPeerName.textContent = peerName;
    activeCallAvatar.textContent = peerName.substring(0, 2).toUpperCase();
    activeCallAvatar.style.backgroundColor = getAvatarColor(peerName);
    activeCallStatus.textContent = 'Calling...';
  }

  try {
    // Reset candidates queue for new outgoing session
    iceCandidatesQueue = [];

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.777777778 } } : false
    });



    if (type === 'video') {
      localVideo.srcObject = localStream;
      
      // Detect multiple video cameras after permission is granted
      navigator.mediaDevices.enumerateDevices().then(devices => {
        videoInputDevices = devices.filter(d => d.kind === 'videoinput');
        console.log(`Discovered ${videoInputDevices.length} cameras:`, videoInputDevices);
        if (videoInputDevices.length > 1) {
          switchCameraBtn.classList.remove('hidden');
        } else {
          switchCameraBtn.classList.add('hidden');
        }
      }).catch(e => console.warn('Video device discovery error:', e));
    }


    createPeerConnection();
    logDiagnostic("P2P PC Created (Outgoing offer)...");


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
    toggleQualityBtn.classList.remove('hidden');
    
    // Set default labels
    isHighQuality = true;
    if (qualityBtnLabel) qualityBtnLabel.textContent = 'HD';
    if (toggleQualityBtn) {
      toggleQualityBtn.classList.remove('low-bandwidth');
      toggleQualityBtn.title = 'Switch to Low Quality (SD)';
    }
  } else {
    videoStreamsContainer.classList.add('hidden');
    audioCallPlaceholder.classList.remove('hidden');
    toggleVideoBtn.classList.add('hidden');
    switchCameraBtn.classList.add('hidden');
    toggleQualityBtn.classList.add('hidden');
    
    activeCallPeerName.textContent = peerName;
    activeCallAvatar.textContent = peerName.substring(0, 2).toUpperCase();
    activeCallAvatar.style.backgroundColor = getAvatarColor(peerName);
    activeCallStatus.textContent = 'Connecting...';
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 1.777777778 } } : false
    });




    if (callType === 'video') {
      localVideo.srcObject = localStream;
      
      // Detect multiple video cameras after permission is granted
      navigator.mediaDevices.enumerateDevices().then(devices => {
        videoInputDevices = devices.filter(d => d.kind === 'videoinput');
        console.log(`Discovered ${videoInputDevices.length} cameras:`, videoInputDevices);
        if (videoInputDevices.length > 1) {
          switchCameraBtn.classList.remove('hidden');
        } else {
          switchCameraBtn.classList.add('hidden');
        }
      }).catch(e => console.warn('Video device discovery error:', e));
    }


    createPeerConnection();
    logDiagnostic("P2P PC Created (Answering call)...");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));


    // Create SDP Answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Process queued candidates now that both local and remote descriptions are set
    processQueuedIceCandidates();


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
    console.log('Received remote media stream track:', event.track.kind);
    
    // Always ensure remoteStream is initialized
    if (!remoteStream) {
      remoteStream = new MediaStream();
    }
    
    // Add track to remote stream object
    remoteStream.addTrack(event.track);
    
    // Force re-assign srcObject to trigger layout/pipeline updates in Chrome/Safari
    remoteVideo.srcObject = remoteStream;
    
    // Explicitly play remote video to bypass browser autoplay policies
    remoteVideo.play().catch(e => {
      console.warn('Autoplay blocked. Adding fallback user gesture listener:', e.message);
      const playFallback = () => {
        remoteVideo.play().then(() => {
          console.log('Remote video playback started successfully via user gesture.');
        }).catch(err => console.error('Fallback playback failed:', err));
      };
      document.addEventListener('click', playFallback, { once: true });
      document.addEventListener('touchstart', playFallback, { once: true });
    });

    // Handle track unmute event (e.g. when quality switches or camera toggles)
    event.track.onunmute = () => {
      console.log('Remote track unmuted. Triggering playback refresh.');
      remoteVideo.play().catch(err => console.warn('Unmute play retry failed:', err.message));
    };
    
    if (callType === 'audio') {
      activeCallStatus.textContent = 'Voice Call Active';
    }
  };




  // ICE state monitor
  peerConnection.oniceconnectionstatechange = () => {
    if (peerConnection) {
      logDiagnostic(`ICE: ${peerConnection.iceConnectionState}`);
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

// Process any ICE candidates that arrived before the remote description was set
async function processQueuedIceCandidates() {
  if (!peerConnection) return;
  logDiagnostic(`Processing ${iceCandidatesQueue.length} queued ICE candidates...`);
  while (iceCandidatesQueue.length > 0) {
    const candidate = iceCandidatesQueue.shift();
    if (!candidate) continue;
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Error adding queued wrapper candidate, trying raw:', err);
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch (err2) {
        console.error('Error adding queued raw ICE candidate:', err2);
      }
    }
  }
  logDiagnostic("ICE candidates processed.");
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
  switchCameraBtn.classList.add('hidden');
  toggleQualityBtn.classList.add('hidden');

  if (iceFailedTimeout) {
    clearTimeout(iceFailedTimeout);
    iceFailedTimeout = null;
  }
  
  videoInputDevices = [];
  currentVideoDeviceIndex = 0;
  iceCandidatesQueue = []; // Clear queue
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

// Camera switching logic for switching between front/back camera
async function switchCamera() {
  if (!localStream || callType !== 'video') return;

  // Toggle active facing mode
  currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
  console.log(`Switching camera facingMode to: ${currentFacingMode}`);
  logDiagnostic(`Switching camera: ${currentFacingMode}...`);

  try {
    const oldVideoTrack = localStream.getVideoTracks()[0];
    
    // Stop the old camera track first to release camera lock on some Android browsers
    if (oldVideoTrack) {
      localStream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }

    // Request new video stream with the updated facingMode constraint
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: currentFacingMode }
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (!newVideoTrack) {
      throw new Error("No video track found in the new camera stream.");
    }
    
    // Add new camera track to local stream
    localStream.addTrack(newVideoTrack);

    // Swap source object for local video tag
    localVideo.srcObject = localStream;

    // replaceTrack WebRTC sender to update peer side stream in real time
    if (peerConnection) {
      const senders = peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }
      
      // Force an SDP renegotiation to update hardware video encoder pipelines on mobile
      try {
        logDiagnostic("Renegotiating session...");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', {
          to: activeCallTargetSocketId,
          offer: offer,
          type: callType
        });
      } catch (negErr) {
        console.warn("Failed to create renegotiation offer:", negErr);
      }
    }

    
    logDiagnostic(`Switched to ${currentFacingMode} camera`);

  } catch (err) {
    console.error('Camera switch failed:', err);
    logDiagnostic('Camera switch failed.');
    
    // Try to fallback by recovering default camera
    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      const newVideoTrack = fallbackStream.getVideoTracks()[0];
      localStream.addTrack(newVideoTrack);
      localVideo.srcObject = localStream;
      if (peerConnection) {
        const senders = peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) await videoSender.replaceTrack(newVideoTrack);
      }
    } catch (e) {
      console.error('Camera recovery failed:', e);
    }
    alert('Failed to switch camera source.');
  }
}


if (switchCameraBtn) {
  switchCameraBtn.addEventListener('click', switchCamera);
}

// Dynamic video quality toggling between High Quality (HD) and Low Quality (SD)
async function toggleVideoQuality() {
  if (!localStream || callType !== 'video') return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  isHighQuality = !isHighQuality;

  // HQ constraints: 720p 30fps. LQ constraints: 360p 15fps. Both maintain 16:9 aspect ratio to prevent zoom shifts.
  const constraints = isHighQuality 
    ? { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: 1.777777778, frameRate: { ideal: 30 } }
    : { width: { ideal: 640 }, height: { ideal: 360 }, aspectRatio: 1.777777778, frameRate: { ideal: 15 } };


  try {
    await videoTrack.applyConstraints(constraints);
    console.log(`Video quality constraints applied. High Quality: ${isHighQuality}`);
    
    // Force an SDP renegotiation to update hardware video encoder pipelines on mobile
    if (peerConnection) {
      try {
        logDiagnostic("Renegotiating session...");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', {
          to: activeCallTargetSocketId,
          offer: offer,
          type: callType
        });
      } catch (negErr) {
        console.warn("Failed to create renegotiation offer:", negErr);
      }
    }

    
    if (isHighQuality) {

      if (qualityBtnLabel) qualityBtnLabel.textContent = 'HD';
      if (toggleQualityBtn) {
        toggleQualityBtn.classList.remove('low-bandwidth');
        toggleQualityBtn.title = 'Switch to Low Quality (SD)';
      }
      alert('Video quality switched to High Definition (720p HD).');
    } else {
      if (qualityBtnLabel) qualityBtnLabel.textContent = 'SD';
      if (toggleQualityBtn) {
        toggleQualityBtn.classList.add('low-bandwidth');
        toggleQualityBtn.title = 'Switch to High Quality (HD)';
      }
      alert('Video quality switched to Low Bandwidth (180p SD) to save network data.');
    }
  } catch (err) {
    console.error('Failed to apply video constraints:', err);
    isHighQuality = !isHighQuality; // Revert state
    alert('Dynamic video resolution constraint switching is not supported on this device.');
  }
}

if (toggleQualityBtn) {
  toggleQualityBtn.addEventListener('click', toggleVideoQuality);
}

// Automatically resume/play remote video when its stream resolution changes (SD <-> HD)
if (remoteVideo) {
  remoteVideo.addEventListener('resize', () => {
    console.log('Remote video size changed (HD/SD toggle). Resuming playback...');
    remoteVideo.play().catch(e => console.warn('Play resume on resize failed:', e.message));
  });
}






// Event delegation on sidebar user list (handles clicking to chat, and voice/video calling)
onlineUsersList.addEventListener('click', (e) => {
  const audioBtn = e.target.closest('.start-audio-call');
  const videoBtn = e.target.closest('.start-video-call');
  const userItem = e.target.closest('.user-item');

  if (audioBtn) {
    e.stopPropagation();
    const socketId = audioBtn.getAttribute('data-id');
    const name = audioBtn.getAttribute('data-name');
    initiateUserCall(socketId, name, 'audio');
  } else if (videoBtn) {
    e.stopPropagation();
    const socketId = videoBtn.getAttribute('data-id');
    const name = videoBtn.getAttribute('data-name');
    initiateUserCall(socketId, name, 'video');
  } else if (userItem) {
    const nameText = userItem.querySelector('.user-name-list').textContent;
    const isSelf = nameText.includes('(you)');
    if (isSelf) return;

    const peerName = nameText.replace(' (you)', '').trim();
    const dmRoom = getDMRoomName(currentUsername, peerName);
    switchChatRoom(dmRoom);
  }
});

// Header call actions triggers
headerAudioCallBtn.addEventListener('click', () => {
  if (currentRoom.startsWith('dm:')) {
    const parts = currentRoom.split(':');
    const peerName = (currentUsername === parts[1]) ? parts[2] : parts[1];
    
    // Find peer socket details
    const peer = globalUsersList.find(u => u.username === peerName);
    if (peer && peer.status === 'online') {
      initiateUserCall(peer.id, peerName, 'audio');
    } else {
      alert(`${peerName} is offline right now.`);
    }
  } else if (currentRoom.startsWith('code-')) {
    const otherUsers = currentRoomUsers.filter(u => u.username !== currentUsername);
    if (otherUsers.length === 0) {
      alert("No one else is online in this private room to call.");
    } else if (otherUsers.length === 1) {
      const peer = otherUsers[0];
      initiateUserCall(peer.id, peer.username, 'audio');
    } else {
      // Multiple users online in the room: prompt selection
      const namesList = otherUsers.map(u => u.username);
      const chosenName = prompt(`Who in this private room do you want to call?\n\nOnline occupants:\n${namesList.join(', ')}`);
      if (chosenName) {
        const peer = otherUsers.find(u => u.username.toLowerCase() === chosenName.trim().toLowerCase());
        if (peer) {
          initiateUserCall(peer.id, peer.username, 'audio');
        } else {
          alert("Selected user is not online in this room.");
        }
      }
    }
  }
});

headerVideoCallBtn.addEventListener('click', () => {
  if (currentRoom.startsWith('dm:')) {
    const parts = currentRoom.split(':');
    const peerName = (currentUsername === parts[1]) ? parts[2] : parts[1];
    
    const peer = globalUsersList.find(u => u.username === peerName);
    if (peer && peer.status === 'online') {
      initiateUserCall(peer.id, peerName, 'video');
    } else {
      alert(`${peerName} is offline right now.`);
    }
  } else if (currentRoom.startsWith('code-')) {
    const otherUsers = currentRoomUsers.filter(u => u.username !== currentUsername);
    if (otherUsers.length === 0) {
      alert("No one else is online in this private room to call.");
    } else if (otherUsers.length === 1) {
      const peer = otherUsers[0];
      initiateUserCall(peer.id, peer.username, 'video');
    } else {
      // Multiple users online in the room: prompt selection
      const namesList = otherUsers.map(u => u.username);
      const chosenName = prompt(`Who in this private room do you want to video call?\n\nOnline occupants:\n${namesList.join(', ')}`);
      if (chosenName) {
        const peer = otherUsers.find(u => u.username.toLowerCase() === chosenName.trim().toLowerCase());
        if (peer) {
          initiateUserCall(peer.id, peer.username, 'video');
        } else {
          alert("Selected user is not online in this room.");
        }
      }
    }
  }
});


// Self-Destruct Timer Interactions
selfDestructBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  selfDestructDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  selfDestructDropdown.classList.add('hidden');
});

selfDestructDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('.dropdown-item');
  if (!item || !socket) return;

  const duration = parseInt(item.getAttribute('data-sec'));
  socket.emit('update-self-destruct-timer', {
    room: currentRoom,
    duration: duration,
    username: currentUsername
  });
});

// --- Voice Recording Lifecycle ---
micRecordBtn.addEventListener('click', startVoiceRecording);
voiceCancelBtn.addEventListener('click', () => stopVoiceRecording(false));
voiceSendBtn.addEventListener('click', () => stopVoiceRecording(true));

async function startVoiceRecording() {
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Hide standard message input form, show voice record banner
    voiceRecordPanel.classList.remove('hidden');
    messageForm.classList.add('hidden');
    
    voiceMediaRecorder = new MediaRecorder(voiceStream);
    voiceAudioChunks = [];
    
    voiceMediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        voiceAudioChunks.push(e.data);
      }
    };

    voiceMediaRecorder.start();

    // Broadcast activity status state (Recording Audio...)
    if (socket) {
      socket.emit('typing', { isTyping: 'recording', room: currentRoom });
    }

    // Set duration timer
    voiceRecordDuration = 0;
    voiceRecordTimer.textContent = '00:00';
    voiceRecordInterval = setInterval(updateVoiceRecordTimer, 1000);

    // Dynamic state relays every 2 seconds
    window.voiceRecordIntervalState = setInterval(() => {
      if (socket) {
        socket.emit('typing', { isTyping: 'recording', room: currentRoom });
      }
    }, 2000);

  } catch (err) {
    console.error('Microphone capture error:', err);
    alert('Could not access microphone. Please verify recording permissions.');
  }
}

function stopVoiceRecording(save) {
  if (!voiceMediaRecorder) return;

  // Clear timers
  if (voiceRecordInterval) {
    clearInterval(voiceRecordInterval);
    voiceRecordInterval = null;
  }
  if (window.voiceRecordIntervalState) {
    clearInterval(window.voiceRecordIntervalState);
    window.voiceRecordIntervalState = null;
  }

  // Stop media recording tracks
  voiceMediaRecorder.stop();
  voiceStream.getTracks().forEach(track => track.stop());

  voiceMediaRecorder.onstop = async () => {
    // Hide recording layout, restore input panels
    voiceRecordPanel.classList.add('hidden');
    messageForm.classList.remove('hidden');

    if (socket) {
      socket.emit('typing', { isTyping: false, room: currentRoom });
    }

    if (save && voiceAudioChunks.length > 0) {
      const audioBlob = new Blob(voiceAudioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' }));

      // Broadcast activity status state (Uploading File...)
      if (socket) {
        socket.emit('typing', { isTyping: 'uploading', room: currentRoom });
      }

      try {
        const response = await fetch(`${SOCKET_URL}/upload`, {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const resData = await response.json();
          console.log('Voice file uploaded successfully:', resData);

          if (socket) {
            socket.emit('send-message', {
              text: '🎤 Voice Message',
              room: currentRoom,
              file: {
                name: 'voice-message.webm',
                size: audioBlob.size,
                url: resData.url
              }
            });
          }
        } else {
          alert('Failed to upload voice message to server.');
        }
      } catch (err) {
        console.error('Fetch voice upload error:', err);
        alert('Network error during voice message upload.');
      }
    }
    
    voiceMediaRecorder = null;
    voiceAudioChunks = [];
  };
}

function updateVoiceRecordTimer() {
  voiceRecordDuration++;
  const minutes = Math.floor(voiceRecordDuration / 60).toString().padStart(2, '0');
  const seconds = (voiceRecordDuration % 60).toString().padStart(2, '0');
  voiceRecordTimer.textContent = `${minutes}:${seconds}`;

  // Limit voice message to 30 seconds
  if (voiceRecordDuration >= 30) {
    stopVoiceRecording(true);
  }
}

// --- DM Helper Functions ---
function getDMRoomName(userA, userB) {
  const sorted = [userA, userB].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

// Repopulate Sidebar Online users based on global registered users list
function updateSidebarOnlineUsers() {
  onlineUsersList.innerHTML = '';
  
  globalUsersList.forEach(user => {
    const isSelf = user.username === currentUsername;
    const li = document.createElement('li');
    li.className = 'user-item';

    const dmRoom = getDMRoomName(currentUsername, user.username);
    if (dmRoom === currentRoom) {
      li.classList.add('active');
    }

    // Unread count badge
    const unreadCount = unreadMessageCounts.get(dmRoom) || 0;
    const badgeHTML = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';

    // Status label (Online green dot or Offline grey dot)
    const dotHTML = user.status === 'online' 
      ? `<div class="online-indicator-dot" style="background-color: var(--accent-success);"></div>`
      : `<div class="online-indicator-dot" style="background-color: var(--text-muted); opacity: 0.6;"></div>`;

    // Dynamic details actions for other users
    const callingActionsHTML = isSelf 
      ? `<div class="online-indicator-dot"></div>` 
      : `<div class="user-call-actions" style="margin-left: auto; display: flex; gap: 6px;">
           ${badgeHTML}
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

    const statusLabel = user.status === 'online' ? 'online' : formatLastSeen(user.lastSeen);

    li.innerHTML = `
      <div class="avatar" style="background-color: ${getAvatarColor(user.username)}; width: 32px; height: 32px; font-size: 0.8rem;">
        ${user.username.substring(0, 2).toUpperCase()}
      </div>
      <div class="user-details" style="max-width: 110px;">
        <div class="user-name-list" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.username} ${isSelf ? '(you)' : ''}</div>
        <div class="sub-text" style="font-size: 0.7rem; color: var(--text-muted);">${statusLabel}</div>
      </div>
      ${callingActionsHTML}
    `;

    onlineUsersList.appendChild(li);
  });
}

// Update Direct Message active header sub-text
function updateHeaderDMStatus() {
  if (!currentRoom.startsWith('dm:')) return;
  const parts = currentRoom.split(':');
  const peerName = (currentUsername === parts[1]) ? parts[2] : parts[1];

  const peer = globalUsersList.find(u => u.username === peerName);
  if (peer) {
    if (peer.status === 'online') {
      roomMembersCount.textContent = 'online';
      roomMembersCount.style.color = 'var(--accent-color)';
    } else {
      roomMembersCount.textContent = formatLastSeen(peer.lastSeen);
      roomMembersCount.style.color = 'var(--text-muted)';
    }
  }
}

function formatLastSeen(timestamp) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'last seen just now';
  if (diffMins < 60) return `last seen ${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `last seen ${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `last seen ${diffDays}d ago`;
}

// Switch Room Controller Helper
function switchChatRoom(roomName) {
  if (roomName === currentRoom) {
    if (window.innerWidth <= 768) {
      document.body.classList.add('active-chat');
    }
    return;
  }

  // Switch active classes in roomsList channels
  roomsList.querySelectorAll('.room-item').forEach(ri => {
    if (ri.getAttribute('data-room') === roomName) {
      ri.classList.add('active');
    } else {
      ri.classList.remove('active');
    }
  });

  // Switch selection in user DMs sidebar
  onlineUsersList.querySelectorAll('.user-item').forEach(ui => {
    const nameText = ui.querySelector('.user-name-list').textContent;
    const name = nameText.replace(' (you)', '').trim();
    const dmRoom = getDMRoomName(currentUsername, name);
    
    if (dmRoom === roomName) {
      ui.classList.add('active');
    } else {
      ui.classList.remove('active');
    }
  });

  currentRoom = roomName;

  // Clear unread badge counts
  unreadMessageCounts.delete(currentRoom);

  // Clear typing indications
  activeTypingUsers.clear();
  updateTypingIndicator();

  // Reset Input states
  messageInput.value = '';
  sendBtn.classList.add('hidden');
  micRecordBtn.classList.remove('hidden');

  // Load UI Headers
  const isDM = roomName.startsWith('dm:');
  const isCodeRoom = roomName.startsWith('code-');

  if (isDM || isCodeRoom) {
    headerCallActions.classList.remove('hidden');
    if (isDM) {
      const parts = roomName.split(':');
      const peerName = (currentUsername === parts[1]) ? parts[2] : parts[1];
      activeRoomTitle.textContent = peerName;
      selfDestructControl.classList.remove('hidden');
      updateHeaderDMStatus();
    } else {
      // Code Room
      const displayName = `Private: ${roomName.replace('code-', '')}`;
      activeRoomTitle.textContent = displayName;
      roomMembersCount.textContent = '0 online';
      currentRoomUsers = []; // Reset occupants until room-users list is received
      selfDestructControl.classList.add('hidden');
    }
  } else {
    activeRoomTitle.textContent = roomName;
    roomMembersCount.textContent = 'Connecting...';
    
    headerCallActions.classList.add('hidden');
    selfDestructControl.classList.add('hidden');
  }


  if (socket) {
    socket.emit('join-room', {
      username: currentUsername,
      room: currentRoom
    });
    
    // Mark as read immediately on open
    socket.emit('mark-read', { room: currentRoom, username: currentUsername });
  }

  // Slide over on mobile layouts
  if (window.innerWidth <= 768) {
    document.body.classList.add('active-chat');
  }
}

// --- Create Custom Channel Action ---
const createRoomBtn = document.getElementById('create-room-btn');
if (createRoomBtn) {
  createRoomBtn.addEventListener('click', () => {
    const name = prompt('Enter a name for the new chat channel:');
    if (!name) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    
    if (socket) {
      socket.emit('create-room', { room: trimmed });
      // Switch to it immediately after server updates
      setTimeout(() => {
        switchChatRoom(trimmed);
      }, 300);
    }
  });
}

// --- Create Secret Code Room ---
const createCodeRoomBtn = document.getElementById('create-code-room-btn');
if (createCodeRoomBtn) {
  createCodeRoomBtn.addEventListener('click', () => {
    // Generate a random 6-digit room code
    const code = Math.floor(100000 + Math.random() * 900000);
    const roomName = `code-${code}`;
    
    if (socket) {
      // Create secret room on the server (doesn't broadcast to other people's sidebar)
      socket.emit('create-room', { room: roomName, isSecret: true });
      
      // Save it locally for the current user
      let localRooms = JSON.parse(localStorage.getItem('joined-code-rooms') || '[]');
      if (!localRooms.includes(roomName)) {
        localRooms.push(roomName);
        localStorage.setItem('joined-code-rooms', JSON.stringify(localRooms));
      }
      
      alert(`🔑 Private Room Created!\n\nYour Room Code is: ${code}\n\nShare this code with another user to let them join your private room. Clicking OK will switch you into the room.`);
      switchChatRoom(roomName);
    }
  });
}

// --- Join Secret Code Room ---
const joinCodeRoomBtn = document.getElementById('join-code-room-btn');
if (joinCodeRoomBtn) {
  joinCodeRoomBtn.addEventListener('click', () => {
    const input = prompt('Enter the secure 6-digit room code:');
    if (!input) return;
    const code = input.trim();
    if (code.length === 0) return;
    
    const roomName = `code-${code}`;
    
    // Save it locally for the current user
    let localRooms = JSON.parse(localStorage.getItem('joined-code-rooms') || '[]');
    if (!localRooms.includes(roomName)) {
      localRooms.push(roomName);
      localStorage.setItem('joined-code-rooms', JSON.stringify(localRooms));
    }
    
    if (socket) {
      // Join the room on the server
      socket.emit('join-room', {
        username: currentUsername,
        room: roomName,
        metadata: getClientMetadata()
      });
    }
    
    switchChatRoom(roomName);
  });
}


