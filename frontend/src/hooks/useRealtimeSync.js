// src/hooks/useRealtimeSync.js
// Battery-optimised realtime sync:
// • Pauses SSE when tab is hidden (phone screen off / other app)
// • Only invalidates the specific query that changed — not everything
// • Longer heartbeat interval
// • Unsubscribes ft_locations (high-frequency, not needed in UI)

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";

// ── Collections to subscribe to ───────────────────────────────────────────────
// ft_locations removed — it fires every 60s per user and is map-only.
// The LiveMapPage subscribes to it directly when open.
const COLLECTION_KEY_MAP = {
  ft_orders:          [["orders"], ["dash-recent-orders"], ["dash-pending-orders"]],
  ft_order_payments:  [["payments"], ["dash-pending-payments"]],
  ft_order_targets:   [["targets"], ["leaderboard"]],
  ft_attendance:      [["attendance"], ["dash-att"]],
  ft_tasks:           [["tasks"], ["my-tasks-dash"]],
  ft_expenses:        [["expenses"], ["dash-pending-exp"]],
  ft_farmer_visits:   [["farmer-visits"]],
  ft_notifications:   [["notifications"]],
  ft_sos_alerts:      [["sos-alerts"]],
  ft_users:           [["team-list"]],
};

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS   = 60_000; // was 30s — doubled to halve check frequency

export function useRealtimeSync() {
  const qc             = useQueryClient();
  const subsRef        = useRef({});
  const reconnecting   = useRef(false);
  const reconnTimer    = useRef(null);
  const heartbeatTimer = useRef(null);
  const backoffRef     = useRef(1000);
  const lastEventRef   = useRef(Date.now());
  const pausedRef      = useRef(false); // true when tab hidden

  // ── Invalidate only the specific keys for this collection ─────────────────
  const flushKeys = useCallback((queryKeys) => {
    for (const key of queryKeys) {
      qc.invalidateQueries({ queryKey: key, exact: false });
    }
    // Note: removed refetchQueries — invalidate is enough; React Query
    // will refetch automatically when the component is visible/mounted.
    // This halves the number of network requests on each SSE event.
  }, [qc]);

  // ── Optimistically patch cache ─────────────────────────────────────────────
  const patchCache = useCallback((collection, event) => {
    const { action, record } = event;
    if (!record?.id) return;

    const keys = COLLECTION_KEY_MAP[collection] ?? [];
    for (const key of keys) {
      qc.setQueriesData({ queryKey: key, exact: false }, (oldData) => {
        if (!oldData) return oldData;

        if (oldData?.items) {
          let items = [...(oldData.items ?? [])];
          if (action === "create") {
            if (!items.find(r => r.id === record.id)) items = [record, ...items];
          } else if (action === "update") {
            items = items.map(r => r.id === record.id ? { ...r, ...record } : r);
          } else if (action === "delete") {
            items = items.filter(r => r.id !== record.id);
          }
          return { ...oldData, items, totalItems: items.length };
        }

        if (Array.isArray(oldData)) {
          if (action === "create") {
            return oldData.find(r => r.id === record.id) ? oldData : [record, ...oldData];
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
        if (pausedRef.current) return; // tab hidden — drop event, don't process
        lastEventRef.current = Date.now();
        backoffRef.current   = 1000;
        patchCache(collection, e);
        flushKeys(queryKeys);
      });
      subsRef.current[collection] = true;
    } catch (err) {
      console.warn(`[Realtime] ❌ ${collection}:`, err?.message);
      subsRef.current[collection] = false;
    }
  }, [patchCache, flushKeys]);

  // ── Subscribe to all collections ──────────────────────────────────────────
  const subscribeAll = useCallback(async () => {
    if (reconnecting.current || !pb.authStore.isValid) return;
    reconnecting.current = true;
    for (const [col, keys] of Object.entries(COLLECTION_KEY_MAP)) {
      await subscribeOne(col, keys);
    }
    reconnecting.current = false;
    backoffRef.current   = 1000;
  }, [subscribeOne]);

  // ── Reconnect with backoff ─────────────────────────────────────────────────
  const reconnect = useCallback((delayMs) => {
    if (reconnTimer.current) clearTimeout(reconnTimer.current);
    const delay = delayMs ?? backoffRef.current;
    reconnTimer.current = setTimeout(async () => {
      await unsubscribeAll();
      subsRef.current      = {};
      reconnecting.current = false;
      await subscribeAll();
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    }, delay);
  }, [subscribeAll]);

  // ── Heartbeat — detect silent SSE drops ───────────────────────────────────
  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (pausedRef.current) return; // don't reconnect while hidden
      const silentMs    = Date.now() - lastEventRef.current;
      const isConnected = pb.realtime?.clientId;
      if (!isConnected && silentMs > HEARTBEAT_MS * 2) {
        subsRef.current = {};
        reconnect(500);
      }
    }, HEARTBEAT_MS);
  }, [reconnect]);

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    subscribeAll();
    startHeartbeat();

    // ── Pause SSE processing when tab hidden (screen off / backgrounded) ──
    // SSE connection stays open (closing/reopening is expensive) but we
    // skip event processing and refetches — saves CPU and radio wake-ups.
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        pausedRef.current = true;
      } else {
        pausedRef.current = false;
        // Refetch stale data now that tab is visible again
        const activeSubs = Object.values(subsRef.current).filter(Boolean).length;
        const totalSubs  = Object.keys(COLLECTION_KEY_MAP).length;
        if (activeSubs < totalSubs) {
          reconnect(300);
        } else {
          // Just refresh data without full reconnect
          for (const keys of Object.values(COLLECTION_KEY_MAP)) {
            for (const key of keys) {
              qc.invalidateQueries({ queryKey: key, exact: false });
            }
          }
        }
      }
    }

    function onOnline() { reconnect(1000); }

    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        reconnect(300);
      } else {
        unsubscribeAll();
        subsRef.current = {};
      }
    });

    pb.realtime.onDisconnect = () => {
      if (pausedRef.current) return; // expected — tab hidden
      subsRef.current = {};
      reconnect();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      unsubscribeAll();
      subsRef.current = {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      if (reconnTimer.current)    clearTimeout(reconnTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (typeof unsubAuth === "function") unsubAuth();
      pb.realtime.onDisconnect = null;
    };
  }, [qc, subscribeAll, startHeartbeat, reconnect]);
}

async function unsubscribeAll() {
  try {
    await pb.realtime.unsubscribe();
  } catch {}
}