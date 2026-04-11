import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import puppeteer from "puppeteer";
import crypto from "crypto";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  log("HTTP", req.method, req.url);
  next();
});

app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const ENABLE_LOGS = process.env.ENABLE_BACKEND_LOGS === "true" || process.env.NODE_ENV !== "production";
const prettyTime = () => new Date().toISOString();
const log = (...args) => { if (ENABLE_LOGS) console.log("[backend]", prettyTime(), ...args); };
const warn = (...args) => { if (ENABLE_LOGS) console.warn("[backend]", prettyTime(), ...args); };
const errorLog = (...args) => { if (ENABLE_LOGS) console.error("[backend]", prettyTime(), ...args); };

let browser = null;
const sessions = new Map();
const MAX_ACTIVE_SESSIONS = Number(process.env.MAX_ACTIVE_SESSIONS) || 4;

const startSessionCountLog = () => {
  setInterval(() => log("Active backend sessions:", sessions.size), 10000);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createSessionId = () => crypto.randomUUID();

const generateNickname = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CharlieKirk${suffix}`;
};

const ANSWER_LABELS = ["triangle", "circle", "square", "diamond"];

const CORRECT_PATH_FRAGMENT = "M46.244 15.355";
const INCORRECT_PATH_FRAGMENT = "M39.99 12.621";

const detectPhase = async (page) => {
  try {
    return await page.evaluate((labels, correctFrag, incorrectFrag) => {
      const paths = Array.from(document.querySelectorAll("path"));
      if (paths.some((p) => (p.getAttribute("d") || "").includes(correctFrag))) return "correct";
      if (paths.some((p) => (p.getAttribute("d") || "").includes(incorrectFrag))) return "incorrect";
      const elements = Array.from(document.querySelectorAll("button, span, div, p, a, li"));
      if (elements.some((el) => {
        const text = el.textContent?.trim().toLowerCase();
        return text ? labels.some((label) => text.includes(label)) : false;
      })) return "answering";
      return "waiting";
    }, labels, correctFrag, incorrectFrag);
  } catch {
    return "waiting";
  }
};

const createSession = async (socket, pin) => {
  if (!browser) throw new Error("Browser is not initialized");

  const nickname = generateNickname();
  const url = `https://kahoot.it/?pin=${encodeURIComponent(pin)}&refer_method=link`;
  log("Creating session", pin, nickname);

  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : typeof browser.createIncognitoBrowserContext === "function"
      ? await browser.createIncognitoBrowserContext()
      : null;
  const page = context ? await context.newPage() : await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    if (typeof page.waitForNetworkIdle === "function") {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });
    }

    await sleep(690);
    const nicknameSelector = 'input[name="nickname"], #nickname, input[data-functional-selector="username-input"]';
    await page.waitForSelector(nicknameSelector, { timeout: 10000 });
    await page.type(nicknameSelector, nickname, { delay: 50 });
    log("Nickname typed", nickname);

    await sleep(670);
    const submitSelector = 'button[data-functional-selector="join-button-username"], button[type="submit"]';
    await page.waitForSelector(submitSelector, { timeout: 10000 });
    await page.click(submitSelector);
    log("Clicked submit");

    if (typeof page.waitForNetworkIdle === "function") {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 2000 }).catch(() => null);
    } else {
      await sleep(2000);
    }

    const confirmationTexts = ["You're in! See your nickname on screen?", "You'll be able to join soon"];
    const confirmationFound = await (typeof page.waitForFunction === "function"
      ? page.waitForFunction(
          (texts) => texts.some((t) => document.body?.innerText?.includes(t)),
          { timeout: 3000 },
          confirmationTexts
        ).then(() => true).catch(() => false)
      : page.evaluate(
          (texts) => texts.some((t) => document.body?.innerText?.includes(t)),
          confirmationTexts
        ).catch(() => false));

    if (!confirmationFound) {
      warn("Confirmation not detected for", nickname, "— aborting");
      throw new Error("Join confirmation not detected");
    }
  } catch (err) {
    warn("Join automation failed:", err);
    try {
      if (page && !(typeof page.isClosed === "function" && page.isClosed()) && typeof page.close === "function") await page.close();
      if (context && typeof context.close === "function") await context.close();
    } catch { /* ignore */ }
    throw err;
  }

  log("Session ready", pin, nickname);

  const sessionId = createSessionId();
  let lastPhase = "waiting";

  const phaseInterval = setInterval(async () => {
    try {
      if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
        await killSession(sessionId, "page closed unexpectedly");
        return;
      }
      const nowPhase = await detectPhase(page);
      if (nowPhase !== lastPhase) {
        lastPhase = nowPhase;
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "phase", phase: nowPhase }));
        }
      }
    } catch (err) {
      await killSession(sessionId, err);
    }
  }, 800);

  const hardTimeout = setTimeout(async () => {
    log("Hard timeout reached", sessionId);
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "status", message: "Session timed out after 1 hour." }));
      socket.close();
    }
    await cleanupSession(sessionId).catch((err) => warn("Hard timeout cleanup failed", err));
  }, 3600_000);

  return { id: sessionId, socket, pin, nickname, context, page, phaseInterval, hardTimeout };
};

const killSession = async (sessionId, reason) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  errorLog("Killing session", sessionId, reason);
  if (session.socket.readyState === 1) {
    try {
      session.socket.send(JSON.stringify({ type: "error", message: "charlie kirk died :( rip" }));
    } catch { /* ignore */ }
    session.socket.close();
  }
  await cleanupSession(sessionId);
};

const cleanupSession = async (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  clearInterval(session.phaseInterval);
  clearTimeout(session.hardTimeout);
  try {
    log("Cleaning up session", sessionId);
    if (session.page && typeof session.page.close === "function") await session.page.close();
    if (session.context && typeof session.context.close === "function") await session.context.close();
  } catch (error) {
    warn("Cleanup error", sessionId, error);
  }
  sessions.delete(sessionId);
};

const startBrowser = async () => {
  try {
    log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
    log("Puppeteer browser launched");
  } catch (error) {
    errorLog("Puppeteer startup failed:", error);
  }
};

app.get("/health", (_req, res) => {
  res.json({ status: "ok", browser: Boolean(browser), sessions: sessions.size });
});

const VALID_SHAPES = new Set(["triangle", "circle", "diamond", "square"]);

app.post("/click-answer", async (req, res) => {
  const { sessionId, shape } = req.body ?? {};

  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "sessionId is required." });
  }

  const normalizedShape = typeof shape === "string" ? shape.trim().toLowerCase() : "";
  if (!VALID_SHAPES.has(normalizedShape)) {
    return res.status(400).json({ error: `shape must be one of: ${[...VALID_SHAPES].join(", ")}.` });
  }

  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "Session not found." });

  try {
    const elementHandle = await session.page.evaluateHandle((shape) => {
      const srSpans = Array.from(document.querySelectorAll(
        "span.styles_SROnly__orvnxj0, [class*='SROnly'], [class*='sr-only'], [class*='srOnly']"
      ));
      for (const span of srSpans) {
        if (span.textContent?.trim().toLowerCase().includes(shape)) {
          let el = span;
          while (el && el.tagName !== "BUTTON") el = el.parentElement;
          if (el) return el;
        }
      }
      const buttons = Array.from(document.querySelectorAll(
        "button[type='submit'], button[data-functional-selector^='answer']"
      ));
      return buttons.find((b) => b.textContent?.toLowerCase().includes(shape)) ?? null;
    }, normalizedShape);

    const element = elementHandle?.asElement ? elementHandle.asElement() : null;
    if (!element) {
      warn("Answer button not found in DOM for shape", normalizedShape, "session", sessionId);
      return res.status(404).json({ error: "Answer button not found in DOM." });
    }

    await element.click({ delay: 30 });
    elementHandle.dispose();

    log("Clicked answer", normalizedShape, "for session", sessionId);
    return res.json({ ok: true, shape: normalizedShape });
  } catch (error) {
    errorLog("click-answer failed:", error);
    await killSession(sessionId, error);
    return res.status(500).json({ error: "Click failed on backend." });
  }
});

wss.on("connection", (socket) => {
  log("WebSocket connection opened");

  if (!browser) {
    socket.send(JSON.stringify({ type: "status", message: "backend unavailable" }));
    socket.close();
    return;
  }

  if (sessions.size >= MAX_ACTIVE_SESSIONS) {
    socket.send(JSON.stringify({
      type: "error",
      message: `Maximum active sessions reached (${MAX_ACTIVE_SESSIONS}). Please try again later.`,
    }));
    socket.close();
    return;
  }

  let session = null;
  let initialized = false;

  const maybeCleanup = async () => {
    if (session) {
      await cleanupSession(session.id);
      session = null;
    }
  };

  socket.send(JSON.stringify({ type: "status", message: "waiting for init" }));

  socket.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      log("WS message received", data?.type);

      if (data?.type === "init") {
        if (initialized) return;

        const pin = String(data.pin || "").trim();
        if (!/^\d{7}$/.test(pin)) {
          socket.send(JSON.stringify({ type: "error", message: "pin must be a 7-digit number" }));
          return;
        }

        try {
          session = await createSession(socket, pin);
          sessions.set(session.id, session);
          initialized = true;
          log("Session created", session.id, pin, session.nickname);
        } catch (error) {
          errorLog("Failed to create session:", error);
          socket.send(JSON.stringify({
            type: "error",
            message: "Unable to join the game. Make sure the PIN is correct and the game is open.",
          }));
          socket.close();
          return;
        }

        socket.send(JSON.stringify({ type: "status", message: "connected" }));
        socket.send(JSON.stringify({
          type: "session",
          sessionId: session.id,
          pin,
          nickname: session.nickname,
        }));
        return;
      }
    } catch (error) {
      console.warn("WS message parse error", error);
    }
  });

  socket.on("close", () => {
    log("WebSocket connection closed");
    maybeCleanup().catch((error) => warn("Cleanup error", error));
  });

  socket.on("error", (error) => {
    warn("WebSocket error", error);
    maybeCleanup().catch((cleanupError) => warn("Cleanup error", cleanupError));
  });
});

server.listen(PORT, async () => {
  console.log(`Kirkahoot backend listening on http://localhost:${PORT}`);
  await startBrowser();
  startSessionCountLog();
});

const shutdown = async (signal) => {
  console.log(`Shutting down on ${signal}...`);
  for (const sessionId of Array.from(sessions.keys())) {
    await cleanupSession(sessionId);
  }
  if (browser) await browser.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
