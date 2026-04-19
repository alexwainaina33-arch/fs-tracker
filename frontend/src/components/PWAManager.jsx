// src/components/PWAManager.jsx
// Handles: install prompt, update detection, offline/online banner
// Drop this into Layout.jsx once — it manages everything automatically

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Download, RefreshCw, WifiOff, Wifi } from "lucide-react";

// ─── REGISTER SERVICE WORKER ──────────────────────────────────────────────────
export function useServiceWorker() {
  const [swReg, setSwReg] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((reg) => {
        setSwReg(reg);
        console.log("[PWA] Service worker registered");

        // Check for updates every 60 seconds
        const interval = setInterval(() => reg.update(), 60 * 1000);

        // New service worker waiting — update is ready
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });

        return () => clearInterval(interval);
      })
      .catch((err) => console.warn("[PWA] SW registration failed:", err));

    // Listen for messages from SW
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "UPDATE_AVAILABLE") setUpdateReady(true);
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (!swReg?.waiting) return;
    swReg.waiting.postMessage("SKIP_WAITING");
    window.location.reload();
  }, [swReg]);

  return { updateReady, applyUpdate };
}

// ─── INSTALL PROMPT HOOK ──────────────────────────────────────────────────────
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    if (window.navigator.standalone === true) { // iOS
      setInstalled(true);
      return;
    }
    // Check localStorage so we never re-prompt on same device
    if (localStorage.getItem("pwa-installed") === "true") {
      setInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setPrompt(null);
      localStorage.setItem("pwa-installed", "true");
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
      setPrompt(null);
      localStorage.setItem("pwa-installed", "true");
    }
  }, [prompt]);

  return { canInstall: !!prompt && !installed, installed, install };
}

// ─── INSTALL BANNER (shown at bottom of screen) ───────────────────────────────
export function InstallBanner() {
  const { canInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 pb-safe">
      <div className="bg-[#111418] border border-[#c8f230]/30 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-slide-up">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-[#c8f230] flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">📍</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">Install FieldTrack</p>
          <p className="text-xs text-[#8b95a1] mt-0.5">
            Add to home screen for the best experience — works offline too!
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button
            onClick={install}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c8f230] text-[#0a0d0f] text-xs font-bold hover:bg-[#d4f542] transition-colors whitespace-nowrap"
          >
            <Download size={13} /> Install App
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-[10px] text-[#4a5568] hover:text-[#8b95a1] text-center transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UPDATE BANNER ────────────────────────────────────────────────────────────
export function UpdateBanner() {
  const { updateReady, applyUpdate } = useServiceWorker();

  if (!updateReady) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] px-4 pt-safe">
      <div className="bg-[#3b82f6] rounded-b-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
        <RefreshCw size={14} className="text-white animate-spin flex-shrink-0" />
        <p className="text-white text-xs flex-1">New version of FieldTrack available!</p>
        <button
          onClick={applyUpdate}
          className="text-xs font-bold text-[#3b82f6] bg-white px-3 py-1.5 rounded-xl hover:bg-[#f0f9ff] transition-colors whitespace-nowrap"
        >
          Update Now
        </button>
      </div>
    </div>
  );
}

// ─── iOS INSTALL INSTRUCTIONS (iOS doesn't support beforeinstallprompt) ───────
export function IOSInstallHint() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const wasDismissed = localStorage.getItem("ios-hint-dismissed") === "true";
    if (isIOS && !isStandalone && !wasDismissed) {
      setTimeout(() => setShow(true), 3000); // show after 3s
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("ios-hint-dismissed", "true");
  };

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4">
      <div className="bg-[#111418] border border-[#c8f230]/30 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <p className="font-bold text-white text-sm flex items-center gap-2">
            <Download size={14} className="text-[#c8f230]" /> Install FieldTrack on iPhone
          </p>
          <button onClick={dismiss} className="text-[#4a5568] hover:text-white text-lg leading-none">×</button>
        </div>
        <div className="space-y-2 text-xs text-[#8b95a1]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#c8f230] text-[#0a0d0f] flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
            <span>Tap the <strong className="text-white">Share</strong> button <span className="text-[#c8f230]">⬆</span> at the bottom of Safari</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#c8f230] text-[#0a0d0f] flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
            <span>Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#c8f230] text-[#0a0d0f] flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
            <span>Tap <strong className="text-white">"Add"</strong> — FieldTrack will appear on your home screen!</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT — drop this into Layout.jsx ──────────────────────────────────
export default function PWAManager() {
  return (
    <>
      <UpdateBanner />
      <InstallBanner />
      <IOSInstallHint />
    </>
  );
}