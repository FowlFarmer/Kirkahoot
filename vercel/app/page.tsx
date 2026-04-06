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

  const getElementDescriptor = (element: Element) => {
    const htmlElement = element as HTMLElement;
    const pathSegments: string[] = [];
    let current: Element | null = element;

    while (current && current.nodeType === 1) {
      const tagName = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      let selector = tagName;

      if (current.id) {
        selector += `#${current.id}`;
      } else if (current.className) {
        const classNames = String(current.className).split(/\s+/).filter(Boolean);
        if (classNames.length > 0) {
          selector += classNames.map((name) => `.${name}`).join("");
        }
      }

      if (parent) {
        const currentElement = current;
        const siblings = Array.from(parent.children).filter(
          (child): child is Element => child instanceof Element && child.tagName === currentElement.tagName
        );
        if (siblings.length > 1) {
          selector += `:nth-of-type(${siblings.indexOf(currentElement) + 1})`;
        }
      }

      pathSegments.unshift(selector);
      current = parent;
    }

    return {
      tagName: element.tagName.toLowerCase(),
      id: htmlElement.id || undefined,
      className: htmlElement.className || undefined,
      name: htmlElement.getAttribute("name") || undefined,
      role: htmlElement.getAttribute("role") || undefined,
      type: (htmlElement.getAttribute("type") || undefined),
      text: htmlElement.textContent?.trim().slice(0, 100) || undefined,
      value: (htmlElement instanceof HTMLInputElement || htmlElement instanceof HTMLTextAreaElement)
        ? htmlElement.value
        : undefined,
      path: pathSegments.join(" > "),
    };
  };

  const sendElementAction = (action: string, element: Element, value?: string) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;

    const descriptor = getElementDescriptor(element);
    socketRef.current.send(
      JSON.stringify({
        type: "element-action",
        action,
        descriptor,
        value,
      })
    );
  };

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

  useEffect(() => {
    const iframe = streamIframeRef.current;
    if (!iframe) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const actionable =
        target.closest("button, a, input, textarea, select, label, [role='button'], [role='link']") || target;
      event.preventDefault();
      event.stopPropagation();
      if (actionable) {
        sendElementAction("click", actionable);
      }
    };

    const handleInput = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        event.preventDefault();
        event.stopPropagation();
        sendElementAction("type", target, target.value);
      }
    };

    const handleChange = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        event.preventDefault();
        event.stopPropagation();
        sendElementAction("type", target, target.value);
      }
    };

    const handleSubmit = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      sendElementAction("submit", target);
    };

    const attachHandlers = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          doc.addEventListener("click", handleClick, true);
          doc.addEventListener("input", handleInput, true);
          doc.addEventListener("change", handleChange, true);
          doc.addEventListener("submit", handleSubmit, true);
        }
      } catch (error) {
        console.warn("Unable to attach iframe interaction handlers", error);
      }
    };

    iframe.addEventListener("load", attachHandlers);
    attachHandlers();

    return () => {
      iframe.removeEventListener("load", attachHandlers);
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          doc.removeEventListener("click", handleClick, true);
          doc.removeEventListener("input", handleInput, true);
          doc.removeEventListener("change", handleChange, true);
          doc.removeEventListener("submit", handleSubmit, true);
        }
      } catch {}
    };
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
      if (data.type === "error") {
        setConnecting(false);
        setStreamStatus("Error");
        setStatusMessage(data.message || "Session error.");
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
                    srcDoc={streamHtml}
                    className="h-[520px] w-full min-w-[320px] bg-white"
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
