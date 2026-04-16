// src/hooks/useTargets.js
// Targets, leaderboard data, and commission calculations

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { useOrdersSummary, currentMonth, formatKES } from "./useOrders";
import toast from "react-hot-toast";

// ─── FETCH ALL STAFF (for name resolution) ────────────────────────────────────
async function fetchAllStaff() {
  try {
    const staff = await pb.collection("ft_users").getFullList({
      fields: "id,name,county,region,role",
      sort: "name",
    });
    const map = {};
    for (const s of staff) map[s.id] = s;
    return map;
  } catch (e) {
    console.warn("Could not fetch staff list:", e);
    return {};
  }
}

// ─── FETCH TARGETS ────────────────────────────────────────────────────────────
export function useTargets(month = currentMonth()) {
  return useQuery({
    queryKey: ["targets", month],
    queryFn: () =>
      pb.collection("ft_order_targets").getFullList({
        filter: `month = "${month}"`,
        expand: "staff,set_by",
        sort: "-month",
      }),
    staleTime: 60000,
  });
}

// ─── FETCH MY TARGET ─────────────────────────────────────────────────────────
export function useMyTarget(month = currentMonth()) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-target", user?.id, month],
    queryFn: async () => {
      try {
        return await pb.collection("ft_order_targets").getFirstListItem(
          `staff = "${user.id}" && month = "${month}"`
        );
      } catch {
        return null;
      }
    },
    staleTime: 60000,
  });
}

// ─── NOTIFY STAFF OF TARGET ───────────────────────────────────────────────────
async function notifyTargetSet(staffId, targetAmount, month, isUpdate = false) {
  try {
    await pb.collection("ft_notifications").create({
      recipient: staffId,
      type: isUpdate ? "target_updated" : "target_set",
      title: isUpdate ? "🎯 Target Updated" : "🎯 Sales Target Set",
      body: `Your sales target for ${month} has been ${isUpdate ? "updated to" : "set to"} KES ${Number(targetAmount).toLocaleString("en-KE")}. Give it your best!`,
      reference_type: "ft_order_targets",
      is_read: false,
    });
  } catch (e) {
    console.warn("Target notification failed:", e);
  }
}

// ─── SET TARGET ───────────────────────────────────────────────────────────────
export function useSetTarget() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ staffId, month, targetAmount, categoryTargets = {} }) => {
      let existing = null;
      try {
        existing = await pb.collection("ft_order_targets").getFirstListItem(
          `staff = "${staffId}" && month = "${month}"`
        );
      } catch {}

      const payload = {
        staff: staffId,
        month,
        target_amount: Number(targetAmount),
        target_distributor: Number(categoryTargets.distributor || 0),
        target_stockist: Number(categoryTargets.stockist || 0),
        target_agrovet: Number(categoryTargets.agrovet || 0),
        target_farmer: Number(categoryTargets.farmer || 0),
        set_by: user.id,
      };

      let result;
      if (existing) {
        result = await pb.collection("ft_order_targets").update(existing.id, payload);
      } else {
        result = await pb.collection("ft_order_targets").create(payload);
      }

      await notifyTargetSet(staffId, targetAmount, month, !!existing);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["targets"], exact: false });
      qc.invalidateQueries({ queryKey: ["leaderboard"], exact: false });
      toast.success("Target saved successfully!");
    },
    onError: (err) => {
      console.error(err);
      toast.error("Failed to save target");
    },
  });
}

// ─── BULK SET TARGETS ─────────────────────────────────────────────────────────
export function useBulkSetTargets() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ staffIds, month, defaultTarget }) => {
      const results = [];
      for (const staffId of staffIds) {
        let existing = null;
        try {
          existing = await pb.collection("ft_order_targets").getFirstListItem(
            `staff = "${staffId}" && month = "${month}"`
          );
        } catch {}

        const payload = {
          staff: staffId,
          month,
          target_amount: Number(defaultTarget),
          set_by: user.id,
        };

        let result;
        if (existing) {
          result = await pb.collection("ft_order_targets").update(existing.id, payload);
        } else {
          result = await pb.collection("ft_order_targets").create(payload);
        }
        results.push(result);
        await notifyTargetSet(staffId, defaultTarget, month, !!existing);
      }
      return results;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["targets"], exact: false });
      qc.invalidateQueries({ queryKey: ["leaderboard"], exact: false });
      toast.success(`Targets set for ${data.length} staff members!`);
    },
    onError: () => toast.error("Failed to set bulk targets"),
  });
}

// ─── LEADERBOARD (targets + achieved + staff names from dedicated fetch) ───────
export function useLeaderboard(month = currentMonth()) {
  const targetsQuery = useTargets(month);
  const summaryQuery = useOrdersSummary(month);

  // Dedicated staff fetch — guarantees names even if expand fails
  const staffQuery = useQuery({
    queryKey: ["staff-map"],
    queryFn: fetchAllStaff,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const isLoading = targetsQuery.isLoading || summaryQuery.isLoading || staffQuery.isLoading;

  const leaderboard = buildLeaderboard(
    targetsQuery.data ?? [],
    summaryQuery.data ?? [],
    staffQuery.data ?? {}
  );

  return { leaderboard, isLoading, targetsQuery, summaryQuery };
}

function buildLeaderboard(targets, summary, staffMap = {}) {
  const achievedMap = {};
  for (const s of summary) {
    achievedMap[s.staffId] = s;
  }

  // Helper: resolve name with multiple fallbacks
  const resolveName = (staffId, expandRecord) => {
    if (expandRecord?.name) return expandRecord.name;
    if (staffMap[staffId]?.name) return staffMap[staffId].name;
    return `Staff (${staffId?.slice(0, 6) ?? "?"})`;
  };

  const resolveCounty = (staffId, expandRecord) => {
    if (expandRecord?.county) return expandRecord.county;
    return staffMap[staffId]?.county ?? "";
  };

  const resolveRegion = (staffId, expandRecord) => {
    if (expandRecord?.region) return expandRecord.region;
    return staffMap[staffId]?.region ?? "";
  };

  const rows = targets.map((t) => {
    const achieved = achievedMap[t.staff] ?? {
      totalAmount: 0,
      totalOrders: 0,
      byCategory: { distributor: 0, stockist: 0, agrovet: 0, farmer: 0 },
    };

    const pct = t.target_amount > 0
      ? Math.round((achieved.totalAmount / t.target_amount) * 100)
      : 0;

    const staffExpand = t.expand?.staff;

    return {
      staffId: t.staff,
      staffName: resolveName(t.staff, staffExpand),
      county: resolveCounty(t.staff, staffExpand),
      region: resolveRegion(t.staff, staffExpand),
      targetAmount: t.target_amount,
      achievedAmount: achieved.totalAmount,
      totalOrders: achieved.totalOrders,
      pct,
      gap: Math.max(0, t.target_amount - achieved.totalAmount),
      byCategory: achieved.byCategory ?? {},
      categoryTargets: {
        distributor: t.target_distributor ?? 0,
        stockist: t.target_stockist ?? 0,
        agrovet: t.target_agrovet ?? 0,
        farmer: t.target_farmer ?? 0,
      },
      targetId: t.id,
    };
  });

  // Add staff who have orders but no target set
  for (const s of summary) {
    if (!rows.find((r) => r.staffId === s.staffId)) {
      rows.push({
        staffId: s.staffId,
        staffName: resolveName(s.staffId, null) !== `Staff (${s.staffId?.slice(0, 6)})` 
          ? resolveName(s.staffId, null) 
          : (s.staffName && s.staffName !== "Unknown" ? s.staffName : resolveName(s.staffId, null)),
        county: s.county || staffMap[s.staffId]?.county || "",
        region: s.region || staffMap[s.staffId]?.region || "",
        targetAmount: 0,
        achievedAmount: s.totalAmount,
        totalOrders: s.totalOrders,
        pct: 0,
        gap: 0,
        byCategory: s.byCategory,
        categoryTargets: {},
        targetId: null,
      });
    }
  }

  return rows.sort((a, b) => {
    if (b.achievedAmount !== a.achievedAmount) return b.achievedAmount - a.achievedAmount;
    return b.pct - a.pct;
  });
}

// ─── COMMISSION CALCULATION ───────────────────────────────────────────────────
export function calculateCommission(amount, tiers = DEFAULT_TIERS) {
  let commission = 0;
  let remaining = amount;

  for (const tier of tiers) {
    if (remaining <= 0) break;
    const tierAmount = tier.max
      ? Math.min(remaining, tier.max - tier.min)
      : remaining;
    commission += tierAmount * (tier.rate / 100);
    remaining -= tierAmount;
  }

  return commission;
}

export const DEFAULT_TIERS = [
  { min: 0,       max: 500000,  rate: 2, label: "0 – 500K"  },
  { min: 500000,  max: 1000000, rate: 3, label: "500K – 1M" },
  { min: 1000000, max: null,    rate: 5, label: "Above 1M"  },
];

// ─── MONTH HELPERS ────────────────────────────────────────────────────────────
export function daysRemainingInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

export function monthProgress() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round((now.getDate() / lastDay) * 100);
}

export function getMonthOptions(count = 6) {
  const months = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-KE", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}
