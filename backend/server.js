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
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  log("HTTP", req.method, req.url);
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const ENABLE_LOGS = process.env.ENABLE_BACKEND_LOGS === "true" || process.env.NODE_ENV !== "production";
const prettyTime = () => new Date().toISOString();
const log = (...args) => {
  if (ENABLE_LOGS) console.log("[backend]", prettyTime(), ...args);
};
const warn = (...args) => {
  if (ENABLE_LOGS) console.warn("[backend]", prettyTime(), ...args);
};
const errorLog = (...args) => {
  if (ENABLE_LOGS) console.error("[backend]", prettyTime(), ...args);
};

let browser = null;
const sessions = new Map();

const startSessionCountLog = () => {
  setInterval(() => {
    log("Active backend sessions:", sessions.size);
  }, 10000);
};

const sanitizeHtml = (html) => {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  return withoutScripts.replace(
    /<head([^>]*)>/i,
    `<head$1><base href=\"https://kahoot.it\">`
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createSessionId = () => crypto.randomUUID();

const performElementAction = async (page, action, descriptor, value) => {
  const result = await page.evaluate(({ action, descriptor, value }) => {
    const escapeCss = (str) =>
      String(str).replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");

    const tryQuery = (selector) => {
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    };

    const findElement = () => {
      const selectors = [];
      if (descriptor.selector) selectors.push(descriptor.selector);
      if (descriptor.id) selectors.push(`#${escapeCss(descriptor.id)}`);
      if (descriptor.name) selectors.push(`${descriptor.tagName || "*"}[name="${escapeCss(descriptor.name)}"]`);
      if (descriptor.role) selectors.push(`${descriptor.tagName || "*"}[role="${escapeCss(descriptor.role)}"]`);
      if (descriptor.className) {
        const classes = String(descriptor.className).split(/\s+/).filter(Boolean);
        if (classes.length) {
          selectors.push(`${descriptor.tagName || "*"}${classes.map((name) => `.${escapeCss(name)}`).join("")}`);
        }
      }
      if (descriptor.path) selectors.push(descriptor.path);

      for (const selector of selectors) {
        const element = tryQuery(selector);
        if (element) return element;
      }

      if (descriptor.text) {
        const searchText = String(descriptor.text).trim().toLowerCase();
        const elements = Array.from(document.querySelectorAll(descriptor.tagName || "*"));
        return elements.find((element) =>
          element.textContent?.trim().toLowerCase().includes(searchText)
        );
      }

      return null;
    };

    const element = findElement();
    if (!element) {
      return { success: false, message: "Element not found" };
    }

    if (action === "click") {
      element.click();
      return { success: true };
    }

    if (action === "submit") {
      if (typeof element.submit === "function") {
        element.submit();
        return { success: true };
      }
      return { success: false, message: "Element cannot submit" };
    }

    if (action === "type") {
      if ("value" in element) {
        element.focus();
        element.value = value || "";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return { success: true };
      }
      return { success: false, message: "Element is not typable" };
    }

    return { success: false, message: "Unsupported action" };
  }, { action, descriptor, value });

  return result;
};

const createSession = async (socket, pin, nickname) => {
  if (!browser) {
    throw new Error("Browser is not initialized");
  }

  const url = `https://kahoot.it/?pin=${encodeURIComponent(pin)}&refer_method=link`;
  log("Creating session", pin, nickname);
  const context =
    typeof browser.createBrowserContext === "function"
      ? await browser.createBrowserContext()
      : typeof browser.createIncognitoBrowserContext === "function"
      ? await browser.createIncognitoBrowserContext()
      : null;
  const page = context ? await context.newPage() : await browser.newPage();
  log("Created page for session", pin, nickname, "using context?", !!context);
  await page.setViewport({ width: 1280, height: 900 });
  log("Navigating to", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  if (typeof page.waitForNetworkIdle === "function") {
    log("Waiting for network idle");
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 });
  }

  let nicknameConfirmed = true;

  try {
    log("Waiting before nickname entry");
    await sleep(690);
    const nicknameSelector = 'input[name="nickname"], #nickname, input[data-functional-selector="username-input"]';
    await page.waitForSelector(nicknameSelector, { timeout: 10000 });
    await page.type(nicknameSelector, nickname, { delay: 50 });
    log("Nickname typed", nickname);

    log("Waiting before submit click");
    await sleep(670);
    const submitSelector = 'button[data-functional-selector="join-button-username"], button[type="submit"]';
    await page.waitForSelector(submitSelector, { timeout: 10000 });
    await page.click(submitSelector);
    log("Clicked OK, go! button");

    if (typeof page.waitForNetworkIdle === "function") {
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 2000 }).catch(() => null);
      log("Network idle after submit");
    } else {
      await sleep(2000);
    }

    const confirmationTexts = [
      "You're in! See your nickname on screen?",
      "You'll be able to join soon",
    ];
    const confirmationFound = await (typeof page.waitForFunction === "function"
      ? page
          .waitForFunction(
            (texts) =>
              texts.some((text) => document.body?.innerText?.includes(text)),
            { timeout: 3000 },
            confirmationTexts
          )
          .then(() => true)
          .catch(() => false)
      : page
          .evaluate(
            (texts) => texts.some((text) => document.body?.innerText?.includes(text)),
            confirmationTexts
          )
          .catch(() => false));

    if (!confirmationFound) {
      nicknameConfirmed = false;
      warn(`Nickname confirmation text not detected: ${confirmationTexts.join(" | ")}`);
    }
  } catch (err) {
    warn("Nickname form automation failed:", err);
    throw err;
  }

  log("Page ready for session", pin, nickname);

  let latestSnapshot = "";
  let previousSnapshot = "";

  const captureSnapshot = async () => {
    if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
      warn("Snapshot capture skipped because page is closed");
      return latestSnapshot;
    }
    try {
      const html = await page.content();
      const snapshot = sanitizeHtml(html);
      latestSnapshot = snapshot;
      log("Captured snapshot for session", pin, nickname);
      return snapshot;
    } catch (error) {
      errorLog("Session snapshot failed:", error);
      return latestSnapshot;
    }
  };

  const sendSnapshot = async (force = false) => {
    const snapshot = await captureSnapshot();
    if (!snapshot) return;
    if (!force && snapshot === previousSnapshot) return;
    previousSnapshot = snapshot;
    if (socket.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: "snapshot",
          html: snapshot,
          timestamp: Date.now(),
        })
      );
    }
  };

  const interval = setInterval(async () => {
    await sendSnapshot();
  }, 1000);
  log("Session interval started", pin, nickname);

  page.on("framenavigated", async () => {
    log("Frame navigated, sending snapshot", pin, nickname);
    await sendSnapshot();
  });

  const sessionId = createSessionId();
  const hardTimeout = setTimeout(async () => {
    log("Session hard timeout reached", sessionId, pin, nickname);
    if (socket.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: "status",
          message: "Session timed out after 1 hour and will be closed.",
        })
      );
      socket.close();
    }
    await cleanupSession(sessionId).catch((err) =>
      warn("Hard timeout cleanup failed", sessionId, err)
    );
  }, 3600_000);

  return {
    id: sessionId,
    socket,
    pin,
    nickname,
    context,
    page,
    captureSnapshot,
    sendSnapshot,
    interval,
    hardTimeout,
    latestSnapshot,
    nicknameConfirmed,
  };
};

const cleanupSession = async (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  clearInterval(session.interval);
  clearTimeout(session.hardTimeout);
  try {
    log("Cleaning up session", sessionId);
    if (session.page && typeof session.page.close === "function") {
      await session.page.close();
    }
    if (session.context && typeof session.context.close === "function") {
      await session.context.close();
    }
  } catch (error) {
    warn("Failed to clean up session", sessionId, error);
  }
  sessions.delete(sessionId);
};

const startBrowser = async () => {
  try {
    log("Launching Puppeteer browser...");
    browser = await puppeteer.launch({
      headless: true,
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

app.get("/snapshot", async (req, res) => {
  const sessionId = req.query.session;
  if (sessionId && typeof sessionId === "string") {
    const session = sessions.get(sessionId);
    if (session) {
      const html = await session.captureSnapshot();
      return res.json({ html, timestamp: Date.now(), session: sessionId });
    }
    return res.status(404).json({ error: "Session not found" });
  }

  return res.json({ html: "", timestamp: Date.now(), sessions: sessions.size });
});

wss.on("connection", (socket) => {
  log("WebSocket connection opened");
  if (!browser) {
    socket.send(JSON.stringify({ type: "status", message: "backend unavailable" }));
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
      log("WS message received", data?.type, data?.action ?? "");

      if (data?.type === "init") {
        if (initialized) {
          return;
        }

        const pin = String(data.pin || "").trim();
        const nickname = String(data.nickname || "").trim();

        if (!/^\d{7}$/.test(pin)) {
          warn("Invalid PIN received", pin);
          socket.send(JSON.stringify({ type: "error", message: "pin must be a 7-digit number" }));
          return;
        }

        if (!nickname) {
          warn("Missing nickname received");
          socket.send(JSON.stringify({ type: "error", message: "nickname is required" }));
          return;
        }

        try {
          session = await createSession(socket, pin, nickname);
          sessions.set(session.id, session);
          initialized = true;
          log("Session created", session.id, pin, nickname);
        } catch (error) {
          errorLog("Failed to create session:", error);
          socket.send(
            JSON.stringify({
              type: "error",
              message:
                "Unable to join the game. Make sure your nickname is not taken, profane, or previously entered in this session, and that the game PIN is correct.",
            })
          );
          socket.close();
          return;
        }

        if (session && session.nicknameConfirmed === false) {
          socket.send(
            JSON.stringify({
              type: "warning",
              message:
                "Nickname confirmation was not detected. The backend is still streaming the page, but the join may not have completed successfully.",
            })
          );
        }

        socket.send(JSON.stringify({ type: "status", message: "connected" }));
        socket.send(JSON.stringify({ type: "session", sessionId: session.id, pin, nickname }));
        await session.sendSnapshot(true);
        return;
      }

      if (data?.type === "refresh") {
        log("Refresh request received", session?.id || "no-session");
        if (session) {
          await session.sendSnapshot(true);
        }
        return;
      }

      if (data?.type === "element-action") {
        if (!session || !initialized) {
          socket.send(JSON.stringify({ type: "status", message: "Session not ready for actions" }));
          return;
        }

        try {
          const { action, descriptor, value } = data;
          const result = await performElementAction(session.page, action, descriptor, value);
          if (!result.success) {
            socket.send(JSON.stringify({ type: "status", message: `Action failed: ${result.message}` }));
          }
          await session.sendSnapshot(true);
        } catch (error) {
          errorLog("Element action failed:", error);
          socket.send(JSON.stringify({ type: "status", message: "Action failed on backend" }));
        }
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
  console.log(`Kahoot snapshot backend listening on http://localhost:${PORT}`);
  await startBrowser();
  startSessionCountLog();
});

process.on("SIGINT", async () => {
  console.log("Shutting down Puppeteer...");
  for (const sessionId of Array.from(sessions.keys())) {
    await cleanupSession(sessionId);
  }
  if (browser) await browser.close();
  process.exit(0);
});
