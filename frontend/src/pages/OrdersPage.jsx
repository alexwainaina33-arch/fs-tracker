// src/pages/OrdersPage.jsx
// Field staff order creation and history with approval status tracking

import React, { useState, useRef } from "react";
import { useAuth } from "../store/auth";
import { useOrders, useCreateOrder, useOrdersRealtime, formatKES, CUSTOMER_CATEGORIES } from "../hooks/useOrders";
import { useGPS } from "../hooks/useGPS";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import CameraCapture from "../components/CameraCapture";
import {
  Plus, ShoppingCart, Camera, MapPin, Phone, User, Package,
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCcw, Upload, Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

const STATUS_CONFIG = {
  draft:               { label: "Draft",            color: "default", icon: Clock },
  pending_approval:    { label: "Pending Approval", color: "warn",    icon: Clock },
  approved:            { label: "Approved",          color: "ok",      icon: CheckCircle },
  rejected:            { label: "Rejected",          color: "danger",  icon: XCircle },
  revision_requested:  { label: "Needs Revision",    color: "blue",    icon: RefreshCcw },
};

const KENYA_COUNTIES = [
  "Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay",
  "Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii",
  "Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera",
  "Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi",
  "Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River",
  "Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
];

const BLANK_FORM = {
  customer_name: "",
  customer_phone: "",
  customer_category: "agrovet",
  product_description: "",
  order_amount: "",
  county: "",
  notes: "",
};

function OrderStatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <Badge label={cfg.label} color={cfg.color} size="xs" />;
}

function OrderCard({ order, onView }) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.draft;
  const Icon = cfg.icon;

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
            {formatDistanceToNow(new Date(order.submitted_at || order.order_date), { addSuffix: true })}
          </p>
        </div>
      </div>

      {order.status === "rejected" && order.rejection_reason && (
        <div className="mt-3 px-3 py-2 bg-[#ff4d4f]/10 border border-[#ff4d4f]/20 rounded-xl">
          <p className="text-xs text-[#ff4d4f] flex items-start gap-1.5">
            <XCircle size={11} className="mt-0.5 flex-shrink-0" />
            {order.rejection_reason}
          </p>
        </div>
      )}

      {order.status === "revision_requested" && order.rejection_reason && (
        <div className="mt-3 px-3 py-2 bg-[#c8f230]/10 border border-[#c8f230]/20 rounded-xl">
          <p className="text-xs text-[#c8f230] flex items-start gap-1.5">
            <RefreshCcw size={11} className="mt-0.5 flex-shrink-0" />
            {order.rejection_reason}
          </p>
        </div>
      )}
    </div>
  );
}

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
    const previews = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : null
    );
    setAttachPreviews((prev) => [...prev, ...previews]);
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
    if (!form.customer_category) return toast.error("Customer category required");
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
  const filterLabels = {
    all: "All",
    pending_approval: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    revision_requested: "Revision",
  };

  const totalApproved = data?.items
    .filter((o) => o.status === "approved")
    .reduce((s, o) => s + Number(o.order_amount || 0), 0) ?? 0;

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
        <Btn onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Order
        </Btn>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => {
          const count = f === "all" ? (data?.totalItems ?? 0) : (data?.items.filter((o) => o.status === f).length ?? 0);
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-medium capitalize transition-all flex items-center gap-1.5 ${
                filter === f
                  ? "bg-[#c8f230] text-[#0a0d0f]"
                  : "bg-[#111418] border border-[#21272f] text-[#8b95a1] hover:text-white"
              }`}
            >
              {filterLabels[f]}
              <span className={`text-[10px] rounded-full px-1.5 ${filter === f ? "bg-[#0a0d0f]/30" : "bg-[#21272f]"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      <div className="space-y-3">
        {isLoading && (
          <div className="py-16 text-center text-[#8b95a1] text-sm">Loading orders…</div>
        )}
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

      {/* ─── CREATE ORDER MODAL ─────────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Order" width="max-w-lg">
        <div className="space-y-4">
          {/* Customer info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input
                label="Customer Name *"
                placeholder="e.g. Kamau Agrovets, Nakuru"
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
              />
            </div>
            <Select
              label="Customer Category *"
              value={form.customer_category}
              onChange={(e) => set("customer_category", e.target.value)}
            >
              {CUSTOMER_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </Select>
            <Input
              label="Phone (optional)"
              placeholder="+254 7XX XXX XXX"
              type="tel"
              value={form.customer_phone}
              onChange={(e) => set("customer_phone", e.target.value)}
            />
          </div>

          {/* Order details */}
          <Textarea
            label="Products / Order Description"
            placeholder="e.g. 50 bags of Safi Urea, 20L Bio-stimulant..."
            rows={3}
            value={form.product_description}
            onChange={(e) => set("product_description", e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">
                Order Amount (KES) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b95a1] font-mono">KES</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={form.order_amount}
                  onChange={(e) => set("order_amount", e.target.value)}
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors"
                />
              </div>
              {form.order_amount && !isNaN(Number(form.order_amount)) && (
                <p className="text-[10px] text-[#c8f230] mt-1 font-mono">{formatKES(form.order_amount)}</p>
              )}
            </div>
            <Select
              label="County"
              value={form.county}
              onChange={(e) => set("county", e.target.value)}
            >
              <option value="">Select county…</option>
              {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {/* GPS indicator */}
          {position && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#00c096]/10 border border-[#00c096]/20 rounded-xl">
              <MapPin size={12} className="text-[#00c096]" />
              <span className="text-xs text-[#00c096]">
                GPS captured (±{Math.round(position.accuracy)}m accuracy)
              </span>
            </div>
          )}

          {/* Attachments */}
          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-2">
              Order Form / Receipt (optional)
            </label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors"
              >
                <Upload size={13} /> Upload File
              </button>
              <button
                onClick={() => setCamOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white text-xs font-medium transition-colors"
              >
                <Camera size={13} /> Take Photo
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            {attachPreviews.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {attachPreviews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#21272f] bg-[#0a0d0f] flex items-center justify-center">
                    {src ? (
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package size={18} className="text-[#8b95a1]" />
                    )}
                    <button
                      onClick={() => removeAttachment(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#ff4d4f] text-white flex items-center justify-center"
                    >
                      <XCircle size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Textarea
            label="Notes (optional)"
            placeholder="Special instructions, payment terms, etc."
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Btn>
          <Btn
            onClick={handleSubmit}
            disabled={createMut.isPending}
            className="flex-1"
          >
            {createMut.isPending ? "Submitting…" : "Submit for Approval"}
          </Btn>
        </div>
      </Modal>

      {/* ─── ORDER DETAIL MODAL ──────────────────────────────────────────────── */}
      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title="Order Details" width="max-w-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <OrderStatusBadge status={selected.status} />
              <span className="text-[10px] font-mono text-[#4a5568]">{selected.order_no}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Customer</p>
                <p className="text-white font-medium">{selected.customer_name}</p>
              </div>
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Category</p>
                <p className="text-white capitalize">{selected.customer_category}</p>
              </div>
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Amount</p>
                <p className="text-[#c8f230] font-bold text-base">{formatKES(selected.order_amount)}</p>
              </div>
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">County</p>
                <p className="text-white">{selected.county || "—"}</p>
              </div>
            </div>

            {selected.product_description && (
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Products</p>
                <p className="text-[#c2cad4] text-sm">{selected.product_description}</p>
              </div>
            )}

            {selected.notes && (
              <div>
                <p className="text-[#8b95a1] text-xs mb-1">Notes</p>
                <p className="text-[#c2cad4] text-sm">{selected.notes}</p>
              </div>
            )}

            {(selected.status === "rejected" || selected.status === "revision_requested") && selected.rejection_reason && (
              <div className={`p-3 rounded-xl border ${
                selected.status === "rejected"
                  ? "bg-[#ff4d4f]/10 border-[#ff4d4f]/20"
                  : "bg-[#c8f230]/10 border-[#c8f230]/20"
              }`}>
                <p className={`text-xs font-medium mb-1 ${
                  selected.status === "rejected" ? "text-[#ff4d4f]" : "text-[#c8f230]"
                }`}>
                  {selected.status === "rejected" ? "Rejection Reason" : "Revision Note"}
                </p>
                <p className="text-sm text-[#c2cad4]">{selected.rejection_reason}</p>
              </div>
            )}

            <p className="text-xs text-[#4a5568] font-mono">
              Submitted {format(new Date(selected.created), "dd MMM yyyy HH:mm")}
            </p>
          </div>
          <div className="pt-4 border-t border-[#21272f] mt-4">
            <Btn variant="ghost" onClick={() => setSelected(null)} className="w-full">Close</Btn>
          </div>
        </Modal>
      )}

      {/* Camera */}
      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={handleCameraCapture}
        title="Capture Order Form"
        facingMode="environment"
      />
    </div>
  );
}
