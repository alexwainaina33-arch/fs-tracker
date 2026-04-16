import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import { Plus, Camera, FileText, X, ImageIcon } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

const TYPES = ["daily_activity","client_visit","sales_report","market_survey","incident","competitor_report","weekly_summary","custom"];
const STATUS_COLOR = { draft:"default", submitted:"blue", reviewed:"warn", approved:"ok" };

export default function ReportsPage() {
  const { user } = useAuth();
  const qc      = useQueryClient();
  const isAdmin = ["admin","manager","supervisor"].includes(user?.role);
  const [showCreate, setShowCreate] = useState(false);
  const [camOpen,    setCamOpen]    = useState(false);
  const [photos,     setPhotos]     = useState([]);

  const blank = { title:"", report_type:"daily_activity", report_date: format(new Date(),"yyyy-MM-dd"), location:"", summary:"", highlights:"", challenges:"" };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data } = useQuery({
    queryKey: ["reports", user.id, isAdmin],
    queryFn:  () => pb.collection("ft_reports").getList(1, 100, {
      filter: isAdmin ? "" : `submitted_by = "${user.id}"`,
      sort: "-created", expand: "submitted_by",
    }),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append("submitted_by", user.id);
      fd.append("title",        form.title);
      fd.append("report_type",  form.report_type);
      fd.append("report_date",  form.report_date);
      fd.append("location",     form.location);
      fd.append("status",       "submitted");
      fd.append("content",      JSON.stringify({ summary: form.summary, highlights: form.highlights, challenges: form.challenges }));
      photos.forEach((p, i) => { if (p?.blob) fd.append("attachments", p.blob, `photo-${i}-${Date.now()}.jpg`); });
      return pb.collection("ft_reports").create(fd);
    },
    onSuccess: () => { qc.invalidateQueries(["reports"]); setShowCreate(false); setForm(blank); setPhotos([]); toast.success("Report submitted!"); },
    onError:   () => toast.error("Submission failed"),
  });

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Reports</h1>
          <p className="text-[#8b95a1] text-sm">{data?.totalItems ?? 0} reports</p>
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={16} /> New Report</Btn>
      </div>

      <div className="space-y-3">
        {data?.items.map(r => {
          const content = typeof r.content === "string" ? JSON.parse(r.content || "{}") : (r.content ?? {});
          return (
            <div key={r.id} className="bg-[#111418] border border-[#21272f] rounded-2xl p-5 hover:border-[#2a3040] transition-colors card-lift">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-[#c8f230]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-white">{r.title}</h3>
                    <Badge label={r.status} color={STATUS_COLOR[r.status] ?? "default"} />
                    <Badge label={r.report_type} />
                  </div>
                  {content.summary && <p className="text-sm text-[#8b95a1] line-clamp-2">{content.summary}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-[#8b95a1]">
                    <span>{format(new Date(r.report_date ?? r.created), "dd MMM yyyy")}</span>
                    {r.location && <span>📍 {r.location}</span>}
                    {r.expand?.submitted_by && <span>by {r.expand.submitted_by.name}</span>}
                    {r.attachments?.length > 0 && <span className="flex items-center gap-1"><ImageIcon size={11} /> {r.attachments.length} photos</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {!data?.items.length && (
          <div className="text-center py-16 text-[#8b95a1]">
            <FileText size={48} className="mx-auto mb-3 opacity-20" /> No reports yet
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Report" width="max-w-xl">
        <div className="space-y-4">
          <Input label="Title *" placeholder="Daily Activity Report — Nakuru" value={form.title} onChange={e => set("title", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.report_type} onChange={e => set("report_type", e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g," ")}</option>)}
            </Select>
            <Input label="Date" type="date" value={form.report_date} onChange={e => set("report_date", e.target.value)} />
          </div>
          <Input label="Location" placeholder="Nakuru County" value={form.location} onChange={e => set("location", e.target.value)} />
          <Textarea label="Summary *" placeholder="What did you do today?" rows={3} value={form.summary} onChange={e => set("summary", e.target.value)} />
          <Textarea label="Highlights" placeholder="Key wins, clients met..." rows={2} value={form.highlights} onChange={e => set("highlights", e.target.value)} />
          <Textarea label="Challenges" placeholder="Any issues or blockers..." rows={2} value={form.challenges} onChange={e => set("challenges", e.target.value)} />
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">Photos ({photos.length}/5)</label>
              {photos.length < 5 && (
                <button onClick={() => setCamOpen(true)} className="text-xs text-[#c8f230] flex items-center gap-1 hover:underline">
                  <Camera size={12} /> Add Photo
                </button>
              )}
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#21272f]">
                    <img src={p.dataUrl} alt={`photo ${i+1}`} className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(ph => ph.filter((_, j) => j !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn onClick={() => createMut.mutate()} disabled={!form.title || !form.summary || createMut.isPending} className="flex-1">
            {createMut.isPending ? "Submitting…" : "Submit Report"}
          </Btn>
        </div>
      </Modal>

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)}
        onCapture={(p) => { if (photos.length < 5) setPhotos(prev => [...prev, p]); setCamOpen(false); }}
        title="Add Photo" facingMode="environment" />
    </div>
  );
}
