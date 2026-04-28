import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LANG_COLOR = {
  Telugu:    "#388e3c",
  Tamil:     "#e65100",
  Malayalam: "#1565c0",
  Hindi:     "#6a1b9a",
};

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function ymd(d)          { return d.toISOString().slice(0, 10); }
function todayStr()      { return ymd(new Date()); }

function buildGrid(month) {
  // Returns 42 cells (6 weeks). Cells outside the month are marked.
  const first = startOfMonth(month);
  const startDow = first.getDay();
  const daysInMonth = endOfMonth(month).getDate();

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ outside: true, key: i });
    } else {
      const d = new Date(month.getFullYear(), month.getMonth(), dayNum);
      cells.push({
        outside: false,
        key: i,
        date: d,
        dateStr: ymd(d),
        dayNum,
      });
    }
  }
  return cells;
}

export default function AdminCalendar() {
  const { authHeaders, API_BASE } = useAdminAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const start = ymd(startOfMonth(month));
    const end   = ymd(endOfMonth(month));
    setLoading(true);
    axios.get(`${API_BASE}/api/admin/calendar`, {
      params: { start, end },
      headers: authHeaders(),
    })
      .then(res => setSongs(res.data.songs || []))
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [month]);

  // Group songs by date (could be multiple languages on same day)
  const songsByDate = useMemo(() => {
    const map = {};
    for (const s of songs) {
      // For each song, figure out which date(s) to attach to:
      // - scheduled_date (future or upcoming)
      // - used_date (already aired)
      const dates = new Set();
      if (s.scheduled_date) dates.add(s.scheduled_date);
      if (s.used_date)      dates.add(s.used_date);
      for (const d of dates) {
        if (!map[d]) map[d] = [];
        map[d].push(s);
      }
    }
    return map;
  }, [songs]);

  const cells = buildGrid(month);
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = todayStr();

  return (
    <div className="admin-section">
      <div className="cal-nav">
        <button className="admin-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
        <h3 className="cal-title">{monthLabel}</h3>
        <button className="admin-btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
        <button className="admin-btn admin-btn-ghost" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
        {loading && <span className="admin-subtle">Loading…</span>}
      </div>

      {/* Legend */}
      <div className="cal-legend">
        {Object.entries(LANG_COLOR).map(([lang, color]) => (
          <span key={lang} className="cal-legend-item">
            <span className="cal-legend-dot" style={{ background: color }} />
            {lang}
          </span>
        ))}
      </div>

      {/* Weekday headers */}
      <div className="cal-grid cal-grid-header">
        {WEEKDAYS.map(w => <div key={w} className="cal-weekday">{w}</div>)}
      </div>

      {/* Days */}
      <div className="cal-grid">
        {cells.map(cell => {
          if (cell.outside) return <div key={cell.key} className="cal-cell cal-outside" />;
          const isToday = cell.dateStr === today;
          const isPast  = cell.dateStr < today;
          const items   = songsByDate[cell.dateStr] || [];
          return (
            <div
              key={cell.key}
              className={`cal-cell ${isToday ? "cal-today" : ""} ${isPast ? "cal-past" : ""}`}
            >
              <div className="cal-day-num">{cell.dayNum}</div>
              <div className="cal-thumbs">
                {items.slice(0, 3).map(s => (
                  <div
                    key={s.id}
                    className="cal-thumb"
                    style={{ borderColor: LANG_COLOR[s.language] || "#999" }}
                    onMouseEnter={() => setHovered(s)}
                    onMouseLeave={() => setHovered(null)}
                    title={`${s.title} · ${s.language}${s.used_date ? " (used)" : ""}`}
                  >
                    {s.album_art_url
                      ? <img src={s.album_art_url} alt="" />
                      : <div className="cal-thumb-empty">🎵</div>}
                    {s.used_date && <div className="cal-thumb-used">✓</div>}
                  </div>
                ))}
                {items.length > 3 && <div className="cal-more">+{items.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hovered song details */}
      {hovered && (
        <div className="cal-tooltip">
          <strong>{hovered.title}</strong>{" "}
          <span className="admin-subtle">— {hovered.language}{hovered.movie ? ` · ${hovered.movie}` : ""}</span>
          {hovered.used_date && <span className="admin-tag admin-tag-used" style={{ marginLeft: 8 }}>Used {hovered.used_date}</span>}
          {!hovered.used_date && hovered.scheduled_date && <span className="admin-tag admin-tag-scheduled" style={{ marginLeft: 8 }}>📅 {hovered.scheduled_date}</span>}
        </div>
      )}
    </div>
  );
}
