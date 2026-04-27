import React from "react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";
import "./admin.css";

function AdminGate() {
  const { isLoggedIn } = useAdminAuth();
  return isLoggedIn ? <AdminDashboard /> : <AdminLogin />;
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminGate />
    </AdminAuthProvider>
  );
}
