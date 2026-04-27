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
const multer     = require("multer");
const { createClient } = require("@supabase/supabase-js");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ── R2 (S3-compatible) client ────────────────────────────────────────────────
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const R2_BUCKET     = process.env.R2_BUCKET;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

// Memory storage for multer (we stream straight to R2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },  // 15MB per file
});

// ── Admin auth middleware (basic email/password from env) ────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers["x-admin-auth"];
  if (!auth) return res.status(401).json({ error: "Admin auth required" });
  const expected = `${process.env.ADMIN_EMAIL}:${process.env.ADMIN_PASSWORD}`;
  if (auth !== expected) return res.status(401).json({ error: "Invalid admin credentials" });
  next();
}

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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ROUTES (protected by requireAdmin)
// ─────────────────────────────────────────────────────────────────────────────

// Admin login — returns token-like credential string the frontend stores
app.post("/api/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  // Token is just the credential pair; sent in x-admin-auth header on subsequent calls.
  res.json({ token: `${email}:${password}` });
});

// Pool stats per language: total / used / unused
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("songs")
    .select("language, used_date");
  if (error) return res.status(500).json({ error: error.message });

  const stats = {};
  for (const row of data) {
    if (!stats[row.language]) stats[row.language] = { total: 0, used: 0, unused: 0 };
    stats[row.language].total += 1;
    if (row.used_date) stats[row.language].used += 1;
    else stats[row.language].unused += 1;
  }
  res.json({ stats });
});

// Check if a Spotify track is already in the pool
app.get("/api/admin/check-spotify/:trackId", requireAdmin, async (req, res) => {
  const { trackId } = req.params;
  const { data } = await supabase
    .from("songs")
    .select("id, title, language")
    .eq("spotify_track_id", trackId)
    .maybeSingle();
  res.json({ exists: !!data, song: data || null });
});

// Sanitize a path segment: keep letters, numbers, spaces, basic punctuation
function sanitizePathSegment(s, maxLen = 80) {
  return String(s).trim()
    .replace(/[\/\\?#:*<>|"]/g, "")    // remove illegal path chars
    .replace(/\s+/g, " ")               // collapse whitespace
    .slice(0, maxLen);
}

// Upload a single audio file to R2; returns the public URL
app.post("/api/admin/upload-audio", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const { language, songFolder } = req.body;
  if (!language || !songFolder) {
    return res.status(400).json({ error: "language and songFolder are required" });
  }

  const safeLanguage = sanitizePathSegment(language, 30);
  const safeFolder   = sanitizePathSegment(songFolder, 100);
  const safeFileName = sanitizePathSegment(req.file.originalname, 80) || "audio.mp3";
  const key          = `${safeLanguage}/${safeFolder}/${safeFileName}`;

  // Build URL with proper encoding for spaces
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  try {
    await r2.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         key,
      Body:        req.file.buffer,
      ContentType: req.file.mimetype || "audio/mpeg",
    }));
    res.json({ url: `${R2_PUBLIC_URL}/${encodedKey}`, key });
  } catch (err) {
    console.error("R2 upload error:", err.message);
    res.status(500).json({ error: "Upload failed", detail: err.message });
  }
});

// Create a song record (after audio is uploaded)
app.post("/api/admin/songs", requireAdmin, async (req, res) => {
  const allowed = [
    "language", "title", "movie", "artist", "release_year",
    "spotify_track_id", "spotify_url", "album_art_url",
    "hint_1_url", "hint_2_url", "hint_3_url", "hint_4_url", "hint_5_url",
    "clue_hint_3", "clue_hint_4", "clue_hint_5",
    "lyricist", "singers", "composer", "director", "hero", "heroine",
    "tmdb_movie_id", "scheduled_date",
  ];
  const insert = { uploaded_by: process.env.ADMIN_EMAIL };
  for (const k of allowed) if (req.body[k] !== undefined) insert[k] = req.body[k];

  if (!insert.language || !insert.title) {
    return res.status(400).json({ error: "language and title are required" });
  }
  if (!insert.hint_1_url || !insert.hint_2_url || !insert.hint_3_url || !insert.hint_4_url || !insert.hint_5_url) {
    return res.status(400).json({ error: "All 5 hint URLs are required" });
  }

  const { data, error } = await supabase
    .from("songs").insert(insert).select().single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "This Spotify track is already in the pool." });
    }
    return res.status(500).json({ error: error.message });
  }
  res.json({ song: data });
});

// List songs (with filters + search)
app.get("/api/admin/songs", requireAdmin, async (req, res) => {
  const { language, used, q } = req.query;
  let query = supabase
    .from("songs")
    .select("id, language, title, movie, artist, used_date, scheduled_date, album_art_url, lyricist, singers, composer, director, hero, heroine, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (language) query = query.eq("language", language);
  if (used === "true")  query = query.not("used_date", "is", null);
  if (used === "false") query = query.is("used_date", null);
  if (q && q.trim()) {
    // OR-search across multiple fields
    const term = `%${q.trim()}%`;
    query = query.or(
      `title.ilike.${term},movie.ilike.${term},artist.ilike.${term},composer.ilike.${term},director.ilike.${term},hero.ilike.${term},heroine.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ songs: data });
});

// Get a single song with all fields (for editing)
app.get("/api/admin/songs/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from("songs").select("*").eq("id", id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: "Not found" });
  res.json({ song: data });
});

// Update a song (edit any allowed field)
app.put("/api/admin/songs/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const allowed = [
    "title", "movie", "artist", "release_year",
    "clue_hint_3", "clue_hint_4", "clue_hint_5",
    "lyricist", "singers", "composer", "director", "hero", "heroine",
    "tmdb_movie_id", "scheduled_date",
  ];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];

  const { data, error } = await supabase
    .from("songs").update(update).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ song: data });
});

// Schedule a song for a date (YYYY-MM-DD or null to unschedule)
app.put("/api/admin/songs/:id/schedule", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { scheduled_date } = req.body;
  // If a song already has scheduled_date for the same day in the same language, swap them
  if (scheduled_date) {
    const { data: target } = await supabase.from("songs").select("language").eq("id", id).single();
    if (target) {
      // Clear other songs in same language scheduled for same date
      await supabase.from("songs")
        .update({ scheduled_date: null })
        .eq("language", target.language)
        .eq("scheduled_date", scheduled_date)
        .neq("id", id);
    }
  }
  const { data, error } = await supabase
    .from("songs").update({ scheduled_date }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ song: data });
});

// Get scheduled queue (next N days per language)
app.get("/api/admin/schedule", requireAdmin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("songs")
    .select("id, language, title, movie, artist, scheduled_date, album_art_url")
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ scheduled: data });
});

// Calendar: songs scheduled OR used within a date range
app.get("/api/admin/calendar", requireAdmin, async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: "start and end required" });

  const { data: scheduled, error: e1 } = await supabase
    .from("songs")
    .select("id, language, title, movie, album_art_url, scheduled_date, used_date")
    .gte("scheduled_date", start)
    .lte("scheduled_date", end);
  if (e1) return res.status(500).json({ error: e1.message });

  const { data: used, error: e2 } = await supabase
    .from("songs")
    .select("id, language, title, movie, album_art_url, scheduled_date, used_date")
    .gte("used_date", start)
    .lte("used_date", end);
  if (e2) return res.status(500).json({ error: e2.message });

  // Dedup by song id
  const byId = new Map();
  for (const s of [...(scheduled || []), ...(used || [])]) byId.set(s.id, s);
  res.json({ songs: Array.from(byId.values()) });
});

// TMDb full credits for a movie/TV (cast + crew with director, composer)
app.get("/api/admin/tmdb-credits", requireAdmin, async (req, res) => {
  const { id, media_type } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  try {
    const endpoint = media_type === "tv"
      ? `${TMDB_BASE}/tv/${id}/aggregate_credits`
      : `${TMDB_BASE}/movie/${id}/credits`;
    const response = await axios.get(endpoint, { params: { api_key: TMDB_KEY } });
    const cast = (response.data.cast || []).slice(0, 12).map(c => ({
      id: c.id, name: c.name,
      character: media_type === "tv" ? (c.roles?.[0]?.character || "") : (c.character || ""),
      profile_path: c.profile_path || null,
      gender: c.gender,           // 1=female, 2=male, 0=unknown
      order: c.order,
    }));
    const crew = response.data.crew || [];
    const director = crew.find(c => c.job === "Director")?.name || null;
    const composer = crew.find(c => c.job === "Original Music Composer" || c.job === "Music")?.name || null;
    res.json({ cast, director, composer });
  } catch (err) {
    console.error("TMDb credits error:", err.message);
    res.status(500).json({ error: "TMDb credits failed" });
  }
});

// Delete a song
app.delete("/api/admin/songs/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("songs").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: Daily song
// Selects today's song for a language, picking via:
//   1. Already used today (return same)
//   2. Scheduled for today (mark used, return)
//   3. Random unused (mark used, return)
// Returns 5 "hint rows" matching the Home.js expected shape.
// ─────────────────────────────────────────────────────────────────────────────

// Map URL languages (lowercase) to DB folder names (capitalized)
const LANGUAGE_DB_MAP = {
  telugu: "Telugu",
  tamil: "Tamil",
  malayalam: "Malayalam",
  hindi: "Hindin",          // existing folder is "Hindin", not "Hindi"
};

function songToHintRows(song) {
  const common = {
    "Song Name":  song.title || "",
    "Album Name": song.movie || "",
    "Song Link":  song.spotify_url || "",
  };
  return [
    { ...common, HintNumber: "1", "Audio Hint Link": song.hint_1_url, Clue: "" },
    { ...common, HintNumber: "2", "Audio Hint Link": song.hint_2_url, Clue: "" },
    { ...common, HintNumber: "3", "Audio Hint Link": song.hint_3_url, Clue: song.clue_hint_3 || "" },
    { ...common, HintNumber: "4", "Audio Hint Link": song.hint_4_url, Clue: song.clue_hint_4 || "" },
    { ...common, HintNumber: "5", "Audio Hint Link": song.hint_5_url, Clue: song.clue_hint_5 || "" },
  ];
}

app.get("/api/daily-song", async (req, res) => {
  const reqLang = String(req.query.language || "").toLowerCase();
  const dbLang  = LANGUAGE_DB_MAP[reqLang];
  if (!dbLang) return res.status(400).json({ error: "Unknown language" });

  const today = new Date().toISOString().slice(0, 10);

  try {
    // 1) Already used today?
    const { data: usedToday } = await supabase
      .from("songs").select("*")
      .eq("language", dbLang).eq("used_date", today).limit(1).maybeSingle();
    if (usedToday) return res.json({ hints: songToHintRows(usedToday), song_id: usedToday.id });

    // 2) Scheduled for today?
    const { data: scheduled } = await supabase
      .from("songs").select("*")
      .eq("language", dbLang).eq("scheduled_date", today).limit(1).maybeSingle();
    if (scheduled) {
      await supabase.from("songs").update({ used_date: today }).eq("id", scheduled.id);
      return res.json({ hints: songToHintRows(scheduled), song_id: scheduled.id });
    }

    // 3) Random unused (no used_date AND no scheduled_date in future, OR scheduled_date is null)
    const { data: pool } = await supabase
      .from("songs").select("*")
      .eq("language", dbLang).is("used_date", null).is("scheduled_date", null);
    if (pool && pool.length > 0) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      await supabase.from("songs").update({ used_date: today }).eq("id", pick.id);
      return res.json({ hints: songToHintRows(pick), song_id: pick.id });
    }

    // 4) Nothing left — return empty
    res.json({ hints: [], song_id: null });
  } catch (err) {
    console.error("Daily song error:", err.message);
    res.status(500).json({ error: "Failed to fetch daily song" });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
