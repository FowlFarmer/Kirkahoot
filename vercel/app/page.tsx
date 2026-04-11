"use client";

import { useEffect, useRef, useState } from "react";

// ── Answer card ───────────────────────────────────────────────────────────────

type KahootAnswer = "Red Triangle" | "Yellow Circle" | "Blue Diamond" | "Green Square";

const ANSWER_STYLES: Record<KahootAnswer, { border: string; bg: string; text: string; iconColor: string }> = {
  "Red Triangle":    { border: "border-red-400",    bg: "bg-red-50 dark:bg-red-950/60",    text: "text-red-900 dark:text-red-200",    iconColor: "#e53e3e" },
  "Yellow Circle":   { border: "border-yellow-400",  bg: "bg-yellow-50 dark:bg-yellow-950/60", text: "text-yellow-900 dark:text-yellow-200", iconColor: "#d69e2e" },
  "Blue Diamond":    { border: "border-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/60",  text: "text-blue-900 dark:text-blue-200",  iconColor: "#3182ce" },
  "Green Square":    { border: "border-green-400",   bg: "bg-green-50 dark:bg-green-950/60", text: "text-green-900 dark:text-green-200", iconColor: "#38a169" },
};

function parseAnswer(result: string): KahootAnswer | null {
  const lower = result.toLowerCase();
  const candidates: [KahootAnswer, number][] = ([
    "Red Triangle",
    "Yellow Circle",
    "Blue Diamond",
    "Green Square",
  ] as KahootAnswer[]).map((a) => [a, lower.indexOf(a.toLowerCase())]);
  const found = candidates.filter(([, i]) => i !== -1).sort((a, b) => a[1] - b[1]);
  return found.length > 0 ? found[0][0] : null;
}

function ShapeIcon({ answer, color }: { answer: KahootAnswer; color: string }) {
  const size = 28;
  if (answer === "Red Triangle")
    return <svg width={size} height={size} viewBox="0 0 28 28" className="shrink-0"><polygon points="14,3 27,25 1,25" fill={color} /></svg>;
  if (answer === "Yellow Circle")
    return <svg width={size} height={size} viewBox="0 0 28 28" className="shrink-0"><circle cx="14" cy="14" r="12" fill={color} /></svg>;
  if (answer === "Blue Diamond")
    return <svg width={size} height={size} viewBox="0 0 28 28" className="shrink-0"><polygon points="14,1 27,14 14,27 1,14" fill={color} /></svg>;
  // Green Square
  return <svg width={size} height={size} viewBox="0 0 28 28" className="shrink-0"><rect x="2" y="2" width="24" height="24" fill={color} /></svg>;
}

function AnswerCard({ inferring, result }: { inferring: boolean; result: string | null }) {
  if (inferring) {
    return (
      <div className="rounded-3xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Gemma answer</p>
        <p>Analyzing…</p>
      </div>
    );
  }
  if (!result) return null;

  const answer = parseAnswer(result);
  const styles = answer ? ANSWER_STYLES[answer] : null;

  return (
    <div className={`rounded-3xl border p-4 text-sm font-medium ${
      styles
        ? `${styles.border} ${styles.bg} ${styles.text}`
        : "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    }`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Gemma answer</p>
      <div className="flex items-start gap-3">
        {answer && <ShapeIcon answer={answer} color={styles!.iconColor} />}
        <p className="leading-relaxed">{result}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const streamIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streamHtml, setStreamHtml] = useState<string>("");
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [refreshAgo, setRefreshAgo] = useState("never");
  const [statusMessage, setStatusMessage] = useState("Enter a 7-digit PIN and nickname to start.");
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const [answeringPhase, setAnsweringPhase] = useState(false);
  const prevAnsweringPhaseRef = useRef(false);
  const answerSentRef = useRef(false);
  const [inferenceResult, setInferenceResult] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
        }
      } catch (error) {
        setCameraError(
          error instanceof Error ? error.message : "Unable to access the camera."
        );
      }
    };

    startCamera();

    return () => {
      if (videoRef.current?.srcObject instanceof MediaStream) {
        const tracks: MediaStreamTrack[] = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const morphNode = (from: Node, to: Node) => {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
      if (typeof (from as any).replaceWith === "function") {
        (from as any).replaceWith(to.cloneNode(true));
      } else if (from.parentNode) {
        from.parentNode.replaceChild(to.cloneNode(true), from);
      }
      return;
    }

    if (from.nodeType === Node.TEXT_NODE || from.nodeType === Node.COMMENT_NODE) {
      if (from.nodeValue !== to.nodeValue) {
        from.nodeValue = to.nodeValue;
      }
      return;
    }

    if (from instanceof Element && to instanceof Element) {
      const fromAttributes = Array.from(from.attributes).map((attr) => attr.name);
      const toAttributes = Array.from(to.attributes).map((attr) => attr.name);

      for (const name of toAttributes) {
        const value = to.getAttribute(name);
        if (value !== from.getAttribute(name)) {
          from.setAttribute(name, value ?? "");
        }
      }
      for (const name of fromAttributes) {
        if (!to.hasAttribute(name)) {
          from.removeAttribute(name);
        }
      }
    }

    const fromChildren = Array.from(from.childNodes);
    const toChildren = Array.from(to.childNodes);
    const length = Math.max(fromChildren.length, toChildren.length);

    for (let i = 0; i < length; i++) {
      const existingChild = fromChildren[i];
      const nextChild = toChildren[i];

      if (!existingChild && nextChild) {
        from.appendChild(nextChild.cloneNode(true));
        continue;
      }

      if (existingChild && !nextChild) {
        existingChild.remove();
        continue;
      }

      if (existingChild && nextChild) {
        morphNode(existingChild, nextChild);
      }
    }
  };

  const updateIframeDocument = (iframe: HTMLIFrameElement, html: string) => {
    const parser = new DOMParser();
    const newDoc = parser.parseFromString(html, "text/html");
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !newDoc.documentElement) return;

    if (!doc.body || !doc.head) {
      doc.open();
      doc.write(html);
      doc.close();
      return;
    }

    if (newDoc.title) {
      doc.title = newDoc.title;
    }

    if (doc.head && newDoc.head) {
      doc.head.innerHTML = newDoc.head.innerHTML;
    }

    if (doc.body && newDoc.body) {
      morphNode(doc.body, newDoc.body);
    }
  };

  const detectAnswerPhaseFromIframe = (iframe: HTMLIFrameElement | null) => {
    if (!iframe) return false;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return false;

    const labels = ["triangle", "circle", "square", "diamond"];
    const elements = Array.from(doc.querySelectorAll("button, span, div, p, a, li"));

    return elements.some((element) => {
      const text = element.textContent?.trim().toLowerCase();
      return text ? labels.some((label) => text.includes(label)) : false;
    });
  };

  useEffect(() => {
    const iframe = streamIframeRef.current;
    if (!iframe || !streamHtml) {
      setAnsweringPhase(false);
      return;
    }

    try {
      updateIframeDocument(iframe, streamHtml);
      const nowAnswering = detectAnswerPhaseFromIframe(iframe);
      if (nowAnswering && !prevAnsweringPhaseRef.current) {
        answerSentRef.current = false;
        captureAndInfer();
      }
      prevAnsweringPhaseRef.current = nowAnswering;
      setAnsweringPhase(nowAnswering);
    } catch (error) {
      console.warn("Unable to update iframe content", error);
    }
  }, [streamHtml]);

  // Listen for clicks inside the sandboxed iframe and forward matching shapes to the backend
  useEffect(() => {
    const iframe = streamIframeRef.current;
    if (!iframe) return;

    const SHAPE_LABELS = ["triangle", "circle", "square", "diamond"];

    const handleIframeClick = (event: MouseEvent) => {
      if (!answeringPhase) return;
      const target = event.target as Element | null;
      if (!target) return;

      // Walk up from the click target to find a button with a recognizable shape label
      let el: Element | null = target;
      while (el) {
        const text = el.textContent?.toLowerCase() ?? "";
        const shape = SHAPE_LABELS.find((s) => text.includes(s));
        if (shape && (el.tagName === "BUTTON" || el.getAttribute("role") === "button")) {
          sendClickAnswer(shape);
          break;
        }
        el = el.parentElement;
      }
    };

    const attachListener = () => {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.addEventListener("click", handleIframeClick, true);
      }
    };

    // Attach now and re-attach whenever the iframe loads
    attachListener();
    iframe.addEventListener("load", attachListener);

    return () => {
      iframe.removeEventListener("load", attachListener);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) doc.removeEventListener("click", handleIframeClick, true);
    };
  }, [answeringPhase, sessionId]);

  useEffect(() => {
    if (lastRefresh === null) {
      setRefreshAgo("never");
      return;
    }

    const updateAgo = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - lastRefresh) / 1000));
      setRefreshAgo(`${seconds}s ago`);
    };

    updateAgo();
    const interval = window.setInterval(updateAgo, 1000);
    return () => window.clearInterval(interval);
  }, [lastRefresh]);

  const sendClickAnswer = (shape: string) => {
    const sid = sessionId;
    if (!sid) return;
    if (answerSentRef.current) return;
    answerSentRef.current = true;
    fetch("http://localhost:3001/click-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, shape }),
    }).catch(() => {});
  };

  const captureAndInfer = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress to JPEG, reducing quality until decoded size <= 80 KB
    const MAX_BYTES = 80 * 1024;
    let quality = 0.85;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    let base64 = dataUrl.split(",")[1];
    while (Math.floor((base64.length * 3) / 4) > MAX_BYTES && quality > 0.1) {
      quality = Math.max(0.1, quality - 0.1);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      base64 = dataUrl.split(",")[1];
    }

    if (Math.floor((base64.length * 3) / 4) > MAX_BYTES) {
      setInferenceResult("Image too large to send even at minimum quality.");
      return;
    }

    setInferring(true);
    setInferenceResult(null);

    const callGemini = async (imageBase64: string): Promise<string> => {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const json = await response.json();
      return json.text ?? json.error ?? "No response.";
    };

    try {
      let text = await callGemini(base64);
      let answer = parseAnswer(text);

      // Dev-only fallback: retry with the test image if no valid answer detected
      if (!answer && process.env.NODE_ENV === "development") {
        const testResp = await fetch("/test_endpoint1.jpg");
        const testBuffer = await testResp.arrayBuffer();
        const testBase64 = btoa(String.fromCharCode(...new Uint8Array(testBuffer)));
        text = await callGemini(testBase64);
        answer = parseAnswer(text);
        if (answer) text = `[dev fallback] ${text}`;
      }

      setInferenceResult(text);

      // Auto-click the matching answer button on the backend
      if (answer && autoSubmit) {
        const shapeWord = answer.split(" ")[1].toLowerCase(); // e.g. "diamond"
        sendClickAnswer(shapeWord);
      }
    } catch {
      setInferenceResult("Failed to reach inference API.");
    } finally {
      setInferring(false);
    }
  };

  const validatePin = (value: string) => /^\d{7}$/.test(value);

  const handleConnect = () => {
    if (connected || connecting) return;
    if (!validatePin(pin)) {
      setStatusMessage("PIN must be exactly 7 digits.");
      return;
    }
    if (!nickname.trim()) {
      setStatusMessage("Nickname is required.");
      return;
    }

    setConnecting(true);
    setStreamStatus("Connecting");
    setStatusMessage("Attempting to connect to the Kahoot game...");
    setInferenceResult(null);
    setInferring(false);
    prevAnsweringPhaseRef.current = false;
    answerSentRef.current = false;

    const socket = new WebSocket("ws://localhost:3001/ws");
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStreamStatus("Connected");
      socket.send(JSON.stringify({ type: "init", pin, nickname }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "snapshot" && typeof data.html === "string") {
        setStreamHtml(data.html);
        setLastRefresh(Date.now());
      }
      if (data.type === "status") {
        setStreamStatus(data.message || "Connected");
      }
      if (data.type === "session") {
        setSessionId(data.sessionId);
        setConnected(true);
        setConnecting(false);
        setStatusMessage(`Streaming pin ${data.pin} as ${data.nickname}.`);
      }
      if (data.type === "warning") {
        setStreamStatus("Warning");
        const message =
          data.message ||
          "Nickname confirmation was not detected; preview is streaming but the join may not be complete.";
        setStatusMessage(message);
        setErrorMessage(message);
        setShowErrorPopup(true);
      }
      if (data.type === "error") {
        setConnecting(false);
        setStreamStatus("Error");
        const message =
          data.message ||
          "Unable to join the game. Make sure your nickname is not taken, profane, or previously entered in this session, and the PIN is correct.";
        setStatusMessage(message);
        setErrorMessage(message);
        setShowErrorPopup(true);
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      setStreamStatus("Disconnected");
      setConnecting(false);
      if (!connected) {
        setStatusMessage("Connection failed. Please try again.");
      } else {
        setStatusMessage("Disconnected from backend.");
      }
      setConnected(false);
      setSessionId(null);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    });

    socket.addEventListener("error", () => {
      setStreamStatus("Error");
      setConnecting(false);
      setStatusMessage("Unable to connect to backend.");
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    });
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
    setSessionId(null);
    setStreamHtml("");
    setAnsweringPhase(false);
    prevAnsweringPhaseRef.current = false;
    answerSentRef.current = false;
    setInferenceResult(null);
    setInferring(false);
    setStatusMessage("Disconnected.");
    setStreamStatus("Disconnected");
  };

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-12 text-black dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">
        <div className="w-full rounded-3xl border border-zinc-200 bg-white/90 p-6 shadow-xl shadow-zinc-200/40 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <div className="flex flex-col gap-1">
              <span>Kahoot Static Stream</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Last refresh: {lastRefresh === null ? "never" : refreshAgo}</span>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              {streamStatus}
            </span>
          </div>

          {!connected ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                Game PIN
                <input
                  inputMode="numeric"
                  maxLength={7}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 7))}
                  className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition hover:border-zinc-400 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  placeholder="e.g. 4124500"
                />
              </label>
              <label className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                Nickname
                <input
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition hover:border-zinc-400 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  placeholder="Your nickname"
                />
              </label>
              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || connected}
                  className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connecting ? "Connecting..." : "Start Kahoot Stream"}
                </button>
                <p className="self-center text-sm text-zinc-600 dark:text-zinc-400">
                  Enter a valid 7-digit PIN and nickname, then connect.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <p className="font-medium">Connected session</p>
                <p className="mt-2 text-sm">Session ID: {sessionId}</p>
                <p className="mt-2 text-sm">PIN: {pin}</p>
                <p className="mt-2 text-sm">Nickname: {nickname}</p>
                <p className={`mt-2 text-sm ${answeringPhase ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
                  {answeringPhase ? "Answering phase" : "Not in answering phase"}
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-3">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Gemini auto-submit</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSubmit}
                    onClick={() => setAutoSubmit((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                      autoSubmit ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        autoSubmit ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </label>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="mt-3 inline-flex rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  Disconnect
                </button>
              </div>
              {(inferring || inferenceResult) && (
                <AnswerCard inferring={inferring} result={inferenceResult} />
              )}
              <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-inner dark:border-zinc-800">
                {streamHtml ? (
                  <iframe
                    ref={streamIframeRef}
                    title="Kahoot static stream"
                    className="h-[520px] w-full min-w-[320px] bg-white opacity-95"
                    style={{ filter: "grayscale(0.08)" }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="flex h-[520px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                    Waiting for the static Kahoot snapshot...
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{statusMessage}</p>
        </div>

        {showErrorPopup && errorMessage ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-3xl border border-red-300 bg-white p-6 shadow-2xl shadow-red-200/50 dark:border-red-700 dark:bg-zinc-950 dark:text-white">
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">Connection Error</h2>
              <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setShowErrorPopup(false)}
                className="mt-6 inline-flex rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <div className="w-full rounded-3xl border border-zinc-200 bg-white/90 p-4 shadow-xl shadow-zinc-200/40 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <span>Camera Preview</span>
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">
              {cameraActive ? "Active" : "Initializing"}
            </span>
          </div>
          <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black dark:border-zinc-800">
            <video
              ref={videoRef}
              className="h-[320px] w-full object-cover"
              playsInline
              muted
            />
          </div>
          {cameraError ? (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
              {cameraError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
