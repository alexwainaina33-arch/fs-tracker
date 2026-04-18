// src/hooks/useOrderPayments.js
// Partial payments for orders — field staff submits, manager/supervisor approves

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pb } from "../lib/pb";
import { useAuth } from "../store/auth";
import { formatKES } from "./useOrders";
import toast from "react-hot-toast";

export const PAYMENT_METHODS = ["mpesa", "cash", "cheque", "bank_transfer"];
export const PAYMENT_METHOD_LABELS = {
  mpesa: "M-Pesa",
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank Transfer",
};

// ─── FETCH PAYMENTS FOR ONE ORDER ────────────────────────────────────────────
export function useOrderPayments(orderId) {
  return useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: () =>
      pb.collection("ft_order_payments").getFullList({
        filter: `order = "${orderId}"`,
        sort: "-payment_date",
        expand: "recorded_by,reviewed_by",
      }),
    enabled: !!orderId,
  });
}

// ─── PAYMENT SUMMARY (only approved payments count toward balance) ─────────────
export function useOrderPaymentSummary(orderId, orderAmount) {
  const { data: payments = [], isLoading } = useOrderPayments(orderId);

  const totalPaid = payments
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const totalPending = payments
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  const balance = Number(orderAmount || 0) - totalPaid;
  const isFullyPaid = balance <= 0;
  const percentPaid = orderAmount > 0
    ? Math.min(100, (totalPaid / Number(orderAmount)) * 100)
    : 0;

  return { payments, totalPaid, totalPending, balance, isFullyPaid, percentPaid, isLoading };
}

// ─── FETCH ALL PENDING PAYMENTS (manager approval queue) ─────────────────────
export function usePendingPayments() {
  return useQuery({
    queryKey: ["payments-pending"],
    queryFn: () =>
      pb.collection("ft_order_payments").getFullList({
        filter: `status = "pending"`,
        sort: "-created",
        expand: "recorded_by,order",
      }),
    refetchInterval: 15000,
  });
}

// ─── SUBMIT PAYMENT (field staff) ────────────────────────────────────────────
export function useSubmitPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderId, amount, paymentMethod, mpesaRef, notes, paymentDate }) => {
      const [order, existingPayments] = await Promise.all([
        pb.collection("ft_orders").getOne(orderId),
        pb.collection("ft_order_payments").getFullList({
          filter: `order = "${orderId}" && status = "approved"`,
        }),
      ]);

      const totalApproved = existingPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      const balance = Number(order.order_amount) - totalApproved;

      if (Number(amount) <= 0) throw new Error("Amount must be greater than 0");
      if (Number(amount) > balance + 0.01) {
        throw new Error(`Amount exceeds balance. Remaining: ${formatKES(balance)}`);
      }

      const payment = await pb.collection("ft_order_payments").create({
        order: orderId,
        amount: Number(amount),
        payment_method: paymentMethod,
        mpesa_ref: mpesaRef || "",
        notes: notes || "",
        recorded_by: user.id,
        payment_date: paymentDate
          ? `${paymentDate} 00:00:00`
          : new Date().toISOString().replace("T", " "),
        status: "pending",
      });

      // Notify managers/supervisors
      try {
        const managers = await pb.collection("ft_users").getFullList({
          filter: `role = "admin" || role = "manager" || role = "supervisor"`,
        });
        for (const mgr of managers) {
          await pb.collection("ft_notifications").create({
            recipient: mgr.id,
            type: "payment_pending",
            title: "💳 Payment Awaiting Approval",
            body: `${user.name} submitted a payment of ${formatKES(amount)} for order ${order.order_no} (${order.customer_name}).`,
            reference_id: payment.id,
            reference_type: "ft_order_payments",
            is_read: false,
          });
        }
      } catch (e) {
        console.warn("Notification failed:", e);
      }

      return payment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["order-payments", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["payments-pending"] });
      toast.success("✅ Payment submitted for approval!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit payment");
    },
  });
}

// ─── APPROVE PAYMENT (manager/supervisor) ─────────────────────────────────────
export function useApprovePayment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ paymentId }) => {
      const payment = await pb.collection("ft_order_payments").update(paymentId, {
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString().replace("T", " "),
        rejection_reason: "",
      });

      const order = await pb.collection("ft_orders").getOne(payment.order);

      // Check if now fully paid
      const allApproved = await pb.collection("ft_order_payments").getFullList({
        filter: `order = "${payment.order}" && status = "approved"`,
      });
      const totalPaid = allApproved.reduce((s, p) => s + Number(p.amount || 0), 0);
      const isFullyPaid = totalPaid >= Number(order.order_amount) - 0.01;

      try {
        // Notify the field staff
        await pb.collection("ft_notifications").create({
          recipient: payment.recorded_by,
          type: "payment_approved",
          title: "✅ Payment Approved",
          body: `Your payment of ${formatKES(payment.amount)} for order ${order.order_no} (${order.customer_name}) has been approved.`,
          reference_id: payment.id,
          reference_type: "ft_order_payments",
          is_read: false,
        });

        if (isFullyPaid) {
          const managers = await pb.collection("ft_users").getFullList({
            filter: `role = "admin" || role = "manager"`,
          });
          for (const mgr of managers) {
            await pb.collection("ft_notifications").create({
              recipient: mgr.id,
              type: "order_fully_paid",
              title: "💰 Order Fully Paid",
              body: `Order ${order.order_no} for ${order.customer_name} (${formatKES(order.order_amount)}) is now fully paid.`,
              reference_id: order.id,
              reference_type: "ft_orders",
              is_read: false,
            });
          }
        }
      } catch (e) {
        console.warn("Notification failed:", e);
      }

      return payment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-payments"], exact: false });
      qc.invalidateQueries({ queryKey: ["payments-pending"] });
      qc.invalidateQueries({ queryKey: ["orders"], exact: false });
      toast.success("✅ Payment approved!");
    },
    onError: () => toast.error("Failed to approve payment"),
  });
}

// ─── REJECT PAYMENT (manager/supervisor) ──────────────────────────────────────
export function useRejectPayment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ paymentId, reason }) => {
      if (!reason || reason.trim().length < 5) {
        throw new Error("Please provide a rejection reason (min 5 characters)");
      }

      const payment = await pb.collection("ft_order_payments").update(paymentId, {
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString().replace("T", " "),
        rejection_reason: reason.trim(),
      });

      const order = await pb.collection("ft_orders").getOne(payment.order);

      try {
        await pb.collection("ft_notifications").create({
          recipient: payment.recorded_by,
          type: "payment_rejected",
          title: "❌ Payment Rejected",
          body: `Your payment of ${formatKES(payment.amount)} for ${order.order_no} was rejected. Reason: ${reason.trim()}`,
          reference_id: payment.id,
          reference_type: "ft_order_payments",
          is_read: false,
        });
      } catch (e) {
        console.warn("Notification failed:", e);
      }

      return payment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-payments"], exact: false });
      qc.invalidateQueries({ queryKey: ["payments-pending"] });
      toast.success("Payment rejected — staff notified.");
    },
    onError: (err) => toast.error(err.message || "Failed to reject payment"),
  });
}

// ─── DELETE PAYMENT (admin only) ──────────────────────────────────────────────
export function useDeletePayment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, orderId }) => {
      await pb.collection("ft_order_payments").delete(paymentId);
      return orderId;
    },
    onSuccess: (orderId) => {
      qc.invalidateQueries({ queryKey: ["order-payments", orderId] });
      qc.invalidateQueries({ queryKey: ["payments-pending"] });
      toast.success("Payment deleted");
    },
    onError: () => toast.error("Failed to delete payment"),
  });
}