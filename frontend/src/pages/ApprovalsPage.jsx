// src/pages/ApprovalsPage.jsx
import React, { useState } from "react";
import { usePendingOrders, useOrders, useApproveOrder, useRejectOrder, useRequestRevision, formatKES } from "../hooks/useOrders";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Textarea } from "../components/ui/Input";
import {
  CheckCircle, XCircle, RefreshCcw, ShoppingBag, Clock,
  User, MapPin, ChevronRight, AlertCircle, TrendingUp,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

const CAT_COLORS = {
  distributor: "blue",
  stockist: "ok",
  agrovet: "warn",
  farmer: "default",
};

function safeDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function ApprovalCard({ order, onSelect }) {
  const d = safeDate(order.submitted_at || order.order_date);
  const timeSince = d ? formatDistanceToNow(d, { addSuffix: true }) : "recently";

  return (
    <div
      className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#c8f230]/30 transition-all cursor-pointer group"
      onClick={() => onSelect(order)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge label={order.customer_category} color={CAT_COLORS[order.customer_category]} size="xs" />
            <span className="text-[10px] font-mono text-[#4a5568]">{order.order_no}</span>
          </div>
          <h3 className="font-semibold text-white truncate">{order.customer_name}</h3>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-xs text-[#8b95a1] flex items-center gap-1">
              <User size={10} />
              {order.expand?.staff?.name ?? "Unknown Staff"}
            </span>
            {order.county && (
              <span className="text-xs text-[#8b95a1] flex items-center gap-1">
                <MapPin size={10} />{order.county}
              </span>
            )}
            <span className="text-xs text-[#8b95a1] flex items-center gap-1">
              <Clock size={10} />{timeSince}
            </span>
          </div>
          {order.product_description && (
            <p className="text-xs text-[#8b95a1] mt-2 line-clamp-1">{order.product_description}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="font-bold text-[#c8f230] text-lg leading-tight">{formatKES(order.order_amount)}</p>
          <ChevronRight size={14} className="text-[#21272f] group-hover:text-[#c8f230] transition-colors ml-auto mt-1" />
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState("pending");
  const [selected, setSelected] = useState(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");

  const { data: pendingData, isLoading: pendingLoading } = usePendingOrders();
  const { data: allData, isLoading: allLoading } = useOrders({ filter: "all" });

  const approveMut = useApproveOrder();
  const rejectMut = useRejectOrder();
  const revisionMut = useRequestRevision();

  const handleApprove = () => {
    if (!selected) return;
    approveMut.mutate(selected.id, {
      onSuccess: () => setSelected(null),
    });
  };

  const handleReject = () => {
    if (!selected || !reason.trim()) return toast.error("Reason required");
    if (rejectMode) {
      revisionMut.mutate(
        { orderId: selected.id, note: reason.trim() },
        { onSuccess: () => { setSelected(null); setReason(""); } }
      );
    } else {
      rejectMut.mutate(
        { orderId: selected.id, reason: reason.trim() },
        { onSuccess: () => { setSelected(null); setReason(""); } }
      );
    }
  };

  const pendingCount = pendingData?.totalItems ?? 0;
  const todayApproved = allData?.items?.filter(
    (o) => o.status === "approved" && safeDate(o.approved_at)?.toDateString() === new Date().toDateString()
  ).length ?? 0;
  const todayValue = allData?.items
    ?.filter((o) => o.status === "approved" && safeDate(o.approved_at)?.toDateString() === new Date().toDateString())
    .reduce((s, o) => s + Number(o.order_amount || 0), 0) ?? 0;

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      <div>
        <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
          <ShoppingBag size={22} className="text-[#c8f230]" /> Order Approvals
        </h1>
        <p className="text-[#8b95a1] text-sm mt-0.5">Review and action field staff orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending Review",      value: pendingCount,        accent: pendingCount > 0 ? "text-[#ffab00]" : "text-white", icon: Clock },
          { label: "Approved Today",      value: todayApproved,       accent: "text-[#00c096]", icon: CheckCircle },
          { label: "Value Approved Today",value: formatKES(todayValue),accent: "text-[#c8f230]", icon: TrendingUp },
        ].map(({ label, value, accent, icon: Icon }) => (
          <div key={label} className="bg-[#111418] border border-[#21272f] rounded-2xl p-3 text-center">
            <Icon size={16} className={`mx-auto mb-1 ${accent}`} />
            <p className={`font-bold text-base ${accent}`}>{value}</p>
            <p className="text-[10px] text-[#8b95a1] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {["pending", "history"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all flex items-center gap-2 ${
              activeTab === tab
                ? "bg-[#c8f230] text-[#0a0d0f]"
                : "bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white"
            }`}
          >
            {tab === "pending" ? "Pending" : "All Orders"}
            {tab === "pending" && pendingCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab ? "bg-[#0a0d0f]/30" : "bg-[#ff4d4f] text-white"
              }`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {(pendingLoading || allLoading) && (
          <div className="py-16 text-center text-[#8b95a1] text-sm">Loading…</div>
        )}

        {activeTab === "pending" && pendingData?.items.map((order) => (
          <ApprovalCard key={order.id} order={order} onSelect={setSelected} />
        ))}

        {activeTab === "history" && allData?.items.map((order) => (
          <div key={order.id} className="bg-[#111418] border border-[#21272f] rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    label={order.status.replace("_", " ")}
                    color={
                      order.status === "approved" ? "ok" :
                      order.status === "rejected" ? "danger" :
                      order.status === "pending_approval" ? "warn" : "default"
                    }
                    size="xs"
                  />
                  <span className="text-[10px] font-mono text-[#4a5568]">{order.order_no}</span>
                </div>
                <p className="text-sm font-medium text-white">{order.customer_name}</p>
                <p className="text-xs text-[#8b95a1] mt-0.5">{order.expand?.staff?.name}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-[#c8f230]">{formatKES(order.order_amount)}</p>
                <p className="text-[10px] text-[#4a5568] font-mono">
                  {safeDate(order.submitted_at)
                    ? format(safeDate(order.submitted_at), "dd MMM HH:mm")
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        ))}

        {activeTab === "pending" && !pendingLoading && !pendingData?.items?.length && (
          <div className="py-20 text-center text-[#8b95a1]">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-white">All caught up!</p>
            <p className="text-sm text-[#8b95a1] mt-1">No orders pending approval</p>
          </div>
        )}
      </div>

      {/* ORDER ACTION MODAL */}
      {selected && (
        <Modal
          open={!!selected}
          onClose={() => { setSelected(null); setReason(""); }}
          title="Review Order"
          width="max-w-md"
        >
          <div className="space-y-4">
            <div className="bg-[#0a0d0f] rounded-2xl p-4 border border-[#21272f] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#8b95a1] text-xs">Customer</p>
                  <p className="text-white font-semibold">{selected.customer_name}</p>
                </div>
                <Badge label={selected.customer_category} color={CAT_COLORS[selected.customer_category]} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#8b95a1] text-xs">Amount</p>
                  <p className="text-[#c8f230] font-bold text-xl">{formatKES(selected.order_amount)}</p>
                </div>
                <div>
                  <p className="text-[#8b95a1] text-xs">Staff</p>
                  <p className="text-white">{selected.expand?.staff?.name ?? "—"}</p>
                </div>
                {selected.county && (
                  <div>
                    <p className="text-[#8b95a1] text-xs">County</p>
                    <p className="text-white">{selected.county}</p>
                  </div>
                )}
                {selected.customer_phone && (
                  <div>
                    <p className="text-[#8b95a1] text-xs">Phone</p>
                    <p className="text-white">{selected.customer_phone}</p>
                  </div>
                )}
              </div>
              {selected.product_description && (
                <div>
                  <p className="text-[#8b95a1] text-xs">Products</p>
                  <p className="text-[#c2cad4] text-sm">{selected.product_description}</p>
                </div>
              )}
              {selected.notes && (
                <div>
                  <p className="text-[#8b95a1] text-xs">Notes</p>
                  <p className="text-[#c2cad4] text-sm">{selected.notes}</p>
                </div>
              )}
              <p className="text-[10px] text-[#4a5568] font-mono">
                Submitted {safeDate(selected.submitted_at)
                  ? format(safeDate(selected.submitted_at), "dd MMM yyyy HH:mm")
                  : "—"}
              </p>
            </div>

            {/* Reject / Revision toggle */}
            <div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setRejectMode(false)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    !rejectMode
                      ? "bg-[#ff4d4f]/15 border-[#ff4d4f]/30 text-[#ff4d4f]"
                      : "bg-[#111418] border-[#21272f] text-[#8b95a1]"
                  }`}
                >
                  <XCircle size={12} className="inline mr-1" /> Reject
                </button>
                <button
                  onClick={() => setRejectMode(true)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    rejectMode
                      ? "bg-[#c8f230]/15 border-[#c8f230]/30 text-[#c8f230]"
                      : "bg-[#111418] border-[#21272f] text-[#8b95a1]"
                  }`}
                >
                  <RefreshCcw size={12} className="inline mr-1" /> Request Revision
                </button>
              </div>
              <Textarea
                label={rejectMode ? "Revision Note (required)" : "Rejection Reason (required, min 10 chars)"}
                placeholder={
                  rejectMode
                    ? "What needs to be revised?"
                    : "Why is this order rejected?"
                }
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {reason.trim().length > 0 && reason.trim().length < 10 && (
                <p className="text-xs text-[#ff4d4f] mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> Need {10 - reason.trim().length} more characters
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-5 border-t border-[#21272f] mt-5">
            <Btn
              onClick={handleApprove}
              disabled={approveMut.isPending}
              className="w-full bg-[#00c096] text-[#0a0d0f] hover:bg-[#00c47a] border-[#00c096]"
            >
              <CheckCircle size={16} />
              {approveMut.isPending ? "Approving…" : "✅ Approve Order"}
            </Btn>
            <Btn
              onClick={handleReject}
              disabled={(rejectMut.isPending || revisionMut.isPending) || reason.trim().length < 10}
              variant={rejectMode ? "ghost" : "danger"}
              className="w-full"
            >
              {rejectMode ? <RefreshCcw size={16} /> : <XCircle size={16} />}
              {(rejectMut.isPending || revisionMut.isPending)
                ? "Sending…"
                : rejectMode ? "Request Revision" : "Reject Order"}
            </Btn>
            <Btn variant="ghost" onClick={() => { setSelected(null); setReason(""); }} className="w-full">
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
