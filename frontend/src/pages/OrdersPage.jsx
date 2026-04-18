// src/pages/OrdersPage.jsx
// Orders — field staff submits payments, manager/supervisor approves them

import React, { useState, useRef } from "react";
import { useAuth } from "../store/auth";
import {
  useOrders, useCreateOrder, useOrdersRealtime,
  formatKES, CUSTOMER_CATEGORIES,
} from "../hooks/useOrders";
import {
  useOrderPaymentSummary,
  useSubmitPayment,
  useApprovePayment,
  useRejectPayment,
  useDeletePayment,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "../hooks/useOrderPayments";
import { useGPS } from "../hooks/useGPS";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import {
  Plus, ShoppingCart, Camera, MapPin, User, Package,
  Clock, CheckCircle, XCircle, RefreshCcw, Upload,
  CreditCard, Trash2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:              { label: "Draft",            color: "default", icon: Clock },
  pending_approval:   { label: "Pending Approval", color: "warn",    icon: Clock },
  approved:           { label: "Approved",         color: "ok",      icon: CheckCircle },
  rejected:           { label: "Rejected",         color: "danger",  icon: XCircle },
  revision_requested: { label: "Needs Revision",   color: "blue",    icon: RefreshCcw },
};

const PAYMENT_STATUS_STYLES = {
  pending:  { bg: "bg-[#ff9f43]/10", border: "border-[#ff9f43]/30", text: "text-[#ff9f43]", label: "Pending Approval" },
  approved: { bg: "bg-[#00c096]/10", border: "border-[#00c096]/30", text: "text-[#00c096]", label: "Approved" },
  rejected: { bg: "bg-[#ff4d4f]/10", border: "border-[#ff4d4f]/30", text: "text-[#ff4d4f]", label: "Rejected" },
};

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii",
  "Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi",
  "Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot",
];

const BLANK_FORM = {
  customer_name: "", customer_phone: "", customer_category: "agrovet",
  product_description: "", order_amount: "", county: "", notes: "",
};

const BLANK_PAYMENT = {
  amount: "", paymentMethod: "mpesa", mpesaRef: "", notes: "",
  paymentDate: format(new Date(), "yyyy-MM-dd"),
};

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <Badge label={cfg.label} color={cfg.color} size="xs" />;
}

// Mini badge for payment status
function PayBadge({ status }) {
  const s = PAYMENT_STATUS_STYLES[status] ?? PAYMENT_STATUS_STYLES.pending;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── PAYMENT PROGRESS BAR (on order card) ────────────────────────────────────
function PaymentProgress({ orderId, orderAmount }) {
  const { totalPaid, totalPending, balance, isFullyPaid, percentPaid, isLoading } =
    useOrderPaymentSummary(orderId, orderAmount);
  if (isLoading || (totalPaid === 0 && totalPending === 0)) return null;

  return (
    <div className="mt-3">
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-[#8b95a1]">
          Paid: <span className="text-[#00c096] font-mono">{formatKES(totalPaid)}</span>
          {totalPending > 0 && (
            <span className="text-[#ff9f43] ml-2 font-mono">+{formatKES(totalPending)} pending</span>
          )}
        </span>
        {!isFullyPaid
          ? <span className="text-[#8b95a1]">Bal: <span className="text-[#ff9f43] font-mono">{formatKES(balance)}</span></span>
          : <span className="text-[#00c096] font-semibold">Fully Paid ✓</span>
        }
      </div>
      <div className="h-1.5 bg-[#21272f] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isFullyPaid ? "bg-[#00c096]" : "bg-[#c8f230]"}`}
          style={{ width: `${percentPaid}%` }}
        />
      </div>
    </div>
  );
}

// ─── PAYMENTS PANEL (inside order detail modal) ───────────────────────────────
function PaymentsPanel({ order, isAdmin }) {
  const { user } = useAuth();
  const isManager = ["admin", "manager", "supervisor"].includes(user?.role);
  const isStaff = !isManager;

  const [showForm, setShowForm] = useState(false);
  const [payForm, setPayForm] = useState(BLANK_PAYMENT);
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const submitPayment = useSubmitPayment();
  const approvePayment = useApprovePayment();
  const rejectPayment = useRejectPayment();
  const deletePayment = useDeletePayment();

  const { payments, totalPaid, totalPending, balance, isFullyPaid, percentPaid, isLoading } =
    useOrderPaymentSummary(order.id, order.order_amount);

  const setP = (k, v) => setPayForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!payForm.amount || isNaN(Number(payForm.amount))) return toast.error("Enter a valid amount");
    if (payForm.paymentMethod === "mpesa" && !payForm.mpesaRef.trim()) return toast.error("M-Pesa reference required");
    if (payForm.paymentMethod === "cheque" && !payForm.mpesaRef.trim()) return toast.error("Cheque reference required");
    if (payForm.paymentMethod === "bank_transfer" && !payForm.mpesaRef.trim()) return toast.error("Transfer reference required");
    submitPayment.mutate(
      { orderId: order.id, amount: payForm.amount, paymentMethod: payForm.paymentMethod,
        mpesaRef: payForm.mpesaRef, notes: payForm.notes, paymentDate: payForm.paymentDate },
      { onSuccess: () => { setShowForm(false); setPayForm(BLANK_PAYMENT); } }
    );
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return toast.error("Enter a rejection reason");
    rejectPayment.mutate(
      { paymentId: rejectId, reason: rejectReason },
      { onSuccess: () => { setRejectId(null); setRejectReason(""); } }
    );
  };

  if (order.status !== "approved") return null;

  return (
    <div className="border-t border-[#21272f] pt-4 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
          <CreditCard size={14} className="text-[#c8f230]" /> Payments
        </h4>
        {/* Only field staff (or own order) can submit a new payment */}
        {!isFullyPaid && (isStaff || order.staff === user?.id) && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-[#c8f230] text-[#0a0d0f] font-semibold hover:bg-[#d4f542] transition-colors"
          >
            <Plus size={12} />
            {showForm ? "Cancel" : "Submit Payment"}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="bg-[#0a0d0f] rounded-xl p-3 mb-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-[#8b95a1]">Order Total</span>
          <span className="text-white font-mono font-bold">{formatKES(order.order_amount)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#8b95a1]">Approved Payments</span>
          <span className="text-[#00c096] font-mono font-bold">{formatKES(totalPaid)}</span>
        </div>
        {totalPending > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-[#8b95a1]">Pending Approval</span>
            <span className="text-[#ff9f43] font-mono">{formatKES(totalPending)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-[#8b95a1]">Balance Due</span>
          <span className={`font-mono font-bold ${isFullyPaid ? "text-[#00c096]" : "text-[#ff9f43]"}`}>
            {isFullyPaid ? "PAID IN FULL ✓" : formatKES(balance)}
          </span>
        </div>
        <div className="h-2 bg-[#21272f] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isFullyPaid ? "bg-[#00c096]" : "bg-[#c8f230]"}`}
            style={{ width: `${percentPaid}%` }}
          />
        </div>
        <p className="text-[10px] text-[#4a5568] text-right">{Math.round(percentPaid)}% paid</p>
      </div>

      {/* Submit payment form (field staff) */}
      {showForm && !isFullyPaid && (
        <div className="bg-[#0a0d0f] border border-[#c8f230]/20 rounded-xl p-3 mb-3 space-y-3">
          <p className="text-xs font-semibold text-[#c8f230]">New Payment Entry</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Amount (KES) *</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#8b95a1] font-mono">KES</span>
                <input
                  type="number" min="1" step="100" placeholder="0"
                  value={payForm.amount}
                  onChange={(e) => setP("amount", e.target.value)}
                  className="w-full bg-[#111418] border border-[#21272f] rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
                />
              </div>
              {balance > 0 && (
                <div className="flex gap-1 mt-1">
                  <button onClick={() => setP("amount", String(Math.round(balance / 2)))}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#21272f] text-[#8b95a1] hover:text-white">50%</button>
                  <button onClick={() => setP("amount", String(balance))}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#21272f] text-[#8b95a1] hover:text-white">Full</button>
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Method *</label>
              <select
                value={payForm.paymentMethod}
                onChange={(e) => { setP("paymentMethod", e.target.value); setP("mpesaRef", ""); }}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-2 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          {payForm.paymentMethod === "mpesa" && (
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">M-Pesa Ref *</label>
              <input
                type="text" placeholder="e.g. QGH7K3L2MN"
                value={payForm.mpesaRef}
                onChange={(e) => setP("mpesaRef", e.target.value.toUpperCase())}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c8f230] uppercase"
              />
            </div>
          )}
          {payForm.paymentMethod === "cheque" && (
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Cheque Ref *</label>
              <input
                type="text" placeholder="e.g. CHQ-001234"
                value={payForm.mpesaRef}
                onChange={(e) => setP("mpesaRef", e.target.value.toUpperCase())}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c8f230] uppercase"
              />
            </div>
          )}
          {payForm.paymentMethod === "bank_transfer" && (
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Transfer Ref *</label>
              <input
                type="text" placeholder="e.g. TRF-20260418-001"
                value={payForm.mpesaRef}
                onChange={(e) => setP("mpesaRef", e.target.value.toUpperCase())}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#c8f230] uppercase"
              />
            </div>
          )}
          {payForm.paymentMethod === "cash" && (
            <div>
              <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Cash Ref (auto-generated)</label>
              <input
                type="text"
                readOnly
                value={payForm.mpesaRef || (() => { const r = `CASH-${Date.now().toString(36).toUpperCase()}`; setTimeout(() => setP("mpesaRef", r), 0); return r; })()}
                className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-[#8b95a1] font-mono outline-none cursor-not-allowed"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Payment Date</label>
            <input
              type="date" value={payForm.paymentDate}
              onChange={(e) => setP("paymentDate", e.target.value)}
              className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
            />
          </div>

          <div>
            <label className="text-[10px] text-[#8b95a1] uppercase tracking-wider block mb-1">Notes (optional)</label>
            <input
              type="text" placeholder="Any extra details..."
              value={payForm.notes}
              onChange={(e) => setP("notes", e.target.value)}
              className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#c8f230]"
            />
          </div>

          <Btn onClick={handleSubmit} disabled={submitPayment.isPending} className="w-full">
            {submitPayment.isPending ? "Submitting…" : "Submit for Approval"}
          </Btn>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectId && (
        <div className="bg-[#0a0d0f] border border-[#ff4d4f]/30 rounded-xl p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-[#ff4d4f]">Rejection Reason *</p>
          <input
            type="text" placeholder="Why is this payment being rejected?"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full bg-[#111418] border border-[#21272f] rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#ff4d4f]"
          />
          <div className="flex gap-2">
            <button onClick={() => { setRejectId(null); setRejectReason(""); }}
              className="flex-1 text-xs py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white">Cancel</button>
            <button onClick={handleReject} disabled={rejectPayment.isPending}
              className="flex-1 text-xs py-2 rounded-xl bg-[#ff4d4f] text-white font-semibold hover:bg-[#ff6b6b]">
              {rejectPayment.isPending ? "Rejecting…" : "Confirm Reject"}
            </button>
          </div>
        </div>
      )}

      {/* Payment history */}
      {isLoading && <p className="text-xs text-[#4a5568] py-2">Loading payments…</p>}
      {payments.length === 0 && !isLoading && (
        <p className="text-xs text-[#4a5568] py-2 text-center">No payments recorded yet</p>
      )}

      <div className="space-y-2">
        {payments.map((p) => {
          const s = PAYMENT_STATUS_STYLES[p.status] ?? PAYMENT_STATUS_STYLES.pending;
          return (
            <div key={p.id} className={`rounded-xl px-3 py-2.5 border ${s.bg} ${s.border}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* Amount + method + status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold font-mono ${s.text}`}>{formatKES(p.amount)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#21272f] text-[#8b95a1]">
                      {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                    </span>
                    {p.mpesa_ref && (
                      <span className="text-[10px] font-mono text-[#c8f230]">{p.mpesa_ref}</span>
                    )}
                    <PayBadge status={p.status} />
                  </div>

                  {/* Notes */}
                  {p.notes && <p className="text-[10px] text-[#4a5568] mt-0.5">{p.notes}</p>}

                  {/* Rejection reason */}
                  {p.status === "rejected" && p.rejection_reason && (
                    <p className="text-[10px] text-[#ff4d4f] mt-1">
                      Reason: {p.rejection_reason}
                    </p>
                  )}

                  {/* Meta */}
                  <p className="text-[10px] text-[#4a5568] mt-1 font-mono">
                    {p.payment_date
                      ? format(new Date(p.payment_date), "dd MMM yyyy")
                      : format(new Date(p.created), "dd MMM yyyy")}
                    {p.expand?.recorded_by?.name && ` · by ${p.expand.recorded_by.name}`}
                    {p.status !== "pending" && p.expand?.reviewed_by?.name && (
                      <span className={s.text}> · {p.status === "approved" ? "approved" : "rejected"} by {p.expand.reviewed_by.name}</span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {/* Managers see approve/reject on pending payments */}
                  {isManager && p.status === "pending" && (
                    <>
                      <button
                        onClick={() => approvePayment.mutate({ paymentId: p.id })}
                        disabled={approvePayment.isPending}
                        className="text-[10px] px-2 py-1 rounded-lg bg-[#00c096] text-white font-semibold hover:bg-[#00d4a8] whitespace-nowrap"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => { setRejectId(p.id); setRejectReason(""); }}
                        className="text-[10px] px-2 py-1 rounded-lg bg-[#ff4d4f] text-white font-semibold hover:bg-[#ff6b6b] whitespace-nowrap"
                      >
                        ✗ Reject
                      </button>
                    </>
                  )}
                  {/* Admin can always delete */}
                  {user?.role === "admin" && (
                    <button
                      onClick={() => { if (confirm("Delete this payment?")) deletePayment.mutate({ paymentId: p.id, orderId: order.id }); }}
                      className="text-[#ff4d4f]/40 hover:text-[#ff4d4f] p-1 transition-colors"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ORDER CARD ───────────────────────────────────────────────────────────────
function OrderCard({ order, onView }) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;

  return (
    <div
      className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2a3040] transition-all cursor-pointer card-lift"
      onClick={() => onView(order)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <OrderStatusBadge status={order.status} />
            <span className="text-[10px] font-mono text-[#4a5568]">{order.order_no}</span>
          </div>
          <h3 className="font-semibold text-white truncate">{order.customer_name}</h3>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-[#8b95a1] capitalize flex items-center gap-1">
              <User size={10} />{order.customer_category}
            </span>
            {order.county && (
              <span className="text-xs text-[#8b95a1] flex items-center gap-1">
                <MapPin size={10} />{order.county}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-[#c8f230] text-base">{formatKES(order.order_amount)}</p>
          <p className="text-[10px] text-[#8b95a1] font-mono mt-0.5">
            {order.submitted_at || order.order_date ? formatDistanceToNow(new Date(order.submitted_at || order.order_date), { addSuffix: true }) : "—"}
          </p>
        </div>
      </div>

      {order.status === "approved" && (
        <PaymentProgress orderId={order.id} orderAmount={order.order_amount} />
      )}

      {order.status === "rejected" && order.rejection_reason && (
        <div className="mt-3 px-3 py-2 bg-[#ff4d4f]/10 border border-[#ff4d4f]/20 rounded-xl">
          <p className="text-xs text-[#ff4d4f] flex items-start gap-1.5">
            <XCircle size={11} className="mt-0.5 flex-shrink-0" />{order.rejection_reason}
          </p>
        </div>
      )}
      {order.status === "revision_requested" && order.rejection_reason && (
        <div className="mt-3 px-3 py-2 bg-[#c8f230]/10 border border-[#c8f230]/20 rounded-xl">
          <p className="text-xs text-[#c8f230] flex items-start gap-1.5">
            <RefreshCcw size={11} className="mt-0.5 flex-shrink-0" />{order.rejection_reason}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { user } = useAuth();
  const isAdmin = ["admin", "manager", "supervisor"].includes(user?.role);
  const { position } = useGPS();

  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [camOpen, setCamOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [attachments, setAttachments] = useState([]);
  const [attachPreviews, setAttachPreviews] = useState([]);
  const fileRef = useRef();

  const { data, isLoading } = useOrders({ filter });
  const createMut = useCreateOrder();
  useOrdersRealtime();

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...files]);
    setAttachPreviews((prev) => [...prev, ...files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : null
    )]);
  };

  const handleCameraCapture = ({ blob }) => {
    setCamOpen(false);
    const file = new File([blob], `order-${Date.now()}.jpg`, { type: "image/jpeg" });
    setAttachments((prev) => [...prev, file]);
    setAttachPreviews((prev) => [...prev, URL.createObjectURL(blob)]);
    toast.success("Photo attached!");
  };

  const removeAttachment = (i) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
    setAttachPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = () => {
    if (!form.customer_name) return toast.error("Customer name required");
    if (!form.order_amount || isNaN(Number(form.order_amount))) return toast.error("Valid order amount required");
    if (Number(form.order_amount) <= 0) return toast.error("Amount must be greater than 0");

    createMut.mutate(
      { formData: form, attachments, position },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm(BLANK_FORM);
          setAttachments([]);
          setAttachPreviews([]);
        },
      }
    );
  };

  const filters = ["all", "pending_approval", "approved", "rejected", "revision_requested"];
  const filterLabels = { all: "All", pending_approval: "Pending", approved: "Approved", rejected: "Rejected", revision_requested: "Revision" };
  const totalApproved = data?.items.filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.order_amount || 0), 0) ?? 0;

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <ShoppingCart size={22} className="text-[#c8f230]" /> Orders
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">
            {data?.totalItems ?? 0} orders · <span className="text-[#00c096]">{formatKES(totalApproved)} approved</span>
          </p>
        </div>
        <Btn onClick={() => setShowCreate(true)}><Plus size={16} /> New Order</Btn>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => {
          const count = f === "all" ? (data?.totalItems ?? 0) : (data?.items.filter((o) => o.status === f).length ?? 0);
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-medium capitalize transition-all flex items-center gap-1.5 ${
                filter === f ? "bg-[#c8f230] text-[#0a0d0f]" : "bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white"
              }`}>
              {filterLabels[f]}
              <span className={`text-[10px] rounded-full px-1.5 ${filter === f ? "bg-[#0a0d0f]/30" : "bg-[#21272f]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {isLoading && <div className="py-16 text-center text-[#8b95a1] text-sm">Loading orders…</div>}
        {data?.items.map((order) => (
          <OrderCard key={order.id} order={order} onView={setSelected} />
        ))}
        {!isLoading && !data?.items.length && (
          <div className="py-16 text-center text-[#8b95a1]">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No orders found</p>
            <p className="text-xs mt-1 text-[#4a5568]">Submit your first order to get started</p>
          </div>
        )}
      </div>

      {/* ── CREATE ORDER MODAL ─────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Order" width="max-w-lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input label="Customer Name *" placeholder="e.g. Kamau Agrovets, Nakuru"
                value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </div>
            <Select label="Customer Category *" value={form.customer_category} onChange={(e) => set("customer_category", e.target.value)}>
              {CUSTOMER_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </Select>
            <Input label="Phone (optional)" placeholder="+254 7XX XXX XXX" type="tel"
              value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} />
          </div>

          <Textarea label="Products / Order Description" placeholder="e.g. 50 bags of Safi Urea…" rows={3}
            value={form.product_description} onChange={(e) => set("product_description", e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">Order Amount (KES) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b95a1] font-mono">KES</span>
                <input type="number" min="0" step="100" placeholder="0" value={form.order_amount}
                  onChange={(e) => set("order_amount", e.target.value)}
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors" />
              </div>
              {form.order_amount && !isNaN(Number(form.order_amount)) && (
                <p className="text-[10px] text-[#c8f230] mt-1 font-mono">{formatKES(form.order_amount)}</p>
              )}
            </div>
            <Select label="County" value={form.county} onChange={(e) => set("county", e.target.value)}>
              <option value="">Select county…</option>
              {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {position && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#00c096]/10 border border-[#00c096]/20 rounded-xl">
              <MapPin size={12} className="text-[#00c096]" />
              <span className="text-xs text-[#00c096]">GPS captured (±{Math.round(position.accuracy)}m accuracy)</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">Order Form / Receipt (optional)</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors">
                <Upload size={13} /> Upload File
              </button>
              <button onClick={() => setCamOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors">
                <Camera size={13} /> Take Photo
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFileChange} />
            {attachPreviews.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {attachPreviews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#21272f] bg-[#0a0d0f] flex items-center justify-center">
                    {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-[#8b95a1]" />}
                    <button onClick={() => removeAttachment(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#ff4d4f] text-white flex items-center justify-center">
                      <XCircle size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Textarea label="Notes (optional)" placeholder="Special instructions, payment terms, etc." rows={2}
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn onClick={handleSubmit} disabled={createMut.isPending} className="flex-1">
            {createMut.isPending ? "Submitting…" : "Submit for Approval"}
          </Btn>
        </div>
      </Modal>

      {/* ── ORDER DETAIL MODAL ─────────────────────────────────────────────── */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Order Details" width="max-w-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <OrderStatusBadge status={selected.status} />
              <span className="text-[10px] font-mono text-[#4a5568]">{selected.order_no}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[#8b95a1] text-xs mb-1">Customer</p><p className="text-white font-medium">{selected.customer_name}</p></div>
              <div><p className="text-[#8b95a1] text-xs mb-1">Category</p><p className="text-white capitalize">{selected.customer_category}</p></div>
              <div><p className="text-[#8b95a1] text-xs mb-1">Amount</p><p className="text-[#c8f230] font-bold text-base">{formatKES(selected.order_amount)}</p></div>
              <div><p className="text-[#8b95a1] text-xs mb-1">County</p><p className="text-white">{selected.county || "—"}</p></div>
            </div>
            {selected.product_description && (
              <div><p className="text-[#8b95a1] text-xs mb-1">Products</p><p className="text-[#c2cad4] text-sm">{selected.product_description}</p></div>
            )}
            {selected.notes && (
              <div><p className="text-[#8b95a1] text-xs mb-1">Notes</p><p className="text-[#c2cad4] text-sm">{selected.notes}</p></div>
            )}
            {(selected.status === "rejected" || selected.status === "revision_requested") && selected.rejection_reason && (
              <div className={`p-3 rounded-xl border ${selected.status === "rejected" ? "bg-[#ff4d4f]/10 border-[#ff4d4f]/20" : "bg-[#c8f230]/10 border-[#c8f230]/20"}`}>
                <p className={`text-xs font-medium mb-1 ${selected.status === "rejected" ? "text-[#ff4d4f]" : "text-[#c8f230]"}`}>
                  {selected.status === "rejected" ? "Rejection Reason" : "Revision Note"}
                </p>
                <p className="text-sm text-[#c2cad4]">{selected.rejection_reason}</p>
              </div>
            )}
            <p className="text-xs text-[#4a5568] font-mono">Submitted {selected.created ? format(new Date(selected.created), "dd MMM yyyy HH:mm") : "—"}</p>

            {/* Payments panel */}
            <PaymentsPanel order={selected} isAdmin={isAdmin} />
          </div>
          <div className="pt-4 border-t border-[#21272f] mt-4">
            <Btn variant="ghost" onClick={() => setSelected(null)} className="w-full">Close</Btn>
          </div>
        </Modal>
      )}

      <CameraCapture open={camOpen} onClose={() => setCamOpen(false)} onCapture={handleCameraCapture}
        title="Capture Order Form" facingMode="environment" />
    </div>
  );
}