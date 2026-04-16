import React from "react";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { StatCard } from "../components/ui/StatCard";
import { Badge } from "../components/ui/Badge";
import { CheckSquare, Clock, Receipt, Users, AlertTriangle, MapPin, Activity } from "lucide-react";
import { format, isPast } from "date-fns";

function PriorityDot({ p }) {
  const c = { urgent:"bg-[#ff4d4f]", high:"bg-[#ffab00]", medium:"bg-[#3b82f6]", low:"bg-[#00c096]" };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c[p] ?? "bg-[#21272f]"}`} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin  = ["admin","manager","supervisor"].includes(user?.role);
  const today    = format(new Date(), "yyyy-MM-dd");

  const { data: tasks } = useQuery({
    queryKey: ["tasks-dash", user.id, isAdmin],
    queryFn:  () => pb.collection("ft_tasks").getList(1, 100, {
      filter: isAdmin ? `status != "completed" && status != "cancelled"` : `assigned_to = "${user.id}"`,
      sort: "due_date",
    }),
    refetchInterval: 60000,
  });

  const { data: att } = useQuery({
    queryKey: ["att-dash", today],
    queryFn:  () => pb.collection("ft_attendance").getList(1, 200, {
      filter: `date = "${today}"`, expand: "user",
    }),
    refetchInterval: 30000,
  });

  const { data: exps } = useQuery({
    queryKey: ["exps-dash"],
    queryFn:  () => pb.collection("ft_expenses").getList(1, 1, { filter: `status = "pending"` }),
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-count"],
    queryFn:  () => pb.collection("ft_users").getList(1, 1, { filter: `role = "field_staff" && status = "active"` }),
    enabled: isAdmin,
  });

  const overdue = tasks?.items.filter(t =>
    t.status === "overdue" || (t.due_date && isPast(new Date(t.due_date)) && t.status === "pending")
  ).length ?? 0;
  const present = att?.items.filter(a => a.clock_in && !a.clock_out).length ?? 0;
  const pending = tasks?.items.filter(t => t.status === "pending").length ?? 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-6 pb-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[#8b95a1] text-sm font-mono">{format(new Date(), "EEEE, dd MMM yyyy")}</p>
          <h1 className="font-display font-bold text-2xl text-white mt-0.5">
            {greeting}, {user?.name?.split(" ")[0]} <span className="text-[#c8f230]">↗</span>
          </h1>
        </div>
        <div className="text-right hidden sm:block">
          <p className="font-mono text-3xl font-bold text-white">{format(new Date(), "HH:mm")}</p>
          <p className="text-xs text-[#8b95a1]">EAT · UTC+3</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CheckSquare}  label="Open Tasks"     value={pending}               sub={overdue > 0 ? `${overdue} overdue` : "all on track"} accent="lime" />
        <StatCard icon={Clock}        label="On Field Now"   value={present}               sub="clocked in today" accent="ok" />
        <StatCard icon={Receipt}      label="Pending Claims" value={exps?.totalItems ?? 0} sub="awaiting approval" accent="warn" />
        {isAdmin
          ? <StatCard icon={Users}         label="Active Staff" value={staff?.totalItems ?? 0} sub="field staff" accent="blue" />
          : <StatCard icon={AlertTriangle} label="Overdue"      value={overdue}               sub="need action"  accent="danger" />}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21272f]">
            <h2 className="font-display font-bold text-white flex items-center gap-2">
              <Activity size={16} className="text-[#c8f230]" />
              {isAdmin ? "Open Tasks" : "My Tasks"}
            </h2>
            <Badge label={`${tasks?.items.length ?? 0}`} />
          </div>
          <div className="divide-y divide-[#21272f]">
            {tasks?.items.slice(0, 8).map(task => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#181c21] transition-colors">
                <PriorityDot p={task.priority} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate font-medium">{task.title}</p>
                  <p className="text-xs text-[#8b95a1] truncate">{task.client_name || task.location_address || task.category}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <Badge label={task.status} color={
                    task.status === "completed" ? "ok" :
                    task.status === "in_progress" ? "blue" :
                    task.status === "overdue" ? "danger" : "default"
                  } />
                  {task.due_date && <p className="text-[10px] text-[#8b95a1] mt-0.5">{format(new Date(task.due_date), "dd MMM")}</p>}
                </div>
              </div>
            ))}
            {!tasks?.items.length && (
              <div className="py-10 text-center text-[#8b95a1] text-sm">
                <CheckSquare size={32} className="mx-auto mb-2 opacity-20" /> No open tasks
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#111418] border border-[#21272f] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#21272f]">
            <h2 className="font-display font-bold text-white flex items-center gap-2">
              <MapPin size={16} className="text-[#c8f230]" /> Field Today
            </h2>
            <Badge label={`${att?.items.length ?? 0}`} color="ok" />
          </div>
          <div className="divide-y divide-[#21272f]">
            {att?.items.slice(0, 8).map(a => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#181c21] transition-colors">
                <div className="w-8 h-8 rounded-full bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-xs font-bold text-[#c8f230] flex-shrink-0">
                  {a.expand?.user?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{a.expand?.user?.name ?? "Staff"}</p>
                  <p className="text-[10px] font-mono text-[#8b95a1]">
                    {a.clock_in ? format(new Date(a.clock_in), "HH:mm") : "--:--"}
                    {a.clock_out ? ` → ${format(new Date(a.clock_out), "HH:mm")}` : " → now"}
                  </p>
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${!a.clock_out ? "bg-[#00c096] animate-pulse" : "bg-[#21272f]"}`} />
              </div>
            ))}
            {!att?.items.length && (
              <div className="py-10 text-center text-[#8b95a1] text-sm">
                <Clock size={32} className="mx-auto mb-2 opacity-20" /> No one clocked in yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
