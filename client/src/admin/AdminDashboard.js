import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";
import AdminUpload from "./AdminUpload";
import AdminSongsList from "./AdminSongsList";
import AdminCalendar from "./AdminCalendar";

const LANGUAGES = ["Telugu", "Tamil", "Malayalam", "Hindin"];

export default function AdminDashboard() {
  const { logout, authHeaders, API_BASE } = useAdminAuth();
  const [stats, setStats] = useState({});
  const [tab, setTab]     = useState("upload");  // "upload" | "songs"

  async function loadStats() {
    try {
      const res = await axios.get(`${API_BASE}/api/admin/stats`, { headers: authHeaders() });
      setStats(res.data.stats || {});
    } catch (err) {
      if (err.response?.status === 401) logout();
    }
  }

  useEffect(() => { loadStats(); }, []);

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div>
          <div className="admin-brand">Anthyakshari Admin</div>
          <div className="admin-subtle">Song pool management</div>
        </div>
        <button className="admin-btn admin-btn-ghost" onClick={logout}>Sign out</button>
      </div>

      {/* Stats */}
      <div className="admin-stats-grid">
        {LANGUAGES.map(lang => {
          const s = stats[lang] || { total: 0, used: 0, unused: 0 };
          return (
            <div key={lang} className="admin-stat-card">
              <div className="admin-stat-lang">{lang === "Hindin" ? "Hindi" : lang}</div>
              <div className="admin-stat-rows">
                <div><span>Total</span><strong>{s.total}</strong></div>
                <div><span>Finished</span><strong>{s.used}</strong></div>
                <div className="admin-stat-unused"><span>Unused</span><strong>{s.unused}</strong></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "upload" ? "active" : ""}`}
          onClick={() => setTab("upload")}
        >
          ⬆ Upload Songs
        </button>
        <button
          className={`admin-tab ${tab === "songs" ? "active" : ""}`}
          onClick={() => setTab("songs")}
        >
          🎵 Browse Songs
        </button>
        <button
          className={`admin-tab ${tab === "calendar" ? "active" : ""}`}
          onClick={() => setTab("calendar")}
        >
          📅 Calendar
        </button>
      </div>

      {tab === "upload"   && <AdminUpload onUploaded={loadStats} />}
      {tab === "songs"    && <AdminSongsList />}
      {tab === "calendar" && <AdminCalendar />}
    </div>
  );
}
