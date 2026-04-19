// src/store/notifications.js
// Real-time notification store using PocketBase subscriptions

import { create } from "zustand";
import { pb } from "../lib/pb";

// ── Tiny notification sound using Web Audio API (no file needed) ──────────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

// ── Vibrate on mobile ─────────────────────────────────────────────────────────
function vibrate() {
  try {
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
  } catch (_) {}
}

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
        sort: "-created",
        requestKey: `notif-load-${userId}`,
      });
      const unread = records.items.filter((n) => !n.is_read).length;
      set({ notifications: records.items, unreadCount: unread, isLoading: false });
    } catch (e) {
      if (e?.status !== 0) console.warn("Failed to load notifications:", e);
      set({ isLoading: false });
    }
  },

  // ─── START REALTIME SUBSCRIPTION ─────────────────────────────────────────
  subscribe: async (userId) => {
    if (!userId) return;

    const prev = get()._unsub;
    if (prev) { try { prev(); } catch (_) {} }

    try {
      const unsub = await pb.collection("ft_notifications").subscribe(
        `recipient="${userId}"`,
        (e) => {
          if (e.record.recipient !== userId) return;

          if (e.action === "create") {
            // Add to top of list
            set((state) => ({
              notifications: [e.record, ...state.notifications].slice(0, 50),
              unreadCount: state.unreadCount + 1,
            }));

            // 🔔 Sound + vibration alert
            playNotifSound();
            vibrate();

            // Browser push notification (if permission granted)
            if (Notification.permission === "granted") {
              new Notification(e.record.title, {
                body: e.record.body,
                icon: "/icons/icon-192x192.png",
                badge: "/icons/icon-72x72.png",
                tag: e.record.id,
              });
            }
          } else if (e.action === "update") {
            set((state) => {
              const updated = state.notifications.map((n) =>
                n.id === e.record.id ? e.record : n
              );
              return {
                notifications: updated,
                unreadCount: updated.filter((n) => !n.is_read).length,
              };
            });
          } else if (e.action === "delete") {
            set((state) => {
              const filtered = state.notifications.filter((n) => n.id !== e.record.id);
              return {
                notifications: filtered,
                unreadCount: filtered.filter((n) => !n.is_read).length,
              };
            });
          }
        }
      );
      set({ _unsub: unsub });
    } catch (e) {
      if (e?.status !== 403 && e?.status !== 0) {
        console.warn("Realtime subscription failed:", e);
      }
    }
  },

  // ─── MARK SINGLE AS READ ──────────────────────────────────────────────────
  markRead: async (notifId) => {
    // Optimistic update first
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === notifId ? { ...n, is_read: true } : n
      );
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.is_read).length,
      };
    });
    try {
      await pb.collection("ft_notifications").update(notifId, { is_read: true });
    } catch (e) {
      console.warn("Mark read failed:", e);
    }
  },

  // ─── MARK ALL READ ────────────────────────────────────────────────────────
  markAllRead: async () => {
    const unread = get().notifications.filter((n) => !n.is_read);
    // Optimistic update
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
    try {
      await Promise.all(
        unread.map((n) =>
          pb.collection("ft_notifications").update(n.id, { is_read: true })
        )
      );
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