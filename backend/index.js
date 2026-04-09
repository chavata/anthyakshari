require("dotenv").config();
console.log(
  "ENV check:",
  "ID =", process.env.SPOTIFY_CLIENT_ID,
  "SECRET set =", !!process.env.SPOTIFY_CLIENT_SECRET,
  "SUPA set =", !!process.env.SUPABASE_URL,
  "TMDB set =", !!process.env.TMDB_API_KEY
);

const express    = require("express");
const axios      = require("axios");
const bodyParser = require("body-parser");
const cors       = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Supabase admin client (service role — never exposed to frontend)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TMDB_KEY  = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

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

    // NEW: log status code so you can see 200 vs 429 etc.
    console.log("Spotify search status:", response.status);

    res.json({ tracks: response.data.tracks.items });
  } catch (err) {
    const status = err.response?.status || 500;

    // NEW: log error status + payload for debugging
    console.error(
      "Spotify search error status:",
      status,
      err.response?.data || err.message
    );

    // Pass through real status (including 429) so frontend can react
    res.status(status).json({ error: "Spotify search failed" });
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
    console.error(
      "Spotify track meta error:",
      err.response?.data || err.message
    );
    res.status(500).json({ error: "Spotify track meta failed" });
  }
});

// ── TMDb proxy: search movies/shows ──────────────────────────────────────────
app.get("/api/tmdb-search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });
  try {
    const response = await axios.get(`${TMDB_BASE}/search/multi`, {
      params: { api_key: TMDB_KEY, query: q, include_adult: false, page: 1 }
    });
    const results = (response.data.results || [])
      .filter(r => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 6);
    res.json({ results });
  } catch (err) {
    console.error("TMDb search error:", err.message);
    res.status(500).json({ error: "TMDb search failed" });
  }
});

// ── TMDb proxy: get cast for a movie or TV show ───────────────────────────────
app.get("/api/tmdb-cast", async (req, res) => {
  const { id, media_type } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  try {
    const endpoint = media_type === "tv"
      ? `${TMDB_BASE}/tv/${id}/aggregate_credits`
      : `${TMDB_BASE}/movie/${id}/credits`;
    const response = await axios.get(endpoint, { params: { api_key: TMDB_KEY } });
    const rawCast = response.data.cast || [];
    const cast = rawCast.map(c => ({
      id: c.id,
      name: c.name,
      character: media_type === "tv"
        ? (c.roles?.[0]?.character || "")
        : (c.character || ""),
      profile_path: c.profile_path || null,
    })).filter(c => c.character).slice(0, 20);
    res.json({ cast });
  } catch (err) {
    console.error("TMDb cast error:", err.message);
    res.status(500).json({ error: "TMDb cast failed" });
  }
});

// ── Submit score ──────────────────────────────────────────────────────────────
// Verifies the user's JWT via Supabase, then upserts into scores table.
app.post("/api/scores", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  // Verify JWT and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

  const { language, date, score, hint_number, clue_used } = req.body;

  if (!language || !date || score === undefined) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const { error } = await supabase.from("scores").upsert({
    user_id:     user.id,
    language,
    date,
    score,
    hint_number: hint_number ?? null,
    clue_used:   clue_used   ?? false,
  }, { onConflict: "user_id,language,date" });

  if (error) {
    console.error("Score upsert error:", error.message);
    return res.status(500).json({ error: "Failed to save score" });
  }

  res.json({ ok: true });
});

// ── Leaderboard ───────────────────────────────────────────────────────────────
// Query params: scope (daily|weekly|alltime), language (telugu|tamil|global)
app.get("/api/leaderboard", async (req, res) => {
  const { scope = "alltime", language = "global" } = req.query;

  // Build date filter
  let dateFilter = null;
  const today = new Date().toISOString().slice(0, 10);
  if (scope === "daily") {
    dateFilter = today;
  } else if (scope === "weekly") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    dateFilter = d.toISOString().slice(0, 10);
  }

  // Build scores query
  let query = supabase
    .from("scores")
    .select("user_id, score, language, date, profiles(username, alter_ego, poster_path)");

  if (language !== "global") {
    query = query.eq("language", language);
  }
  if (scope === "daily") {
    query = query.eq("date", dateFilter);
  } else if (scope === "weekly") {
    query = query.gte("date", dateFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Leaderboard query error:", error.message);
    return res.status(500).json({ error: "Failed to fetch leaderboard" });
  }

  // Aggregate scores per user
  const userMap = {};
  for (const row of data) {
    const uid = row.user_id;
    if (!userMap[uid]) {
      userMap[uid] = {
        user_id:    uid,
        username:   row.profiles?.username   || "Unknown",
        alter_ego:  row.profiles?.alter_ego  || null,
        poster_path: row.profiles?.poster_path || null,
        total_score: 0,
        games_played: 0,
      };
    }
    userMap[uid].total_score  += row.score;
    userMap[uid].games_played += 1;
  }

  const leaderboard = Object.values(userMap)
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 50)
    .map((u, i) => ({ ...u, rank: i + 1 }));

  res.json({ leaderboard, scope, language });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
