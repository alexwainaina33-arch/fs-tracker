// src/components/PWAManager.jsx
// Handles: install prompt, SILENT auto-update, iOS hint
// Updates happen automatically in the background — users never see a prompt

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";

// ─── REGISTER SERVICE WORKER (silent auto-update) ────────────────────────────
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[PWA] Service worker registered");

        // Check for new SW version every 30 seconds
        const interval = setInterval(() => reg.update(), 30 * 1000);

        // New SW found — silently activate it immediately, no user prompt
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;

          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              console.log("[PWA] Update ready — applying silently");
              newSW.postMessage("SKIP_WAITING");
            }
          });
        });

        return () => clearInterval(interval);
      })
      .catch((err) => console.warn("[PWA] SW registration failed:", err));

    // When SW sends SW_UPDATED message — reload silently
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_UPDATED") {
        console.log("[PWA] SW_UPDATED received — reloading");
        setTimeout(() => window.location.reload(), 300);
      }
    });

    // When the new SW takes control — reload silently
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);
}

// ─── INSTALL PROMPT HOOK ──────────────────────────────────────────────────────
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      localStorage.getItem("pwa-installed") === "true"
    ) {
      setInstalled(true);
      return;
    }

    const handler = (e) => { e.preventDefault(); setPrompt(e); };
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

// ─── INSTALL BANNER ───────────────────────────────────────────────────────────
export function InstallBanner() {
  const { canInstall, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 pb-safe">
      <div className="bg-[#111418] border border-[#c8f230]/30 rounded-2xl p-4 shadow-2xl flex items-center gap-4 animate-slide-up">
        <div className="w-12 h-12 rounded-xl bg-[#c8f230] flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">📍</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">Install FieldTrack</p>
          <p className="text-xs text-[#8b95a1] mt-0.5">
            Add to home screen — works offline too!
          </p>
        </div>
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

// ─── iOS INSTALL INSTRUCTIONS ─────────────────────────────────────────────────
export function IOSInstallHint() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    const wasDismissed = localStorage.getItem("ios-hint-dismissed") === "true";
    if (isIOS && !isStandalone && !wasDismissed) {
      setTimeout(() => setShow(true), 3000);
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
          {[
            <>Tap the <strong className="text-white">Share</strong> button <span className="text-[#c8f230]">⬆</span> at the bottom of Safari</>,
            <>Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong></>,
            <>Tap <strong className="text-white">"Add"</strong> — FieldTrack will appear on your home screen!</>,
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#c8f230] text-[#0a0d0f] flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function PWAManager() {
  useServiceWorker();
  return (
    <>
      <InstallBanner />
      <IOSInstallHint />
    </>
  );
}