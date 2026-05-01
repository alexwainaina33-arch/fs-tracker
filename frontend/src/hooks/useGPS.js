// src/hooks/useGPS.js
// Battery-optimised GPS — adaptive accuracy based on movement + throttled pings
// Fixes: overheating, excessive battery drain on field staff devices

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { enqueue, isOnline } from "../lib/offlineQueue";
import { checkGeofences } from "../lib/geofence";
import toast from "react-hot-toast";

// ── Tuning constants ──────────────────────────────────────────────────────────
const PING_MOVING_MS    = 60_000;  // push location every 60s when moving  (was 30s)
const PING_STILL_MS     = 5 * 60_000; // push every 5 min when stationary  (was 30s)
const MOVING_SPEED_MS   = 0.8;     // m/s threshold to count as "moving" (~3 km/h)
const STALE_ACCURACY_M  = 80;      // ignore readings worse than 80m
const GEOFENCE_CHECK_INTERVAL = 3; // only run geofence check every 3rd ping

export function useGPS() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState(false);
  const [position, setPosition] = useState(null);
  const [error,    setError]    = useState(null);

  const watchRef      = useRef(null);
  const timerRef      = useRef(null);
  const posRef        = useRef(null);
  const lastPushRef   = useRef(0);       // timestamp of last DB push
  const pingCountRef  = useRef(0);       // for geofence throttle
  const zonesRef      = useRef([]);
  const geofenceState = useRef({});
  const isMovingRef   = useRef(false);

  // ── Load geofence zones once ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    pb.collection("ft_geofences")
      .getFullList({ filter: `is_active = true` })
      .then((zones) => { zonesRef.current = zones; })
      .catch(() => {});
  }, [user?.id]);

  // ── Push a location ping ───────────────────────────────────────────────────
  const push = useCallback(async (pos) => {
    if (!user) return;

    // Skip inaccurate readings — saves battery and reduces noise
    if (pos.accuracy > STALE_ACCURACY_M) return;

    posRef.current = pos;
    setPosition(pos);

    const now       = Date.now();
    const isMoving  = (pos.speed ?? 0) > MOVING_SPEED_MS;
    isMovingRef.current = isMoving;

    // Throttle: only push if enough time has passed for current movement state
    const interval = isMoving ? PING_MOVING_MS : PING_STILL_MS;
    if (now - lastPushRef.current < interval) return;
    lastPushRef.current = now;

    const payload = {
      user:            user.id,
      latitude:        pos.latitude,
      longitude:       pos.longitude,
      accuracy_meters: pos.accuracy,
      speed_kmh:       pos.speed ? +(pos.speed * 3.6).toFixed(1) : 0,
      battery_level:   pos.battery ?? null,
      activity_type:   isMoving ? "driving" : "stationary",
      recorded_at:     new Date().toISOString(),
    };

    try {
      if (isOnline()) {
        await pb.collection("ft_locations").create(payload);
      } else {
        await enqueue({ type: "create", collection: "ft_locations", data: payload });
      }
    } catch {}

    // ── Geofence check — only every Nth ping, only when online ────────────
    pingCountRef.current += 1;
    if (
      zonesRef.current.length &&
      isOnline() &&
      pingCountRef.current % GEOFENCE_CHECK_INTERVAL === 0
    ) {
      try {
        const { inside, breaches } = checkGeofences(
          pos.latitude,
          pos.longitude,
          zonesRef.current.map((z) => ({
            id:             z.id,
            center_lat:     z.latitude,
            center_lng:     z.longitude,
            radius_metres:  z.radius_meters,
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

          await pb.collection("ft_geofence_events").create({
            user:        user.id,
            geofence:    breach.zone.id,
            event_type:  breach.type,
            latitude:    pos.latitude,
            longitude:   pos.longitude,
            recorded_at: new Date().toISOString(),
          }).catch(() => {});

          // Notify managers — fire and forget, don't await in loop
          pb.collection("ft_users")
            .getFullList({ filter: `role = "admin" || role = "manager" || role = "supervisor"`, fields: "id" })
            .then((managers) => {
              for (const mgr of managers) {
                pb.collection("ft_notifications").create({
                  recipient:      mgr.id,
                  type:           `geofence_${breach.type}`,
                  title:          breach.type === "exit" ? "⚠️ Geofence Exit" : "📍 Geofence Entry",
                  body:           msg,
                  reference_type: "ft_geofence_events",
                  is_read:        false,
                }).catch(() => {});
              }
            })
            .catch(() => {});

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

    // Use LOW accuracy by default — switches to high only when moving fast
    // LOW accuracy = network/cell tower positioning = far less battery drain
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        const pos = {
          latitude:  p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy:  p.coords.accuracy,
          speed:     p.coords.speed ?? 0,
        };

        // Get battery level if available — non-blocking
        if (navigator.getBattery) {
          navigator.getBattery()
            .then((b) => { pos.battery = Math.round(b.level * 100); push(pos); })
            .catch(() => push(pos));
        } else {
          push(pos);
        }
      },
      (err) => { setError(err.message); },
      {
        enableHighAccuracy: false, // ← KEY CHANGE: was true, causing CPU/battery spike
        maximumAge:         60000, // accept cached position up to 60s old (was 10s)
        timeout:            30000, // (was 15s)
      }
    );

    // Heartbeat — re-push last known position so live map stays fresh
    // Interval adapts to movement state
    timerRef.current = setInterval(() => {
      if (posRef.current) push(posRef.current);
    }, PING_STILL_MS);

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

// One-shot position fetch — used by visit form for GPS capture
export function getPosition(opts = {}) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,  // high accuracy OK for one-shot (not continuous)
      timeout:            15000,
      maximumAge:         0,
      ...opts,
    })
  );
}