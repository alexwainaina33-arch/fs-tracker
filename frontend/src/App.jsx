import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/auth";
import Layout               from "./components/Layout";
import LoginPage            from "./pages/LoginPage";
import DashboardPage        from "./pages/DashboardPage";
import LiveMapPage          from "./pages/admin/LiveMapPage";
import TasksPage            from "./pages/TasksPage";
import AttendancePage       from "./pages/AttendancePage";
import ExpensesPage         from "./pages/ExpensesPage";
import ReportsPage          from "./pages/ReportsPage";
import TeamPage             from "./pages/admin/TeamPage";
import GeofencePage         from "./pages/admin/GeofencePage";
import SOSPage              from "./pages/SOSPage";
import OrdersPage           from "./pages/OrdersPage";
import ApprovalsPage        from "./pages/ApprovalsPage";
import PaymentApprovalsPage from "./pages/PaymentApprovalsPage";
import LeaderboardPage      from "./pages/LeaderboardPage";
import TargetsPage          from "./pages/TargetsPage";
import FarmerVisitsPage     from "./pages/FarmerVisitsPage";
import AdvancedReportsPage  from "./pages/AdvancedReportsPage";
import TeamSummaryPage      from "./pages/admin/TeamSummaryPage";
import ProfilePage          from "./pages/ProfilePage";

function Guard({ children, adminOnly = false }) {
  const { isAuth, isSupervisor } = useAuth();
  if (!isAuth) return <Navigate to="/login" replace />;
  if (adminOnly && !isSupervisor()) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Guard><Layout /></Guard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"        element={<DashboardPage />} />
        <Route path="map"              element={<LiveMapPage />} />
        <Route path="tasks"            element={<TasksPage />} />
        <Route path="attendance"       element={<AttendancePage />} />
        <Route path="expenses"         element={<ExpensesPage />} />
        <Route path="reports"          element={<ReportsPage />} />
        <Route path="advanced-reports" element={<AdvancedReportsPage />} />
        <Route path="orders"           element={<OrdersPage />} />
        <Route path="farmer-visits"    element={<FarmerVisitsPage />} />
        <Route path="leaderboard"      element={<LeaderboardPage />} />
        <Route path="sos"              element={<SOSPage />} />
        <Route path="profile"          element={<ProfilePage />} />

        {/* Admin/Manager/Supervisor only */}
        <Route path="team"              element={<Guard adminOnly><TeamPage /></Guard>} />
        <Route path="team-summary"      element={<Guard adminOnly><TeamSummaryPage /></Guard>} />
        <Route path="geofences"         element={<Guard adminOnly><GeofencePage /></Guard>} />
        <Route path="approvals"         element={<Guard adminOnly><ApprovalsPage /></Guard>} />
        <Route path="payment-approvals" element={<Guard adminOnly><PaymentApprovalsPage /></Guard>} />
        <Route path="targets"           element={<Guard adminOnly><TargetsPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}