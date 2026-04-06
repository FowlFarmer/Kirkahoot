"use client";

import { useEffect, useRef, useState } from "react";

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
      setAnsweringPhase(detectAnswerPhaseFromIframe(iframe));
    } catch (error) {
      console.warn("Unable to update iframe content", error);
    }
  }, [streamHtml]);

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
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="mt-3 inline-flex rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  Disconnect
                </button>
              </div>
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
