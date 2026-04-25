// src/components/Layout.jsx
import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useGPS } from "../hooks/useGPS";
import { useTheme } from "../store/theme";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import OfflineBanner from "./OfflineBanner";
import NotificationBell from "./NotificationBell";
import PWAManager from "./PWAManager";
import {
  LayoutDashboard, Map, CheckSquare, Clock, Receipt,
  FileText, Users, LogOut, Menu, X,
  Navigation, AlertOctagon, Shield,
  ShoppingCart, CheckCircle, Trophy, Target,
  Sprout, BarChart2, Sun, Moon, CreditCard,
} from "lucide-react";

const NAV_ADMIN = [
  { to: "/dashboard",         icon: LayoutDashboard, label: "Dashboard"      },
  { to: "/map",               icon: Map,             label: "Live Map"       },
  { to: "/team-summary",      icon: Users,           label: "Team Summary"   },
  { to: "/tasks",             icon: CheckSquare,     label: "Tasks"          },
  { to: "/attendance",        icon: Clock,           label: "Attendance"     },
  { to: "/expenses",          icon: Receipt,         label: "Expenses"       },
  { to: "/orders",            icon: ShoppingCart,    label: "Orders"         },
  { to: "/farmer-visits",     icon: Sprout,          label: "Farmer Visits"  },
  { to: "/approvals",         icon: CheckCircle,     label: "Approvals"      },
  { to: "/payment-approvals", icon: CreditCard,      label: "Pmnt Approvals" },
  { to: "/targets",           icon: Target,          label: "Targets"        },
  { to: "/leaderboard",       icon: Trophy,          label: "Leaderboard"    },
  { to: "/reports",           icon: FileText,        label: "Reports"        },
  { to: "/advanced-reports",  icon: BarChart2,       label: "Adv. Reports"   },
  { to: "/team",              icon: Users,           label: "Team"           },
  { to: "/geofences",         icon: Shield,          label: "Geofences"      },
];

const NAV_FIELD = [
  { to: "/dashboard",     icon: LayoutDashboard, label: "Dashboard"     },
  { to: "/tasks",         icon: CheckSquare,     label: "My Tasks"      },
  { to: "/attendance",    icon: Clock,           label: "Attendance"    },
  { to: "/expenses",      icon: Receipt,         label: "Expenses"      },
  { to: "/orders",        icon: ShoppingCart,    label: "Orders"        },
  { to: "/farmer-visits", icon: Sprout,          label: "Farmer Visits" },
  { to: "/leaderboard",   icon: Trophy,          label: "Leaderboard"   },
  { to: "/reports",       icon: FileText,        label: "Reports"       },
];

export default function Layout() {
  const { user, logout }                    = useAuth();
  const { tracking, position, start, stop } = useGPS();
  const { theme, toggle, init }             = useTheme();
  const navigate                            = useNavigate();
  const location                            = useLocation();
  const [open, setOpen]                     = useState(false);

  useEffect(() => { init(); }, []);
  useRealtimeSync();

  const isAdmin   = ["admin","manager","supervisor"].includes(user?.role);
  const navItems  = isAdmin ? NAV_ADMIN : NAV_FIELD;
  const allNav    = [...NAV_ADMIN, ...NAV_FIELD];
  const isLight   = theme === "light";
  const isMapPage = location.pathname === "/map";

  const sidebarBg    = isLight ? "bg-white border-[#e4e4e7]"   : "bg-[#0a0d0f] border-[#21272f]";
  const headerBg     = isLight ? "bg-white border-[#e4e4e7]"   : "bg-[#0a0d0f] border-[#21272f]";
  const logoText     = isLight ? "text-[#18181b]"               : "text-white";
  const subText      = isLight ? "text-[#71717a]"               : "text-[#8b95a1]";
  const headerTitle  = isLight ? "text-[#18181b]"               : "text-white";
  const toggleBg     = isLight ? "bg-[#f4f4f5] text-[#52525b] hover:text-[#18181b]" : "bg-[#21272f] text-[#8b95a1] hover:text-white";
  const dividerColor = isLight ? "border-[#e4e4e7]"             : "border-[#21272f]";
  const userNameCls  = isLight ? "text-[#18181b]"               : "text-white";
  const logoutCls    = isLight ? "text-[#71717a] hover:text-[#ff4d4f]" : "text-[#8b95a1] hover:text-[#ff4d4f]";
  const menuBtnCls   = isLight ? "text-[#71717a] hover:text-[#18181b]" : "text-[#8b95a1] hover:text-white";
  const navActive    = isLight ? "bg-[#f0ffd0] text-[#4a6000] font-medium" : "bg-[#c8f230]/10 text-[#c8f230] font-medium";
  const navInactive  = isLight ? "text-[#52525b] hover:text-[#18181b] hover:bg-[#f4f4f5]" : "text-[#8b95a1] hover:text-[#c2cad4] hover:bg-[#181c21]";
  const gpsBg        = tracking
    ? "bg-[#c8f230]/10 text-[#c8f230] border border-[#c8f230]/20"
    : isLight ? "bg-[#f4f4f5] text-[#71717a] border border-[#e4e4e7]" : "bg-[#21272f] text-[#8b95a1]";
  const avatarBg     = isLight ? "bg-[#f0ffd0] border-[#c8f230]/50 text-[#4a6000]" : "bg-[#c8f230]/15 border-[#c8f230]/30 text-[#c8f230]";

  return (
    <div className={`flex h-full overflow-hidden ${isLight ? "bg-[#f4f4f5]" : "bg-[#0a0d0f]"}`}>
      <OfflineBanner />
      <PWAManager />

      {/* ── SIDEBAR ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-[700] w-56 flex flex-col border-r
        transition-transform duration-300 ease-out
        ${sidebarBg}
        ${open ? "translate-x-0" : "-translate-x-full"}
        lg:relative lg:translate-x-0
      `}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 h-16 border-b ${dividerColor} flex-shrink-0`}>
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-lg bg-[#c8f230] opacity-20 blur-sm" />
            <div className="relative w-8 h-8 rounded-lg bg-[#c8f230] flex items-center justify-center">
              <Navigation size={16} className="text-[#0a0d0f]" />
            </div>
          </div>
          <div className="flex-1">
            <span className={`font-display font-bold text-base leading-none ${logoText}`}>FieldTrack</span>
            <p className={`text-[9px] uppercase tracking-widest leading-none mt-0.5 ${subText}`}>Kenya</p>
          </div>
          <button onClick={() => setOpen(false)} className={`lg:hidden ${subText}`}><X size={18} /></button>
        </div>

        {/* GPS toggle */}
        <div className={`px-3 py-2 border-b ${dividerColor}`}>
          <button onClick={tracking ? stop : start}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${gpsBg}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tracking ? "bg-[#c8f230] animate-pulse" : isLight ? "bg-[#a1a1aa]" : "bg-[#8b95a1]"}`} />
            {tracking ? "GPS Active" : "GPS Off"}
            {tracking && position && (
              <span className="ml-auto font-mono text-[10px] opacity-60">±{Math.round(position.accuracy)}m</span>
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${isActive ? navActive : navInactive}`
              }>
              <Icon size={16} className="flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className={`px-3 py-3 border-t ${dividerColor}`}>
          <div className="flex items-center gap-3 px-3 py-2">
            <button onClick={() => { navigate("/profile"); setOpen(false); }}
              title="My profile"
              className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 transition-opacity hover:opacity-75 ${avatarBg}`}>
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </button>
            <div className="flex-1 min-w-0">
              <button onClick={() => { navigate("/profile"); setOpen(false); }}
                className={`text-xs font-medium truncate block hover:underline text-left w-full ${userNameCls}`}>
                {user?.name}
              </button>
              <p className={`text-[10px] capitalize ${subText}`}>{user?.role?.replace("_"," ")}</p>
            </div>
            <button onClick={() => { logout(); navigate("/login"); }} title="Logout"
              className={`transition-colors ${logoutCls}`}>
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop */}
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 z-[650] bg-black/60 lg:hidden" />}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className={`flex items-center gap-3 px-4 h-16 border-b flex-shrink-0 relative z-[600] ${headerBg}`}>
          <button onClick={() => setOpen(true)} className={`lg:hidden p-1.5 ${menuBtnCls}`}>
            <Menu size={20} />
          </button>
          <h1 className={`font-display font-bold text-base ${headerTitle}`}>
            {allNav.find(n => location.pathname.startsWith(n.to))?.label ?? "FieldTrack"}
          </h1>
          <div className="flex-1" />
          {user?.role === "field_staff" && (
            <button onClick={() => navigate("/sos")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ff4d4f]/15 border border-[#ff4d4f]/30 text-[#ff4d4f] text-xs font-bold hover:bg-[#ff4d4f]/25 transition-colors">
              <AlertOctagon size={14} className="animate-pulse" />
              SOS
            </button>
          )}
          <button onClick={toggle} title={isLight ? "Dark mode" : "Light mode"}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${toggleBg}`}>
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <NotificationBell />
          {/* ── Profile avatar ── */}
          <button
            onClick={() => navigate("/profile")}
            title="My profile"
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-opacity hover:opacity-75"
            style={{ background: isLight ? "#f0ffd0" : "rgba(200,242,48,0.15)", border: `1px solid ${isLight ? "rgba(200,242,48,0.5)" : "rgba(200,242,48,0.3)"}`, color: isLight ? "#4a6000" : "#c8f230" }}>
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </button>
        </header>

        <main className={`flex-1 ${isMapPage ? "overflow-hidden" : "overflow-y-auto"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}