# Kahoot Backend Plan

This project is intentionally designed as a wrapper around a regular `kahoot.it` iframe, with the backend providing a safe automation and DOM observation layer.

## Why the backend exists

- The frontend cannot directly inspect the Kahoot page DOM inside a cross-origin iframe.
- That means the app cannot reliably know when Kahoot is in the question/answer time window from the client alone.
- The backend uses Puppeteer to load Kahoot in an isolated browser session and access the page DOM.

## Primary backend responsibilities

1. Stream sanitized snapshots of the Kahoot page
   - Load the Kahoot session in Puppeteer and capture HTML content
   - Remove unsafe scripts and normalize the snapshot before sending it
   - Keep the stream updated when the page DOM changes
   - Enforce session limits and cleanup for long-running sessions

2. Automate join/setup and optional actions
   - Auto-fill PIN and nickname into Kahoot
   - Click through the Kahoot setup UI reliably
   - Optionally accept frontend user answer selections and click them on the backend page

## Why this is the right architecture

- The frontend cannot inspect a true cross-origin Kahoot iframe, so the backend must provide safe page snapshots.
- The frontend can render those snapshots locally and perform lightweight state detection in its own iframe document.
- This keeps automation and page access on the backend while allowing the frontend to reflect answer-phase state and UI warnings.

## Intended UX flow

- User enters PIN and nickname in the frontend.
- Backend creates a Puppeteer session and joins Kahoot.
- Backend streams sanitized HTML snapshots over WebSocket to the frontend.
- Frontend renders the snapshot into a sandboxed iframe and scans the rendered DOM for answer-mode indicators.
- If nickname confirmation is not detected, the frontend shows a warning but keeps the preview active.
- Backend enforces a hard 1-hour session timeout and cleans up stale sessions.

## What we learned up to this point

- Puppeteer is the right tool for loading a cross-origin Kahoot page and capturing sanitized HTML snapshots for the frontend.
- A backend session per WebSocket connection keeps each Kahoot interaction isolated and makes session cleanup easier.
- Sending sanitized HTML snapshots to the frontend works well, but the frontend should render them in a sandboxed iframe and avoid replacing the entire document too often.
- The frontend can safely detect answer phase by scanning its own rendered iframe DOM for `triangle`, `circle`, `square`, or `diamond` labels.
- Backend validation of join behavior is useful, but warning instead of failing lets the stream continue while the user learns the join may not have completed.
- A hard 1-hour timeout prevents long-running stale Puppeteer sessions from consuming resources indefinitely.

## Notes on implementation details

- The backend loads `https://kahoot.it/?pin=<PIN>&refer_method=link` and automates the nickname join flow.
- Snapshots are captured and streamed only when the page DOM changes.
- The frontend renders the snapshots into a sandboxed iframe and updates the iframe document incrementally.
- The frontend now performs its own answer-phase detection, rather than relying on backend state.
- Error and warning messages are sent from the backend to the frontend over WebSocket for user-facing feedback.
- Sessions are cleaned up after 1 hour or when the WebSocket disconnects.

## Future directions

- Improve answer-phase detection by targeting more specific DOM selectors or element attributes instead of only visible text.
- Explore a safer incremental DOM update strategy so the frontend preview can update page regions without replacing the whole `srcDoc`.
- Add backend action forwarding in a controlled way so the user can select an answer in the UI and the backend clicks it on the Kahoot page.
- Add more robust session cleanup and reconnection handling for long-running games.
- Consider adding an explicit photo capture coordinator for the LLM once the question phase is reliably detected.
