import React, { useState } from "react";
import { useAdminAuth } from "./AdminAuthContext";

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-login-card">
        <h1 className="admin-title">Anthyakshari Admin</h1>
        <p className="admin-subtitle">Sign in to manage the song pool.</p>
        <form onSubmit={handleSubmit} className="admin-form">
          <input
            className="admin-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            className="admin-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <div className="admin-error">{error}</div>}
          <button className="admin-btn admin-btn-primary" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
