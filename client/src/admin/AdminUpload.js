import React, { useState } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";

const LANGUAGES = ["Telugu", "Tamil", "Malayalam", "Hindin"];

// Group selected files by their parent folder name
function groupFilesByFolder(fileList) {
  const groups = {};
  for (const f of fileList) {
    const path = f.webkitRelativePath || f.name;  // e.g. "Humsafar/Humsafar1.mp3"
    const parts = path.split("/");
    if (parts.length < 2) continue;  // skip loose files
    const folder = parts[0];
    const filename = parts[parts.length - 1];
    if (!/\.(mp3|m4a|wav|ogg)$/i.test(filename)) continue;
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push({ file: f, filename });
  }
  // Sort each group's files alphabetically (Humsafar1, Humsafar2…)
  for (const folder of Object.keys(groups)) {
    groups[folder].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  }
  return groups;
}

export default function AdminUpload({ onUploaded }) {
  const { authHeaders, API_BASE } = useAdminAuth();
  const [language, setLanguage] = useState("Telugu");
  const [folders, setFolders]   = useState({});  // { folderName: SongDraft }

  function handleFolderSelect(e) {
    const grouped = groupFilesByFolder(e.target.files);
    const newDrafts = {};
    for (const [folderName, files] of Object.entries(grouped)) {
      if (folders[folderName]) continue;  // skip already-added
      newDrafts[folderName] = {
        folderName,
        files,
        status: files.length === 5 ? "ready" : "invalid",
        // metadata to be filled
        spotifyQuery: folderName,
        spotifyResults: [],
        searchingSpotify: false,
        selectedTrack: null,
        clueLyricist: "",
        clueSingers: "",
        clueComposer: "",
        uploaded: false,
        saving: false,
        error: "",
        hintUrls: [],
        existingSong: null,
      };
    }
    setFolders(prev => ({ ...prev, ...newDrafts }));
    e.target.value = "";  // allow re-select
  }

  function updateFolder(name, patch) {
    setFolders(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function removeFolder(name) {
    setFolders(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  async function searchSpotify(folderName) {
    const draft = folders[folderName];
    const q = draft.spotifyQuery.trim();
    if (!q) return;
    updateFolder(folderName, { searchingSpotify: true, spotifyResults: [], existingSong: null });
    try {
      const res = await axios.get(`${API_BASE}/api/spotify-search`, { params: { q } });
      updateFolder(folderName, { spotifyResults: res.data.tracks || [] });
    } catch (err) {
      updateFolder(folderName, { error: "Spotify search failed" });
    } finally {
      updateFolder(folderName, { searchingSpotify: false });
    }
  }

  async function pickTrack(folderName, track) {
    // Check duplicate
    try {
      const res = await axios.get(`${API_BASE}/api/admin/check-spotify/${track.id}`, { headers: authHeaders() });
      if (res.data.exists) {
        updateFolder(folderName, {
          selectedTrack: track,
          existingSong: res.data.song,
          spotifyResults: [],
        });
        return;
      }
    } catch {}

    // Auto-fill clue_singers from Spotify artists
    const singers = (track.artists || []).map(a => a.name).join(", ");
    updateFolder(folderName, {
      selectedTrack: track,
      existingSong: null,
      spotifyResults: [],
      clueSingers: singers,
    });
  }

  async function uploadAndSave(folderName) {
    const draft = folders[folderName];
    if (draft.files.length !== 5) {
      updateFolder(folderName, { error: "Need exactly 5 audio files." });
      return;
    }
    if (!draft.selectedTrack) {
      updateFolder(folderName, { error: "Pick a Spotify track first." });
      return;
    }
    if (draft.existingSong) {
      updateFolder(folderName, { error: "This Spotify track already exists in the pool." });
      return;
    }

    updateFolder(folderName, { saving: true, error: "" });

    try {
      // 1) Upload all 5 files in order to R2
      const hintUrls = [];
      for (let i = 0; i < draft.files.length; i++) {
        const { file, filename } = draft.files[i];
        const fd = new FormData();
        fd.append("file", file, filename);
        fd.append("language", language);
        fd.append("songFolder", folderName);
        const res = await axios.post(`${API_BASE}/api/admin/upload-audio`, fd, {
          headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
        });
        hintUrls.push(res.data.url);
      }

      // 2) Create song record
      const t = draft.selectedTrack;
      const albumArt = t.album?.images?.[0]?.url || null;
      const releaseYear = parseInt((t.album?.release_date || "").slice(0, 4)) || null;

      await axios.post(`${API_BASE}/api/admin/songs`, {
        language,
        title: t.name,
        movie: t.album?.name || null,
        artist: (t.artists || []).map(a => a.name).join(", "),
        release_year: releaseYear,
        spotify_track_id: t.id,
        spotify_url: t.external_urls?.spotify || null,
        album_art_url: albumArt,
        hint_1_url: hintUrls[0],
        hint_2_url: hintUrls[1],
        hint_3_url: hintUrls[2],
        hint_4_url: hintUrls[3],
        hint_5_url: hintUrls[4],
        clue_lyricist: draft.clueLyricist || null,
        clue_singers:  draft.clueSingers  || null,
        clue_composer: draft.clueComposer || null,
      }, { headers: authHeaders() });

      updateFolder(folderName, { uploaded: true, saving: false, hintUrls });
      onUploaded && onUploaded();
    } catch (err) {
      updateFolder(folderName, {
        saving: false,
        error: err.response?.data?.error || err.message || "Upload failed",
      });
    }
  }

  const folderEntries = Object.values(folders);

  return (
    <div className="admin-section">
      <div className="admin-row">
        <label className="admin-label">
          Language
          <select className="admin-select" value={language} onChange={e => setLanguage(e.target.value)}>
            {LANGUAGES.map(l => <option key={l} value={l}>{l === "Hindin" ? "Hindi (uploads to Hindin/)" : l}</option>)}
          </select>
        </label>

        <label className="admin-uploader">
          <input
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelect}
            style={{ display: "none" }}
          />
          <span className="admin-btn admin-btn-primary">+ Add folder(s)</span>
        </label>
      </div>

      <p className="admin-hint">
        Pick a parent folder containing one sub-folder per song. Each song folder must have exactly 5 audio files (hint 1 → hint 5).
      </p>

      {folderEntries.length === 0 && (
        <div className="admin-empty">No folders selected yet.</div>
      )}

      {folderEntries.map(draft => (
        <div key={draft.folderName} className="admin-card">
          <div className="admin-card-header">
            <div>
              <div className="admin-card-title">{draft.folderName}</div>
              <div className="admin-card-subtitle">
                {draft.files.length} files · {draft.status === "ready" ? "✓ ready" : "⚠ needs exactly 5 files"}
              </div>
            </div>
            <button className="admin-btn admin-btn-ghost" onClick={() => removeFolder(draft.folderName)}>Remove</button>
          </div>

          {draft.uploaded ? (
            <div className="admin-success">✓ Uploaded and saved</div>
          ) : (
            <>
              {/* Spotify search */}
              <div className="admin-field">
                <label className="admin-label">Match to Spotify track</label>
                <div className="admin-row">
                  <input
                    className="admin-input"
                    value={draft.spotifyQuery}
                    onChange={e => updateFolder(draft.folderName, { spotifyQuery: e.target.value })}
                    placeholder="Search Spotify…"
                  />
                  <button
                    className="admin-btn"
                    onClick={() => searchSpotify(draft.folderName)}
                    disabled={draft.searchingSpotify}
                  >
                    {draft.searchingSpotify ? "Searching…" : "Search"}
                  </button>
                </div>

                {draft.spotifyResults.length > 0 && (
                  <ul className="admin-spotify-results">
                    {draft.spotifyResults.slice(0, 6).map(t => (
                      <li key={t.id} className="admin-spotify-item" onClick={() => pickTrack(draft.folderName, t)}>
                        {t.album?.images?.[2]?.url && (
                          <img src={t.album.images[2].url} alt="" className="admin-spotify-art" />
                        )}
                        <div>
                          <div className="admin-spotify-name">{t.name}</div>
                          <div className="admin-spotify-meta">
                            {(t.artists || []).map(a => a.name).join(", ")} · {t.album?.name}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {draft.selectedTrack && (
                  <div className="admin-selected">
                    <strong>Selected:</strong> {draft.selectedTrack.name} —{" "}
                    {(draft.selectedTrack.artists || []).map(a => a.name).join(", ")}
                  </div>
                )}

                {draft.existingSong && (
                  <div className="admin-warning">
                    ⚠ This song is already in the pool ({draft.existingSong.language} · {draft.existingSong.title}).
                    Pick a different track or remove this folder.
                  </div>
                )}
              </div>

              {/* Clues */}
              {draft.selectedTrack && !draft.existingSong && (
                <>
                  <div className="admin-field">
                    <label className="admin-label">Clue 1 — Lyricist (shown at hint 3)</label>
                    <input
                      className="admin-input"
                      value={draft.clueLyricist}
                      onChange={e => updateFolder(draft.folderName, { clueLyricist: e.target.value })}
                      placeholder="e.g. Sirivennela Sitarama Sastry"
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Clue 2 — Singers (shown at hint 4)</label>
                    <input
                      className="admin-input"
                      value={draft.clueSingers}
                      onChange={e => updateFolder(draft.folderName, { clueSingers: e.target.value })}
                      placeholder="Auto-filled from Spotify, edit if needed"
                    />
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Clue 3 — Composer (shown at hint 5)</label>
                    <input
                      className="admin-input"
                      value={draft.clueComposer}
                      onChange={e => updateFolder(draft.folderName, { clueComposer: e.target.value })}
                      placeholder="e.g. Devi Sri Prasad"
                    />
                  </div>
                </>
              )}

              {draft.error && <div className="admin-error">{draft.error}</div>}

              <div className="admin-row">
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => uploadAndSave(draft.folderName)}
                  disabled={draft.saving || draft.status !== "ready" || !draft.selectedTrack || draft.existingSong}
                >
                  {draft.saving ? "Uploading…" : "Upload & Save"}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
