// src/hooks/useRealtimeSync.js
// Advanced realtime sync — SSE subscriptions with:
// • Heartbeat monitoring (detects silent drops)
// • Exponential backoff reconnection
// • Optimistic cache patching (instant UI updates)
// • Per-collection independent retry
// • Reconnects on tab focus, online, auth change, SSE drop

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";

// Collection → React Query keys to invalidate + refetch on any change
const COLLECTION_KEY_MAP = {
  ft_orders:          [["orders"], ["dash-recent-orders"], ["dash-pending-orders"], ["order-summary"]],
  ft_order_payments:  [["payments"], ["dash-pending-payments"], ["dash-coll-rate"], ["order-payments"]],
  ft_order_targets:   [["targets"], ["leaderboard"], ["my-target"]],
  ft_attendance:      [["attendance"], ["dash-att"], ["my-att-dash"], ["team-att"]],
  ft_locations:       [["map-locs"], ["dash-live-locs"], ["map-history"]],
  ft_tasks:           [["tasks"], ["my-tasks-dash"]],
  ft_expenses:        [["expenses"], ["dash-pending-exp"]],
  ft_farmer_visits:   [["farmer-visits"], ["dash-visits-today"], ["my-visits-today"]],
  ft_notifications:   [["notifications"]],
  ft_sos_alerts:      [["sos-alerts"]],
  ft_geofences:       [["geofences"]],
  ft_geofence_events: [["geofence-events"]],
  ft_users:           [["team-list"], ["staff-map"], ["dash-active-staff"]],
  ft_mileage:         [["mileage"]],
  ft_reports:         [["reports"]],
};

const MAX_BACKOFF_MS  = 30000; // max 30s between reconnect attempts
const HEARTBEAT_MS    = 30000; // check SSE health every 30s

export function useRealtimeSync() {
  const qc              = useQueryClient();
  const subsRef         = useRef({});       // collection → true/false
  const reconnecting    = useRef(false);
  const reconnTimer     = useRef(null);
  const heartbeatTimer  = useRef(null);
  const backoffRef      = useRef(1000);     // current backoff delay
  const lastEventRef    = useRef(Date.now()); // timestamp of last SSE event

  // ── Invalidate + refetch all keys for a collection ────────────────────────
  const flushKeys = useCallback((queryKeys) => {
    for (const key of queryKeys) {
      qc.invalidateQueries({ queryKey: key, exact: false });
      qc.refetchQueries({   queryKey: key, exact: false });
    }
  }, [qc]);

  // ── Optimistically patch the React Query cache with the incoming record ────
  // This makes the UI update BEFORE the refetch completes
  const patchCache = useCallback((collection, event) => {
    const { action, record } = event;
    if (!record?.id) return;

    const keys = COLLECTION_KEY_MAP[collection] ?? [];
    for (const key of keys) {
      qc.setQueriesData({ queryKey: key, exact: false }, (oldData) => {
        if (!oldData) return oldData;

        // PocketBase list response shape: { items: [...], totalItems, ... }
        if (oldData?.items) {
          let items = [...(oldData.items ?? [])];
          if (action === "create") {
            // Add to front if not already present
            if (!items.find(r => r.id === record.id)) {
              items = [record, ...items];
            }
          } else if (action === "update") {
            items = items.map(r => r.id === record.id ? { ...r, ...record } : r);
          } else if (action === "delete") {
            items = items.filter(r => r.id !== record.id);
          }
          return { ...oldData, items, totalItems: items.length };
        }

        // Array shape (getFullList)
        if (Array.isArray(oldData)) {
          if (action === "create") {
            return oldData.find(r => r.id === record.id)
              ? oldData
              : [record, ...oldData];
          } else if (action === "update") {
            return oldData.map(r => r.id === record.id ? { ...r, ...record } : r);
          } else if (action === "delete") {
            return oldData.filter(r => r.id !== record.id);
          }
        }

        return oldData;
      });
    }
  }, [qc]);

  // ── Subscribe to one collection ───────────────────────────────────────────
  const subscribeOne = useCallback(async (collection, queryKeys) => {
    if (subsRef.current[collection] === true) return;

    try {
      await pb.collection(collection).subscribe("*", (e) => {
        lastEventRef.current = Date.now(); // record activity for heartbeat
        backoffRef.current   = 1000;       // reset backoff on successful event

        console.debug(`[Realtime] ${collection} → ${e.action} ${e.record?.id ?? ""}`);

        // 1. Optimistically patch cache immediately (instant UI)
        patchCache(collection, e);

        // 2. Then refetch from server to get full expanded data
        flushKeys(queryKeys);
      });

      subsRef.current[collection] = true;
    } catch (err) {
      console.warn(`[Realtime] ❌ Failed to subscribe to ${collection}:`, err);
      subsRef.current[collection] = false;
    }
  }, [patchCache, flushKeys]);

  // ── Subscribe to all collections ─────────────────────────────────────────
  const subscribeAll = useCallback(async () => {
    if (reconnecting.current) return;
    if (!pb.authStore.isValid) return;

    reconnecting.current = true;
    console.log("[Realtime] Subscribing to all collections...");

    for (const [collection, queryKeys] of Object.entries(COLLECTION_KEY_MAP)) {
      await subscribeOne(collection, queryKeys);
    }

    reconnecting.current = false;
    backoffRef.current   = 1000; // reset backoff after successful connect
    console.log("[Realtime] ✅ All collections subscribed");
  }, [subscribeOne]);

  // ── Reconnect with exponential backoff ────────────────────────────────────
  const reconnect = useCallback((delayMs) => {
    if (reconnTimer.current) clearTimeout(reconnTimer.current);

    const delay = delayMs ?? backoffRef.current;
    console.log(`[Realtime] Reconnecting in ${delay}ms...`);

    reconnTimer.current = setTimeout(async () => {
      await unsubscribeAll();
      subsRef.current      = {};
      reconnecting.current = false;
      await subscribeAll();

      // Increase backoff for next failure (cap at MAX_BACKOFF_MS)
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    }, delay);
  }, [subscribeAll]);

  // ── Heartbeat: detect silent SSE drops ───────────────────────────────────
  // If no SSE event received in 2× heartbeat window, force reconnect
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);

    heartbeatTimer.current = setInterval(() => {
      const silentMs = Date.now() - lastEventRef.current;
      const isConnected = pb.realtime?.clientId; // truthy when SSE is alive

      if (!isConnected && silentMs > HEARTBEAT_MS * 2) {
        console.warn(`[Realtime] 💔 Heartbeat: SSE silent for ${Math.round(silentMs/1000)}s — reconnecting`);
        subsRef.current = {};
        reconnect(500);
      }
    }, HEARTBEAT_MS);
  }, [reconnect]);

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    subscribeAll();
    startHeartbeat();

    // ── Re-subscribe when tab becomes visible ────────────────────────────
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        const activeSubs = Object.values(subsRef.current).filter(Boolean).length;
        const totalSubs = Object.keys(COLLECTION_KEY_MAP).length;
        if (activeSubs < totalSubs) {
          console.log("[Realtime] Tab visible — subscriptions lost, reconnecting");
          reconnect(300);
        }
      }
    }

    // ── Re-subscribe when internet returns ───────────────────────────────
    function onOnline() {
      console.log("[Realtime] Back online — reconnecting");
      reconnect(1000);
    }

    // ── Re-subscribe on auth change ───────────────────────────────────────
    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        reconnect(300);
      } else {
        unsubscribeAll();
        subsRef.current = {};
      }
    });

    // ── PocketBase native SSE disconnect event ────────────────────────────
    pb.realtime.onDisconnect = () => {
      console.warn("[Realtime] SSE onDisconnect fired — reconnecting");
      subsRef.current = {};
      reconnect(); // uses current backoff
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      unsubscribeAll();
      subsRef.current = {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      if (reconnTimer.current)   clearTimeout(reconnTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (typeof unsubAuth === "function") unsubAuth();
      pb.realtime.onDisconnect = null;
    };
  }, [qc, subscribeAll, startHeartbeat, reconnect]);
}

// ── Unsubscribe from all PocketBase realtime channels ────────────────────────
async function unsubscribeAll() {
  try {
    await pb.realtime.unsubscribe();
    console.log("[Realtime] Unsubscribed all");
  } catch (err) {
    console.warn("[Realtime] Unsubscribe error:", err);
  }
}