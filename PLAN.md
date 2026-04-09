# Anthyakshari — Feature & Build Plan

## Project Owner
- **Email:** gautivasu@gmail.com
- **Aliases used in git:** chaitanya, chavata
- **Live URL:** https://anthyakshari.netlify.app
- **Backend (Render):** https://anthyakshari.onrender.com

---

## What is Anthyakshari?

A daily music guessing game (like Wordle) for South Indian film music lovers.  
Players listen to audio hints and guess the song using Spotify search.  
Currently supports **Telugu** and **Tamil** languages.

**Tech stack:**
- Frontend: React (CRA), React Router, Axios — deployed on Netlify
- Backend: Node.js + Express — deployed on Render
- Song hints: Google Sheets (CSV export), one row per hint per day
- Song search: Spotify Web API (Client Credentials flow, proxied through backend)

---

## Scoring System

| Hint guessed on | Points |
|-----------------|--------|
| Hint 1          | 100    |
| Hint 2          | 80     |
| Hint 3          | 60     |
| Hint 4          | 40     |
| Hint 5          | 20     |
| Failed / gave up| 0      |

**Clue penalty:** -5 points if the text clue was revealed before submitting.

---

## Leaderboard Feature (In Progress)

### Overview
Logged-in users can participate in leaderboards. Guests can still play normally — scores just won't be submitted.

### Leaderboard Types
1. **Language Leaderboard** — top scores for Telugu or Tamil separately
2. **Global Leaderboard** — combined score across both languages

### Time Scopes (all three)
- **Daily** — today's scores only
- **Weekly** — sum of scores over last 7 days
- **All-time** — cumulative sum since account creation

---

## User Identity

### Signup / Login
- Provider: **Supabase Auth** (email/password to start; Spotify OAuth to be added)
- Guests play without logging in — no leaderboard participation

### Display Name Format
```
[movie poster]  chavata aka Tyler Durden
```
- **username** — chosen by user on signup (e.g. "chavata")
- **alter ego** — a movie/show character picked from TMDb (e.g. "Tyler Durden")
- **Movie poster** — used as their leaderboard avatar (fetched from TMDb, stored as poster_path)
- Alter ego names are NOT unique — multiple users can share the same character

### Profile Setup Flow (first login)
1. Enter username
2. Search for a movie/show via TMDb API
3. Pick the movie → poster preview appears
4. Pick a character from that movie's cast
5. Preview: **[poster]  chavata aka Tyler Durden**
6. Confirm → saved to `profiles` table

---

## Database (Supabase — Free Tier)

**Region:** Singapore (closest to target users)  
**Project name:** anthyakshari  
**Project ID:** bpidkjgfpjdokuuyjpxg  
**Project URL:** https://bpidkjgfpjdokuuyjpxg.supabase.co

### Table: `profiles`
| Column         | Type      | Notes                          |
|----------------|-----------|--------------------------------|
| id             | uuid (PK) | matches Supabase auth user id  |
| username       | text      | display name, e.g. "chavata"   |
| alter_ego      | text      | character name, e.g. "Tyler Durden" |
| tmdb_movie_id  | integer   | TMDb movie/show id             |
| poster_path    | text      | e.g. "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg" |
| created_at     | timestamp |                                |

### Table: `scores`
| Column      | Type      | Notes                             |
|-------------|-----------|-----------------------------------|
| id          | uuid (PK) |                                   |
| user_id     | uuid (FK) | references profiles.id            |
| language    | text      | "telugu" or "tamil"               |
| date        | date      | game date                         |
| score       | integer   | 0–100 after clue penalty          |
| hint_number | integer   | which hint they solved on (1–5)   |
| clue_used   | boolean   |                                   |
| created_at  | timestamp |                                   |
| UNIQUE      |           | (user_id, language, date)         |

---

## External APIs

| Service   | Purpose                          | Key location          |
|-----------|----------------------------------|-----------------------|
| Spotify   | Song search autocomplete         | backend/.env          |
| TMDb      | Movie/character search + posters | to be added to .env   |
| Supabase  | Auth + database                  | to be added to .env   |

---

## Environment Variables Needed

### backend/.env (add these)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
TMDB_API_KEY=your-tmdb-key
```

### client/.env (add these)
```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-public-key
REACT_APP_TMDB_API_KEY=your-tmdb-key
```

---

## Implementation Checklist

### Infrastructure
- [x] Create Supabase project (region: Singapore)
- [x] Run DB schema SQL in Supabase SQL editor
- [ ] Enable Spotify OAuth in Supabase Auth providers (optional, post-launch)
- [x] Get TMDb API key from themoviedb.org
- [x] Add env vars to backend and client

### Backend (index.js additions)
- [x] `POST /api/scores` — submit a score (verify Supabase JWT)
- [x] `GET /api/leaderboard` — daily/weekly/alltime, language/global params
- [x] TMDb proxy routes `/api/tmdb-search` and `/api/tmdb-cast`

### Frontend (new components)
- [x] `supabaseClient.js` — Supabase client singleton
- [x] `AuthContext.js` — Supabase session context provider
- [x] `AuthModal.js` — signup/login form
- [x] `ProfileSetup.js` — username + alter ego picker (TMDb search)
- [x] `Leaderboard.js` — tabbed: Daily / Weekly / All-time, Telugu / Tamil / Global
- [x] `leaderboard.css` — styles for all new components

### Frontend (changes to existing)
- [x] `App.js` — wrapped with AuthProvider
- [x] `Home.js` — score submission on game complete, auth/leaderboard buttons in topbar

---

## Status
- **Phase:** Feature complete — leaderboard built and compiling cleanly
- **Launch status:** Not yet launched — testing phase
- **Last updated:** 2026-04-06
