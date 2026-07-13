const { google } = require('googleapis');
const readline = require('readline');

if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET) {
  console.error('Set GMAIL_CLIENT_ID & GMAIL_CLIENT_SECRET env vars first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const SCOPES = ['https://mail.google.com/'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Open this URL in a browser and grant access:');
console.log(authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from the page: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('\n=== Refresh Token ===\n', tokens.refresh_token);
    console.log('\nSave this token as GMAIL_REFRESH_TOKEN in your environment.');
    rl.close();
  } catch (err) {
    console.error('Error retrieving token:', err);
    rl.close();
  }
});
