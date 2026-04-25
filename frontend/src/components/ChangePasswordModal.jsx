import React, { useState } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { Modal } from "./ui/Modal";
import { Btn } from "./ui/Btn";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

/**
 * ChangePasswordModal
 *
 * Props:
 *   open      {boolean}  – controls visibility
 *   onClose   {fn}       – called when modal should close
 *   targetUser {object}  – if set, admin is resetting ANOTHER user's password
 *                          expects { id, name, email }
 *                          if null/undefined → user is changing their OWN password
 */
export default function ChangePasswordModal({ open, onClose, targetUser = null }) {
  const { user: me } = useAuth();

  const isSelfChange = !targetUser || targetUser.id === me?.id;

  const blank = { current: "", next: "", confirm: "" };
  const [form, setForm]       = useState(blank);
  const [show, setShow]       = useState({ current: false, next: false, confirm: false });
  const [loading, setLoading] = useState(false);

  const toggle = (field) => setShow(p => ({ ...p, [field]: !p[field] }));
  const set    = (k, v)  => setForm(p => ({ ...p, [k]: v }));

  const strength = (() => {
    const p = form.next;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)              s++;
    if (/[A-Z]/.test(p))           s++;
    if (/[0-9]/.test(p))           s++;
    if (/[^A-Za-z0-9]/.test(p))    s++;
    return s;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#3b82f6", "#c8f230"][strength];

  const handleClose = () => {
    setForm(blank);
    setShow({ current: false, next: false, confirm: false });
    onClose();
  };

  const submit = async () => {
    if (form.next.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (form.next !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      if (isSelfChange) {
        // User changing their own password — PocketBase requires old password
        await pb.collection("ft_users").update(me.id, {
          oldPassword:     form.current,
          password:        form.next,
          passwordConfirm: form.confirm,
        });
        toast.success("Password changed — please sign in again");
        // PB invalidates the session after a password change
        pb.authStore.clear();
        window.location.href = "/";
      } else {
        // Admin resetting another user's password — no old password needed
        await pb.collection("ft_users").update(targetUser.id, {
          password:        form.next,
          passwordConfirm: form.confirm,
        });
        toast.success(`Password reset for ${targetUser.name}`);
        handleClose();
      }
    } catch (err) {
      const msg = err?.response?.data?.oldPassword?.message
        ?? err?.message
        ?? "Failed to update password";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = isSelfChange
    ? form.current && form.next && form.confirm && !loading
    : form.next && form.confirm && !loading;

  const PasswordField = ({ label, field, placeholder }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">{label}</label>
      <div className="relative">
        <input
          type={show[field] ? "text" : "password"}
          value={form[field]}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors"
        />
        <button
          type="button"
          onClick={() => toggle(field)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b95a1] hover:text-white transition-colors"
        >
          {show[field] ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isSelfChange ? "Change Password" : `Reset Password — ${targetUser?.name}`}
      width="max-w-md"
    >
      <div className="space-y-4">
        {/* Context banner */}
        <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
          isSelfChange
            ? "bg-[#c8f230]/5 border border-[#c8f230]/20 text-[#c8f230]"
            : "bg-amber-500/5 border border-amber-500/20 text-amber-400"
        }`}>
          {isSelfChange
            ? <Lock size={15} className="mt-0.5 flex-shrink-0" />
            : <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" />}
          <span>
            {isSelfChange
              ? "You'll be signed out after changing your password."
              : `You are resetting the password for ${targetUser?.email}. They will need to use the new password on their next sign-in.`}
          </span>
        </div>

        {/* Old password — only for self-change */}
        {isSelfChange && (
          <PasswordField label="Current Password" field="current" placeholder="Your current password" />
        )}

        {/* New password */}
        <PasswordField label="New Password" field="next" placeholder="min 8 characters" />

        {/* Strength bar */}
        {form.next && (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {[1,2,3,4].map(i => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{ background: i <= strength ? strengthColor : "#21272f" }}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: strengthColor }}>{strengthLabel}</p>
          </div>
        )}

        {/* Confirm */}
        <PasswordField label="Confirm New Password" field="confirm" placeholder="Repeat new password" />

        {/* Match indicator */}
        {form.confirm && (
          <p className={`text-xs ${form.next === form.confirm ? "text-[#c8f230]" : "text-red-400"}`}>
            {form.next === form.confirm ? "✓ Passwords match" : "✗ Passwords do not match"}
          </p>
        )}
      </div>

      <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
        <Btn variant="ghost" onClick={handleClose} className="flex-1">Cancel</Btn>
        <Btn onClick={submit} disabled={!canSubmit} className="flex-1">
          {loading
            ? <span className="w-4 h-4 border-2 border-[#0a0d0f]/30 border-t-[#0a0d0f] rounded-full animate-spin" />
            : isSelfChange ? "Change Password" : "Reset Password"}
        </Btn>
      </div>
    </Modal>
  );
}