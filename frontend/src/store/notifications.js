// src/store/notifications.js
// Real-time notification store using PocketBase subscriptions

import { create } from "zustand";
import { pb } from "../lib/pb";

export const useNotifications = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  _unsub: null,

  // ─── LOAD NOTIFICATIONS ───────────────────────────────────────────────────
  load: async (userId) => {
    if (!userId) return;
    set({ isLoading: true });
    try {
      const records = await pb.collection("ft_notifications").getList(1, 50, {
        filter: `recipient = "${userId}"`,
        sort: "-id",
        requestKey: `notif-load-${userId}`,   // prevents auto-cancellation
      });
      const unread = records.items.filter((n) => !n.is_read).length;
      set({ notifications: records.items, unreadCount: unread, isLoading: false });
    } catch (e) {
      // Silently ignore auto-cancellation (status 0) — harmless re-render artifact
      if (e?.status !== 0) console.warn("Failed to load notifications:", e);
      set({ isLoading: false });
    }
  },

  // ─── START REALTIME SUBSCRIPTION ─────────────────────────────────────────
  subscribe: async (userId) => {
    if (!userId) return;

    // Unsubscribe previous listener before starting a new one
    const prev = get()._unsub;
    if (prev) { try { prev(); } catch (_) {} }

    try {
      const unsub = await pb.collection("ft_notifications").subscribe(
        `recipient="${userId}"`,
        (e) => {
          if (e.record.recipient !== userId) return;

          if (e.action === "create") {
            set((state) => ({
              notifications: [e.record, ...state.notifications].slice(0, 50),
              unreadCount: state.unreadCount + 1,
            }));
            if (Notification.permission === "granted") {
              new Notification(e.record.title, {
                body: e.record.body,
                icon: "/icons/icon-192x192.png",   // use our PWA icon
              });
            }
          } else if (e.action === "update") {
            set((state) => ({
              notifications: state.notifications.map((n) =>
                n.id === e.record.id ? e.record : n
              ),
              unreadCount: state.notifications.filter((n) => !n.is_read).length,
            }));
          } else if (e.action === "delete") {
            set((state) => ({
              notifications: state.notifications.filter((n) => n.id !== e.record.id),
              unreadCount: state.notifications.filter(
                (n) => !n.is_read && n.id !== e.record.id
              ).length,
            }));
          }
        }
      );
      set({ _unsub: unsub });
    } catch (e) {
      // Silently ignore 403 — happens on re-login / token refresh, auto-recovers
      if (e?.status !== 403 && e?.status !== 0) {
        console.warn("Realtime subscription failed:", e);
      }
    }
  },

  // ─── MARK AS READ ─────────────────────────────────────────────────────────
  markRead: async (notifId) => {
    try {
      await pb.collection("ft_notifications").update(notifId, { is_read: true });
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === notifId ? { ...n, is_read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (e) {
      console.warn("Mark read failed:", e);
    }
  },

  // ─── MARK ALL READ ────────────────────────────────────────────────────────
  markAllRead: async () => {
    const unread = get().notifications.filter((n) => !n.is_read);
    try {
      await Promise.all(
        unread.map((n) =>
          pb.collection("ft_notifications").update(n.id, { is_read: true })
        )
      );
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      console.warn("Mark all read failed:", e);
    }
  },

  // ─── UNSUBSCRIBE ──────────────────────────────────────────────────────────
  unsubscribe: () => {
    const unsub = get()._unsub;
    if (unsub) {
      try { unsub(); } catch (_) {}
      set({ _unsub: null });
    }
  },

  // ─── REQUEST BROWSER NOTIFICATION PERMISSION ──────────────────────────────
  requestPermission: async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  },
}));