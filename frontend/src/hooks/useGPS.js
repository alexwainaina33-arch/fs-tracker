// src/hooks/useGPS.js
// GPS tracking with geofence breach detection + notifications

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { enqueue, isOnline } from "../lib/offlineQueue";
import { checkGeofences } from "../lib/geofence";
import toast from "react-hot-toast";

const INTERVAL_MS  = 30_000; // ping every 30s
const STALE_MS     = 10 * 60 * 1000; // 10 min

export function useGPS() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [error,    setError]    = useState(null);

  const watchRef      = useRef(null);
  const timerRef      = useRef(null);
  const posRef        = useRef(null);
  const zonesRef      = useRef([]);       // cached geofence zones
  const geofenceState = useRef({});       // { [zoneId]: boolean } — inside or not

  // ── Load geofence zones once on mount ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    pb.collection("ft_geofences").getFullList({ filter: `is_active = true` })
      .then((zones) => { zonesRef.current = zones; })
      .catch(() => {});
  }, [user?.id]);

  // ── Push a location ping to PocketBase ────────────────────────────────────
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

    // ── Geofence breach check ───────────────────────────────────────────────
    if (zonesRef.current.length && isOnline()) {
      try {
        const { inside, breaches } = checkGeofences(
          pos.latitude,
          pos.longitude,
          zonesRef.current.map((z) => ({
            id:            z.id,
            center_lat:    z.latitude,   // PocketBase field names
            center_lng:    z.longitude,
            radius_metres: z.radius_meters,
            alert_on_exit:  z.alert_on_exit,
            alert_on_enter: z.alert_on_entry,
          })),
          geofenceState.current
        );
        geofenceState.current = inside;

        for (const breach of breaches) {
          const msg = breach.type === "exit"
            ? `⚠️ ${user.name} exited zone "${breach.zone.name}"`
            : `📍 ${user.name} entered zone "${breach.zone.name}"`;

          // Save breach event to PocketBase
          await pb.collection("ft_geofence_events").create({
            user:        user.id,
            geofence:    breach.zone.id,
            event_type:  breach.type,
            latitude:    pos.latitude,
            longitude:   pos.longitude,
            recorded_at: new Date().toISOString(),
          }).catch(() => {});

          // Notify all managers
          const managers = await pb.collection("ft_users").getFullList({
            filter: `role = "admin" || role = "manager" || role = "supervisor"`,
            fields: "id",
          }).catch(() => []);

          for (const mgr of managers) {
            await pb.collection("ft_notifications").create({
              recipient:      mgr.id,
              type:           `geofence_${breach.type}`,
              title:          breach.type === "exit" ? "⚠️ Geofence Exit" : "📍 Geofence Entry",
              body:           msg,
              reference_type: "ft_geofence_events",
              is_read:        false,
            }).catch(() => {});
          }

          toast(msg, { icon: breach.type === "exit" ? "⚠️" : "📍" });
        }
      } catch (e) {
        console.warn("[Geofence] check failed:", e);
      }
    }
  }, [user]);

  // ── Start tracking ─────────────────────────────────────────────────────────
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
          navigator.getBattery().then((b) => {
            pos.battery = Math.round(b.level * 100);
            push(pos);
          });
        } else {
          push(pos);
        }
      },
      (err) => { setError(err.message); toast.error("GPS: " + err.message); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    // Heartbeat — re-push last known position so map stays fresh
    timerRef.current = setInterval(() => {
      if (posRef.current) push(posRef.current);
    }, INTERVAL_MS);

    setTracking(true);
  }, [push]);

  // ── Stop tracking ──────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTracking(false);
  }, []);

  // Auto-start for field staff
  useEffect(() => {
    if (user?.role === "field_staff") start();
    return stop;
  }, [user?.id]);

  return { tracking, position, error, start, stop };
}

// One-shot position fetch
export function getPosition(opts = {}) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...opts,
    })
  );
}