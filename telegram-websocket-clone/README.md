# Telegram WebSocket Clone

A premium, fully responsive Telegram-like chat application powered by WebSockets (`Socket.IO` and `Node.js`) on the backend and pure Vanilla JS/HTML/CSS on the frontend. The entire application is structured to run **100% free** in both local development and cloud production environments.

---

## Features
- **Real-Time Messaging**: Instantly send and receive messages with no delays via WebSocket.
- **Multiple Rooms**: Predefined channels (`Telegram General`, `Tech Talk`, `Meme Zone`, `Project Updates`) with local switching.
- **Online Member List**: See active subscribers online in each room in real time.
- **Typing Indicators**: Bouncing animation showing who is currently writing a message.
- **Double Ticks**: Realistic read-receipt checkmarks indicating sent/delivered status.
- **Custom Avatars**: Unique initials and colors automatically generated for nicknames.
- **Theme Switcher**: Fluid transitions between Telegram's signature **Dark Theme** and **Classic Light Theme**.
- **Message History Caching**: Retains the last 50 messages in each room directly in the server's memory for newly joined users.
- **Responsive Layout**: Designed to look like a native application on both desktop and mobile screens.

---

## Folder Structure
```
telegram-websocket-clone/
├── client/
│   ├── index.html        # Main HTML structure
│   ├── style.css         # Premium UI styles & themes
│   └── app.js            # Frontend connection controller
└── server/
    ├── package.json      # Backend dependencies & startup scripts
    └── server.js         # Node.js + Socket.IO server file
```

---

## Local Run Instructions

### Step 1: Start the Backend Server
1. Open your terminal and navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install the node packages:
   ```bash
   npm install
   ```
3. Run the server locally:
   ```bash
   npm start
   ```
   *The console should output: `Server is running on port 3000`.*

### Step 2: Open the Frontend Client
1. Open the [client/index.html](client/index.html) file directly in any modern web browser.
2. Select a nickname, choose a room, and click **Start Chatting**!
3. Open a second tab or private browser window with a different nickname to test real-time chat, typing indications, and active member lists side-by-side.

---

## Free Cloud Deployment Guide

This project is built using zero-cost cloud architecture:

### 1. Host the Backend Server (Render.com - Free Tier)
Render offers a generous, fully-functional free web service tier perfect for hosting WebSocket servers.
1. Sign up/log in at [Render](https://render.com).
2. Click **New +** and select **Web Service**.
3. Link your GitHub repository (containing this project).
4. Configure the Web Service:
   - **Name**: `telegram-ws-backend`
   - **Root Directory**: `server` (crucial so Render only builds the backend folder!)
   - **Environment / Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Select the **Free Instance Type** and click **Deploy**.
6. Once deployed, copy your service's URL (e.g., `https://telegram-ws-backend.onrender.com`).

> [!NOTE]
> Render's free servers "sleep" after 15 minutes of zero traffic. When someone opens the chat after a period of inactivity, the server will take around 50 seconds to spin back up, after which WebSocket connections will run perfectly.

---

### 2. Update the Frontend to point to Render
1. Open [client/app.js](client/app.js) in your text editor.
2. Find the constant `PROD_SERVER_URL` near the top:
   ```javascript
   // USER ACTION: Paste your deployed free-tier backend URL (e.g., Render/Glitch) here
   const PROD_SERVER_URL = 'https://YOUR-RENDER-SERVICE-NAME.onrender.com';
   ```
3. Paste your copied Render URL here and save the file.

---

### 3. Host the Frontend Client (Netlify / Vercel / GitHub Pages - Free)
Since the `client` folder contains only static HTML/CSS/JS files, it can be hosted on fast global CDNs for free.

#### Option A: Drag & Drop with Netlify (Easiest)
1. Sign up/log in at [Netlify](https://www.netlify.com).
2. Go to the Netlify dashboard and scroll down to the **"Drag and drop your site folder"** section.
3. Drag the entire `client` folder from your desktop onto the upload area.
4. Your site will instantly go live with a free secure URL!

#### Option B: GitHub Pages
1. Push your repository to GitHub.
2. Go to **Settings > Pages** on your GitHub repo.
3. Under **Build and deployment**, set Source to **Deploy from a branch**.
4. Select your main branch and choose the `/client` directory, then click save.
5. GitHub will deploy your static frontend at `https://<username>.github.io/<repository-name>`.
