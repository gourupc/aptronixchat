/**
 * Build & Stealth Security Script
 * Obfuscates client JS, server JS, generates robots.txt, _redirects, _headers, sanitizes README.md
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// 1. OBFUSCATE CLIENT JAVASCRIPT
const DEV_SRC = path.join(__dirname, 'client', 'app.dev.js');
const PROD_JS = path.join(__dirname, 'client', 'app.js');
const PROD_MIN = path.join(__dirname, 'client', 'app.min.js');

const sourcePath = fs.existsSync(DEV_SRC) ? DEV_SRC : PROD_JS;

console.log('[BUILD] Reading client source:', sourcePath);
let source = fs.readFileSync(sourcePath, 'utf8');

// Strip any residual revealing comments
source = source.replace(/\/\*[\s\S]*?\*\//g, '');
source = source.replace(/\/\/ ={3,}[^\n]*/g, '');
source = source.replace(/\/\/ -{3,}[^\n]*/g, '');
source = source.replace(/\/\/\s*(telegram|messenger|webrtc|socket\.io|chat|room|admin|passcode|call|video|voice|disappearing|self-destruct)[^\n]*/gi, '');

console.log(`[BUILD] Cleaned client source size: ${(source.length / 1024).toFixed(1)} KB`);

console.log('[BUILD] Obfuscating Client JavaScript with 100% string array encoding...');
const clientResult = JavaScriptObfuscator.obfuscate(source, {
  compact: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1.0,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1.0,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexesType: ['hexadecimal-number'],
  stringArrayIndexShift: true,
  unicodeEscapeSequence: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  deadCodeInjection: false,
  controlFlowFlattening: false,
  selfDefending: false,
  sourceMap: false,
  debugProtection: false,
});

const clientObfuscated = clientResult.getObfuscatedCode();

// Write to BOTH app.min.js and app.js
fs.writeFileSync(PROD_MIN, clientObfuscated, 'utf8');
fs.writeFileSync(PROD_JS, clientObfuscated, 'utf8');
console.log(`[BUILD] Client obfuscated output written to BOTH app.min.js and app.js (${(clientObfuscated.length / 1024).toFixed(1)} KB)`);

// 2. OBFUSCATE SERVER JAVASCRIPT
const SERVER_DEV = path.join(__dirname, 'server', 'server.dev.js');
const SERVER_PROD = path.join(__dirname, 'server', 'server.js');
const serverSourcePath = fs.existsSync(SERVER_DEV) ? SERVER_DEV : SERVER_PROD;

if (fs.existsSync(serverSourcePath)) {
  console.log('[BUILD] Reading server source:', serverSourcePath);
  let serverSource = fs.readFileSync(serverSourcePath, 'utf8');
  serverSource = serverSource.replace(/\/\*[\s\S]*?\*\//g, '');
  serverSource = serverSource.replace(/\/\/ ={3,}[^\n]*/g, '');
  serverSource = serverSource.replace(/\/\/ -{3,}[^\n]*/g, '');

  console.log('[BUILD] Obfuscating Server JavaScript for Node.js...');
  const serverResult = JavaScriptObfuscator.obfuscate(serverSource, {
    target: 'node',
    compact: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1.0,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    sourceMap: false
  });

  const serverObfuscated = serverResult.getObfuscatedCode();
  fs.writeFileSync(SERVER_PROD, serverObfuscated, 'utf8');
  console.log(`[BUILD] Obfuscated server.js written (${(serverObfuscated.length / 1024).toFixed(1)} KB)`);
}

// 3. GENERATE STRICT ROBOTS.TXT
const ROBOTS_CONTENT = `User-agent: *
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Bytespider
Disallow: /
`;

fs.writeFileSync(path.join(__dirname, 'client', 'robots.txt'), ROBOTS_CONTENT, 'utf8');
fs.writeFileSync(path.join(__dirname, 'robots.txt'), ROBOTS_CONTENT, 'utf8');
console.log('[BUILD] Generated strict robots.txt (client + root)');

// 4. GENERATE _REDIRECTS
const REDIRECTS_CONTENT = `/server/* / 404
/README.md / 404
/package.json / 404
/package-lock.json / 404
/telegram-websocket-clone/* / 404
/client/app.dev.js / 404
/server/server.dev.js / 404
/encrypted_blob.txt / 404
`;

fs.writeFileSync(path.join(__dirname, 'client', '_redirects'), REDIRECTS_CONTENT, 'utf8');
fs.writeFileSync(path.join(__dirname, '_redirects'), REDIRECTS_CONTENT, 'utf8');
console.log('[BUILD] Generated _redirects (client + root)');

// 5. GENERATE _HEADERS
const HEADERS_CONTENT = `/*
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
`;

fs.writeFileSync(path.join(__dirname, 'client', '_headers'), HEADERS_CONTENT, 'utf8');
fs.writeFileSync(path.join(__dirname, '_headers'), HEADERS_CONTENT, 'utf8');
console.log('[BUILD] Generated _headers (client + root)');

// 6. OVERWRITE README.MD
const README_CONTENT = `# AetherAI Search

Intelligent web inquiry and knowledge exploration portal.
`;
fs.writeFileSync(path.join(__dirname, 'README.md'), README_CONTENT, 'utf8');
console.log('[BUILD] Sanitized README.md');

// 7. STRIP COMMENTS FROM STYLE.CSS
const CSS_PATH = path.join(__dirname, 'client', 'style.css');
if (fs.existsSync(CSS_PATH)) {
  let css = fs.readFileSync(CSS_PATH, 'utf8');
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  css = css.replace(/\n\s*\n/g, '\n');
  fs.writeFileSync(CSS_PATH, css, 'utf8');
  console.log('[BUILD] Stripped comments from style.css');
}

console.log('[BUILD] All build and stealth protection tasks completed successfully! ✅');
