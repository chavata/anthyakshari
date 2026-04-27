import React, { useState, useRef, useCallback } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";

const TMDB_KEY   = process.env.REACT_APP_TMDB_API_KEY;
const TMDB_BASE  = "https://api.themoviedb.org/3";
const POSTER_BASE = "https://image.tmdb.org/t/p/w185";

export default function ProfileSetup({ onComplete }) {
  const { user, saveProfile } = useAuth();

  const [username, setUsername]       = useState("");
  const [movieQuery, setMovieQuery]   = useState("");
  const [movieResults, setMovieResults] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [cast, setCast]               = useState([]);
  const [selectedChar, setSelectedChar] = useState(null);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingCast, setLoadingCast] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const searchTimeout = useRef(null);

  // ── Movie search (debounced) ───────────────────────────────────────────────
  const handleMovieInput = useCallback((e) => {
    const q = e.target.value;
    setMovieQuery(q);
    setSelectedMovie(null);
    setSelectedChar(null);
    setCast([]);
    clearTimeout(searchTimeout.current);
    if (!q.trim()) { setMovieResults([]); return; }
    setLoadingMovies(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${TMDB_BASE}/search/multi`, {
          params: { api_key: TMDB_KEY, query: q, include_adult: false, page: 1 }
        });
        const results = (res.data.results || [])
          .filter(r => r.media_type === "movie" || r.media_type === "tv")
          .slice(0, 6);
        setMovieResults(results);
      } catch { setMovieResults([]); }
      finally { setLoadingMovies(false); }
    }, 300);
  }, []);

  // ── Pick a movie → fetch cast ──────────────────────────────────────────────
  async function handleSelectMovie(movie) {
    setSelectedMovie(movie);
    setMovieResults([]);
    setMovieQuery(movie.title || movie.name || "");
    setSelectedChar(null);
    setCast([]);
    setLoadingCast(true);
    try {
      const endpoint = movie.media_type === "tv"
        ? `${TMDB_BASE}/tv/${movie.id}/aggregate_credits`
        : `${TMDB_BASE}/movie/${movie.id}/credits`;
      const res = await axios.get(endpoint, { params: { api_key: TMDB_KEY } });
      // For TV aggregate_credits, characters are nested under roles
      const rawCast = res.data.cast || [];
      const normalized = rawCast.map(c => ({
        id: c.id,
        name: c.name,
        character: movie.media_type === "tv"
          ? (c.roles?.[0]?.character || "")
          : (c.character || ""),
        profile_path: c.profile_path || null,
      })).filter(c => c.character).slice(0, 20);
      setCast(normalized);
    } catch { setCast([]); }
    finally { setLoadingCast(false); }
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!username.trim()) { setError("Please enter a username."); return; }
    if (!selectedMovie)   { setError("Please pick a movie or show."); return; }
    if (!selectedChar)    { setError("Please pick a character."); return; }
    setError("");
    setSaving(true);
    try {
      // Check username uniqueness (exclude current user in case of re-setup)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.trim())
        .neq("id", user.id)
        .maybeSingle();
      if (existing) {
        setError("That username is already taken. Try another.");
        setSaving(false);
        return;
      }
      await saveProfile(user.id, {
        username: username.trim(),
        alter_ego: selectedChar.character,
        tmdb_movie_id: selectedMovie.id,
        poster_path: selectedMovie.poster_path || null,
      });
      onComplete && onComplete();
    } catch (err) {
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const posterUrl = selectedMovie?.poster_path
    ? `${POSTER_BASE}${selectedMovie.poster_path}` : null;

  return (
    <div className="stats-overlay">
      <div className="stats-modal profile-setup-modal">
        <div className="stats-header">
          <h2>✦ Set Up Your Identity ✦</h2>
        </div>

        <div className="profile-setup-body">
          {/* Preview */}
          {(selectedMovie || username) && (
            <div className="profile-preview">
              {posterUrl
                ? <img src={posterUrl} alt="poster" className="profile-poster" />
                : <div className="profile-poster-placeholder">🎬</div>
              }
              <div className="profile-preview-name">
                <span className="profile-username">{username || "your name"}</span>
                {selectedChar && (
                  <span className="profile-aka"> aka {selectedChar.character}</span>
                )}
              </div>
            </div>
          )}

          {/* Username */}
          <label className="profile-label">
            Your display name
            <span className="profile-info" title="This is your unique handle on the leaderboard. Each name can only be claimed by one player.">ⓘ</span>
          </label>
          <input
            className="auth-input"
            type="text"
            placeholder="e.g. chavata"
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={30}
          />
          <div className="profile-help">A unique handle that identifies you on the leaderboard.</div>

          {/* Movie search */}
          <label className="profile-label">
            Pick your alter ego
            <span className="profile-info" title="Choose a movie or show character to be your alter ego. Your leaderboard entry will read 'username aka [Character Name]'. Just for fun — characters can be shared by multiple players.">ⓘ</span>
          </label>
          <div className="profile-help">
            Your leaderboard entry will look like <em>"chavata aka Tyler Durden"</em>. The poster becomes your avatar.
          </div>
          <div className="profile-movie-search">
            <input
              className="auth-input"
              type="text"
              placeholder="e.g. Fight Club, Breaking Bad…"
              value={movieQuery}
              onChange={handleMovieInput}
            />
            {loadingMovies && <div className="profile-hint">Searching…</div>}
            {movieResults.length > 0 && (
              <ul className="profile-movie-list">
                {movieResults.map(m => (
                  <li key={m.id} className="profile-movie-item" onClick={() => handleSelectMovie(m)}>
                    {m.poster_path
                      ? <img src={`${POSTER_BASE}${m.poster_path}`} alt={m.title||m.name} className="profile-movie-thumb" />
                      : <div className="profile-movie-thumb profile-movie-thumb-empty">🎬</div>
                    }
                    <div>
                      <div className="profile-movie-title">{m.title || m.name}</div>
                      <div className="profile-movie-year">
                        {m.media_type === "tv" ? "TV" : "Movie"} ·{" "}
                        {(m.release_date || m.first_air_date || "").slice(0,4)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Character picker */}
          {loadingCast && <div className="profile-hint">Loading cast…</div>}
          {cast.length > 0 && (
            <>
              <label className="profile-label">Pick a character</label>
              <div className="profile-cast-grid">
                {cast.map(c => (
                  <button
                    key={`${c.id}-${c.character}`}
                    className={`profile-cast-btn${selectedChar?.character === c.character ? " selected" : ""}`}
                    onClick={() => setSelectedChar(c)}
                  >
                    {c.character}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button
            className="button"
            style={{ marginTop: "16px", width: "100%" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Identity →"}
          </button>
        </div>
      </div>
    </div>
  );
}
