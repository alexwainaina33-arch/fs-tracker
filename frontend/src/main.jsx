// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "react-hot-toast";
import App from "./App";
import "./index.css";
import { flushQueue, getQueueCount } from "./lib/offlineQueue";
import { pb } from "./lib/pb";

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20000, retry: 1 },
  },
});

// ── Auto-sync when internet returns ──────────────────────────────────────────
async function syncOfflineQueue() {
  try {
    const count = await getQueueCount();
    if (count === 0) return;

    toast.loading(`Syncing ${count} offline record${count > 1 ? "s" : ""}…`, { id: "sync" });
    const flushed = await flushQueue(pb);

    if (flushed > 0) {
      toast.success(
        `✅ Synced ${flushed} record${flushed > 1 ? "s" : ""} successfully!`,
        { id: "sync", duration: 5000 }
      );
      qc.invalidateQueries();
    } else {
      toast.dismiss("sync");
    }
  } catch (e) {
    toast.error("Sync failed — will retry when online", { id: "sync" });
    console.warn("[Sync] flush failed:", e);
  }
}

window.addEventListener("online", () => {
  toast.success("Back online!", { duration: 2000 });
  setTimeout(syncOfflineQueue, 1500);
});

window.addEventListener("offline", () => {
  toast("📴 You're offline — data will sync when reconnected", {
    duration: 5000,
    icon: "📴",
    style: { background: "#181c21", color: "#ff9f43", border: "1px solid #ff9f43/30" },
  });
});

window.addEventListener("load", () => {
  if (navigator.onLine) setTimeout(syncOfflineQueue, 3000);
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      {/* ── Future flags silence React Router v6 → v7 warnings ── */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: "#181c21",
              color: "#c2cad4",
              border: "1px solid #21272f",
              borderRadius: "12px",
              fontFamily: "Outfit, sans-serif",
              fontSize: "14px",
            },
            success: { iconTheme: { primary: "#c8f230", secondary: "#0a0d0f" } },
            error:   { iconTheme: { primary: "#ff4d4f", secondary: "#0a0d0f" } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);