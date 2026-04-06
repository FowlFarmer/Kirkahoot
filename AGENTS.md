<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Check out ORACLE_PUPPETEER_SETUP.md for details on project scope

## Repo structure
- `/vercel/`: Next.js frontend app.
- `/backend/`: Puppeteer backend service for snapshot streaming.

## Current setup
- The frontend includes a camera preview and a static Kahoot stream.
- The user enters a 7-digit game PIN and a nickname before connecting.
- The backend service runs separately and exposes:
  - `GET /health`
  - `GET /snapshot?session=<id>`
  - `ws://localhost:3001/ws`
- Each WebSocket connection creates an isolated Puppeteer session.
- See `KAHOOT_BACKEND_PLAN.md` for the intended backend role as a Kahoot iframe wrapper, click automation layer, and photo-trigger coordinator.

## Current features
- frontend validates the PIN is exactly 7 digits
- frontend sends `init` over WebSocket with `pin` and `nickname`
- backend loads `https://kahoot.it/?pin=<PIN>&refer_method=link`
- backend captures sanitized page HTML snapshots
- backend streams snapshot updates only when the DOM changes
- frontend renders the snapshot as a read-only `srcDoc` iframe
- frontend includes a persistent camera preview

When the repo changes, update this file to keep the architecture notes accurate.

<!-- END:nextjs-agent-rules -->
