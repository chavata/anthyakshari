require("dotenv").config();
console.log(
  "ENV check:",
  "ID =", process.env.SPOTIFY_CLIENT_ID,
  "SECRET set =", !!process.env.SPOTIFY_CLIENT_SECRET
);

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// In-memory cache for Spotify app token
let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

// Get Spotify app token via Client Credentials Flow
async function getSpotifyAppToken() {
  const now = Date.now();

  if (spotifyToken && now < spotifyTokenExpiresAt) {
    return spotifyToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  const authHeader =
    "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");

  const resp = await axios.post(
    "https://accounts.spotify.com/api/token",
    params,
    {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );

  const { access_token, expires_in } = resp.data;
  spotifyToken = access_token;
  spotifyTokenExpiresAt = now + (expires_in - 30) * 1000;

  return spotifyToken;
}

// Proxy for Spotify search
app.get("/api/spotify-search", async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json({ tracks: [] });
  }

  try {
    const token = await getSpotifyAppToken();

    const response = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          q,
          type: "track",
          limit: 8
        }
      }
    );

    res.json({ tracks: response.data.tracks.items });
  } catch (err) {
    console.error("Spotify search error:", err.response?.data || err.message);
    res.status(500).json({ error: "Spotify search failed" });
  }
});

// Helper that can also be used from other routes later
async function getSpotifyTrackMetaByUrl(trackUrl) {
  const match = trackUrl.match(/track\/([A-Za-z0-9]+)/);
  if (!match) {
    throw new Error("Invalid Spotify track URL");
  }
  const trackId = match[1];

  const token = await getSpotifyAppToken();

  const response = await axios.get(
    `https://api.spotify.com/v1/tracks/${trackId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const t = response.data;
  return {
    id: t.id,
    name: t.name,
    album: t.album?.name || "",
    artists: (t.artists || []).map(a => a.name).join(", ")
  };
}

// NEW: get track meta (song + album) from a Spotify track URL
app.get("/api/spotify-track-meta", async (req, res) => {
  const trackUrl = req.query.url;

  if (!trackUrl) {
    return res.status(400).json({ error: "Missing url query param" });
  }

  try {
    const meta = await getSpotifyTrackMetaByUrl(trackUrl);
    res.json(meta);
  } catch (err) {
    console.error("Spotify track meta error:", err.response?.data || err.message);
    res.status(500).json({ error: "Spotify track meta failed" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
