// src/hooks/useOrders.js
// Orders data fetching, mutations, and real-time subscriptions

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import toast from "react-hot-toast";
import { format } from "date-fns";

export const CUSTOMER_CATEGORIES = ["distributor", "stockist", "agrovet", "farmer"];
export const ORDER_STATUSES = ["draft", "pending_approval", "approved", "rejected", "revision_requested"];

// Format KES currency
export function formatKES(amount) {
  if (!amount && amount !== 0) return "KES 0";
  return `KES ${Number(amount).toLocaleString("en-KE")}`;
}

// Generate order number
export function generateOrderNo() {
  const prefix = "ORD";
  const timestamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${rand}`;
}

// Get current month in YYYY-MM format
export function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

// ─── FETCH ORDERS ────────────────────────────────────────────────────────────
export function useOrders({ filter = "all", staffId = null } = {}) {
  const { user } = useAuth();
  const isAdmin = ["admin", "manager", "supervisor"].includes(user?.role);

  const buildFilter = () => {
    const parts = [];
    if (!isAdmin && user?.id) parts.push(`staff = "${user.id}"`);
    if (staffId && isAdmin) parts.push(`staff = "${staffId}"`);
    if (filter !== "all") parts.push(`status = "${filter}"`);
    return parts.join(" && ") || "";
  };

  return useQuery({
    queryKey: ["orders", filter, staffId, user?.id, isAdmin],
    queryFn: () =>
      pb.collection("ft_orders").getList(1, 500, {
        filter: buildFilter(),
        sort: "-submitted_at",
        expand: "staff,approved_by,rejected_by",
      }),
    enabled: !!user?.id,
    refetchInterval: 5000,
    staleTime: 0,
  });
}

// ─── FETCH PENDING APPROVALS (Manager view) ──────────────────────────────────
export function usePendingOrders() {
  return useQuery({
    queryKey: ["orders-pending"],
    queryFn: () =>
      pb.collection("ft_orders").getList(1, 200, {
        filter: `status = "pending_approval"`,
        sort: "-submitted_at",
        expand: "staff",
      }),
    refetchInterval: 15000,
  });
}

// ─── FETCH ORDERS SUMMARY (for leaderboard/dashboard) ────────────────────────
export function useOrdersSummary(month = currentMonth()) {
  return useQuery({
    queryKey: ["orders-summary", month],
    queryFn: async () => {
      const [year, mon] = month.split("-");
      const startDate = `${month}-01 00:00:00`;
      const endDate = `${month}-31 23:59:59`;

      const orders = await pb.collection("ft_orders").getFullList({
        filter: `status = "approved" && submitted_at >= "${startDate}" && submitted_at <= "${endDate}"`,
        expand: "staff",
        sort: "-order_amount",
      });

      // Group by staff
      const byStaff = {};
      for (const order of orders) {
        const staffId = order.staff;
        const staffName = order.expand?.staff?.name ?? "Unknown";
        if (!byStaff[staffId]) {
          byStaff[staffId] = {
            staffId,
            staffName,
            county: order.expand?.staff?.county ?? "",
            region: order.expand?.staff?.region ?? "",
            totalOrders: 0,
            totalAmount: 0,
            byCategory: { distributor: 0, stockist: 0, agrovet: 0, farmer: 0 },
          };
        }
        byStaff[staffId].totalOrders += 1;
        byStaff[staffId].totalAmount += Number(order.order_amount) || 0;
        const cat = order.customer_category;
        if (cat && byStaff[staffId].byCategory[cat] !== undefined) {
          byStaff[staffId].byCategory[cat] += Number(order.order_amount) || 0;
        }
      }

      return Object.values(byStaff).sort((a, b) => b.totalAmount - a.totalAmount);
    },
    refetchInterval: 5000,
    staleTime: 0,
  });
}

// ─── CREATE ORDER ─────────────────────────────────────────────────────────────
export function useCreateOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ formData, attachments, position }) => {
      const fd = new FormData();
      fd.append("order_no", generateOrderNo());
      fd.append("staff", user.id);
      fd.append("customer_name", formData.customer_name);
      fd.append("customer_phone", formData.customer_phone || "");
      fd.append("customer_category", formData.customer_category);
      fd.append("product_description", formData.product_description || "");
      fd.append("order_amount", String(formData.order_amount));
      fd.append("notes", formData.notes || "");
      fd.append("status", "pending_approval");
      fd.append("submitted_at", new Date().toISOString().replace("T", " "));
      if (position) {
        fd.append("gps_lat", String(position.latitude));
        fd.append("gps_lng", String(position.longitude));
      }
      if (formData.county) fd.append("county", formData.county);

      // Attach order form files
      if (attachments?.length) {
        for (const file of attachments) {
          fd.append("order_form", file);
        }
      }

      const order = await pb.collection("ft_orders").create(fd);

      // Create notification for managers
      await createOrderNotification(order, user);

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      qc.refetchQueries({ queryKey: ["orders"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-pending"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-summary"], exact: false });
      toast.success("✅ Order submitted for approval!");
    },
    onError: (err) => {
      console.error("Create order error:", err?.response?.data ?? err);
      toast.error("Failed to submit order. Please try again.");
    },
  });
}

async function createOrderNotification(order, submitter) {
  try {
    // Get all managers
    const managers = await pb.collection("ft_users").getFullList({
      filter: `role = "admin" || role = "manager"`,
    });
    for (const mgr of managers) {
      await pb.collection("ft_notifications").create({
        recipient: mgr.id,
        type: "order_pending",
        title: "New Order Awaiting Approval",
        body: `${submitter.name} submitted an order for KES ${Number(order.order_amount).toLocaleString("en-KE")} from ${order.customer_name} (${order.customer_category})`,
        reference_id: order.id,
        reference_type: "ft_orders",
        is_read: false,
      });
    }
  } catch (e) {
    console.warn("Notification creation failed:", e);
  }
}

// ─── APPROVE ORDER ────────────────────────────────────────────────────────────
export function useApproveOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderId) => {
      const order = await pb.collection("ft_orders").update(orderId, {
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString().replace("T", " "),
      });

      // Notify field staff
      await pb.collection("ft_notifications").create({
        recipient: order.staff,
        type: "order_approved",
        title: "🎉 Order Approved!",
        body: `Your order for ${order.customer_name} (KES ${Number(order.order_amount).toLocaleString("en-KE")}) has been approved!`,
        reference_id: order.id,
        reference_type: "ft_orders",
        is_read: false,
      });

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-pending"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-summary"], exact: false });
      qc.invalidateQueries({ queryKey: ["leaderboard"], exact: false });
      toast.success("✅ Order approved!");
    },
    onError: () => toast.error("Failed to approve order"),
  });
}

// ─── REJECT ORDER ─────────────────────────────────────────────────────────────
export function useRejectOrder() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, reason }) => {
      if (!reason || reason.trim().length < 10) {
        throw new Error("Rejection reason must be at least 10 characters");
      }

      const order = await pb.collection("ft_orders").update(orderId, {
        status: "rejected",
        rejected_by: user.id,
        rejection_reason: reason.trim(),
      });

      // Notify field staff
      await pb.collection("ft_notifications").create({
        recipient: order.staff,
        type: "order_rejected",
        title: "❌ Order Rejected",
        body: `Your order for ${order.customer_name} was rejected. Reason: ${reason.trim()}`,
        reference_id: order.id,
        reference_type: "ft_orders",
        is_read: false,
      });

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-pending"], exact: false });
      toast.success("Order rejected with reason sent to staff.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to reject order");
    },
  });
}

// ─── REQUEST REVISION ─────────────────────────────────────────────────────────
export function useRequestRevision() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, note }) => {
      const order = await pb.collection("ft_orders").update(orderId, {
        status: "revision_requested",
        rejection_reason: note,
      });

      await pb.collection("ft_notifications").create({
        recipient: order.staff,
        type: "order_revision",
        title: "📝 Order Needs Revision",
        body: `Please revise your order for ${order.customer_name}. Note: ${note}`,
        reference_id: order.id,
        reference_type: "ft_orders",
        is_read: false,
      });

      return order;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      qc.invalidateQueries({ queryKey: ["orders-pending"], exact: false });
      toast.success("Revision request sent to staff.");
    },
    onError: () => toast.error("Failed to request revision"),
  });
}

// ─── REALTIME SUBSCRIPTION ────────────────────────────────────────────────────
export function useOrdersRealtime(onNewOrder) {
  const qc = useQueryClient();

  useEffect(() => {
    let unsub;
    pb.collection("ft_orders")
      .subscribe("*", (e) => {
        qc.invalidateQueries({ queryKey: ["orders"], exact: false });
        qc.refetchQueries({ queryKey: ["orders"], exact: false });
        qc.invalidateQueries({ queryKey: ["orders-pending"], exact: false });
        qc.invalidateQueries({ queryKey: ["orders-summary"], exact: false });
        if (e.action === "create" && onNewOrder) onNewOrder(e.record);
      })
      .then((fn) => { unsub = fn; });

    return () => { unsub?.(); };
  }, [qc, onNewOrder]);
}
