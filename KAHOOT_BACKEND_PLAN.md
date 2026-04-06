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
