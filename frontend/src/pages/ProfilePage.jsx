import React, { useState } from "react";
import { useAuth } from "../store/auth";
import { pb } from "../lib/pb";
import { useTheme } from "../store/theme";
import ChangePasswordModal from "../components/ChangePasswordModal";
import {
  User, Mail, Phone, MapPin, Briefcase, Hash,
  KeyRound, Shield, Calendar, Pencil, Check, X,
} from "lucide-react";
import toast from "react-hot-toast";

const COUNTIES = ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Thika","Malindi","Kitale","Garissa","Kakamega","Nyeri","Meru","Machakos","Kisii","Lamu","Other"];
const ROLE_COLORS = {
  admin:       "bg-[#c8f230]/10 text-[#c8f230] border-[#c8f230]/20",
  manager:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
  supervisor:  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  field_staff: "bg-[#8b95a1]/10 text-[#8b95a1] border-[#8b95a1]/20",
};

export default function ProfilePage() {
  const { user, update } = useAuth();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [showPw,   setShowPw]   = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({
    name:       user?.name       ?? "",
    phone:      user?.phone      ?? "",
    county:     user?.county     ?? "",
    department: user?.department ?? "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      const updated = await pb.collection("ft_users").update(user.id, {
        name:       form.name,
        phone:      form.phone,
        county:     form.county,
        department: form.department,
      });
      update(updated);
      setEditing(false);
      toast.success("Profile updated");
    } catch (e) {
      toast.error("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setForm({
      name:       user?.name       ?? "",
      phone:      user?.phone      ?? "",
      county:     user?.county     ?? "",
      department: user?.department ?? "",
    });
    setEditing(false);
  };

  // theme-aware classes
  const cardBg   = isLight ? "bg-white border-[#e4e4e7]"      : "bg-[#111418] border-[#21272f]";
  const pageBg   = isLight ? "bg-[#f4f4f5]"                   : "bg-[#0a0d0f]";
  const labelCls = isLight ? "text-[#71717a]"                 : "text-[#8b95a1]";
  const valueCls = isLight ? "text-[#18181b]"                 : "text-white";
  const divider  = isLight ? "border-[#e4e4e7]"               : "border-[#21272f]";
  const inputCls = isLight
    ? "bg-[#f4f4f5] border-[#e4e4e7] text-[#18181b] focus:border-[#c8f230]"
    : "bg-[#0a0d0f] border-[#21272f] text-white focus:border-[#c8f230]";

  const joined = user?.created
    ? new Date(user.created).toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const roleColor = ROLE_COLORS[user?.role] ?? ROLE_COLORS.field_staff;

  return (
    <div className={`min-h-full ${pageBg} p-5 pb-10`}>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Header card ── */}
        <div className={`rounded-2xl border ${cardBg} overflow-hidden`}>
          {/* accent bar */}
          <div className="h-2 bg-gradient-to-r from-[#c8f230] via-[#a8d010] to-[#c8f230]/30" />

          <div className="p-6 flex items-center gap-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-[#c8f230]/15 border-2 border-[#c8f230]/30 flex items-center justify-center text-3xl font-bold text-[#c8f230]">
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className={`absolute -bottom-1 -right-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${roleColor}`}>
                {user?.role?.replace("_", " ")}
              </span>
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <h1 className={`font-display font-bold text-2xl leading-tight ${valueCls}`}>{user?.name}</h1>
              <p className={`text-sm mt-0.5 ${labelCls}`}>{user?.email}</p>
              <div className={`flex items-center gap-1.5 mt-2 text-xs ${labelCls}`}>
                <Calendar size={12} />
                <span>Joined {joined}</span>
              </div>
            </div>

            {/* Edit / Save buttons */}
            <div className="flex gap-2 flex-shrink-0">
              {editing ? (
                <>
                  <button onClick={cancelEdit}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${isLight ? "border-[#e4e4e7] text-[#71717a] hover:text-[#18181b]" : "border-[#21272f] text-[#8b95a1] hover:text-white"}`}>
                    <X size={15} />
                  </button>
                  <button onClick={saveProfile} disabled={saving}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#c8f230] text-[#0a0d0f] hover:bg-[#d9ff50] transition-colors disabled:opacity-50">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-[#0a0d0f]/30 border-t-[#0a0d0f] rounded-full animate-spin" />
                      : <Check size={15} />}
                  </button>
                </>
              ) : (
                <button onClick={() => setEditing(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${isLight ? "border-[#e4e4e7] text-[#52525b] hover:text-[#18181b] hover:border-[#c8f230]" : "border-[#21272f] text-[#8b95a1] hover:text-white hover:border-[#c8f230]/40"}`}>
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Details card ── */}
        <div className={`rounded-2xl border ${cardBg} p-6 space-y-5`}>
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${labelCls}`}>Profile Details</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Name */}
            <Field icon={User} label="Full Name" editing={editing}
              value={form.name} onChange={v => set("name", v)}
              display={user?.name} inputCls={inputCls} labelCls={labelCls} valueCls={valueCls} />

            {/* Employee ID — read-only */}
            <Field icon={Hash} label="Employee ID"
              display={user?.employee_id || "—"}
              labelCls={labelCls} valueCls={valueCls} />

            {/* Email — read-only */}
            <Field icon={Mail} label="Email"
              display={user?.email}
              labelCls={labelCls} valueCls={valueCls} />

            {/* Phone */}
            <Field icon={Phone} label="Phone" editing={editing}
              value={form.phone} onChange={v => set("phone", v)}
              display={user?.phone || "—"} inputCls={inputCls} labelCls={labelCls} valueCls={valueCls} />

            {/* County */}
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <label className={`flex items-center gap-1.5 text-xs font-medium ${labelCls}`}>
                  <MapPin size={12} /> County
                </label>
                <select value={form.county} onChange={e => set("county", e.target.value)}
                  className={`rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${inputCls}`}>
                  <option value="">Select county</option>
                  {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ) : (
              <Field icon={MapPin} label="County"
                display={user?.county || "—"}
                labelCls={labelCls} valueCls={valueCls} />
            )}

            {/* Department */}
            <Field icon={Briefcase} label="Department" editing={editing}
              value={form.department} onChange={v => set("department", v)}
              display={user?.department || "—"} inputCls={inputCls} labelCls={labelCls} valueCls={valueCls} />

            {/* Role — read-only */}
            <Field icon={Shield} label="Role"
              display={user?.role?.replace("_", " ")}
              labelCls={labelCls} valueCls={`capitalize ${valueCls}`} />

          </div>
        </div>

        {/* ── Security card ── */}
        <div className={`rounded-2xl border ${cardBg} p-6`}>
          <h2 className={`text-xs font-semibold uppercase tracking-widest ${labelCls} mb-4`}>Security</h2>
          <div className={`flex items-center justify-between py-3 border-b ${divider}`}>
            <div>
              <p className={`text-sm font-medium ${valueCls}`}>Password</p>
              <p className={`text-xs mt-0.5 ${labelCls}`}>Change your login password</p>
            </div>
            <button
              onClick={() => setShowPw(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 text-[#c8f230] text-sm font-medium hover:bg-[#c8f230]/20 transition-colors"
            >
              <KeyRound size={14} />
              Change Password
            </button>
          </div>
          <div className="flex items-center justify-between pt-3">
            <div>
              <p className={`text-sm font-medium ${valueCls}`}>Account Status</p>
              <p className={`text-xs mt-0.5 ${labelCls}`}>Your current account status</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full border capitalize ${
              user?.status === "active"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}>
              {user?.status ?? "active"}
            </span>
          </div>
        </div>

      </div>

      <ChangePasswordModal open={showPw} onClose={() => setShowPw(false)} />
    </div>
  );
}

// ── Helper sub-component ──────────────────────────────────────────────────────
function Field({ icon: Icon, label, display, editing, value, onChange, inputCls, labelCls, valueCls }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`flex items-center gap-1.5 text-xs font-medium ${labelCls}`}>
        <Icon size={12} /> {label}
      </label>
      {editing && onChange ? (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors ${inputCls}`}
        />
      ) : (
        <p className={`text-sm ${valueCls}`}>{display}</p>
      )}
    </div>
  );
}