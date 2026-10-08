/**
 * Build & Stealth Security Script
 * Obfuscates JS, generates robots.txt, _redirects, _headers, sanitizes README.md
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const DEV_SRC = path.join(__dirname, 'client', 'app.dev.js');
const PROD_JS = path.join(__dirname, 'client', 'app.js');
const PROD_MIN = path.join(__dirname, 'client', 'app.min.js');

const sourcePath = fs.existsSync(DEV_SRC) ? DEV_SRC : PROD_JS;

console.log('[BUILD] Reading source:', sourcePath);
let source = fs.readFileSync(sourcePath, 'utf8');

// Strip any residual revealing comments
source = source.replace(/\/\*[\s\S]*?\*\//g, '');
source = source.replace(/\/\/ ={3,}[^\n]*/g, '');
source = source.replace(/\/\/ -{3,}[^\n]*/g, '');
source = source.replace(/\/\/\s*(telegram|messenger|webrtc|socket\.io|chat|room|admin|passcode|call|video|voice|disappearing|self-destruct)[^\n]*/gi, '');

console.log(`[BUILD] Cleaned source size: ${(source.length / 1024).toFixed(1)} KB`);

console.log('[BUILD] Obfuscating JavaScript with 100% string array encoding...');
const result = JavaScriptObfuscator.obfuscate(source, {
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

const obfuscated = result.getObfuscatedCode();

// Write to BOTH app.min.js and app.js so no plain code is ever exposed
fs.writeFileSync(PROD_MIN, obfuscated, 'utf8');
fs.writeFileSync(PROD_JS, obfuscated, 'utf8');
console.log(`[BUILD] Obfuscated output written to BOTH app.min.js and app.js (${(obfuscated.length / 1024).toFixed(1)} KB)`);

// 1. Generate strict robots.txt for AI bots & search engines
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

// 2. Generate _redirects to block unauthorized static path probes
const REDIRECTS_CONTENT = `/server/* / 404
/README.md / 404
/package.json / 404
/package-lock.json / 404
/telegram-websocket-clone/* / 404
/client/app.dev.js / 404
/encrypted_blob.txt / 404
`;

fs.writeFileSync(path.join(__dirname, 'client', '_redirects'), REDIRECTS_CONTENT, 'utf8');
fs.writeFileSync(path.join(__dirname, '_redirects'), REDIRECTS_CONTENT, 'utf8');
console.log('[BUILD] Generated _redirects (client + root)');

// 3. Generate _headers with security & anti-crawling tags
const HEADERS_CONTENT = `/*
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
`;

fs.writeFileSync(path.join(__dirname, 'client', '_headers'), HEADERS_CONTENT, 'utf8');
fs.writeFileSync(path.join(__dirname, '_headers'), HEADERS_CONTENT, 'utf8');
console.log('[BUILD] Generated _headers (client + root)');

// 4. Overwrite README.md with sanitized content
const README_CONTENT = `# AetherAI Search

Intelligent web inquiry and knowledge exploration portal.
`;
fs.writeFileSync(path.join(__dirname, 'README.md'), README_CONTENT, 'utf8');
console.log('[BUILD] Sanitized README.md');

console.log('[BUILD] All build and stealth protection tasks completed successfully! ✅');
