# Kahoot Backend TODOs

## Session limits

- Add `MAX_ACTIVE_SESSIONS` as an environment variable for the backend.
- Reject new WebSocket connections once the active Puppeteer session count reaches the configured limit.
- Return a clear `type: "error"` response to the client when the limit is reached.

## Current implementation

- The backend currently enforces a hard session limit using `MAX_ACTIVE_SESSIONS` with a default of `4`.
- This limit is applied immediately when a new WebSocket connection opens.

## Future env vars to add

- `MAX_ACTIVE_SESSIONS` — maximum concurrent Puppeteer sessions.
- `SESSION_TIMEOUT_MS` — session hard timeout duration.
- `ENABLE_BACKEND_LOGS` — toggle backend logging.