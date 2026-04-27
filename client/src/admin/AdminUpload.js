import React, { useState } from "react";
import axios from "axios";
import { useAdminAuth } from "./AdminAuthContext";

const LANGUAGES = ["Telugu", "Tamil", "Malayalam", "Hindin"];

function groupFilesByFolder(fileList) {
  const groups = {};
  for (const f of fileList) {
    const path = f.webkitRelativePath || f.name;
    const parts = path.split("/");
    if (parts.length < 2) continue;
    const folder = parts[0];
    const filename = parts[parts.length - 1];
    if (!/\.(mp3|m4a|wav|ogg)$/i.test(filename)) continue;
    if (!groups[folder]) groups[folder] = [];
    groups[folder].push({ file: f, filename });
  }
  for (const folder of Object.keys(groups)) {
    groups[folder].sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  }
  return groups;
}

function emptyDraft(folderName, files) {
  return {
    folderName,
    files,
    status: files.length === 5 ? "ready" : "invalid",
    spotifyQuery: folderName,
    spotifyResults: [],
    searchingSpotify: false,
    selectedTrack: null,
    tmdbQuery: "",
    tmdbResults: [],
    searchingTmdb: false,
    selectedTmdb: null,
    cast: [],
    // Structured metadata
    movie: "",
    lyricist: "",
    singers: "",
    composer: "",
    director: "",
    hero: "",
    heroine: "",
    // Clue text (defaults filled from above)
    clueHint3: "",
    clueHint4: "",
    clueHint5: "",
    uploaded: false,
    saving: false,
    error: "",
    existingSong: null,
  };
}

export default function AdminUpload({ onUploaded }) {
  const { authHeaders, API_BASE } = useAdminAuth();
  const [language, setLanguage] = useState("Telugu");
  const [folders, setFolders]   = useState({});

  function handleFolderSelect(e) {
    const grouped = groupFilesByFolder(e.target.files);
    const newDrafts = {};
    for (const [folderName, files] of Object.entries(grouped)) {
      if (folders[folderName]) continue;
      newDrafts[folderName] = emptyDraft(folderName, files);
    }
    setFolders(prev => ({ ...prev, ...newDrafts }));
    e.target.value = "";
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
    } catch {
      updateFolder(folderName, { error: "Spotify search failed" });
    } finally {
      updateFolder(folderName, { searchingSpotify: false });
    }
  }

  async function pickTrack(folderName, track) {
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

    const singers = (track.artists || []).map(a => a.name).join(", ");
    const movie = track.album?.name || "";
    updateFolder(folderName, {
      selectedTrack: track,
      existingSong: null,
      spotifyResults: [],
      singers,
      movie,
      tmdbQuery: movie,
      clueHint3: singers,
    });
    // Auto-trigger TMDB search using album/movie name
    if (movie) searchTmdb(folderName, movie);
  }

  async function searchTmdb(folderName, queryOverride) {
    const draft = folders[folderName];
    const q = (queryOverride !== undefined ? queryOverride : draft.tmdbQuery).trim();
    if (!q) return;
    updateFolder(folderName, { searchingTmdb: true, tmdbResults: [] });
    try {
      const res = await axios.get(`${API_BASE}/api/tmdb-search`, { params: { q } });
      updateFolder(folderName, { tmdbResults: res.data.results || [] });
    } catch {
      // silent
    } finally {
      updateFolder(folderName, { searchingTmdb: false });
    }
  }

  async function pickTmdb(folderName, item) {
    updateFolder(folderName, { selectedTmdb: item, tmdbResults: [] });
    try {
      const res = await axios.get(`${API_BASE}/api/admin/tmdb-credits`, {
        params: { id: item.id, media_type: item.media_type },
        headers: authHeaders(),
      });
      const cast = res.data.cast || [];
      const director = res.data.director || "";
      const composer = res.data.composer || "";
      // Best-effort hero/heroine: top-billed by gender
      const males   = cast.filter(c => c.gender === 2).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      const females = cast.filter(c => c.gender === 1).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      const hero    = males[0]?.name   || "";
      const heroine = females[0]?.name || "";

      const draft = folders[folderName];
      updateFolder(folderName, {
        cast,
        director,
        composer,
        hero,
        heroine,
        movie: item.title || item.name || draft.movie,
        clueHint4: composer || draft.clueHint4,
        clueHint5: draft.clueHint5 || (director ? `Director: ${director}` : ""),
      });
    } catch {
      // silent
    }
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
      updateFolder(folderName, { error: "This Spotify track is already in the pool." });
      return;
    }

    updateFolder(folderName, { saving: true, error: "" });

    // Standardize R2 folder name = Spotify track name (sanitized)
    // Standardize file names = hint1.mp3 ... hint5.mp3
    const sanitize = (s) => String(s).trim().replace(/[\/\\?#:*<>|"]/g, "").replace(/\s+/g, " ").slice(0, 100);
    const songFolderName = sanitize(draft.selectedTrack.name);

    try {
      const hintUrls = [];
      for (let i = 0; i < draft.files.length; i++) {
        const { file, filename } = draft.files[i];
        const ext = (filename.split(".").pop() || "mp3").toLowerCase();
        const newFilename = `hint${i + 1}.${ext}`;
        const fd = new FormData();
        fd.append("file", file, newFilename);
        fd.append("language", language);
        fd.append("songFolder", songFolderName);
        const res = await axios.post(`${API_BASE}/api/admin/upload-audio`, fd, {
          headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
        });
        hintUrls.push(res.data.url);
      }

      const t = draft.selectedTrack;
      const albumArt = t.album?.images?.[0]?.url || null;
      const releaseYear = parseInt((t.album?.release_date || "").slice(0, 4)) || null;

      await axios.post(`${API_BASE}/api/admin/songs`, {
        language,
        title: t.name,
        movie: draft.movie || t.album?.name || null,
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
        clue_hint_3: draft.clueHint3 || null,
        clue_hint_4: draft.clueHint4 || null,
        clue_hint_5: draft.clueHint5 || null,
        lyricist: draft.lyricist || null,
        singers:  draft.singers  || null,
        composer: draft.composer || null,
        director: draft.director || null,
        hero:     draft.hero     || null,
        heroine:  draft.heroine  || null,
        tmdb_movie_id: draft.selectedTmdb?.id || null,
      }, { headers: authHeaders() });

      updateFolder(folderName, { uploaded: true, saving: false });
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

      {folderEntries.length === 0 && <div className="admin-empty">No folders selected yet.</div>}

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
              {/* Step 1: Spotify */}
              <div className="admin-field">
                <label className="admin-label">1. Match to Spotify track</label>
                <div className="admin-row">
                  <input
                    className="admin-input"
                    value={draft.spotifyQuery}
                    onChange={e => updateFolder(draft.folderName, { spotifyQuery: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), searchSpotify(draft.folderName))}
                    placeholder="Search Spotify…"
                  />
                  <button className="admin-btn" onClick={() => searchSpotify(draft.folderName)} disabled={draft.searchingSpotify}>
                    {draft.searchingSpotify ? "…" : "Search"}
                  </button>
                </div>

                {draft.spotifyResults.length > 0 && (
                  <ul className="admin-spotify-results">
                    {draft.spotifyResults.slice(0, 6).map(t => (
                      <li key={t.id} className="admin-spotify-item" onClick={() => pickTrack(draft.folderName, t)}>
                        {t.album?.images?.[2]?.url && <img src={t.album.images[2].url} alt="" className="admin-spotify-art" />}
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

                {draft.selectedTrack && !draft.existingSong && (
                  <div className="admin-selected">
                    ✓ <strong>{draft.selectedTrack.name}</strong> — {(draft.selectedTrack.artists || []).map(a => a.name).join(", ")}
                    <div className="admin-subtle" style={{ marginTop: 4 }}>
                      Will upload to: <code>{language}/{draft.selectedTrack.name.trim().replace(/[\/\\?#:*<>|"]/g, "").replace(/\s+/g, " ").slice(0, 100)}/hint1-5.mp3</code>
                    </div>
                  </div>
                )}

                {draft.existingSong && (
                  <div className="admin-warning">
                    ⚠ This song is already in the pool ({draft.existingSong.language} · {draft.existingSong.title}). Pick another or remove this folder.
                  </div>
                )}
              </div>

              {/* Step 2: TMDB */}
              {draft.selectedTrack && !draft.existingSong && (
                <div className="admin-field">
                  <label className="admin-label">2. Match movie/show on TMDB (auto-fills cast & crew)</label>
                  <div className="admin-row">
                    <input
                      className="admin-input"
                      value={draft.tmdbQuery}
                      onChange={e => updateFolder(draft.folderName, { tmdbQuery: e.target.value })}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), searchTmdb(draft.folderName))}
                      placeholder="Search TMDB…"
                    />
                    <button className="admin-btn" onClick={() => searchTmdb(draft.folderName)} disabled={draft.searchingTmdb}>
                      {draft.searchingTmdb ? "…" : "Search"}
                    </button>
                  </div>

                  {draft.tmdbResults.length > 0 && (
                    <ul className="admin-spotify-results">
                      {draft.tmdbResults.slice(0, 6).map(m => (
                        <li key={m.id} className="admin-spotify-item" onClick={() => pickTmdb(draft.folderName, m)}>
                          {m.poster_path && <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" className="admin-spotify-art" />}
                          <div>
                            <div className="admin-spotify-name">{m.title || m.name}</div>
                            <div className="admin-spotify-meta">
                              {m.media_type === "tv" ? "TV" : "Movie"} · {(m.release_date || m.first_air_date || "").slice(0, 4)}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {draft.selectedTmdb && (
                    <div className="admin-selected">
                      ✓ {draft.selectedTmdb.title || draft.selectedTmdb.name} (TMDB)
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Metadata */}
              {draft.selectedTrack && !draft.existingSong && (
                <>
                  <div className="admin-section-divider">3. Song metadata (edit anything)</div>
                  <div className="admin-grid-2">
                    <label className="admin-label">Movie<input className="admin-input" value={draft.movie} onChange={e => updateFolder(draft.folderName, { movie: e.target.value })} /></label>
                    <label className="admin-label">Lyricist<input className="admin-input" value={draft.lyricist} onChange={e => updateFolder(draft.folderName, { lyricist: e.target.value })} /></label>
                    <label className="admin-label">Singers<input className="admin-input" value={draft.singers} onChange={e => updateFolder(draft.folderName, { singers: e.target.value })} /></label>
                    <label className="admin-label">Composer<input className="admin-input" value={draft.composer} onChange={e => updateFolder(draft.folderName, { composer: e.target.value })} /></label>
                    <label className="admin-label">Director<input className="admin-input" value={draft.director} onChange={e => updateFolder(draft.folderName, { director: e.target.value })} /></label>
                    <label className="admin-label">Hero<input className="admin-input" value={draft.hero} onChange={e => updateFolder(draft.folderName, { hero: e.target.value })} /></label>
                    <label className="admin-label">Heroine<input className="admin-input" value={draft.heroine} onChange={e => updateFolder(draft.folderName, { heroine: e.target.value })} /></label>
                  </div>

                  <div className="admin-section-divider">4. Text clues shown to player</div>
                  <div className="admin-field">
                    <label className="admin-label">Clue at hint 3 <span className="admin-subtle">(default: singers)</span>
                      <input className="admin-input" value={draft.clueHint3} onChange={e => updateFolder(draft.folderName, { clueHint3: e.target.value })} />
                    </label>
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Clue at hint 4 <span className="admin-subtle">(default: composer)</span>
                      <input className="admin-input" value={draft.clueHint4} onChange={e => updateFolder(draft.folderName, { clueHint4: e.target.value })} />
                    </label>
                  </div>
                  <div className="admin-field">
                    <label className="admin-label">Clue at hint 5 <span className="admin-subtle">(suggestion: trivia, director, hero)</span>
                      <input className="admin-input" value={draft.clueHint5} onChange={e => updateFolder(draft.folderName, { clueHint5: e.target.value })} />
                    </label>
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
