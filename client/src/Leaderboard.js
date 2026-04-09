import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";

const API_BASE    = process.env.REACT_APP_BACKEND_URL || "https://anthyakshari.onrender.com";
const POSTER_BASE = "https://image.tmdb.org/t/p/w185";

const SCOPES    = ["daily", "weekly", "alltime"];
const LANGUAGES = ["global", "telugu", "tamil"];

const scopeLabel    = { daily: "Today", weekly: "This Week", alltime: "All Time" };
const languageLabel = { global: "🌐 Global", telugu: "తెలుగు", tamil: "தமிழ்" };

const medals = ["🥇", "🥈", "🥉"];

// ── Shared inner content (used in both modal and inline) ──────────────────────
function LeaderboardContent({ onClose, inline = false }) {
  const { profile } = useAuth();
  const [scope, setScope]       = useState("alltime");
  const [language, setLanguage] = useState("global");
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE}/api/leaderboard`, {
        params: { scope, language }
      });
      setRows(res.data.leaderboard || []);
    } catch {
      setError("Failed to load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, [scope, language]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  return (
    <div className={inline ? "lb-inline-wrap" : "stats-modal leaderboard-modal"}>
      <div className="stats-header">
        <h2>✦ Leaderboard ✦</h2>
        {!inline && <button className="stats-close" onClick={onClose}>✕</button>}
      </div>

      {/* Scope tabs */}
      <div className="lb-tabs">
        {SCOPES.map(s => (
          <button
            key={s}
            className={`lb-tab${scope === s ? " lb-tab-active" : ""}`}
            onClick={() => setScope(s)}
          >
            {scopeLabel[s]}
          </button>
        ))}
      </div>

      {/* Language tabs */}
      <div className="lb-lang-tabs">
        {LANGUAGES.map(l => (
          <button
            key={l}
            className={`lb-lang-tab${language === l ? " lb-lang-tab-active" : ""}`}
            onClick={() => setLanguage(l)}
          >
            {languageLabel[l]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="lb-body">
        {loading && <div className="status-text">Loading…</div>}
        {!loading && error && <div className="status-text">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="status-text">No scores yet. Be the first!</div>
        )}
        {!loading && !error && rows.length > 0 && (
          <ul className="lb-list">
            {rows.map((row) => {
              const isMe = profile && row.username === profile.username;
              const posterUrl = row.poster_path ? `${POSTER_BASE}${row.poster_path}` : null;
              return (
                <li key={row.user_id} className={`lb-row${isMe ? " lb-row-me" : ""}`}>
                  <span className="lb-rank">
                    {row.rank <= 3 ? medals[row.rank - 1] : `#${row.rank}`}
                  </span>
                  <div className="lb-avatar">
                    {posterUrl
                      ? <img src={posterUrl} alt="poster" className="lb-poster" />
                      : <div className="lb-poster-fallback">🎬</div>
                    }
                  </div>
                  <div className="lb-identity">
                    <span className="lb-username">{row.username}</span>
                    {row.alter_ego && (
                      <span className="lb-alter-ego"> aka {row.alter_ego}</span>
                    )}
                  </div>
                  <div className="lb-score-col">
                    <span className="lb-score">{row.total_score}</span>
                    <span className="lb-pts">pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!inline && (
        <button className="button button-outline" style={{ marginTop: "12px" }} onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}

// ── Modal version (used from game page topbar) ────────────────────────────────
export default function Leaderboard({ onClose }) {
  return (
    <div className="stats-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <LeaderboardContent onClose={onClose} inline={false} />
    </div>
  );
}

// ── Inline version (embedded on home page) ────────────────────────────────────
export function LeaderboardInline() {
  return <LeaderboardContent inline={true} />;
}
