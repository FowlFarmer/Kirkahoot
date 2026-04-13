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
      <div className="rounded-3xl border-4 border-dashed border-yellow-400 bg-yellow-50 p-4 text-sm dark:bg-yellow-950/30 anim-jelly">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-yellow-600">🧠 KIRK BRAIN STATUS 🧠</p>
        <p className="text-yellow-700 dark:text-yellow-300 font-bold">
          {result ? result : "zzzz... charlie is sleeping... waiting 4 questoin... 😴💤"}
        </p>
      </div>
    );
  }
  if (inferring) {
    return (
      <div className="rounded-3xl border-4 border-purple-500 bg-purple-50 p-4 text-sm dark:bg-purple-950/30 anim-pulse-slow">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-purple-600">🔥 KIRK NEURONS FIRING 🔥</p>
        <p className="text-purple-700 dark:text-purple-300 font-bold text-lg">big thinkign... 🤔🤔🤔</p>
      </div>
    );
  }

  if (gamePhase === "correct") {
    return (
      <div className="anim-jelly rounded-3xl border-4 border-green-400 bg-green-50 p-4 text-sm font-bold text-green-800 dark:bg-green-950/40 dark:text-green-200">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-green-600">🏆 KIRK SMASHED IT 🏆</p>
        <p className="text-2xl font-black">✅ W!!! HE ATE!!! 🐊</p>
        {result && <p className="mt-1 leading-relaxed opacity-80">{result}</p>}
      </div>
    );
  }

  if (gamePhase === "incorrect") {
    return (
      <div className="anim-shake rounded-3xl border-4 border-red-400 bg-red-50 p-4 text-sm font-bold text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-red-600">💀 KIRK FUMBLED 💀</p>
        <p className="text-2xl font-black">❌ L BOZO ratio&apos;d 💀💀💀</p>
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
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-orange-500">🎯 KIRK PICKED: 🎯</p>
      <div className="flex items-start gap-3">
        {answer && <ShapeIcon answer={answer} color={styles!.iconColor} />}
        <p className="leading-relaxed">{result}</p>
      </div>
    </div>
  );
}

// ── Wonky title ───────────────────────────────────────────────────────────────

const TITLE_PARTS = [
  { text: "low",             origin: "lowkey",         color: "#ff6600", rot: "-4deg"  },
  { text: "kirk",            origin: "charlie kirk",   color: "#cc0000", rot: "3deg"   },
  { text: "hoot",            origin: "in kahoot",         color: "#0044cc", rot: "-2deg"  },
  { text: "enuinsplainin'",  origin: "be mansplainin'",   color: "#cc00cc", rot: "2deg"   },
];

// phase 0 = squished (resting), 1 = spread, 2 = squish A (low+hoot), 3 = squish B (kirk+enuins), 4 = all normal spread
function WonkyTitle() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let alive = true;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const run = async () => {
      while (alive) {
        await delay(5000);
        if (!alive) break;
        setPhase(1); await delay(550);
        setPhase(2); await delay(520);
        setPhase(3); await delay(520);
        setPhase(4); await delay(420);
        setPhase(0); await delay(700);
      }
    };
    run();
    return () => { alive = false; };
  }, []);

  const partStyle = (i: number): React.CSSProperties => {
    const p = TITLE_PARTS[i];
    const isA = i === 0 || i === 2;
    const isB = i === 1 || i === 3;
    const spread = phase >= 1;
    const squishA = phase === 2 && isA;
    const squishB = phase === 3 && isB;
    const squishing = squishA || squishB;
    return {
      display: "inline-block",
      whiteSpace: spread ? "nowrap" : "normal",
      color: spread ? p.color : "#cc0000",
      transform: squishing
        ? `scaleY(0.12) rotate(0deg)`
        : spread
        ? `rotate(${p.rot}) scaleY(1)`
        : "rotate(0deg) scaleY(1)",
      transformOrigin: "bottom center",
      transition: "all 0.38s cubic-bezier(.36,.07,.19,.97)",
      marginRight: spread ? "6px" : "0px",
      verticalAlign: "bottom",
      textShadow: spread
        ? `2px 2px 0 #000`
        : "3px 3px 0 #ffff00, 6px 6px 0 #0000cc",
      position: "relative",
    };
  };

  return (
    <h1 className="anim-bounce-title text-center text-3xl sm:text-4xl font-black tracking-tight select-none w-full"
      style={{lineHeight: 1.3, minHeight: '5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center'}}>
      {TITLE_PARTS.map((p, i) => (
        <span key={i} style={partStyle(i)}>
          {phase >= 1 ? p.origin : p.text}
        </span>
      ))}
    </h1>
  );
}

// ── Kirk mood image ───────────────────────────────────────────────────────────

const PHASE_IMAGES: Record<string, string[]> = {
  waiting:   ["/kirkpie.jpg"],
  answering: ["/kirkhappy1.jpg", "/kirkhappy2.jpg", "/kirkhappy3.jpg"],
  correct:   ["/kirkhappy1.jpg", "/kirkhappy2.jpg", "/kirkhappy3.jpg"],
  incorrect: ["/kirksad1.jpg", "/kirksad2.jpg"],
};

function KirkImage({ phase, inferring }: { phase: string; inferring: boolean }) {
  const effectivePhase = inferring ? "answering" : phase;
  const pool = PHASE_IMAGES[effectivePhase] ?? PHASE_IMAGES.waiting;
  const src = pool[Math.floor(Math.random() * pool.length)];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src + effectivePhase}
      src={src}
      alt="Charlie Kirk"
      className="anim-kirk mx-auto object-cover shadow-lg"
      style={{ borderRadius: "50%", width: "clamp(80px,20vw,140px)", height: "clamp(80px,20vw,140px)" }}
    />
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
  const [facingMode, setFacingMode] = useState<"user"|"environment">("environment");
  const [lastCaptureUrl, setLastCaptureUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const savedScrollRef = useRef(0);

  // When `connected` becomes true the iframe + camera mount — lock scroll position
  useEffect(() => {
    if (connected) {
      const saved = savedScrollRef.current;
      // Defer so the DOM has painted before we restore
      const raf = requestAnimationFrame(() => window.scrollTo({ top: saved, behavior: "instant" }));
      return () => cancelAnimationFrame(raf);
    }
  }, [connected]);

  useEffect(() => {
    if (!connected) return;

    let stopped = false;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
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
  }, [connected, facingMode]);

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
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/click-answer`, {
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
    // Center-crop by zoom factor
    const srcW = vw / cameraZoom;
    const srcH = vh / cameraZoom;
    const srcX = (vw - srcW) / 2;
    const srcY = (vh - srcH) / 2;
    // Force 4:3 output canvas
    const outH = Math.round(srcW * (3 / 4));
    canvas.width = Math.round(srcW);
    canvas.height = outH;
    const cropSrcH = Math.min(srcH, srcW * (3 / 4));
    const cropSrcY = srcY + (srcH - cropSrcH) / 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, srcX, cropSrcY, srcW, cropSrcH, 0, 0, canvas.width, canvas.height);

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

    setLastCaptureUrl(dataUrl);
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
      const text = await callCharlie(base64);
      const answer = parseAnswer(text);

      setInferenceResult(text);

      // Auto-click the matching answer button on the backend
      const shapeWord = answer ? answer.split(" ")[1].toLowerCase() : "triangle";
      sendClickAnswer(shapeWord);
    } catch {
      setInferenceResult("Failed to reach inference API.");
    } finally {
      setInferring(false);
    }
  };

  const validatePin = (value: string) => /^\d{1,9}$/.test(value);

  const handleConnect = () => {
    if (connected || connecting) return;
    if (!validatePin(pin)) {
      setStatusMessage("PIN must be 1-9 digits.");
      return;
    }

    setConnecting(true);
    savedScrollRef.current = window.scrollY;
    setStreamStatus("Connecting");
    setStatusMessage("Attempting to connect to the Kahoot game...");
    setInferenceResult(null);
    setInferring(false);
    prevPhaseRef.current = "waiting";
    answerSentRef.current = false;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL!;
    const wsUrl = backendUrl.replace(/^http/, "ws") + "/ws";
    const socket = new WebSocket(wsUrl);
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
          setTimeout(() => captureAndInfer(), 700);
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
    <div className="min-h-screen px-4 py-12 text-black" style={{background: 'repeating-linear-gradient(45deg, #ff006620 0px, #ff006620 2px, #fff700 2px, #fff700 12px, #00ff8820 12px, #00ff8820 14px, #ffffff 14px, #ffffff 24px)'}}>
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8">

        {/* Kirk header */}
        <WonkyTitle />
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a href="https://ko-fi.com/A0A41XMQCC" target="_blank" rel="noopener noreferrer"
            className="anim-jelly inline-block"
            style={{filter:'drop-shadow(4px 4px 0 #cc0000) drop-shadow(-2px -2px 0 #ffff00)'}}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img height="36" style={{border:'0px', height:'36px'}} src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy Me a Deuterium-Tritium Fusion Reactor" />
          </a>
          <a href="https://tzhu.dev" target="_blank" rel="noopener noreferrer"
            className="anim-wobble inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black text-white transition-transform"
            style={{background:'linear-gradient(135deg,#0044cc,#cc00cc,#ff6600)', border:'3px solid #000', textShadow:'1px 1px 0 #000', boxShadow:'4px 4px 0 #ffff00, 6px 6px 0 #000'}}>
            🌐 tzhu.dev
          </a>
        </div>
        <p className="text-center text-xs font-bold uppercase tracking-widest rounded-xl px-3 py-2" style={{color:'#0000cc', background:'rgba(255,255,255,0.85)'}}>⚠️ WARNING: contains based AI 🦅 conservative Kahoot domination ⚠️</p>

        {/* Charlie Kirk's Den */}
        <div className="anim-flash-border w-full rounded-3xl border-4 border-red-500 bg-white/95 p-6 shadow-2xl">
          <div className="mb-4 relative flex flex-wrap items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-black uppercase" style={{background:'linear-gradient(90deg,#cc0000,#ff6600,#ffcc00)', color:'white', textShadow:'1px 1px 0 #000'}}>
            <span className="text-center">🦅 lowkirkhootenuinsplainin&apos; 🦅</span>
            {connected && (
              <span className="sm:absolute sm:right-4 rounded-full px-2 py-1 text-xs font-black" style={{background:'#00ff88', color:'#000', border:'2px solid #000'}}>
                🟢 {streamStatus}
              </span>
            )}
          </div>

          <div className={connected ? "hidden" : "space-y-5"}>
              <KirkImage phase="waiting" inferring={false} />
              <p className="text-center text-sm leading-relaxed font-bold max-w-sm mx-auto" style={{color:'#cc0000'}}>
                Enter your game PIN and Charlie Kirk will crash this bih type shi, when a question drops, dis YN's
                be seeing thru yo camera n' picks the answer, n
                crodie clicks it on his own Kahoot session fam, all before ya&apos;ve even read the question.
                You just watch the carnage.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <input
                  inputMode="numeric"
                  maxLength={9}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 9))}
                  className="w-48 rounded-2xl px-4 py-3 text-sm outline-none font-bold" style={{border:'3px solid #cc0000', background:'#fffde7', color:'#000', fontSize:'16px'}}
                  placeholder="Game PIN"
                />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting || connected}
                  className="anim-rainbow-btn rounded-full px-5 py-3 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50" style={{background:'linear-gradient(90deg,#cc0000,#ff6600,#ffcc00,#00cc44,#0044cc,#cc00cc)', backgroundSize:'300% 100%', border:'3px solid #000', textShadow:'1px 1px 0 #000'}}
                >
                  {connecting ? "Connecting..." : "Oh LAWD he comin'!"}
                </button>
              </div>
            </div>

            <div className={connected ? "space-y-4" : "hidden"}>
              <div className="rounded-3xl border-4 border-dashed border-orange-500 p-4 text-sm font-bold" style={{background:'#fffde7'}}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-base" style={{color:'#cc0000'}}>🎮 KIRK IS IN THE LOBBY 🎮</p>
                    <p className="mt-2">📌 PIN: <span style={{color:'#0044cc'}}>{pin}</span></p>
                    <p className="mt-1">🤠 nickname: <span style={{color:'#cc0000'}}>{connectedNickname ?? "—"}</span></p>
                    <p className={`mt-2 text-base font-black`} style={{color:
                      gamePhase === "answering" ? "#00aa44" :
                      gamePhase === "correct" ? "#00aa44" :
                      gamePhase === "incorrect" ? "#cc0000" :
                      "#888"
                    }}>
                      {gamePhase === "answering" ? "🔥 ANSWERING RN 🔥" :
                       gamePhase === "correct" ? "✅ W SECURED ✅" :
                       gamePhase === "incorrect" ? "💀 L TAKEN 💀" :
                       "😴 standing by..."}
                    </p>
                    <div className="mt-3 flex justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="inline-flex rounded-full px-4 py-2 text-sm font-black transition" style={{background:'#cc0000', color:'white', border:'3px solid #000'}}
                    >
                      💀 KILL KIRK 💀
                    </button>
                  </div>
                  </div>
                  <div className="w-full flex justify-center sm:w-auto sm:flex-none">
                    <KirkImage phase={gamePhase} inferring={inferring} />
                  </div>
                </div>
              </div>
              <AnswerCard inferring={inferring} result={inferenceResult} gamePhase={gamePhase} />
            </div>
        </div>

        {showErrorPopup && errorMessage ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="anim-pop-in w-full max-w-md rounded-3xl border border-red-300 bg-white p-6 shadow-2xl shadow-red-200/50 dark:border-red-700 dark:bg-zinc-950 dark:text-white">
              <h2 className="text-lg font-black" style={{color:'#cc0000'}}>💀 charlie kirk died :( rip 💀</h2>
              <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setShowErrorPopup(false)}
                className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-black text-white transition" style={{background:'#cc0000', border:'3px solid #000'}}
              >
                pour one out 🕯️
              </button>
            </div>
          </div>
        ) : null}

        {/* Camera + Kahoot — always in DOM, hidden until connected */}
        <div className={connected ? "contents" : "hidden"}>
            {/* Kahoot iframe */}
            <div className="w-full rounded-3xl border-4 border-blue-600 bg-white/95 p-4" style={{boxShadow:'8px 8px 0 #ffff00'}}>
              <div className="mb-4 flex items-center justify-center rounded-2xl px-4 py-3 text-xs sm:text-sm font-black uppercase" style={{background:'linear-gradient(90deg,#0044cc,#0099ff)', color:'white', textShadow:'1px 1px 0 #000'}}>
                <span>🎮 kahoot battleground 🎮</span>
              </div>
              <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black shadow-inner dark:border-zinc-800">
                <iframe
                  ref={kahootIframeRef}
                  src="https://kahoot.it"
                  title="Kahoot"
                  tabIndex={-1}
                  className="h-[520px] w-full min-w-[320px] bg-white"
                />
              </div>
            </div>

            {/* Charlie Kirk's eyeballz */}
            <div className="w-full rounded-3xl border-4 border-green-500 bg-white/95 p-4" style={{boxShadow:'8px 8px 0 #cc0000'}}>
              <div className="mb-4 flex flex-col sm:flex-row sm:relative sm:items-center sm:justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-black uppercase" style={{background:'linear-gradient(90deg,#00aa44,#00ff88)', color:'white', textShadow:'1px 1px 0 #000'}}>
                <span className="text-center">👁️ charlie kirk&apos;s eyeballz 👁️</span>
                <div className="flex items-center justify-center gap-2 sm:absolute sm:right-3">
                  <button
                    type="button"
                    onClick={() => setFacingMode(f => f === "environment" ? "user" : "environment")}
                    className="rounded-full px-2 py-1 text-xs font-black transition"
                    style={{background:'#fff', color:'#000', border:'2px solid #000'}}
                    title="Flip camera"
                  >🔄 flip</button>
                  <span className="rounded-full px-2 py-1 text-xs font-black" style={{background:'#ffff00', color:'#000', border:'2px solid #000'}}>
                    {cameraActive ? "👁️ WATCHING" : "💤 booting up"}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-black dark:border-zinc-800" style={{aspectRatio:'4/3'}}>
                <video
                  tabIndex={-1}
                  ref={videoRef}
                  className="w-full h-full object-cover transition-transform duration-150"
                  style={{ transform: `scale(${cameraZoom})` }}
                  playsInline
                  muted
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs font-black w-20 shrink-0" style={{color:'#cc0000'}}>🔍 {cameraZoom.toFixed(1)}× ZOOM</span>
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
              {lastCaptureUrl ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-black uppercase tracking-widest" style={{color:'#cc0000'}}>📸 last sent to kirk brain</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lastCaptureUrl} alt="last capture" className="w-full rounded-2xl border-2 border-dashed border-orange-400" style={{aspectRatio:'4/3', objectFit:'cover'}} />
                </div>
              ) : null}
            </div>
        </div>

      </div>
    </div>
  );
}
