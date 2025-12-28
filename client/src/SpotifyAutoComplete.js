import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function SpotifyAutocomplete({ value, onSelect, disabled }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState(value || "");
  const containerRef = useRef(null);

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
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchSuggestions(q) {
    if (!q) {
      setSuggestions([]);
      setIsActive(false);
      return;
    }

    try {
      const res = await axios.get("/api/spotify-search", {
        params: { q },
      });

      setSuggestions(res.data.tracks || []);
      setIsActive(true);
    } catch (err) {
      console.error("Spotify autocomplete error:", err);
      setSuggestions([]);
      setIsActive(false);
    }
  }

  function handleChange(e) {
    if (disabled) return;
    const newValue = e.target.value;
    setQuery(newValue);
    fetchSuggestions(newValue);
  }

  function handleSelect(track) {
    if (disabled) return;

    const displayName = `${track.name} – ${track.artists
      .map((a) => a.name)
      .join(", ")}`;
    setQuery(displayName);
    setIsActive(false);

    if (onSelect) {
      onSelect({
        id: track.id,
        name: track.name,
        url: track.external_urls?.spotify || "",
        albumName: track.album?.name || "",
        artists: track.artists?.map((a) => a.name).join(", "),
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
