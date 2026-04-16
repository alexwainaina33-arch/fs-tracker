import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../../lib/pb";
import { useAuth } from "../../store/auth";
import { Modal } from "../../components/ui/Modal";
import { Btn } from "../../components/ui/Btn";
import { Badge } from "../../components/ui/Badge";
import { Input, Select } from "../../components/ui/Input";
import { Plus, Search, Users } from "lucide-react";
import toast from "react-hot-toast";

const ROLES    = ["field_staff","supervisor","manager","admin"];
const STATUSES = ["active","on_leave","suspended","inactive"];
const EA_CODES = ["+254","+255","+256","+250","+257","+211"];
const COUNTIES = ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Thika","Malindi","Kitale","Garissa","Kakamega","Nyeri","Meru","Machakos","Kisii","Lamu","Other"];

export default function TeamPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search,     setSearch]     = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const blank = { name:"", email:"", password:"", employee_id:"", phone:"", phoneCode:"+254", role:"field_staff", county:"", department:"" };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data } = useQuery({
    queryKey: ["team", search],
    queryFn:  () => pb.collection("ft_users").getList(1, 200, {
      filter: search ? `name ~ "${search}" || email ~ "${search}"` : "",
      sort: "name",
    }),
    refetchInterval: 30000,
  });

  const createMut = useMutation({
    mutationFn: (d) => pb.collection("ft_users").create({
      name: d.name, email: d.email,
      password: d.password, passwordConfirm: d.password,
      employee_id: d.employee_id,
      phone: d.phoneCode + d.phone,
      role: d.role, county: d.county,
      department: d.department, status: "active",
    }),
    onSuccess: () => { qc.invalidateQueries(["team"]); setShowCreate(false); setForm(blank); toast.success("Team member added!"); },
    onError:   (e) => toast.error("Failed: " + e.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => pb.collection("ft_users").update(id, { status }),
    onSuccess:  () => { qc.invalidateQueries(["team"]); toast.success("Status updated"); },
  });

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2"><Users size={20} className="text-[#c8f230]" /> Team</h1>
          <p className="text-[#8b95a1] text-sm">{data?.totalItems ?? 0} members</p>
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={16} /> Add Member</Btn>
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8b95a1]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…"
          className="w-full bg-[#111418] border border-[#21272f] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[#3d4550] outline-none focus:border-[#c8f230] transition-colors" />
      </div>

      <div className="bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#21272f] text-[#8b95a1] text-xs uppercase tracking-wider">
                {["Name","Role","County","Phone","Status","Action"].map(h => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21272f]">
              {data?.items.map(m => (
                <tr key={m.id} className="hover:bg-[#181c21] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-sm font-bold text-[#c8f230] flex-shrink-0">
                        {m.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-medium text-white">{m.name}</p>
                        <p className="text-xs text-[#8b95a1]">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><Badge label={m.role || "field_staff"} color={m.role === "admin" ? "lime" : m.role === "manager" ? "warn" : "default"} /></td>
                  <td className="px-5 py-4 text-[#8b95a1]">{m.county || "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs text-[#8b95a1]">{m.phone || "—"}</td>
                  <td className="px-5 py-4"><Badge label={m.status || "active"} color={m.status === "active" ? "ok" : m.status === "suspended" ? "danger" : "default"} /></td>
                  <td className="px-5 py-4">
                    {m.id !== user.id && (
                      <select value={m.status || "active"} onChange={e => updateStatus.mutate({ id: m.id, status: e.target.value })}
                        className="bg-[#0a0d0f] border border-[#21272f] rounded-lg px-2 py-1 text-xs text-white outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
              {!data?.items.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-[#8b95a1]">No team members yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Team Member" width="max-w-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name *"  placeholder="Jane Wanjiku" value={form.name}        onChange={e => set("name", e.target.value)} />
            <Input label="Employee ID"  placeholder="EMP-001"      value={form.employee_id} onChange={e => set("employee_id", e.target.value)} />
          </div>
          <Input label="Email *" type="email" placeholder="jane@company.co.ke" value={form.email} onChange={e => set("email", e.target.value)} />
          <Input label="Password *" type="password" placeholder="min 8 characters" value={form.password} onChange={e => set("password", e.target.value)} />
          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">Phone</label>
            <div className="flex gap-2">
              <select value={form.phoneCode} onChange={e => set("phoneCode", e.target.value)}
                className="bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-[#c8f230] w-24">
                {EA_CODES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="7XX XXX XXX" type="tel"
                className="flex-1 bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c8f230]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Role" value={form.role} onChange={e => set("role", e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r.replace("_"," ")}</option>)}
            </Select>
            <Select label="County" value={form.county} onChange={e => set("county", e.target.value)}>
              <option value="">Select county</option>
              {COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input label="Department" placeholder="Sales / Operations" value={form.department} onChange={e => set("department", e.target.value)} />
        </div>
        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn onClick={() => createMut.mutate(form)} disabled={!form.name || !form.email || !form.password || createMut.isPending} className="flex-1">
            {createMut.isPending ? "Adding…" : "Add Member"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
