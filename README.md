# Kirkahoot

Charlie Kirk joins your Kahoot game, plays it himself, and tells you the answers in real time.

## How it works

1. You enter a 7-digit game PIN and a nickname for yourself.
2. Charlie Kirk (a headless Puppeteer bot on the backend) joins the same game under the name `CharlieKirk<XXXX>`.
3. When the answer phase starts, your camera takes a photo of the question on-screen.
4. The photo goes to a Gemma 3 4B vision model (`/api/gemini`), which picks the correct answer shape and color.
5. Charlie Kirk clicks that answer on his session.
6. Your screen shows which answer he picked, then goes green (correct) or red (incorrect) once Kahoot reveals the result.

Charlie's eyeballs are your camera. He plays; you watch.

---

## Running locally

### Backend (Puppeteer bot)

```bash
cd backend
npm install
node server.js
```

Runs on `http://localhost:3001`. Requires Chrome/Chromium — set `PUPPETEER_EXECUTABLE_PATH` if needed.

### Frontend (Next.js)

```bash
cd vercel
npm install
npm run dev
```

Runs on `http://localhost:3000`. Requires `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`.

---

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | `vercel/.env.local` | Google GenAI key for Gemma 3 4B |
| `PUPPETEER_EXECUTABLE_PATH` | backend env | Path to Chromium binary (optional) |
| `PORT` | backend env | Backend port (default: 3001) |
| `MAX_ACTIVE_SESSIONS` | backend env | Max concurrent bots (default: 4) |

---

## Architecture

```
Browser (you)
  └── Next.js frontend (Vercel)
        ├── Camera preview
        ├── WebSocket → backend /ws
        ├── POST /api/gemini  (Gemma 3 4B vision)
        └── POST backend /click-answer

Backend (Oracle VM or localhost)
  └── Express + ws + Puppeteer
        ├── One persistent Chromium process
        ├── One isolated context + page per session
        ├── Detects phase: waiting / answering / correct / incorrect
        └── Clicks the right answer button on Charlie's page
```

See [ORACLE_PUPPETEER_SETUP.md](ORACLE_PUPPETEER_SETUP.md) for production deployment on Oracle Cloud.
