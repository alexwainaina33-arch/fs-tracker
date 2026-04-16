import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import { Plus, Camera, MapPin, Phone, User, CheckCircle, PlayCircle, Clock } from "lucide-react";
import { format, isPast } from "date-fns";
import toast from "react-hot-toast";

const PRIORITY_COLOR = { urgent:"danger", high:"warn", medium:"blue", low:"ok" };
const STATUS_COLOR   = { pending:"default", in_progress:"blue", completed:"ok", overdue:"danger", cancelled:"default" };
const FILTERS = ["all","pending","in_progress","overdue","completed"];
const CATS    = ["visit","delivery","installation","maintenance","survey","sales_call","collection","inspection","training","other"];
const PRIOS   = ["low","medium","high","urgent"];

const TODAY = new Date().toISOString().split("T")[0];

function buildFilter(filter, userId, isAdmin) {
  const base = isAdmin ? "" : `assigned_to = "${userId}"`;
  if (filter === "all") return base;
  const sf = `status = "${filter}"`;
  return base ? `${base} && ${sf}` : sf;
}

// Combine separate date + time strings into PocketBase date format
function buildDueDate(dateStr, timeStr) {
  if (!dateStr) return "";
  const combined = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T00:00:00`;
  return new Date(combined).toISOString().replace("T", " ");
}

// Split date + time picker — styled to exactly match Input.jsx
// [color-scheme:dark] makes the browser render native date/time controls in dark mode
const inputCls = "w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors [color-scheme:dark]";

function DateTimeInput({ dateVal, timeVal, onDateChange, onTimeChange }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">
        Due Date &amp; Time
      </label>
      <div className="grid grid-cols-2 gap-3">
        <input type="date" value={dateVal} min={TODAY} onChange={e => onDateChange(e.target.value)} className={inputCls} />
        <input type="time" value={timeVal}             onChange={e => onTimeChange(e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const qc      = useQueryClient();
  const isAdmin = ["admin","manager","supervisor"].includes(user?.role);

  const [filter,        setFilter]        = useState("all");
  const [showCreate,    setShowCreate]    = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [camOpen,       setCamOpen]       = useState(false);
  const [pendingStatus, setPendingStatus] = useState(null);

  const blank = {
    title:            "",
    description:      "",
    priority:         "medium",
    category:         "visit",
    status:           "pending",  // required by PocketBase schema
    due_date_str:     "",         // YYYY-MM-DD for the date input
    due_time_str:     "",         // HH:MM for the time input
    client_name:      "",
    client_phone:     "",
    location_address: "",
    assigned_to:      user.id,
  };

  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", filter, user.id, isAdmin],
    queryFn:  () => pb.collection("ft_tasks").getList(1, 200, {
      filter:  buildFilter(filter, user.id, isAdmin),
      sort:    "due_date,-created",
      expand:  "assigned_to",
    }),
    refetchInterval: 30000,
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-list"],
    queryFn:  () => pb.collection("ft_users").getList(1, 200, {
      filter: `status = "active"`,
      sort:   "name",
    }),
    enabled: isAdmin,
  });

  const createMut = useMutation({
    mutationFn: (d) => {
      // Strip the UI-only date/time fields and build the real due_date
      const { due_date_str, due_time_str, ...rest } = d;
      const payload = {
        ...rest,
        created_by: user.id,
        status:     rest.status || "pending",
      };
      const due = buildDueDate(due_date_str, due_time_str);
      if (due) payload.due_date = due;
      return pb.collection("ft_tasks").create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries(["tasks"]);
      setShowCreate(false);
      setForm(blank);
      toast.success("Task created!");
    },
    onError: (err) => {
      console.error("Create task error:", err?.response?.data ?? err);
      const detail = err?.response?.data
        ? Object.entries(err.response.data)
            .map(([k, v]) => `${k}: ${v?.message ?? v}`)
            .join(", ")
        : "Unknown error";
      toast.error(`Failed to create task — ${detail}`);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status, photo }) => {
      const fd = new FormData();
      fd.append("status", status);
      if (status === "in_progress") fd.append("started_at",   new Date().toISOString().replace("T", " "));
      if (status === "completed")   fd.append("completed_at", new Date().toISOString().replace("T", " "));
      if (photo?.blob) fd.append("completion_photos", photo.blob, `task-${Date.now()}.jpg`);
      return pb.collection("ft_tasks").update(id, fd);
    },
    onSuccess: () => {
      qc.invalidateQueries(["tasks"]);
      toast.success("Updated!");
      setSelected(null);
    },
    onError: (err) => {
      console.error("Status update error:", err?.response?.data ?? err);
      toast.error("Failed to update status");
    },
  });

  const handlePhotoCapture = (photo) => {
    setCamOpen(false);
    if (pendingStatus) {
      statusMut.mutate({ ...pendingStatus, photo });
      setPendingStatus(null);
    }
  };

  const completeWithPhoto = (task) => {
    setPendingStatus({ id: task.id, status: "completed" });
    setSelected(null);
    setCamOpen(true);
  };

  const counts = {};
  FILTERS.forEach(f => {
    counts[f] = f === "all"
      ? (data?.totalItems ?? 0)
      : (data?.items.filter(t => t.status === f).length ?? 0);
  });

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Tasks</h1>
          <p className="text-[#8b95a1] text-sm">{data?.totalItems ?? 0} total</p>
        </div>
        {isAdmin && (
          <Btn onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Task
          </Btn>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all flex items-center gap-2 ${
              filter === f
                ? "bg-[#c8f230] text-[#0a0d0f]"
                : "bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white"
            }`}>
            {f.replace("_", " ")}
            <span className={`text-xs rounded-full px-1.5 ${filter === f ? "bg-[#0a0d0f]/30" : "bg-[#21272f]"}`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        {isLoading && <p className="text-[#8b95a1] text-center py-12">Loading…</p>}
        {data?.items.map(task => (
          <div
            key={task.id}
            className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2a3040] transition-all cursor-pointer card-lift"
            onClick={() => setSelected(task)}>
            <div className="flex items-start gap-3">
              <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                task.priority === "urgent" ? "bg-[#ff4d4f]"
                : task.priority === "high"   ? "bg-[#ffab00]"
                : task.priority === "medium" ? "bg-[#3b82f6]"
                : "bg-[#00c096]"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge label={task.priority} color={PRIORITY_COLOR[task.priority]} size="xs" />
                  <Badge label={task.status}   color={STATUS_COLOR[task.status]}     size="xs" />
                  {task.category && <Badge label={task.category} size="xs" />}
                </div>
                <h3 className="font-semibold text-white">{task.title}</h3>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                  {task.client_name      && <span className="text-xs text-[#8b95a1] flex items-center gap-1"><User  size={11} />{task.client_name}</span>}
                  {task.client_phone     && <span className="text-xs text-[#8b95a1] flex items-center gap-1"><Phone size={11} />{task.client_phone}</span>}
                  {task.location_address && <span className="text-xs text-[#8b95a1] flex items-center gap-1"><MapPin size={11} />{task.location_address}</span>}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {task.expand?.assigned_to && (
                    <span className="text-xs text-[#8b95a1]">
                      {task.expand.assigned_to.name}
                    </span>
                  )}
                  {task.due_date && (
                    <span className={`text-xs font-mono flex items-center gap-1 ${
                      isPast(new Date(task.due_date)) && task.status !== "completed"
                        ? "text-[#ff4d4f]"
                        : "text-[#8b95a1]"
                    }`}>
                      <Clock size={11} />
                      {format(new Date(task.due_date), "dd MMM, HH:mm")}
                    </span>
                  )}
                </div>
              </div>
              <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
                {task.status === "pending" && task.assigned_to === user.id && (
                  <Btn size="sm" variant="ghost" onClick={() => statusMut.mutate({ id: task.id, status: "in_progress" })}>
                    <PlayCircle size={14} /> Start
                  </Btn>
                )}
                {task.status === "in_progress" && (task.assigned_to === user.id || isAdmin) && (
                  <Btn size="sm" variant="ok" onClick={() => completeWithPhoto(task)}>
                    <Camera size={14} /> Done
                  </Btn>
                )}
              </div>
            </div>
          </div>
        ))}
        {!isLoading && !data?.items.length && (
          <div className="text-center py-16 text-[#8b95a1]">
            <CheckCircle size={48} className="mx-auto mb-3 opacity-20" />
            No tasks found
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Task" width="max-w-xl">
        <div className="space-y-4">
          <Input
            label="Title *"
            placeholder="e.g. Visit Farmer John in Nakuru"
            value={form.title}
            onChange={e => set("title", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" value={form.priority} onChange={e => set("priority", e.target.value)}>
              {PRIOS.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select label="Category" value={form.category} onChange={e => set("category", e.target.value)}>
              {CATS.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Client Name"  value={form.client_name}  onChange={e => set("client_name",  e.target.value)} />
            <Input label="Client Phone" value={form.client_phone} onChange={e => set("client_phone", e.target.value)} type="tel" />
          </div>
          <Input
            label="Location"
            value={form.location_address}
            onChange={e => set("location_address", e.target.value)}
          />

          {/* Split date + time — renders correctly in dark theme */}
          <DateTimeInput
            dateVal={form.due_date_str}
            timeVal={form.due_time_str}
            onDateChange={v => set("due_date_str", v)}
            onTimeChange={v => set("due_time_str", v)}
          />

          {isAdmin && (
            <Select label="Assign To" value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)}>
              {staff?.items.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </Select>
          )}
          <Textarea
            label="Notes"
            rows={3}
            value={form.description}
            onChange={e => set("description", e.target.value)}
          />
        </div>
        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn
            onClick={() => createMut.mutate(form)}
            disabled={!form.title || createMut.isPending}
            className="flex-1">
            {createMut.isPending ? "Creating…" : "Create Task"}
          </Btn>
        </div>
      </Modal>

      {/* Task Detail Modal */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={selected.title}>
          <div className="space-y-4 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Badge label={selected.priority} color={PRIORITY_COLOR[selected.priority]} />
              <Badge label={selected.status}   color={STATUS_COLOR[selected.status]} />
            </div>
            {selected.description      && <p className="text-[#8b95a1]">{selected.description}</p>}
            {selected.client_name      && <div className="flex items-center gap-2 text-[#c2cad4]"><User  size={14} />{selected.client_name}</div>}
            {selected.client_phone     && <div className="flex items-center gap-2 text-[#c2cad4]"><Phone size={14} />{selected.client_phone}</div>}
            {selected.location_address && <div className="flex items-center gap-2 text-[#c2cad4]"><MapPin size={14} />{selected.location_address}</div>}
            {selected.due_date         && (
              <div className="flex items-center gap-2 text-[#c2cad4]">
                <Clock size={14} />
                Due: {format(new Date(selected.due_date), "dd MMM yyyy, HH:mm")}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
            {selected.status === "pending" && selected.assigned_to === user.id && (
              <Btn variant="ghost" onClick={() => statusMut.mutate({ id: selected.id, status: "in_progress" })}>
                <PlayCircle size={14} /> Start Task
              </Btn>
            )}
            {selected.status === "in_progress" && (selected.assigned_to === user.id || isAdmin) && (
              <Btn variant="ok" onClick={() => completeWithPhoto(selected)}>
                <Camera size={14} /> Complete with Photo
              </Btn>
            )}
            <Btn variant="ghost" onClick={() => setSelected(null)} className="ml-auto">Close</Btn>
          </div>
        </Modal>
      )}

      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={handlePhotoCapture}
        title="Completion Photo"
        facingMode="environment"
      />
    </div>
  );
}
