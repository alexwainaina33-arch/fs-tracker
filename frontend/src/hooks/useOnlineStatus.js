import { useState, useEffect } from "react";
import { flushQueue } from "../lib/offlineQueue";
import { pb } from "../lib/pb";
import toast from "react-hot-toast";

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      const flushed = await flushQueue(pb);
      if (flushed > 0) toast.success(`Back online — ${flushed} action(s) synced`);
    };
    const goOffline = () => {
      setOnline(false);
      toast("You are offline. Actions will sync when reconnected.", { icon: "📡", duration: 5000 });
    };
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
