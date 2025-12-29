import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

// backend base URL (Render)
const API_BASE =
  process.env.REACT_APP_BACKEND_URL || "https://anthyakshari.onrender.com";

export default function SpotifyAutocomplete({ value, onSelect, disabled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState(value || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef(null);
  const lastRequestId = useRef(0); // to ignore late responses

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsActive(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -------- Debounced fetchSuggestions ----------
  const fetchSuggestions = useCallback(
    (() => {
      let timeoutId;

      return (q) => {
        if (!q) {
          clearTimeout(timeoutId);
          setSuggestions([]);
          setIsActive(false);
          setLoading(false);
          setError("");
          return;
        }

        clearTimeout(timeoutId);
        setLoading(true);
        setError("");

        timeoutId = setTimeout(async () => {
          const requestId = ++lastRequestId.current;

          try {
            const res = await axios.get(`${API_BASE}/api/spotify-search`, {
              params: { q }
            });

            // ignore if there is a newer request
            if (requestId !== lastRequestId.current) return;

            setSuggestions(res.data.tracks || []);
            setIsActive(true);
          } catch (err) {
            if (requestId !== lastRequestId.current) return;

            const status = err.response?.status;
            if (status === 429) {
              setError("Too many searches. Please wait a few seconds.");
            } else {
              setError("Search failed. Please try again.");
            }
            setSuggestions([]);
            setIsActive(false);
          } finally {
            if (requestId === lastRequestId.current) {
              setLoading(false);
            }
          }
        }, 350); // 350ms debounce
      };
    })(),
    []
  );
  // ----------------------------------------------

  function handleChange(e) {
    if (disabled) return;
    const newValue = e.target.value;
    setQuery(newValue);
    fetchSuggestions(newValue);
  }

  function handleSelect(track) {
    if (disabled) return;

    const trackTitle = track.name || "";
    const artistsLabel = track.artists?.map((a) => a.name).join(", ") || "";

    const displayName = `${trackTitle} – ${artistsLabel}`;
    setQuery(displayName);
    setIsActive(false);
    setSuggestions([]);

    if (onSelect) {
      onSelect({
        id: track.id,
        name: displayName,          // full UI label
        trackName: trackTitle,      // pure title for validation
        url: track.external_urls?.spotify || "",
        albumName: track.album?.name || "",
        artists: artistsLabel
      });
    }
  }

  return (
    <div className="spotify-autocomplete" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() =>
          !disabled && query && suggestions.length && setIsActive(true)
        }
        placeholder="Search for a song"
        className="spotify-input"
        disabled={disabled}
      />

      {loading && !disabled && (
        <div className="spotify-status">Searching…</div>
      )}
      {error && !disabled && (
        <div className="spotify-status error">{error}</div>
      )}

      {!disabled && isActive && suggestions.length > 0 && (
        <ul className="spotify-suggestions">
          {suggestions.map((track) => (
            <li
              key={track.id}
              className="spotify-suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(track)}
            >
              {track.album?.images?.[0] && (
                <img
                  src={track.album.images[0].url}
                  alt={track.name}
                  className="spotify-album-thumb"
                />
              )}

              <div className="spotify-suggestion-main">
                <span className="spotify-track-name">{track.name}</span>
                <span className="spotify-artist-name">
                  {track.artists.map((a) => a.name).join(", ")} •{" "}
                  {track.album?.name}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
