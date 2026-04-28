import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";

const LANGUAGES = ["all", "Telugu", "Tamil", "Malayalam", "Hindi"];
const USED_FILTERS = ["all", "false", "true"];
const usedLabel = { all: "All", false: "Unused", true: "Finished" };

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function AdminSongsList() {
  const { authHeaders, API_BASE } = useAdminAuth();
  const [songs, setSongs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [language, setLanguage] = useState("all");
  const [used, setUsed]         = useState("all");
  const [q, setQ]               = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [schedulingId, setSchedulingId] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [previewingId, setPreviewingId] = useState(null);
  const [previewSong, setPreviewSong] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAudio, setDeleteAudio] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (language !== "all") params.language = language;
      if (used !== "all")     params.used = used;
      if (q.trim())           params.q = q.trim();
      const res = await axios.get(`${API_BASE}/api/admin/songs`, { params, headers: authHeaders() });
      setSongs(res.data.songs || []);
    } finally {
      setLoading(false);
    }
  }, [language, used, q]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function startEdit(song) {
    // Fetch full song with all fields
    const res = await axios.get(`${API_BASE}/api/admin/songs/${song.id}`, { headers: authHeaders() });
    const full = res.data.song;
    setEditingId(song.id);
    setEditDraft({
      title: full.title || "", movie: full.movie || "", artist: full.artist || "",
      release_year: full.release_year || "",
      lyricist: full.lyricist || "", singers: full.singers || "", composer: full.composer || "",
      director: full.director || "", hero: full.hero || "", heroine: full.heroine || "",
      clue_hint_3: full.clue_hint_3 || "",
      clue_hint_4: full.clue_hint_4 || "",
      clue_hint_5: full.clue_hint_5 || "",
    });
  }

  async function saveEdit() {
    await axios.put(`${API_BASE}/api/admin/songs/${editingId}`, editDraft, { headers: authHeaders() });
    setEditingId(null);
    load();
  }

  function askDelete(song) {
    setDeleteTarget(song);
    setDeleteAudio(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API_BASE}/api/admin/songs/${deleteTarget.id}`, {
        headers: authHeaders(),
        params: deleteAudio ? { delete_audio: "true" } : undefined,
      });
      setDeleteTarget(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function togglePreview(song) {
    if (previewingId === song.id) {
      setPreviewingId(null);
      setPreviewSong(null);
      return;
    }
    setPreviewingId(song.id);
    setPreviewSong(null);
    try {
      const res = await axios.get(`${API_BASE}/api/admin/songs/${song.id}`, { headers: authHeaders() });
      setPreviewSong(res.data.song);
    } catch {
      setPreviewingId(null);
    }
  }

  function startSchedule(song) {
    setSchedulingId(song.id);
    setScheduleDate(song.scheduled_date || todayStr());
  }

  async function saveSchedule(unschedule = false) {
    await axios.put(
      `${API_BASE}/api/admin/songs/${schedulingId}/schedule`,
      { scheduled_date: unschedule ? null : scheduleDate },
      { headers: authHeaders() }
    );
    setSchedulingId(null);
    load();
  }

  return (
    <div className="admin-section">
      <div className="admin-row">
        <input
          className="admin-input"
          style={{ minWidth: 280 }}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="🔍 Search title, movie, composer, director, hero, heroine…"
        />
        <label className="admin-label">
          Language
          <select className="admin-select" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l === "all" ? "All" : l}</option>)}
          </select>
        </label>
        <label className="admin-label">
          Status
          <select className="admin-select" value={used} onChange={e => setUsed(e.target.value)}>
            {USED_FILTERS.map(u => <option key={u} value={u}>{usedLabel[u]}</option>)}
          </select>
        </label>
      </div>

      {loading && <div className="admin-empty">Loading…</div>}
      {!loading && songs.length === 0 && <div className="admin-empty">No songs match these filters.</div>}

      <ul className="admin-songs-list">
        {songs.map(s => (
          <li key={s.id} className="admin-song-row">
            {s.album_art_url
              ? <img src={s.album_art_url} alt="" className="admin-song-art" />
              : <div className="admin-song-art admin-song-art-empty">🎵</div>}

            {editingId === s.id ? (
              <div className="admin-song-edit">
                <div className="admin-grid-2">
                  <label className="admin-label">Title<input className="admin-input" value={editDraft.title} onChange={e => setEditDraft({ ...editDraft, title: e.target.value })} /></label>
                  <label className="admin-label">Movie<input className="admin-input" value={editDraft.movie} onChange={e => setEditDraft({ ...editDraft, movie: e.target.value })} /></label>
                  <label className="admin-label">Artist<input className="admin-input" value={editDraft.artist} onChange={e => setEditDraft({ ...editDraft, artist: e.target.value })} /></label>
                  <label className="admin-label">Year<input className="admin-input" value={editDraft.release_year} onChange={e => setEditDraft({ ...editDraft, release_year: e.target.value })} /></label>
                  <label className="admin-label">Lyricist<input className="admin-input" value={editDraft.lyricist} onChange={e => setEditDraft({ ...editDraft, lyricist: e.target.value })} /></label>
                  <label className="admin-label">Singers<input className="admin-input" value={editDraft.singers} onChange={e => setEditDraft({ ...editDraft, singers: e.target.value })} /></label>
                  <label className="admin-label">Composer<input className="admin-input" value={editDraft.composer} onChange={e => setEditDraft({ ...editDraft, composer: e.target.value })} /></label>
                  <label className="admin-label">Director<input className="admin-input" value={editDraft.director} onChange={e => setEditDraft({ ...editDraft, director: e.target.value })} /></label>
                  <label className="admin-label">Hero<input className="admin-input" value={editDraft.hero} onChange={e => setEditDraft({ ...editDraft, hero: e.target.value })} /></label>
                  <label className="admin-label">Heroine<input className="admin-input" value={editDraft.heroine} onChange={e => setEditDraft({ ...editDraft, heroine: e.target.value })} /></label>
                </div>
                <label className="admin-label">Clue hint 3<input className="admin-input" value={editDraft.clue_hint_3} onChange={e => setEditDraft({ ...editDraft, clue_hint_3: e.target.value })} /></label>
                <label className="admin-label">Clue hint 4<input className="admin-input" value={editDraft.clue_hint_4} onChange={e => setEditDraft({ ...editDraft, clue_hint_4: e.target.value })} /></label>
                <label className="admin-label">Clue hint 5<input className="admin-input" value={editDraft.clue_hint_5} onChange={e => setEditDraft({ ...editDraft, clue_hint_5: e.target.value })} /></label>
                <div className="admin-row">
                  <button className="admin-btn admin-btn-primary" onClick={saveEdit}>Save</button>
                  <button className="admin-btn admin-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : schedulingId === s.id ? (
              <div className="admin-song-meta">
                <div className="admin-song-title">{s.title}</div>
                <div className="admin-row" style={{ marginTop: 8 }}>
                  <input
                    type="date"
                    className="admin-input"
                    value={scheduleDate}
                    onChange={e => setScheduleDate(e.target.value)}
                    min={todayStr()}
                  />
                  <button className="admin-btn admin-btn-primary" onClick={() => saveSchedule(false)}>Schedule</button>
                  <button className="admin-btn" onClick={() => { setScheduleDate(todayStr()); saveSchedule(false); }}>Today</button>
                  {s.scheduled_date && (
                    <button className="admin-btn admin-btn-ghost" onClick={() => saveSchedule(true)}>Unschedule</button>
                  )}
                  <button className="admin-btn admin-btn-ghost" onClick={() => setSchedulingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="admin-song-meta">
                  <div className="admin-song-title">{s.title}</div>
                  <div className="admin-song-sub">
                    {[s.movie, s.artist].filter(Boolean).join(" · ")}
                  </div>
                  <div className="admin-song-tags">
                    <span className="admin-tag">{s.language}</span>
                    {s.scheduled_date && <span className="admin-tag admin-tag-scheduled">📅 {s.scheduled_date}</span>}
                    {s.used_date
                      ? <span className="admin-tag admin-tag-used">Used {s.used_date}</span>
                      : <span className="admin-tag admin-tag-unused">Unused</span>}
                    {(s.composer || s.director || s.hero || s.heroine) && (
                      <span className="admin-tag admin-tag-meta" title={`Composer: ${s.composer || "—"} · Director: ${s.director || "—"} · Hero: ${s.hero || "—"} · Heroine: ${s.heroine || "—"}`}>ℹ meta</span>
                    )}
                  </div>
                </div>
                <div className="admin-song-actions">
                  <button className="admin-btn" onClick={() => togglePreview(s)}>
                    {previewingId === s.id ? "▾ Hide" : "▶ Play"}
                  </button>
                  <button className="admin-btn" onClick={() => startSchedule(s)}>Schedule</button>
                  <button className="admin-btn" onClick={() => startEdit(s)}>Edit</button>
                  <button className="admin-btn admin-btn-danger" onClick={() => askDelete(s)}>Delete</button>
                </div>
              </>
            )}

            {/* Inline hint preview */}
            {previewingId === s.id && (
              <div className="admin-preview-panel">
                {!previewSong && <div className="admin-subtle">Loading hints…</div>}
                {previewSong && [1, 2, 3, 4, 5].map(n => {
                  const url = previewSong[`hint_${n}_url`];
                  const clue = previewSong[`clue_hint_${n}`] || "";
                  return (
                    <div key={n} className="admin-hint-preview-row">
                      <span className="admin-hint-label">Hint {n}</span>
                      {url ? (
                        <audio controls preload="none" src={url}>Your browser does not support audio.</audio>
                      ) : (
                        <span className="admin-subtle">no audio</span>
                      )}
                      {n >= 3 && clue && <span className="admin-hint-clue">"{clue}"</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="admin-modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px" }}>Delete song?</h3>
            <p style={{ margin: "0 0 14px", color: "#5a6376" }}>
              You're about to delete <strong>{deleteTarget.title}</strong> ({deleteTarget.language}).
            </p>
            <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", background: "#f6f8fc", borderRadius: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={deleteAudio} onChange={e => setDeleteAudio(e.target.checked)} />
              <span>Also delete the 5 audio files from Cloudflare R2</span>
            </label>
            <p className="admin-subtle" style={{ marginTop: 8 }}>
              {deleteAudio
                ? "This permanently removes the audio files from R2 storage. The song folder cannot be recovered."
                : "Audio files stay in R2. Only the database row is removed (you can re-link them later by adding a new song)."}
            </p>
            <div className="admin-row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="admin-btn" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="admin-btn admin-btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? "Deleting…" : (deleteAudio ? "Delete song + audio" : "Delete song only")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
