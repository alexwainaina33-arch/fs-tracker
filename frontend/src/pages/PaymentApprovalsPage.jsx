// src/pages/PaymentApprovalsPage.jsx
// Managers/supervisors approve or reject payments submitted by field staff

import React, { useState } from "react";
import {
  usePendingPayments,
  useApprovePayment,
  useRejectPayment,
  PAYMENT_METHOD_LABELS,
} from "../hooks/useOrderPayments";
import { formatKES } from "../hooks/useOrders";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import {
  CreditCard, CheckCircle, XCircle, Clock,
  User, Hash, CalendarDays, AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

export default function PaymentApprovalsPage() {
  const { data: payments = [], isLoading } = usePendingPayments();

  const approveMut = useApprovePayment();
  const rejectMut  = useRejectPayment();

  const [selected, setSelected]       = useState(null); // payment being reviewed
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject]   = useState(false);

  const handleApprove = (payment) => {
    approveMut.mutate(
      { paymentId: payment.id },
      { onSuccess: () => setSelected(null) }
    );
  };

  const handleRejectConfirm = () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 5)
      return toast.error("Enter a reason (min 5 characters)");
    rejectMut.mutate(
      { paymentId: selected.id, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setSelected(null);
          setRejectReason("");
          setShowReject(false);
        },
      }
    );
  };

  const openReview = (payment) => {
    setSelected(payment);
    setShowReject(false);
    setRejectReason("");
  };

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
          <CreditCard size={22} className="text-[#c8f230]" /> Payment Approvals
        </h1>
        <p className="text-[#8b95a1] text-sm mt-0.5">
          Review payments submitted by field staff
        </p>
      </div>

      {/* Stats bar */}
      <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 flex items-center gap-4">
        <Clock size={18} className={payments.length > 0 ? "text-[#ff9f43]" : "text-[#4a5568]"} />
        <div>
          <p className={`font-bold text-lg ${payments.length > 0 ? "text-[#ff9f43]" : "text-white"}`}>
            {payments.length}
          </p>
          <p className="text-xs text-[#8b95a1]">Pending payment{payments.length !== 1 ? "s" : ""} awaiting approval</p>
        </div>
        {payments.length > 0 && (
          <div className="ml-auto text-right">
            <p className="text-xs text-[#8b95a1]">Total value</p>
            <p className="font-bold text-[#c8f230] font-mono">
              {formatKES(payments.reduce((s, p) => s + Number(p.amount || 0), 0))}
            </p>
          </div>
        )}
      </div>

      {/* List */}
      {isLoading && (
        <div className="py-16 text-center text-[#8b95a1] text-sm">Loading payments…</div>
      )}

      {!isLoading && payments.length === 0 && (
        <div className="py-20 text-center text-[#8b95a1]">
          <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-white">All caught up!</p>
          <p className="text-sm mt-1">No payments pending approval</p>
        </div>
      )}

      <div className="space-y-3">
        {payments.map((payment) => {
          const orderNo    = payment.expand?.order?.order_no   ?? "—";
          const customer   = payment.expand?.order?.customer_name ?? "—";
          const staffName  = payment.expand?.recorded_by?.name ?? "Unknown staff";
          const payDate    = payment.payment_date
            ? format(new Date(payment.payment_date), "dd MMM yyyy")
            : format(new Date(payment.created), "dd MMM yyyy");
          const timeAgo    = formatDistanceToNow(new Date(payment.created), { addSuffix: true });

          return (
            <div
              key={payment.id}
              className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#c8f230]/30 transition-all cursor-pointer"
              onClick={() => openReview(payment)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Amount + method */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-lg font-bold text-[#c8f230] font-mono">
                      {formatKES(payment.amount)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#21272f] text-[#8b95a1]">
                      {PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
                    </span>
                    {payment.mpesa_ref && (
                      <span className="text-[10px] font-mono text-[#c8f230] bg-[#c8f230]/10 px-2 py-0.5 rounded-full">
                        {payment.mpesa_ref}
                      </span>
                    )}
                  </div>

                  {/* Order info */}
                  <div className="flex items-center gap-3 flex-wrap text-xs text-[#8b95a1]">
                    <span className="flex items-center gap-1">
                      <Hash size={10} />{orderNo}
                    </span>
                    <span className="truncate max-w-[160px]">{customer}</span>
                  </div>

                  {/* Staff + date */}
                  <div className="flex items-center gap-3 flex-wrap text-xs text-[#8b95a1] mt-1">
                    <span className="flex items-center gap-1">
                      <User size={10} />{staffName}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays size={10} />{payDate}
                    </span>
                    <span className="text-[#4a5568]">{timeAgo}</span>
                  </div>

                  {payment.notes && (
                    <p className="text-xs text-[#4a5568] mt-1.5 italic">"{payment.notes}"</p>
                  )}
                </div>

                {/* Quick action buttons */}
                <div className="flex flex-col gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleApprove(payment)}
                    disabled={approveMut.isPending}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-[#00c096] text-white font-semibold hover:bg-[#00d4a8] transition-colors whitespace-nowrap"
                  >
                    <CheckCircle size={12} /> Approve
                  </button>
                  <button
                    onClick={() => { openReview(payment); setShowReject(true); }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-[#ff4d4f]/15 border border-[#ff4d4f]/30 text-[#ff4d4f] font-semibold hover:bg-[#ff4d4f]/25 transition-colors whitespace-nowrap"
                  >
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── REVIEW MODAL ─────────────────────────────────────────────────────── */}
      {selected && (
        <Modal
          open={!!selected}
          onClose={() => { setSelected(null); setRejectReason(""); setShowReject(false); }}
          title="Review Payment"
          width="max-w-md"
        >
          <div className="space-y-4">
            {/* Payment detail card */}
            <div className="bg-[#0a0d0f] rounded-2xl p-4 border border-[#21272f] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-[#c8f230] font-mono">
                  {formatKES(selected.amount)}
                </p>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#21272f] text-[#8b95a1]">
                  {PAYMENT_METHOD_LABELS[selected.payment_method] ?? selected.payment_method}
                </span>
              </div>

              {selected.mpesa_ref && (
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">M-Pesa Reference</p>
                  <p className="text-[#c8f230] font-mono text-sm">{selected.mpesa_ref}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">Order</p>
                  <p className="text-white font-mono text-xs">{selected.expand?.order?.order_no ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">Customer</p>
                  <p className="text-white text-xs truncate">{selected.expand?.order?.customer_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">Submitted by</p>
                  <p className="text-white text-xs">{selected.expand?.recorded_by?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">Payment Date</p>
                  <p className="text-white text-xs">
                    {selected.payment_date
                      ? format(new Date(selected.payment_date), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
              </div>

              {selected.notes && (
                <div>
                  <p className="text-[#8b95a1] text-xs mb-0.5">Notes</p>
                  <p className="text-[#c2cad4] text-sm italic">"{selected.notes}"</p>
                </div>
              )}

              {/* Order total vs this payment */}
              {selected.expand?.order?.order_amount && (
                <div className="pt-2 border-t border-[#21272f]">
                  <p className="text-[#8b95a1] text-xs mb-0.5">Order Total</p>
                  <p className="text-white font-mono text-sm font-bold">
                    {formatKES(selected.expand.order.order_amount)}
                  </p>
                </div>
              )}
            </div>

            {/* Reject reason input */}
            {showReject && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#ff4d4f] uppercase tracking-wider block">
                  Rejection Reason *
                </label>
                <input
                  type="text"
                  placeholder="Why is this payment being rejected?"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                  className="w-full bg-[#0a0d0f] border border-[#ff4d4f]/40 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff4d4f] transition-colors"
                />
                {rejectReason.trim().length > 0 && rejectReason.trim().length < 5 && (
                  <p className="text-xs text-[#ff4d4f] flex items-center gap-1">
                    <AlertCircle size={11} /> Need {5 - rejectReason.trim().length} more characters
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-5 border-t border-[#21272f] mt-5">
            {!showReject ? (
              <>
                <Btn
                  onClick={() => handleApprove(selected)}
                  disabled={approveMut.isPending}
                  className="w-full bg-[#00c096] text-[#0a0d0f] hover:bg-[#00d4a8] border-[#00c096]"
                >
                  <CheckCircle size={16} />
                  {approveMut.isPending ? "Approving…" : "✅ Approve Payment"}
                </Btn>
                <Btn
                  onClick={() => setShowReject(true)}
                  variant="ghost"
                  className="w-full border border-[#ff4d4f]/30 text-[#ff4d4f] hover:bg-[#ff4d4f]/10"
                >
                  <XCircle size={16} /> Reject Payment
                </Btn>
              </>
            ) : (
              <>
                <Btn
                  onClick={handleRejectConfirm}
                  disabled={rejectMut.isPending || rejectReason.trim().length < 5}
                  className="w-full bg-[#ff4d4f] text-white hover:bg-[#ff6b6b] border-[#ff4d4f]"
                >
                  <XCircle size={16} />
                  {rejectMut.isPending ? "Rejecting…" : "Confirm Rejection"}
                </Btn>
                <Btn
                  onClick={() => { setShowReject(false); setRejectReason(""); }}
                  variant="ghost"
                  className="w-full"
                >
                  ← Back
                </Btn>
              </>
            )}
            <Btn
              variant="ghost"
              onClick={() => { setSelected(null); setRejectReason(""); setShowReject(false); }}
              className="w-full"
            >
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}