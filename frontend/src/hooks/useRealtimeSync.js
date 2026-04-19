// src/hooks/useRealtimeSync.js
// Subscribes to all PocketBase collections via SSE.
// Changes appear INSTANTLY — no polling, no refresh needed.
// Reconnects automatically after tab switch, coming back online, or SSE drop.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";

// Collection → React Query keys to invalidate + immediately refetch
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

export function useRealtimeSync() {
  const qc           = useQueryClient();
  const subsRef      = useRef({});      // { collectionName: true } — tracks active subs
  const reconnecting = useRef(false);
  const reconnTimer  = useRef(null);

  useEffect(() => {
    if (!pb.authStore.isValid) return;

    // ── Core: subscribe to one collection ─────────────────────────────────────
    async function subscribeOne(collection, queryKeys) {
      if (subsRef.current[collection]) return; // already subscribed

      try {
        await pb.collection(collection).subscribe("*", (e) => {
          // 🔑 THE FIX: invalidate AND immediately refetch — no waiting for poll
          for (const key of queryKeys) {
            qc.invalidateQueries({ queryKey: key, exact: false });
            qc.refetchQueries({   queryKey: key, exact: false });
          }
          console.debug(`[Realtime] ${collection} → ${e.action}`, e.record?.id ?? "");
        });
        subsRef.current[collection] = true;
      } catch (err) {
        console.warn(`[Realtime] Failed to subscribe to ${collection}:`, err);
        subsRef.current[collection] = false; // mark for retry
      }
    }

    // ── Subscribe to all collections ──────────────────────────────────────────
    async function subscribeAll() {
      if (reconnecting.current) return;
      reconnecting.current = true;

      for (const [collection, queryKeys] of Object.entries(COLLECTION_KEY_MAP)) {
        await subscribeOne(collection, queryKeys);
      }

      reconnecting.current = false;
    }

    // ── Reconnect: unsubscribe everything then re-subscribe ───────────────────
    async function reconnect(delayMs = 500) {
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      reconnTimer.current = setTimeout(async () => {
        console.log("[Realtime] Reconnecting...");
        await unsubscribeAll();
        subsRef.current = {};        // reset tracked subs
        await subscribeAll();
        console.log("[Realtime] ✅ Reconnected");
      }, delayMs);
    }

    // ── Initial subscribe ─────────────────────────────────────────────────────
    subscribeAll();

    // ── Re-subscribe when tab becomes visible again ───────────────────────────
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        reconnect(300);
      }
    }

    // ── Re-subscribe when internet comes back ─────────────────────────────────
    function onOnline() {
      reconnect(1000);
    }

    // ── Re-subscribe on auth change (login / logout) ──────────────────────────
    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        reconnect(300);
      } else {
        unsubscribeAll();
        subsRef.current = {};
      }
    });

    // ── PocketBase SSE disconnect detection ───────────────────────────────────
    // PocketBase fires this when the EventSource drops
    pb.realtime.onDisconnect = () => {
      console.warn("[Realtime] SSE disconnected — scheduling reconnect");
      subsRef.current = {}; // mark all as unsubscribed
      reconnect(2000);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      unsubscribeAll();
      subsRef.current = {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      if (reconnTimer.current) clearTimeout(reconnTimer.current);
      if (typeof unsubAuth === "function") unsubAuth();
    };
  }, [qc]);
}

// ── Unsubscribe from all PocketBase realtime channels ─────────────────────────
async function unsubscribeAll() {
  try {
    await pb.realtime.unsubscribe();
  } catch (err) {
    console.warn("[Realtime] Unsubscribe error:", err);
  }
}