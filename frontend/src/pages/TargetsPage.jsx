// src/pages/admin/TargetsPage.jsx
// Set monthly sales targets per staff member — individual or bulk

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useTargets, useSetTarget, useBulkSetTargets, getMonthOptions, calculateCommission, DEFAULT_TIERS } from "../hooks/useTargets";
import { currentMonth, formatKES } from "../hooks/useOrders";
import { Modal } from "../components/ui/Modal";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Textarea } from "../components/ui/Input";
import {
  Target, Users, Plus, Edit3, ChevronRight, TrendingUp, Save,
  DollarSign, Award, Zap, Settings
} from "lucide-react";
import toast from "react-hot-toast";

const CATEGORY_LABELS = {
  distributor: { label: "Distributors", emoji: "🏭", color: "text-[#3b82f6]" },
  stockist:    { label: "Stockists",    emoji: "🏪", color: "text-[#00c096]" },
  agrovet:     { label: "Agrovets",    emoji: "🌿", color: "text-[#ffab00]" },
  farmer:      { label: "Farmers",     emoji: "🌾", color: "text-[#c8f230]" },
};

function TargetCard({ staffMember, target, onEdit }) {
  const hasTarget = !!target;
  return (
    <div className="bg-[#111418] border border-[#21272f] rounded-2xl p-4 hover:border-[#2a3040] transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#c8f230]/10 border border-[#c8f230]/20 flex items-center justify-center text-sm font-bold text-[#c8f230]">
            {staffMember.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{staffMember.name}</p>
            <p className="text-xs text-[#8b95a1]">{staffMember.county || staffMember.region || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasTarget ? (
            <div className="text-right">
              <p className="text-sm font-bold text-[#c8f230]">{formatKES(target.target_amount)}</p>
              <p className="text-[10px] text-[#8b95a1]">target set</p>
            </div>
          ) : (
            <Badge label="No Target" color="default" size="xs" />
          )}
          <button
            onClick={() => onEdit(staffMember, target)}
            className="p-2 rounded-xl bg-[#21272f] text-[#8b95a1] hover:text-white hover:bg-[#2a3040] transition-colors"
          >
            <Edit3 size={13} />
          </button>
        </div>
      </div>

      {/* Category targets mini breakdown */}
      {hasTarget && (target.target_distributor || target.target_stockist || target.target_agrovet || target.target_farmer) ? (
        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#21272f]">
          {Object.entries(CATEGORY_LABELS).map(([cat, cfg]) => {
            const val = target[`target_${cat}`] ?? 0;
            return (
              <div key={cat} className="text-center">
                <p className="text-[10px] text-[#8b95a1]">{cfg.emoji}</p>
                <p className={`text-[10px] font-medium ${val > 0 ? cfg.color : "text-[#4a5568]"}`}>
                  {val > 0 ? `${(val / 1000).toFixed(0)}K` : "—"}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function TargetsPage() {
  const monthOptions = getMonthOptions(3);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [editingStaff, setEditingStaff] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showCommission, setShowCommission] = useState(false);

  // Individual target form
  const [targetAmount, setTargetAmount] = useState("");
  const [catTargets, setCatTargets] = useState({ distributor: "", stockist: "", agrovet: "", farmer: "" });
  const [bulkAmount, setBulkAmount] = useState("");

  // Commission calc
  const [commAmount, setCommAmount] = useState("");

  const { data: staff } = useQuery({
    queryKey: ["staff-field"],
    queryFn: () =>
      pb.collection("ft_users").getFullList({
        filter: `role = "field_staff" && status = "active"`,
        sort: "name",
      }),
  });

  const { data: targets } = useTargets(selectedMonth);

  const setTargetMut = useSetTarget();
  const bulkMut = useBulkSetTargets();

  const targetByStaff = {};
  (targets ?? []).forEach((t) => {
    targetByStaff[t.staff] = t;
  });

  const openEdit = (staffMember, target) => {
    setEditingStaff(staffMember);
    setEditingTarget(target ?? null);
    setTargetAmount(target?.target_amount ? String(target.target_amount) : "");
    setCatTargets({
      distributor: target?.target_distributor ? String(target.target_distributor) : "",
      stockist:    target?.target_stockist    ? String(target.target_stockist)    : "",
      agrovet:     target?.target_agrovet     ? String(target.target_agrovet)     : "",
      farmer:      target?.target_farmer      ? String(target.target_farmer)      : "",
    });
  };

  const handleSave = () => {
    if (!targetAmount || isNaN(Number(targetAmount))) return toast.error("Valid target amount required");
    setTargetMut.mutate(
      {
        staffId: editingStaff.id,
        month: selectedMonth,
        targetAmount: Number(targetAmount),
        categoryTargets: {
          distributor: Number(catTargets.distributor || 0),
          stockist:    Number(catTargets.stockist    || 0),
          agrovet:     Number(catTargets.agrovet     || 0),
          farmer:      Number(catTargets.farmer      || 0),
        },
      },
      {
        onSuccess: () => {
          setEditingStaff(null);
        },
      }
    );
  };

  const handleBulkSave = () => {
    if (!bulkAmount || isNaN(Number(bulkAmount))) return toast.error("Valid target amount required");
    const staffIds = (staff ?? []).map((s) => s.id);
    bulkMut.mutate(
      { staffIds, month: selectedMonth, defaultTarget: Number(bulkAmount) },
      { onSuccess: () => setShowBulk(false) }
    );
  };

  // Auto-fill: distribute total among categories
  const autoDistribute = () => {
    const total = Number(targetAmount);
    if (!total) return;
    const dist = { distributor: total * 0.35, stockist: total * 0.25, agrovet: total * 0.25, farmer: total * 0.15 };
    setCatTargets({
      distributor: String(Math.round(dist.distributor)),
      stockist:    String(Math.round(dist.stockist)),
      agrovet:     String(Math.round(dist.agrovet)),
      farmer:      String(Math.round(dist.farmer)),
    });
  };

  const commCalc = commAmount && !isNaN(Number(commAmount))
    ? calculateCommission(Number(commAmount))
    : 0;

  const staffWithTargets = (staff ?? []).filter((s) => targetByStaff[s.id]);
  const staffWithoutTargets = (staff ?? []).filter((s) => !targetByStaff[s.id]);

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-white flex items-center gap-2">
            <Target size={22} className="text-[#c8f230]" /> Sales Targets
          </h1>
          <p className="text-[#8b95a1] text-sm mt-0.5">
            {staffWithTargets.length} of {(staff ?? []).length} staff have targets
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => setShowCommission(true)}>
            <DollarSign size={14} /> Commission
          </Btn>
          <Btn size="sm" onClick={() => setShowBulk(true)}>
            <Zap size={14} /> Bulk Set
          </Btn>
        </div>
      </div>

      {/* Month selector */}
      <Select
        label="Month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
      >
        {monthOptions.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </Select>

      {/* Staff without targets warning */}
      {staffWithoutTargets.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-[#ffab00]/10 border border-[#ffab00]/20 rounded-xl">
          <Award size={16} className="text-[#ffab00] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-[#ffab00] font-medium">
              {staffWithoutTargets.length} staff have no target for {selectedMonth}
            </p>
            <p className="text-xs text-[#8b95a1] mt-0.5">
              Use Bulk Set or edit individually
            </p>
          </div>
          <Btn size="sm" onClick={() => setShowBulk(true)} className="ml-auto flex-shrink-0">
            Set All
          </Btn>
        </div>
      )}

      {/* Staff list */}
      <div className="space-y-2">
        {(staff ?? []).map((s) => (
          <TargetCard
            key={s.id}
            staffMember={s}
            target={targetByStaff[s.id] ?? null}
            onEdit={openEdit}
          />
        ))}
        {!staff?.length && (
          <div className="py-16 text-center text-[#8b95a1] text-sm">
            <Users size={32} className="mx-auto mb-2 opacity-20" />
            No active field staff found
          </div>
        )}
      </div>

      {/* ─── INDIVIDUAL TARGET MODAL ─────────────────────────────────────────── */}
      {editingStaff && (
        <Modal
          open={!!editingStaff}
          onClose={() => setEditingStaff(null)}
          title={`Set Target — ${editingStaff.name}`}
          width="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-[#0a0d0f] rounded-xl border border-[#21272f]">
              <p className="text-xs text-[#8b95a1]">Month: <span className="text-white font-medium">{selectedMonth}</span></p>
              <p className="text-xs text-[#8b95a1] mt-0.5">Staff: <span className="text-white font-medium">{editingStaff.name}</span></p>
            </div>

            {/* Total target */}
            <div>
              <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">
                Total Monthly Target (KES) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b95a1] font-mono">KES</span>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  placeholder="e.g. 1000000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors"
                />
              </div>
              {targetAmount && !isNaN(Number(targetAmount)) && (
                <p className="text-[10px] text-[#c8f230] mt-1 font-mono">{formatKES(targetAmount)}</p>
              )}
            </div>

            {/* Category breakdown */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider">
                  Category Breakdown (optional)
                </label>
                <button
                  onClick={autoDistribute}
                  className="text-[10px] text-[#c8f230] hover:underline"
                >
                  Auto-distribute
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CATEGORY_LABELS).map(([cat, cfg]) => (
                  <div key={cat}>
                    <label className="text-[10px] text-[#8b95a1] block mb-1">
                      {cfg.emoji} {cfg.label}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      placeholder="0"
                      value={catTargets[cat]}
                      onChange={(e) => setCatTargets((p) => ({ ...p, [cat]: e.target.value }))}
                      className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#c8f230] transition-colors"
                    />
                  </div>
                ))}
              </div>
              {/* Category sum vs total */}
              {targetAmount && (
                (() => {
                  const catSum = Object.values(catTargets).reduce((s, v) => s + Number(v || 0), 0);
                  const total = Number(targetAmount);
                  const diff = total - catSum;
                  if (catSum === 0) return null;
                  return (
                    <p className={`text-[10px] mt-1 ${Math.abs(diff) < 1 ? "text-[#00c096]" : "text-[#ffab00]"}`}>
                      Category sum: {formatKES(catSum)} {diff !== 0 ? `(${diff > 0 ? "+" : ""}${formatKES(diff)} unallocated)` : "✓ Balanced"}
                    </p>
                  );
                })()
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
            <Btn variant="ghost" onClick={() => setEditingStaff(null)} className="flex-1">Cancel</Btn>
            <Btn
              onClick={handleSave}
              disabled={setTargetMut.isPending || !targetAmount}
              className="flex-1"
            >
              <Save size={14} />
              {setTargetMut.isPending ? "Saving…" : "Save Target"}
            </Btn>
          </div>
        </Modal>
      )}

      {/* ─── BULK SET MODAL ──────────────────────────────────────────────────── */}
      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Bulk Set Targets" width="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-[#8b95a1]">
            Set the same target for all <span className="text-white font-medium">{(staff ?? []).length} active field staff</span> for {selectedMonth}.
          </p>
          <p className="text-xs text-[#ffab00] bg-[#ffab00]/10 border border-[#ffab00]/20 rounded-xl px-3 py-2">
            This will overwrite existing targets. Set individual targets afterwards if needed.
          </p>
          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">
              Target per Staff (KES) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b95a1] font-mono">KES</span>
              <input
                type="number"
                min="0"
                step="50000"
                placeholder="e.g. 500000"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(e.target.value)}
                className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors"
              />
            </div>
            {bulkAmount && !isNaN(Number(bulkAmount)) && (
              <p className="text-[10px] text-[#c8f230] mt-1 font-mono">
                {formatKES(bulkAmount)} × {(staff ?? []).length} staff = {formatKES(Number(bulkAmount) * (staff ?? []).length)} total
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 pt-5 border-t border-[#21272f] mt-5">
          <Btn variant="ghost" onClick={() => setShowBulk(false)} className="flex-1">Cancel</Btn>
          <Btn
            onClick={handleBulkSave}
            disabled={bulkMut.isPending || !bulkAmount}
            className="flex-1"
          >
            {bulkMut.isPending ? "Setting…" : `Set for All ${(staff ?? []).length} Staff`}
          </Btn>
        </div>
      </Modal>

      {/* ─── COMMISSION CALCULATOR MODAL ─────────────────────────────────────── */}
      <Modal open={showCommission} onClose={() => setShowCommission(false)} title="Commission Calculator" width="max-w-sm">
        <div className="space-y-4">
          <p className="text-sm text-[#8b95a1]">Calculate commission based on approved sales amount.</p>

          {/* Tiers display */}
          <div className="space-y-1.5">
            {DEFAULT_TIERS.map((tier, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-[#0a0d0f] rounded-xl border border-[#21272f]">
                <span className="text-xs text-[#8b95a1]">{tier.label}</span>
                <span className="text-xs font-bold text-[#c8f230]">{tier.rate}% commission</span>
              </div>
            ))}
          </div>

          {/* Calculator */}
          <div>
            <label className="text-xs font-medium text-[#8b95a1] uppercase tracking-wider block mb-1.5">
              Approved Sales Amount (KES)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b95a1] font-mono">KES</span>
              <input
                type="number"
                min="0"
                step="10000"
                placeholder="0"
                value={commAmount}
                onChange={(e) => setCommAmount(e.target.value)}
                className="w-full bg-[#0a0d0f] border border-[#21272f] rounded-xl pl-12 pr-4 py-3 text-sm text-white outline-none focus:border-[#c8f230] transition-colors"
              />
            </div>
          </div>

          {commCalc > 0 && (
            <div className="p-4 bg-[#c8f230]/10 border border-[#c8f230]/20 rounded-2xl text-center">
              <p className="text-[#8b95a1] text-xs mb-1">Commission Earned</p>
              <p className="text-[#c8f230] font-bold text-2xl">{formatKES(Math.round(commCalc))}</p>
              <p className="text-[10px] text-[#8b95a1] mt-1">
                on {formatKES(commAmount)} sales ({((commCalc / Number(commAmount)) * 100).toFixed(1)}% effective rate)
              </p>
            </div>
          )}
        </div>
        <div className="pt-4 border-t border-[#21272f] mt-4">
          <Btn variant="ghost" onClick={() => setShowCommission(false)} className="w-full">Close</Btn>
        </div>
      </Modal>
    </div>
  );
}
