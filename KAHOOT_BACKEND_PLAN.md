# Kahoot Backend Plan

This project is intentionally designed as a wrapper around a regular `kahoot.it` iframe, with the backend providing a safe automation and DOM observation layer.

## Why the backend exists

- The frontend cannot directly inspect the Kahoot page DOM inside a cross-origin iframe.
- That means the app cannot reliably know when Kahoot is in the question/answer time window from the client alone.
- The backend uses Puppeteer to load Kahoot in an isolated browser session and access the page DOM.

## Primary backend responsibilities

1. Detect game state changes
   - Observe Kahoot page DOM changes in the backend session
   - Determine when the game has reached a question/answer phase
   - Trigger a camera/photo capture event to send to the LLM at the correct moment

2. Automate join/setup and answer interactions
   - Auto-fill PIN and nickname into Kahoot
   - Click through Kahoot setup UI reliably
   - Optionally accept frontend user answer selections and click answers on the backend page

## Why this is the right architecture

- The frontend can still render a read-only snapshot of the Kahoot page for preview.
- The backend can make decisions from the actual page DOM and automate interactions.
- This preserves the ability to do CV/photo capture on top while still reacting to Kahoot game state.

## Intended UX flow

- User enters PIN and nickname in the frontend.
- Backend creates a Puppeteer session and joins Kahoot.
- Backend watches the Kahoot DOM for question windows.
- When it detects a question phase, it signals the frontend or triggers a photo capture for the LLM.
- The frontend may also send answer clicks, which the backend can translate into clicks on the Kahoot page.

## What we learned up to this point

- Puppeteer is the right tool for scraping a cross-origin Kahoot page because it can access page DOM content that the browser frontend cannot.
- A backend session per WebSocket connection keeps each Kahoot interaction isolated and makes it easier to manage session lifecycle.
- Sending sanitized HTML snapshots as `srcDoc` to the frontend is a reliable way to preview the page without exposing a live cross-origin iframe.
- DOM diffing helps avoid unnecessary snapshot updates, but the frontend may still flash if the entire `srcDoc` is replaced too often.
- Detecting answer-phase state from page text like `red triangle`, `blue diamond`, `yellow circle`, and `green square` is a practical heuristic for Kahoot answer screens.
- Backend-side validation of join success and nickname entry improves robustness and prevents the UI from staying stuck on an invalid session.

## Notes on implementation details

- The backend now loads `https://kahoot.it/?pin=<PIN>&refer_method=link` and waits for the join flow to complete.
- Snapshots are captured only when the DOM changes or when answer-phase state changes, so the frontend stays in sync without too many redundant updates.
- The frontend still renders the page in a read-only preview, while the backend retains the only direct access to the Kahoot DOM.
- Error messages and session status are forwarded from backend to frontend over WebSocket for user-facing feedback.

## Future directions

- Improve answer-phase detection by targeting more specific DOM selectors or element attributes instead of only visible text.
- Explore a safer incremental DOM update strategy so the frontend preview can update page regions without replacing the whole `srcDoc`.
- Add backend action forwarding in a controlled way so the user can select an answer in the UI and the backend clicks it on the Kahoot page.
- Add more robust session cleanup and reconnection handling for long-running games.
- Consider adding an explicit photo capture coordinator for the LLM once the question phase is reliably detected.
