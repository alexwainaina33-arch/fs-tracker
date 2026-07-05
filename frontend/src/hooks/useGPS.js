// src/hooks/useGPS.js
// Battery-optimised GPS — adaptive accuracy based on movement + throttled pings
// v3 fixes:
//   - Stable useEffect deps (no stale closures on start/stop/push)
//   - pausedRef synced correctly
//   - consent null/true/false handled properly
//   - Auto-start only triggers when consent is explicitly true

import { useState, useEffect, useCallback, useRef } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { enqueue, isOnline } from "../lib/offlineQueue";
import { checkGeofences } from "../lib/geofence";
import toast from "react-hot-toast";

const PING_MOVING_MS          = 60_000;
const PING_STILL_MS           = 5 * 60_000;
const MOVING_SPEED_MS         = 0.8;
const STALE_ACCURACY_M        = 80;
const GEOFENCE_CHECK_INTERVAL = 3;
const CONSENT_KEY             = "fieldtrack_gps_consent";

export function useGPS() {
  const { user } = useAuth();

  const [tracking, setTracking] = useState(false);
  const [paused,   setPaused]   = useState(false);
  const [position, setPosition] = useState(null);
  const [error,    setError]    = useState(null);
  const [consent,  setConsent]  = useState(() => {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY)); }
    catch { return null; }
  });

  const watchRef      = useRef(null);
  const timerRef      = useRef(null);
  const posRef        = useRef(null);
  const lastPushRef   = useRef(0);
  const pingCountRef  = useRef(0);
  const zonesRef      = useRef([]);
  const geofenceState = useRef({});
  // Keep refs in sync with state so callbacks always see current values
  const pausedRef     = useRef(false);
  const trackingRef   = useRef(false);
  const userRef       = useRef(user);

  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { trackingRef.current = tracking; }, [tracking]);

  // Load geofence zones
  useEffect(() => {
    if (!user?.id) return;
    pb.collection("ft_geofences")
      .getFullList({ filter: "is_active = true" })
      .then((zones) => { zonesRef.current = zones; })
      .catch(() => {});
  }, [user?.id]);

  const push = useCallback(async (pos) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (pausedRef.current) return;
    if (pos.accuracy > STALE_ACCURACY_M) return;

    posRef.current = pos;
    setPosition(pos);

    const now      = Date.now();
    const isMoving = (pos.speed ?? 0) > MOVING_SPEED_MS;
    const interval = isMoving ? PING_MOVING_MS : PING_STILL_MS;
    if (now - lastPushRef.current < interval) return;
    lastPushRef.current = now;

    const payload = {
      org_id:          currentUser.org_id,
      user:            currentUser.id,
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
    } catch { /* silent — don't break GPS on network errors */ }

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
            id: z.id,
            center_lat: z.latitude,
            center_lng: z.longitude,
            radius_metres: z.radius_meters,
            alert_on_exit:  z.alert_on_exit,
            alert_on_enter: z.alert_on_entry,
          })),
          geofenceState.current
        );
        geofenceState.current = inside;

        for (const breach of breaches) {
          const msg = breach.type === "exit"
            ? `⚠️ ${currentUser.name} exited zone "${breach.zone.name}"`
            : `📍 ${currentUser.name} entered zone "${breach.zone.name}"`;

          // Schema: event_type values are "entered"/"exited", timestamp field is "occurred_at"
          await pb.collection("ft_geofence_events").create({
            org_id:      currentUser.org_id,
            user:        currentUser.id,
            geofence:    breach.zone.id,
            event_type:  breach.type === "exit" ? "exited" : "entered",
            latitude:    pos.latitude,
            longitude:   pos.longitude,
            occurred_at: new Date().toISOString(),
          }).catch(() => {});

          pb.collection("ft_users")
            .getFullList({
              filter: `role = "admin" || role = "manager" || role = "supervisor"`,
              fields: "id",
            })
            .then((managers) => {
              for (const mgr of managers) {
                pb.collection("ft_notifications").create({
                  org_id:         currentUser.org_id,
                  recipient:      mgr.id,
                  type:           "geofence_breach",
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
  }, []); // stable — uses refs only

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
    setPaused(false);
    pausedRef.current  = false;
    trackingRef.current = false;
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS not available on this device");
      return;
    }
    // Don't double-start
    if (trackingRef.current) return;

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
          navigator.getBattery()
            .then((b) => { pos.battery = Math.round(b.level * 100); push(pos); })
            .catch(() => push(pos));
        } else {
          push(pos);
        }
      },
      (err) => {
        setError(err.message);
        console.warn("[GPS] watch error:", err.message);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 }
    );

    timerRef.current = setInterval(() => {
      if (posRef.current && !pausedRef.current) push(posRef.current);
    }, PING_STILL_MS);

    setTracking(true);
    setPaused(false);
    trackingRef.current = true;
    pausedRef.current   = false;
  }, [push]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    toast("GPS paused — location won't be shared until you resume.", {
      icon: "⏸",
      duration: 4000,
    });
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    toast.success("GPS resumed");
  }, []);

  const grantConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "true");
    setConsent(true);
  }, []);

  const revokeConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, "false");
    setConsent(false);
    stop();
    toast("GPS tracking disabled. You can re-enable it from your profile.", {
      duration: 5000,
    });
  }, [stop]);

  // Auto-start for field_staff ONLY when consent is explicitly true
  useEffect(() => {
    if (user?.role === "field_staff" && consent === true) {
      start();
    }
    // Cleanup on unmount
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [user?.id, consent]); // intentionally excludes start/stop — they're stable

  return {
    tracking, paused, position, error, consent,
    start, stop, pause, resume, grantConsent, revokeConsent,
  };
}

// One-shot position — used by visit/clock forms
export function getPosition(opts = {}) {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      ...opts,
    })
  );
}