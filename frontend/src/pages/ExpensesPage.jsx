import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb, fileUrl } from "../lib/pb";
import { useAuth } from "../store/auth";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import { Plus, Camera, Receipt, Check, X } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

const TYPES  = ["fuel","transport","meals","accommodation","airtime","parking","client_entertainment","materials","other"];
const CURRS  = ["KES","UGX","TZS","RWF","USD"];
const STATUS_COLOR = { pending:"warn", approved:"ok", rejected:"danger", paid:"lime" };

export default function ExpensesPage() {
  const { user } = useAuth();
  const qc      = useQueryClient();
  const isAdmin = ["admin","manager"].includes(user?.role);
  const [showCreate,    setShowCreate]    = useState(false);
  const [camOpen,       setCamOpen]       = useState(false);
  const [receiptPhoto,  setReceiptPhoto]  = useState(null);

  const blank = { expense_type:"fuel", description:"", amount:"", currency:"KES", expense_date: format(new Date(),"yyyy-MM-dd") };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data } = useQuery({
    queryKey: ["expenses", user.id, isAdmin],
    queryFn:  () => pb.collection("ft_expenses").getList(1, 100, {
      filter: isAdmin ? "" : `submitted_by = "${user.id}"`,
      sort: "-created", expand: "submitted_by,approved_by",
    }),
    refetchInterval: 30000,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("submitted_by", user.id);
      fd.append("status", "pending");
      if (receiptPhoto?.blob) fd.append("receipts", receiptPhoto.blob, `receipt-${Date.now()}.jpg`);
      return pb.collection("ft_expenses").create(fd);
    },
    onSuccess: () => { qc.invalidateQueries(["expenses"]); setShowCreate(false); setForm(blank); setReceiptPhoto(null); toast.success("Claim submitted!"); },
    onError:   () => toast.error("Failed to submit"),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, status }) => pb.collection("ft_expenses").update(id, { status, approved_by: user.id }),
    onSuccess:  () => { qc.invalidateQueries(["expenses"]); toast.success("Updated!"); },
  });

  const totalPending = data?.items.filter(e => e.status === "pending").reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Expenses</h1>
          {isAdmin && totalPending > 0 && <p className="text-[#ffab00] text-sm mt-0.5">KES {totalPending.toLocaleString()} pending</p>}
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={16} /> Claim Expense</Btn>
      </div>

      <div className="space-y-3">
        {data?.items.map(e => (
          <div key={e.id} className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2a3040] transition-colors card-lift">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-[#0a0d0f] border border-[#21272f] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {e.receipts
                  ? <img src={fileUrl(e, Array.isArray(e.receipts) ? e.receipts[0] : e.receipts, "200x200")} alt="receipt" className="w-full h-full object-cover" />
                  : <Receipt size={22} className="text-[#21272f]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge label={e.expense_type} />
                  <Badge label={e.status} color={STATUS_COLOR[e.status] ?? "default"} />
                  <span className="font-mono font-bold text-white">{e.currency} {Number(e.amount).toLocaleString()}</span>
                </div>
                {e.description && <p className="text-sm text-[#8b95a1] truncate">{e.description}</p>}
                <div className="flex items-center gap-4 mt-1.5 text-xs text-[#8b95a1]">
                  <span>{format(new Date(e.expense_date ?? e.created), "dd MMM yyyy")}</span>
                  {e.expand?.submitted_by && <span>by {e.expand.submitted_by.name}</span>}
                </div>
              </div>
              {isAdmin && e.status === "pending" && (
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => approveMut.mutate({ id: e.id, status: "approved" })}
                    className="w-9 h-9 rounded-xl bg-[#00c096]/10 border border-[#00c096]/20 flex items-center justify-center text-[#00c096] hover:bg-[#00c096]/20 transition-colors">
                    <Check size={16} />
                  </button>
                  <button onClick={() => approveMut.mutate({ id: e.id, status: "rejected" })}
                    className="w-9 h-9 rounded-xl bg-[#ff4d4f]/10 border border-[#ff4d4f]/20 flex items-center justify-center text-[#ff4d4f] hover:bg-[#ff4d4f]/20 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!data?.items.length && (
          <div className="text-center py-16 text-[#8b95a1]">
            <Receipt size={48} className="mx-auto mb-3 opacity-20" /> No expense claims yet
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Submit Expense">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.expense_type} onChange={e => set("expense_type", e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
            </Select>
            <Select label="Currency" value={form.currency} onChange={e => set("currency", e.target.value)}>
              {CURRS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input label="Amount *" type="number" placeholder="1500" value={form.amount} onChange={e => set("amount", e.target.value)} />
          <Input label="Date" type="date" value={form.expense_date} onChange={e => set("expense_date", e.target.value)} />
          <Textarea label="Description" placeholder="Fuel Nakuru–Nairobi" rows={2} value={form.description} onChange={e => set("description", e.target.value)} />
          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Receipt Photo</label>
            {receiptPhoto ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-[#21272f]">
                <img src={receiptPhoto.dataUrl} alt="receipt" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-1 font-mono text-[10px] text-[#c8f230]">
                  {receiptPhoto.timestamp ? format(new Date(receiptPhoto.timestamp), "dd MMM yyyy HH:mm:ss") : ""} · timestamped
                </div>
                <button onClick={() => setReceiptPhoto(null)}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setCamOpen(true)}
                className="w-full h-28 rounded-xl border border-dashed border-[#21272f] hover:border-[#c8f230]/50 flex flex-col items-center justify-center gap-2 text-[#8b95a1] hover:text-[#c8f230] transition-colors">
                <Camera size={24} /><span className="text-sm">Tap to photograph receipt</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn onClick={() => createMut.mutate()} disabled={!form.amount || createMut.isPending} className="flex-1">
            {createMut.isPending ? "Submitting…" : "Submit Claim"}
          </Btn>
        </div>
      </Modal>

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)}
        onCapture={(p) => { setReceiptPhoto(p); setCamOpen(false); }}
        title="Photograph Receipt" facingMode="environment" />
    </div>
  );
}
