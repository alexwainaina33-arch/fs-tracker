import { useState, useEffect, useRef } from "react";
import { flushQueue } from "../lib/offlineQueue";
import { pb } from "../lib/pb";
import toast from "react-hot-toast";

// Debounce ms — browser fires online/offline rapidly on weak connections.
// We wait 3s before trusting a status change to avoid banner flicker.
const DEBOUNCE_MS = 3000;

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const timerRef  = useRef(null);
  const toastRef  = useRef(null); // track active toast so we don't stack them

  useEffect(() => {
    const apply = (isOnline) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        setOnline(isOnline);
        if (isOnline) {
          // Dismiss the offline toast if it's still showing
          if (toastRef.current) { toast.dismiss(toastRef.current); toastRef.current = null; }
          const flushed = await flushQueue(pb);
          if (flushed > 0) toast.success(`Back online — ${flushed} action(s) synced`);
        } else {
          // Only show one offline toast at a time
          if (!toastRef.current) {
            toastRef.current = toast(
              "You are offline. Actions will sync when reconnected.",
              { icon: "📡", duration: Infinity }
            );
          }
        }
      }, isOnline ? DEBOUNCE_MS : DEBOUNCE_MS);
    };

    const goOnline  = () => apply(true);
    const goOffline = () => apply(false);

    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}