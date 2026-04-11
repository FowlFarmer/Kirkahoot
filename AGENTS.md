<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Check out ORACLE_PUPPETEER_SETUP.md for details on project scope

## Repo structure
- `/vercel/`: Next.js frontend app.
- `/backend/`: Puppeteer backend service for snapshot streaming.

## Current setup
- The frontend includes a camera preview and a preview of the Kahoot session.
- The user enters a 7-digit game PIN and a nickname before connecting.
- The backend service runs separately and exposes:
  - `GET /health`
  - `GET /snapshot?session=<id>`
  - `ws://localhost:3001/ws`
- Each WebSocket connection creates an isolated Puppeteer session and page.
- The backend automates Kahoot join and streams sanitized HTML snapshots.
- The frontend renders snapshots into a sandboxed iframe and detects answer mode locally.
- The backend enforces a hard 1-hour timeout per session.
- Inference is handled by `/api/gemini` (Next.js route, `app/api/gemini/route.ts`) using `@google/genai` directly.
- The route accepts `{ prompt, imageBase64, mimeType }` and returns `{ text }` as plain JSON.
- The model is `gemma-3-4b-it` via the Google GenAI API (`GOOGLE_GENERATIVE_AI_API_KEY`).
- Response text is sanitized: newlines, carriage returns, and null bytes are stripped before returning.

## Current features
- frontend validates the PIN is exactly 7 digits
- frontend sends `init` over WebSocket with `pin` and `nickname`
- backend loads `https://kahoot.it/?pin=<PIN>&refer_method=link`
- backend captures sanitized page HTML snapshots and removes scripts
- backend streams snapshot updates when the page changes
- frontend updates iframe document content incrementally to reduce visual flash
- frontend detects answer phase by scanning the rendered iframe DOM for `triangle`, `circle`, `square`, or `diamond`
- frontend shows a warning popup if nickname confirmation is not detected, while still keeping the stream active
- backend session cleanup closes every session after 1 hour or when disconnected
- `/api/gemini` receives a screenshot (base64) and prompt, calls Gemma 3 4B, and returns the sanitized answer text

When the repo changes, update this file to keep the architecture notes accurate.

<!-- END:nextjs-agent-rules -->
