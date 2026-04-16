import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { Eye, EyeOff, Navigation, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [show,     setShow]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome, ${user.name.split(" ")[0]}!`);
      navigate("/dashboard");
    } catch {
      toast.error("Wrong email or password");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#0a0d0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#c8f230 1px, transparent 1px), linear-gradient(90deg, #c8f230 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#c8f230]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative animate-slide-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#c8f230] mb-5 shadow-lg shadow-[#c8f230]/25">
            <Navigation size={30} className="text-[#0a0d0f]" />
          </div>
          <h1 className="font-display font-extrabold text-4xl text-white leading-none">FieldTrack</h1>
          <p className="text-[#8b95a1] text-sm mt-2 font-mono tracking-widest uppercase">East Africa · Field Ops</p>
        </div>

        <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-7 shadow-2xl">
          <p className="text-[#8b95a1] text-sm mb-6">Sign in to your workspace</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@fieldteam.co.ke" autoComplete="email"
                className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">Password</label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors" />
                <button type="button" onClick={() => setShow(!show)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b95a1] hover:text-white">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#c8f230] hover:bg-[#d9ff50] disabled:opacity-50 text-[#0a0d0f] font-bold py-3.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 mt-2 text-sm">
              {loading
                ? <span className="w-4 h-4 border-2 border-[#0a0d0f]/30 border-t-[#0a0d0f] rounded-full animate-spin" />
                : <><ArrowRight size={16} /> Sign In</>}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-[#3d4550] mt-6 font-mono">FieldTrack v3 · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
