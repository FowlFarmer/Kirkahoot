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

function AnswerCard({ inferring, result, gamePhase }: { inferring: boolean; result: string | null; gamePhase: string }) {
  const isGray = gamePhase === "waiting" && !inferring;

  if (isGray) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Charlie Kirk&apos;s Response</p>
        <p className="text-zinc-400 dark:text-zinc-500">
          {result ? result : "Charlie Kirk is waiting for the question…"}
        </p>
      </div>
    );
  }
  if (inferring) {
    return (
      <div className="rounded-3xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Charlie Kirk&apos;s Response</p>
        <p>Charlie Kirk is thinking…</p>
      </div>
    );
  }

  if (gamePhase === "correct") {
    return (
      <div className="rounded-3xl border border-emerald-400 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Charlie Kirk&apos;s Response</p>
        <p className="text-lg font-bold">✓ Correct!</p>
        {result && <p className="mt-1 leading-relaxed opacity-80">{result}</p>}
      </div>
    );
  }

  if (gamePhase === "incorrect") {
    return (
      <div className="rounded-3xl border border-red-400 bg-red-50 p-4 text-sm font-medium text-red-800 dark:border-red-600 dark:bg-red-950/40 dark:text-red-200">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Charlie Kirk&apos;s Response</p>
        <p className="text-lg font-bold">✗ Wrong!</p>
        {result && <p className="mt-1 leading-relaxed opacity-80">{result}</p>}
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">Charlie Kirk&apos;s Response</p>
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
  const [connectedNickname, setConnectedNickname] = useState<string | null>(null);
  const kahootIframeRef = useRef<HTMLIFrameElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Enter a 7-digit PIN to start.");
  const [streamStatus, setStreamStatus] = useState("Disconnected");
  const [gamePhase, setGamePhase] = useState<"waiting"|"answering"|"correct"|"incorrect">("waiting");
  const prevPhaseRef = useRef<string>("waiting");
  const answerSentRef = useRef(false);
  const [inferenceResult, setInferenceResult] = useState<string | null>(null);
  const [inferring, setInferring] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  useEffect(() => {
    if (!connected) return;

    let stopped = false;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
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
      stopped = true;
      if (videoRef.current?.srcObject instanceof MediaStream) {
        const tracks: MediaStreamTrack[] = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
      setCameraActive(false);
      setCameraError(null);
    };
  }, [connected]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const sendClickAnswer = (shape: string) => {
    const sid = sessionIdRef.current;
    if (!sid) { console.warn("[kirk] sendClickAnswer: no sessionId"); return; }
    if (answerSentRef.current) { console.warn("[kirk] sendClickAnswer: already sent this phase, skipping", shape); return; }
    answerSentRef.current = true;
    console.log("[kirk] sendClickAnswer:", shape);
    fetch("http://localhost:3001/click-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, shape }),
    }).catch((e) => console.error("[kirk] click-answer fetch failed", e));
  };

  const captureAndInfer = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = document.createElement("canvas");
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    // Center-crop by zoom factor so the output resolution stays constant
    const srcW = vw / cameraZoom;
    const srcH = vh / cameraZoom;
    const srcX = (vw - srcW) / 2;
    const srcY = (vh - srcH) / 2;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

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

    const callCharlie = async (imageBase64: string): Promise<string> => {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });
      const json = await response.json();
      return json.text ?? json.error ?? "No response.";
    };

    try {
      let text = await callCharlie(base64);
      let answer = parseAnswer(text);

      // Dev-only fallback: retry with the test image if no valid answer detected
      if (!answer && process.env.NODE_ENV === "development") {
        const testResp = await fetch("/test_endpoint1.jpg");
        const testBuffer = await testResp.arrayBuffer();
        const testBase64 = btoa(String.fromCharCode(...new Uint8Array(testBuffer)));
        text = await callCharlie(testBase64);
        answer = parseAnswer(text);
        if (answer) text = `[dev fallback] ${text}`;
      }

      setInferenceResult(text);

      // Auto-click the matching answer button on the backend
      if (answer) {
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

    setConnecting(true);
    setStreamStatus("Connecting");
    setStatusMessage("Attempting to connect to the Kahoot game...");
    setInferenceResult(null);
    setInferring(false);
    prevPhaseRef.current = "waiting";
    answerSentRef.current = false;

    const socket = new WebSocket("ws://localhost:3001/ws");
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStreamStatus("Connected");
      socket.send(JSON.stringify({ type: "init", pin }));
    });

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "phase") {
        const nowPhase: string = data.phase ?? "waiting";
        if (nowPhase === "answering" && prevPhaseRef.current !== "answering") {
          answerSentRef.current = false;
          captureAndInfer();
        }
        prevPhaseRef.current = nowPhase;
        setGamePhase(nowPhase as "waiting"|"answering"|"correct"|"incorrect");
      }
      if (data.type === "status") {
        setStreamStatus(data.message || "Connected");
      }
      if (data.type === "session") {
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
        setConnectedNickname(data.nickname ?? null);
        setConnected(true);
        setConnecting(false);
        setStatusMessage(`Charlie Kirk joined as ${data.nickname}.`);
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
        const message = data.message || "charlie kirk died :( rip";
        setStatusMessage(message);
        setErrorMessage(message);
        setShowErrorPopup(true);
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      setStreamStatus("Disconnected");
      setConnecting(false);
      setConnected((wasConnected) => {
        if (wasConnected) {
          setStatusMessage("Disconnected from backend.");
        } else {
          setStatusMessage("Connection failed. Please try again.");
        }
        return false;
      });
      setSessionId(null);
      sessionIdRef.current = null;
      setConnectedNickname(null);
      setGamePhase("waiting");
      prevPhaseRef.current = "waiting";
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
    sessionIdRef.current = null;
    setConnectedNickname(null);
    setGamePhase("waiting");
    prevPhaseRef.current = "waiting";
    answerSentRef.current = false;
    setInferenceResult(null);
    setInferring(false);
    setStatusMessage("Disconnected.");
    setStreamStatus("Disconnected");
  };

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-12 text-black dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">

        {/* Charlie Kirk's Den */}
        <div className="w-full rounded-3xl border border-zinc-200 bg-white/90 p-6 shadow-xl shadow-zinc-200/40 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/20">
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <span>lowkirkhootenuinsplainin&apos;</span>
            {connected && (
              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                {streamStatus}
              </span>
            )}
          </div>

          {!connected ? (
            <div className="space-y-5">
              {/* Kirk portrait */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kirkpie.png"
                alt="Charlie Kirk"
                className="mx-auto h-40 w-40 rounded-full object-cover shadow-lg"
              />
              <p className="text-center text-xs leading-relaxed text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto">
                Enter your game PIN and Charlie Kirk will crash this bih type shi, when a question drops, dis YN's
                be seeing thru yo camera n' picks the answer, n
                crodie clicks it on his own Kahoot session fam, all before ya&apos;ve even read the question.
                You just watch the carnage.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <input
                  inputMode="numeric"
                  maxLength={7}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 7))}
                  className="w-48 rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition hover:border-zinc-400 focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  placeholder="Game PIN (7 digits)"
                />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || connected}
                  className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connecting ? "Connecting..." : "Oh LAWD he comin'!"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <p className="font-medium">Connected session</p>
                <p className="mt-2 text-sm">PIN: {pin}</p>
                <p className="mt-2 text-sm">Nickname: {connectedNickname ?? "—"}</p>
                <p className={`mt-2 text-sm ${
                  gamePhase === "answering" ? "text-emerald-700 dark:text-emerald-300" :
                  gamePhase === "correct" ? "text-emerald-700 dark:text-emerald-300" :
                  gamePhase === "incorrect" ? "text-red-700 dark:text-red-300" :
                  "text-zinc-500 dark:text-zinc-400"
                }`}>
                  {gamePhase === "answering" ? "Answering phase" :
                   gamePhase === "correct" ? "Correct!" :
                   gamePhase === "incorrect" ? "Wrong!" :
                   "Waiting"}
                </p>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="mt-3 inline-flex rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  Disconnect
                </button>
              </div>
              <AnswerCard inferring={inferring} result={inferenceResult} gamePhase={gamePhase} />
            </div>
          )}
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

        {/* Camera + Kahoot — only shown after connection */}
        {connected && (
          <>
            {/* Kahoot iframe */}
            <div className="w-full rounded-3xl border border-zinc-200 bg-white/90 p-4 shadow-xl shadow-zinc-200/40 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/20">
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <span>Kahoot</span>
              </div>
              <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-inner dark:border-zinc-800">
                <iframe
                  ref={kahootIframeRef}
                  src="https://kahoot.it"
                  title="Kahoot"
                  className="h-[520px] w-full min-w-[320px] bg-white"
                />
              </div>
            </div>

            {/* Charlie Kirk's eyeballz */}
            <div className="w-full rounded-3xl border border-zinc-200 bg-white/90 p-4 shadow-xl shadow-zinc-200/40 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-black/20">
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <span>Charlie Kirk&apos;s eyeballz</span>
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">
                  {cameraActive ? "Active" : "Initializing"}
                </span>
              </div>
              <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black dark:border-zinc-800">
                <video
                  ref={videoRef}
                  className="h-[320px] w-full object-cover transition-transform duration-150"
                  style={{ transform: `scale(${cameraZoom})` }}
                  playsInline
                  muted
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-zinc-500 dark:text-zinc-400 w-16 shrink-0">Zoom {cameraZoom.toFixed(1)}×</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={cameraZoom}
                  onChange={(e) => setCameraZoom(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              {cameraError ? (
                <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
                  {cameraError}
                </p>
              ) : null}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
