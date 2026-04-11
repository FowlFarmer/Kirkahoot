# Oracle Cloud Puppeteer Setup

Kirkahoot's backend runs a persistent Puppeteer service on an Oracle Cloud Always Free VM. This document covers provisioning and deployment.

---

## Architecture summary

- **Frontend**: Next.js on Vercel. Handles camera, WebSocket client, Gemini API calls, and answer display.
- **Backend**: Node.js (Express + ws + Puppeteer) on Oracle VM. Runs headless Chromium, manages one bot session per connected user, streams phase state over WebSocket.

One persistent Chromium process serves all sessions. Each user gets an isolated incognito context and page. Sessions are cleaned up on disconnect or after a 1-hour hard timeout.

---

## Phase state machine

The backend polls Kahoot's DOM every 800 ms and sends `{ type: "phase", phase }` over the WebSocket. Possible phases:

| Phase | Meaning |
|---|---|
| `waiting` | Lobby / between questions |
| `answering` | Answer buttons are visible — bot takes photo, infers, clicks |
| `correct` | Checkmark SVG detected — answer was right |
| `incorrect` | X mark SVG detected — answer was wrong |

Once `answering` begins, the backend suppresses spurious `waiting` flashes until `correct` or `incorrect` arrives. If `answering` lasts more than 5 minutes continuously, the session is killed.

---

## Oracle Cloud VM setup

### 1. Create an Always Free VM

- Oracle Cloud console → Compute → Instances → Create Instance
- Shape: VM.Standard.E2.1.Micro (Always Free)
- OS: Ubuntu 22.04
- Enable SSH access, add your public key

### 2. SSH in and install dependencies

```bash
ssh ubuntu@<your-vm-ip>

sudo apt update && sudo apt install -y curl git build-essential \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxcomposite1 libxrandr2 libxdamage1 libxkbcommon0 \
  libgbm1 libpango-1.0-0 libglib2.0-0 ca-certificates

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Install Chromium

```bash
sudo apt install -y chromium-browser
which chromium-browser   # note this path
```

### 4. Clone and install the backend

```bash
git clone <your-repo-url> kirkahoot
cd kirkahoot/backend
npm install
```

### 5. Run the backend

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
PORT=3001 \
node server.js
```

To keep it running:

```bash
npm install -g pm2
pm2 start server.js --name kirkahoot-backend \
  --env production \
  -- --env PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser PORT=3001
pm2 save
pm2 startup
```

### 6. Open the firewall port

Oracle Cloud console → Networking → Virtual Cloud Networks → Security Lists → add ingress rule for TCP port 3001.

Also on the VM:

```bash
sudo iptables -I INPUT -p tcp --dport 3001 -j ACCEPT
```

### 7. Point the frontend at the backend

In `vercel/app/page.tsx`, update the WebSocket URL from `ws://localhost:3001/ws` to `ws://<your-vm-ip>:3001/ws` (or `wss://` if you put it behind a reverse proxy with TLS).

---

## Security notes

- The backend has no authentication. In production, put it behind a reverse proxy (nginx/caddy) and add a shared secret or token check.
- `MAX_ACTIVE_SESSIONS` (default: 4) limits concurrent bots to protect the VM from resource exhaustion.
- Each session has a hard 1-hour timeout and a 5-minute answering-phase watchdog.
- Puppeteer runs with `--no-sandbox` — acceptable inside a dedicated VM, not in a shared container.
