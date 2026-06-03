// src/hooks/useRealtimeSync.js
// Battery-optimised realtime sync — v2
// Fix: pb.realtime.onDisconnect was being called repeatedly on weak networks
//      causing subscribe/unsubscribe thrashing and app instability.
//      Solution: use a single reconnect lock and minimum backoff of 5s.

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";

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

const MAX_BACKOFF_MS  = 60_000;  // was 30s — longer cap reduces hammering
const MIN_BACKOFF_MS  = 5_000;   // NEW: minimum 5s before any reconnect attempt
const HEARTBEAT_MS    = 60_000;

export function useRealtimeSync() {
  const qc             = useQueryClient();
  const subsRef        = useRef({});
  const reconnecting   = useRef(false);
  const reconnTimer    = useRef(null);
  const heartbeatTimer = useRef(null);
  const backoffRef     = useRef(MIN_BACKOFF_MS);
  const lastEventRef   = useRef(Date.now());
  const pausedRef      = useRef(false);
  // NEW: track last disconnect time to rate-limit reconnect attempts
  const lastDisconnect = useRef(0);

  const flushKeys = useCallback((queryKeys) => {
    for (const key of queryKeys) {
      qc.invalidateQueries({ queryKey: key, exact: false });
    }
  }, [qc]);

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

  const subscribeOne = useCallback(async (collection, queryKeys) => {
    if (subsRef.current[collection] === true) return;
    try {
      await pb.collection(collection).subscribe("*", (e) => {
        if (pausedRef.current) return;
        lastEventRef.current = Date.now();
        backoffRef.current   = MIN_BACKOFF_MS;
        patchCache(collection, e);
        flushKeys(queryKeys);
      });
      subsRef.current[collection] = true;
    } catch (err) {
      console.warn(`[Realtime] ❌ ${collection}:`, err?.message);
      subsRef.current[collection] = false;
    }
  }, [patchCache, flushKeys]);

  const subscribeAll = useCallback(async () => {
    if (reconnecting.current || !pb.authStore.isValid) return;
    reconnecting.current = true;
    for (const [col, keys] of Object.entries(COLLECTION_KEY_MAP)) {
      await subscribeOne(col, keys);
    }
    reconnecting.current = false;
    backoffRef.current   = MIN_BACKOFF_MS;
  }, [subscribeOne]);

  const reconnect = useCallback((delayMs) => {
    if (reconnTimer.current) clearTimeout(reconnTimer.current);
    // Rate-limit: if we just disconnected, don't retry for at least MIN_BACKOFF_MS
    const timeSinceDisconnect = Date.now() - lastDisconnect.current;
    const safeDelay = Math.max(delayMs ?? backoffRef.current, MIN_BACKOFF_MS, MIN_BACKOFF_MS - timeSinceDisconnect);

    reconnTimer.current = setTimeout(async () => {
      await unsubscribeAll();
      subsRef.current      = {};
      reconnecting.current = false;
      await subscribeAll();
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
    }, safeDelay);
  }, [subscribeAll]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    heartbeatTimer.current = setInterval(() => {
      if (pausedRef.current) return;
      const silentMs    = Date.now() - lastEventRef.current;
      const isConnected = pb.realtime?.clientId;
      if (!isConnected && silentMs > HEARTBEAT_MS * 2) {
        subsRef.current = {};
        reconnect(MIN_BACKOFF_MS);
      }
    }, HEARTBEAT_MS);
  }, [reconnect]);

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    subscribeAll();
    startHeartbeat();

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        pausedRef.current = true;
      } else {
        pausedRef.current = false;
        const activeSubs = Object.values(subsRef.current).filter(Boolean).length;
        const totalSubs  = Object.keys(COLLECTION_KEY_MAP).length;
        if (activeSubs < totalSubs) {
          reconnect(1000);
        } else {
          for (const keys of Object.values(COLLECTION_KEY_MAP)) {
            for (const key of keys) {
              qc.invalidateQueries({ queryKey: key, exact: false });
            }
          }
        }
      }
    }

    function onOnline() {
      // Back online — wait MIN_BACKOFF_MS before reconnecting to let network settle
      reconnect(MIN_BACKOFF_MS);
    }

    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        reconnect(1000);
      } else {
        unsubscribeAll();
        subsRef.current = {};
      }
    });

    pb.realtime.onDisconnect = () => {
      if (pausedRef.current) return;
      // Record disconnect time so reconnect can enforce minimum delay
      lastDisconnect.current = Date.now();
      subsRef.current = {};
      reconnect(); // uses backoffRef with MIN floor
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