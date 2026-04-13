import "dotenv/config";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import Kahoot from "kahoot.js-latest";
import crypto from "crypto";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const MAX_ACTIVE_SESSIONS = Number(process.env.MAX_ACTIVE_SESSIONS) || 20;
const LOG_INTERVAL_MS = Number(process.env.LOG_INTERVAL_MS) || 10000;
const ENABLE_LOGS = process.env.ENABLE_BACKEND_LOGS === "true" || process.env.NODE_ENV !== "production";

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  log("HTTP", req.method, req.url);
  next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const prettyTime = () => new Date().toISOString();
const log = (...args) => { if (ENABLE_LOGS) console.log("[backend_test]", prettyTime(), ...args); };
const warn = (...args) => { if (ENABLE_LOGS) console.warn("[backend_test]", prettyTime(), ...args); };
const errorLog = (...args) => { if (ENABLE_LOGS) console.error("[backend_test]", prettyTime(), ...args); };

const sessions = new Map();

// Kahoot answer index → shape name (standard order)
// 0=triangle(red), 1=diamond(blue), 2=circle(yellow), 3=square(green)
const INDEX_TO_SHAPE = ["triangle", "diamond", "circle", "square"];
const SHAPE_TO_INDEX = { triangle: 0, diamond: 1, circle: 2, square: 3 };

const generateNickname = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CharlieKirk${suffix}`;
};

const createSession = async (socket, pin) => {
  const nickname = generateNickname();
  const sessionId = crypto.randomUUID();

  const client = new Kahoot();
  let pendingQuestion = null;
  let inAnsweringPhase = false;
  let seenFirstQuestionReady = false;
  let hardTimeout = null;

  const send = (obj) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(obj));
  };

  const cleanup = () => {
    if (hardTimeout) clearTimeout(hardTimeout);
    try { client.leave(); } catch { /* ignore */ }
    sessions.delete(sessionId);
  };

  client.on("Joined", () => {
    log("Joined game", pin, nickname);
  });

  client.on("NameAccept", () => {
    log("Name accepted", nickname);
  });

  client.on("QuestionReady", () => {
    log("QuestionReady", sessionId);
    seenFirstQuestionReady = true;
    inAnsweringPhase = false;
    pendingQuestion = null;
    send({ type: "phase", phase: "waiting" });
  });

  client.on("QuestionStart", (question) => {
    if (!seenFirstQuestionReady) {
      log("QuestionStart ignored — joined mid-question, waiting for next cycle", sessionId);
      return;
    }
    log("QuestionStart", sessionId);
    pendingQuestion = question;
    inAnsweringPhase = true;
    send({ type: "phase", phase: "answering" });
  });

  client.on("QuestionEnd", (result) => {
    if (!inAnsweringPhase) {
      log("QuestionEnd ignored — not in answering phase", sessionId);
      return;
    }
    log("QuestionEnd isCorrect:", result?.isCorrect, sessionId);
    pendingQuestion = null;
    inAnsweringPhase = false;
    const phase = result?.isCorrect ? "correct" : "incorrect";
    send({ type: "phase", phase });
  });

  client.on("QuizEnd", () => {
    log("QuizEnd", sessionId);
    send({ type: "status", message: "Quiz ended." });
  });

  client.on("Disconnect", (reason) => {
    warn("Kahoot client disconnected:", reason, sessionId);
    send({ type: "error", message: "charlie kirk died :( rip" });
    socket.close();
    cleanup();
  });

  await client.join(pin, nickname);

  hardTimeout = setTimeout(() => {
    log("Hard timeout reached", sessionId);
    send({ type: "status", message: "Session timed out after 1 hour." });
    socket.close();
    cleanup();
  }, 3600_000);

  return { id: sessionId, socket, pin, nickname, client, cleanup, getPendingQuestion: () => pendingQuestion };
};

const VALID_SHAPES = new Set(["triangle", "circle", "diamond", "square"]);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", sessions: sessions.size });
});

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

  const question = session.getPendingQuestion();
  if (!question) {
    return res.status(409).json({ error: "No active question to answer." });
  }

  const index = SHAPE_TO_INDEX[normalizedShape] ?? 0;

  try {
    await question.answer(index);
    log("Answered", normalizedShape, "index", index, "for session", sessionId);
    return res.json({ ok: true, shape: normalizedShape, index });
  } catch (err) {
    errorLog("answer failed:", err);
    return res.status(500).json({ error: "Answer failed." });
  }
});

wss.on("connection", (socket) => {
  log("WebSocket connection opened");

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
        } catch (err) {
          errorLog("Failed to create session:", err);
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
      }
    } catch (err) {
      warn("WS message parse error", err);
    }
  });

  socket.on("close", () => {
    log("WebSocket connection closed");
    if (session) {
      session.cleanup();
      session = null;
    }
  });

  socket.on("error", (err) => {
    warn("WebSocket error", err);
    if (session) {
      session.cleanup();
      session = null;
    }
  });
});

setInterval(() => {
  const mem = process.memoryUsage();
  const rss = (mem.rss / 1024 / 1024).toFixed(1);
  const heap = (mem.heapUsed / 1024 / 1024).toFixed(1);
  log(`Active sessions: ${sessions.size} | RAM rss=${rss}MB heap=${heap}MB`);
}, LOG_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`Kirkahoot backend_test listening on http://localhost:${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`Shutting down on ${signal}...`);
  for (const session of sessions.values()) session.cleanup();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
