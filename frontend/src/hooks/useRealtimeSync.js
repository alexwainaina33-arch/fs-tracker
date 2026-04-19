// src/hooks/useRealtimeSync.js
// Subscribes to all PocketBase collections and instantly invalidates
// React Query cache — no page refresh needed, updates appear in real-time.

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";

// All collections → which React Query keys to invalidate when they change
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
  const subsRef      = useRef({});   // track active subscriptions
  const reconnectRef = useRef(null); // reconnect timer

  useEffect(() => {
    // Only subscribe when authenticated
    if (!pb.authStore.isValid) return;

    async function subscribe() {
      // Clear any pending reconnect
      if (reconnectRef.current) clearTimeout(reconnectRef.current);

      for (const [collection, queryKeys] of Object.entries(COLLECTION_KEY_MAP)) {
        // Skip if already subscribed
        if (subsRef.current[collection]) continue;

        try {
          await pb.collection(collection).subscribe("*", () => {
            // Invalidate all related React Query keys instantly
            for (const key of queryKeys) {
              qc.invalidateQueries({ queryKey: key, exact: false });
            }
          });
          subsRef.current[collection] = true;
        } catch (err) {
          console.warn(`[Realtime] Failed to subscribe to ${collection}:`, err);
        }
      }
    }

    subscribe();

    // Reconnect if PocketBase SSE connection drops
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        // User came back to tab — re-subscribe to anything that dropped
        reconnectRef.current = setTimeout(subscribe, 500);
      }
    }

    // Also reconnect on auth change (login/logout)
    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        reconnectRef.current = setTimeout(subscribe, 300);
      } else {
        unsubscribeAll();
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", subscribe); // reconnect after offline

    return () => {
      unsubscribeAll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", subscribe);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (typeof unsubAuth === "function") unsubAuth();
    };
  }, [qc]);
}

async function unsubscribeAll() {
  try {
    await pb.realtime.unsubscribe();
  } catch {}
}