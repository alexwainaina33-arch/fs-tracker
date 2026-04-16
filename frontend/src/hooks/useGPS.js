import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { enqueue, isOnline } from "../lib/offlineQueue";
import toast from "react-hot-toast";

const INTERVAL_MS = 30_000;

export function useGPS() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [error,    setError]    = useState(null);
  const watchRef  = useRef(null);
  const timerRef  = useRef(null);
  const posRef    = useRef(null);

  const push = useCallback(async (pos) => {
    if (!user) return;
    posRef.current = pos;
    setPosition(pos);
    const payload = {
      user:            user.id,
      latitude:        pos.latitude,
      longitude:       pos.longitude,
      accuracy_meters: pos.accuracy,
      speed_kmh:       pos.speed ? +(pos.speed * 3.6).toFixed(1) : 0,
      battery_level:   pos.battery ?? null,
      activity_type:   (pos.speed ?? 0) > 0.5 ? "driving" : "stationary",
      recorded_at:     new Date().toISOString(),
    };
    try {
      if (isOnline()) {
        await pb.collection("ft_locations").create(payload);
      } else {
        await enqueue({ type: "create", collection: "ft_locations", data: payload });
      }
    } catch {}
  }, [user]);

  const start = useCallback(() => {
    if (!navigator.geolocation) { toast.error("GPS not available"); return; }
    setError(null);
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos = {
          latitude:  p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy:  p.coords.accuracy,
          speed:     p.coords.speed ?? 0,
        };
        if (navigator.getBattery) {
          navigator.getBattery().then((b) => { pos.battery = Math.round(b.level * 100); push(pos); });
        } else {
          push(pos);
        }
      },
      (err) => { setError(err.message); toast.error("GPS: " + err.message); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    timerRef.current = setInterval(() => { if (posRef.current) push(posRef.current); }, INTERVAL_MS);
    setTracking(true);
  }, [push]);

  const stop = useCallback(() => {
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    setTracking(false);
  }, []);

  useEffect(() => {
    if (user?.role === "field_staff") start();
    return stop;
  }, [user?.id]);

  return { tracking, position, error, start, stop };
}

export function getPosition(opts = {}) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...opts,
    })
  );
}
