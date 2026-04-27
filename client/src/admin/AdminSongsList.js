import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";

const LANGUAGES = ["all", "Telugu", "Tamil", "Malayalam", "Hindin"];
const USED_FILTERS = ["all", "false", "true"];
const usedLabel = { all: "All", false: "Unused", true: "Finished" };

export default function AdminSongsList() {
  const { authHeaders, API_BASE } = useAdminAuth();
  const [songs, setSongs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [language, setLanguage] = useState("all");
  const [used, setUsed]         = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (language !== "all") params.language = language;
      if (used !== "all")     params.used = used;
      const res = await axios.get(`${API_BASE}/api/admin/songs`, { params, headers: authHeaders() });
      setSongs(res.data.songs || []);
    } finally {
      setLoading(false);
    }
  }, [language, used]);

  useEffect(() => { load(); }, [load]);

  function startEdit(song) {
    setEditingId(song.id);
    setEditDraft({
      title: song.title || "", movie: song.movie || "", artist: song.artist || "",
      release_year: song.release_year || "",
      clue_lyricist: song.clue_lyricist || "",
      clue_singers: song.clue_singers || "",
      clue_composer: song.clue_composer || "",
    });
  }

  async function saveEdit() {
    await axios.put(`${API_BASE}/api/admin/songs/${editingId}`, editDraft, { headers: authHeaders() });
    setEditingId(null);
    load();
  }

  async function removeSong(id) {
    if (!window.confirm("Delete this song? This won't remove the audio files from R2.")) return;
    await axios.delete(`${API_BASE}/api/admin/songs/${id}`, { headers: authHeaders() });
    load();
  }

  return (
    <div className="admin-section">
      <div className="admin-row">
        <label className="admin-label">
          Language
          <select className="admin-select" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l === "all" ? "All" : (l === "Hindin" ? "Hindi" : l)}</option>)}
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
              : <div className="admin-song-art admin-song-art-empty">🎵</div>
            }
            {editingId === s.id ? (
              <div className="admin-song-edit">
                <input className="admin-input" value={editDraft.title} placeholder="Title" onChange={e => setEditDraft({ ...editDraft, title: e.target.value })} />
                <input className="admin-input" value={editDraft.movie} placeholder="Movie" onChange={e => setEditDraft({ ...editDraft, movie: e.target.value })} />
                <input className="admin-input" value={editDraft.artist} placeholder="Artist" onChange={e => setEditDraft({ ...editDraft, artist: e.target.value })} />
                <input className="admin-input" value={editDraft.release_year} placeholder="Year" onChange={e => setEditDraft({ ...editDraft, release_year: e.target.value })} />
                <input className="admin-input" value={editDraft.clue_lyricist} placeholder="Lyricist (clue)" onChange={e => setEditDraft({ ...editDraft, clue_lyricist: e.target.value })} />
                <input className="admin-input" value={editDraft.clue_singers} placeholder="Singers (clue)" onChange={e => setEditDraft({ ...editDraft, clue_singers: e.target.value })} />
                <input className="admin-input" value={editDraft.clue_composer} placeholder="Composer (clue)" onChange={e => setEditDraft({ ...editDraft, clue_composer: e.target.value })} />
                <div className="admin-row">
                  <button className="admin-btn admin-btn-primary" onClick={saveEdit}>Save</button>
                  <button className="admin-btn admin-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
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
                    {s.used_date
                      ? <span className="admin-tag admin-tag-used">Used {s.used_date}</span>
                      : <span className="admin-tag admin-tag-unused">Unused</span>}
                  </div>
                </div>
                <div className="admin-song-actions">
                  <button className="admin-btn" onClick={() => startEdit(s)}>Edit</button>
                  <button className="admin-btn admin-btn-danger" onClick={() => removeSong(s.id)}>Delete</button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
