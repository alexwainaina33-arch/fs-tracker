// src/components/NotificationBell.jsx
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Bell, CheckCheck, ShoppingCart, ThumbsUp, X, RefreshCcw, Target, CreditCard } from "lucide-react";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { useAuth } from "../store/auth";
import { useNotifications } from "../store/notifications";

const TYPE_CONFIG = {
  order_pending:    { icon: ShoppingCart, color: "text-[#ffab00]", bg: "bg-[#ffab00]/10" },
  order_approved:   { icon: ThumbsUp,     color: "text-[#00c096]", bg: "bg-[#00c096]/10" },
  order_rejected:   { icon: X,            color: "text-[#ff4d4f]", bg: "bg-[#ff4d4f]/10" },
  order_revision:   { icon: RefreshCcw,   color: "text-[#c8f230]", bg: "bg-[#c8f230]/10" },
  target_set:       { icon: Target,       color: "text-[#c8f230]", bg: "bg-[#c8f230]/10" },
  target_updated:   { icon: Target,       color: "text-[#ffab00]", bg: "bg-[#ffab00]/10" },
  payment_approved: { icon: CreditCard,   color: "text-[#00c096]", bg: "bg-[#00c096]/10" },
  payment_pending:  { icon: CreditCard,   color: "text-[#ffab00]", bg: "bg-[#ffab00]/10" },
  default:          { icon: Bell,         color: "text-[#8b95a1]", bg: "bg-[#21272f]"    },
};

function NotifIcon({ type }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.default;
  const Icon = cfg.icon;
  return (
    <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={14} className={cfg.color} />
    </div>
  );
}

function safeDistance(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "recently";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "recently";
  }
}

// ── Group notifications by date ───────────────────────────────────────────────
function groupByDate(notifications) {
  const groups = { Today: [], Yesterday: [], Older: [] };
  for (const n of notifications) {
    const d = new Date(n.created);
    if (isToday(d))     groups.Today.push(n);
    else if (isYesterday(d)) groups.Yesterday.push(n);
    else                groups.Older.push(n);
  }
  return groups;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { notifications, unreadCount, load, subscribe, markRead, markAllRead, requestPermission } =
    useNotifications();
  const [open, setOpen]         = useState(false);
  const prevCountRef            = useRef(unreadCount);
  const bellRef                 = useRef(null);

  // Request browser notification permission on mount
  useEffect(() => {
    requestPermission();
  }, []);

  // Load + subscribe on mount
  useEffect(() => {
    if (!user?.id) return;
    load(user.id);
    subscribe(user.id);

    // Refresh every 30s as fallback (realtime handles instant updates)
    const interval = setInterval(() => load(user.id), 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // ── Animate bell when new notification arrives ────────────────────────────
  useEffect(() => {
    if (unreadCount > prevCountRef.current && bellRef.current) {
      bellRef.current.classList.add("animate-bounce");
      setTimeout(() => bellRef.current?.classList.remove("animate-bounce"), 1000);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // ── Auto mark as read when panel is open and user sees notifications ──────
  const handleOpen = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  // ── Mark read on click ────────────────────────────────────────────────────
  const handleNotifClick = useCallback((n) => {
    if (!n.is_read) markRead(n.id);
  }, [markRead]);

  const groups = groupByDate(notifications);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={handleOpen}
        className="relative text-[#8b95a1] hover:text-white transition-colors p-2 rounded-xl hover:bg-[#181c21]"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-[#c8f230] rounded-full flex items-center justify-center text-[9px] font-bold text-[#0a0d0f] animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-[#111418] border border-[#21272f] rounded-2xl shadow-2xl z-50 overflow-hidden"
            style={{ animation: "slideDown 0.15s ease-out" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#21272f]">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-[#c8f230]" />
                <span className="font-semibold text-white text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-[#c8f230] text-[#0a0d0f] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead()}
                    className="flex items-center gap-1 text-xs text-[#8b95a1] hover:text-[#c8f230] transition-colors"
                  >
                    <CheckCheck size={12} />
                    All read
                  </button>
                )}
              </div>
            </div>

            {/* Notification list grouped by date */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-[#8b95a1] text-sm">
                  <Bell size={28} className="mx-auto mb-2 opacity-20" />
                  No notifications yet
                </div>
              ) : (
                Object.entries(groups).map(([label, items]) => {
                  if (items.length === 0) return null;
                  return (
                    <div key={label}>
                      {/* Date group header */}
                      <div className="px-4 py-1.5 bg-[#0a0d0f]/60 border-b border-[#21272f]">
                        <span className="text-[10px] font-bold text-[#4a5568] uppercase tracking-widest">
                          {label}
                        </span>
                      </div>

                      {/* Items */}
                      <div className="divide-y divide-[#21272f]">
                        {items.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotifClick(n)}
                            className={`flex items-start gap-3 px-4 py-3 hover:bg-[#181c21] cursor-pointer transition-colors ${
                              !n.is_read ? "bg-[#c8f230]/5" : ""
                            }`}
                          >
                            <NotifIcon type={n.type} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium leading-tight ${
                                !n.is_read ? "text-white" : "text-[#c2cad4]"
                              }`}>
                                {n.title}
                              </p>
                              <p className="text-xs text-[#8b95a1] mt-0.5 leading-relaxed line-clamp-2">
                                {n.body}
                              </p>
                              <p className="text-[10px] text-[#4a5568] mt-1 font-mono">
                                {safeDistance(n.created)}
                              </p>
                            </div>
                            {!n.is_read && (
                              <div className="w-2 h-2 rounded-full bg-[#c8f230] flex-shrink-0 mt-1.5 animate-pulse" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[#21272f] text-center">
                <p className="text-[10px] text-[#4a5568]">
                  {unreadCount > 0
                    ? `${unreadCount} unread · tap to mark as read`
                    : `All caught up · ${notifications.length} notifications`}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Slide-down animation */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}