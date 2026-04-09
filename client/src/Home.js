import React, { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import SpotifyAutocomplete from "./SpotifyAutoComplete";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import ProfileSetup from "./ProfileSetup";
import Leaderboard from "./Leaderboard";
import HelpModal from "./HelpModal";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://anthyakshari.onrender.com";

const SHEET_URLS = {
  telugu: "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=0",
  tamil:  "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=1054205430",
};

const buttonTexts = {
  telugu: { clueButton: "Clue Kavalentra", giveUpButton: "Raatleda",        prevHint: "← Prev", nextHint: "Next →", submit: "Submit" },
  tamil:  { clueButton: "Clue Veenuma",    giveUpButton: "Varaatha",         prevHint: "← Prev", nextHint: "Next →", submit: "Submit" },
};

const getStatsKey  = (lang) => `wtl_stats_${lang}`;
const getPlayedKey = (lang) => `wtl_played_${lang}`;

const languageTitles = {
  telugu: "అంత్యాక్షరి",
  tamil:  "அந்தாக்ஷரி",
};

const GAME_START_DATE = "2024-12-01";

function normalize(str) {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function getTodayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

function parseCsv(text) {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  function parseLine(line) {
    const cells = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim()); return cells;
  }
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = parseLine(line); const row = {};
    headers.forEach((h,i) => { row[h] = (cells[i]||"").trim(); }); return row;
  });
}

function loadStats(lang) {
  try {
    const raw = localStorage.getItem(getStatsKey(lang));
    if (!raw) return { games: [] };
    const p = JSON.parse(raw);
    return Array.isArray(p.games) ? p : { games: [] };
  } catch { return { games: [] }; }
}
function saveStats(stats, lang) {
  try { localStorage.setItem(getStatsKey(lang), JSON.stringify(stats)); } catch {}
}
function loadTodayResult(lang) {
  try {
    const raw = localStorage.getItem(getPlayedKey(lang));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p.date === getTodayLocal() ? p : null;
  } catch { return null; }
}
function saveTodayResult(lang, payload) {
  try { localStorage.setItem(getPlayedKey(lang), JSON.stringify(payload)); } catch {}
}

function computeAggregates(games) {
  if (!games.length) return {
    totalGames:0, wins:0, winRate:0, avgScore:0, currentStreak:0, bestStreak:0,
    dist:{ hint1:0, hint2:0, hint3:0, hint4:0, hint5:0, raatl:0 }
  };
  const totalGames = games.length;
  const wins = games.filter(g=>g.result==="win").length;
  const winRate = Math.round((wins/totalGames)*100);
  const avgScore = Math.round((games.reduce((s,g)=>s+(g.score||0),0)/totalGames)*10)/10;
  const sorted = [...games].sort((a,b)=>(a.date>b.date?1:-1));
  let bestStreak=0, tempStreak=0, prevDate=null;
  for (const g of sorted) {
    if (g.result !== "win") { tempStreak=0; prevDate=g.date; continue; }
    if (!prevDate) { tempStreak=1; }
    else {
      const diff = Math.round((new Date(g.date+"T00:00:00")-new Date(prevDate+"T00:00:00"))/86400000);
      tempStreak = diff===1 ? tempStreak+1 : 1;
    }
    prevDate=g.date; bestStreak=Math.max(bestStreak,tempStreak);
  }
  const today = getTodayLocal();
  let currentStreak=0;
  const rev=[...sorted].reverse();
  for (let i=0;i<rev.length;i++){
    const g=rev[i]; if (g.result!=="win") break;
    if (i===0){
      const diff=Math.round((new Date(today+"T00:00:00")-new Date(g.date+"T00:00:00"))/86400000);
      if (diff>1) break; currentStreak=1;
    } else {
      const diff=Math.round((new Date(rev[i-1].date+"T00:00:00")-new Date(g.date+"T00:00:00"))/86400000);
      if (diff!==1) break; currentStreak++;
    }
  }
  const dist={hint1:0,hint2:0,hint3:0,hint4:0,hint5:0,raatl:0};
  for (const g of games){
    if (g.result==="lose"||g.solvedOnHint==="raatl") dist.raatl++;
    else { const k=`hint${g.solvedOnHint}`; if (k in dist) dist[k]++; }
  }
  return { totalGames, wins, winRate, avgScore, currentStreak, bestStreak, dist };
}

function getDayNumber(dateStr) {
  try { return Math.floor((new Date(dateStr+"T00:00:00")-new Date(GAME_START_DATE+"T00:00:00"))/86400000)+1; }
  catch { return 1; }
}

function buildShareText({ date, solvedOnHint, totalHints, score, usedClue, gaveUp, language }) {
  const dayNumber = getDayNumber(date);
  const langName = language==="telugu"?"Telugu":"Tamil";
  const header = gaveUp
    ? `WTL's Anthyakshari (${langName}) #${dayNumber} X/${totalHints}`
    : `WTL's Anthyakshari (${langName}) #${dayNumber} ${solvedOnHint}/${totalHints}`;
  const scoreLine = gaveUp ? "Score: 0/100" : `Score: ${score}/100${usedClue?" (clue used)":""}`;
  const cells = [];
  for (let i=1;i<=totalHints;i++){
    if (gaveUp) cells.push(i===totalHints?"❌":"⬜");
    else cells.push(i===solvedOnHint?"🟩":i<solvedOnHint?"⬜":"");
  }
  const grid = cells.filter(Boolean).join("");
  const link = `Can you guess today's ${langName} song? 🎵\nPlay here: https://anthyakshari.netlify.app/${language}`;
  return `${header}\n${scoreLine}\n${grid}\n\n${link}`;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Home({ language="telugu", theme="light", onToggleTheme }) {
  const navigate = useNavigate();
  const { session, profile, isLoggedIn, needsProfile, signOut } = useAuth();

  const [hintsToday, setHintsToday]           = useState([]);
  const [currentHintIdx, setCurrentHintIdx]   = useState(0);
  const [loading, setLoading]                 = useState(true);
  const [selectedTrack, setSelectedTrack]     = useState(null);
  const [showAnswer, setShowAnswer]           = useState(false);
  const [status, setStatus]                   = useState("");
  const [revealedClues, setRevealedClues]     = useState(new Set());
  const [gaveUp, setGaveUp]                   = useState(false);
  const [finalScore, setFinalScore]           = useState(null);
  const [stats, setStats]                     = useState(()=>loadStats(language));
  const [showStats, setShowStats]             = useState(false);
  const [shareStatus, setShareStatus]         = useState("");
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasFinishedToday, setHasFinishedToday] = useState(false);
  const [searchKey, setSearchKey]             = useState(0);
  const [showAuth, setShowAuth]               = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHelp, setShowHelp]               = useState(false);

  useEffect(()=>{ setStats(loadStats(language)); }, [language]);

  useEffect(()=>{
    async function loadSheet(){
      setLoading(true);
      try {
        const res = await axios.get(SHEET_URLS[language]);
        const rows = parseCsv(res.data);
        const today = getTodayLocal();
        const todaysRows = rows
          .filter(r=>r["Date"]===today)
          .sort((a,b)=>Number(a["HintNumber"]||0)-Number(b["HintNumber"]||0));
        setHintsToday(todaysRows);
        const saved = loadTodayResult(language);
        if (saved){
          setHasFinishedToday(true); setGaveUp(saved.gaveUp);
          setFinalScore(saved.score); setShowAnswer(true);
          setCurrentHintIdx(typeof saved.solvedOnHint==="number" ? saved.solvedOnHint-1 : todaysRows.length-1);
          setShowResultModal(true);
        }
      } catch(err){ console.error("Failed to load sheet:", err); setHintsToday([]); }
      finally { setLoading(false); }
    }
    loadSheet();
  }, [language]);

  const hasHints       = hintsToday.length > 0;
  const currentHint    = hasHints ? hintsToday[currentHintIdx] : null;
  const isGameFinished = showAnswer || gaveUp;

  function recordGame(result, score, solvedOnHint){
    if (!currentHint) return;
    const today = getTodayLocal();
    const usedClue = revealedClues.has(currentHintIdx);
    const newGame = { date:today, result, score:score??0,
      hintNumber:Number(currentHint["HintNumber"]||currentHintIdx+1),
      solvedOnHint: result==="win"?solvedOnHint:"raatl", usedClue, timestamp:Date.now() };
    setStats(prev=>{
      if (prev.games.some(g=>g.date===today)) return prev;
      const next={games:[...prev.games,newGame]};
      saveStats(next,language); return next;
    });
    saveTodayResult(language,{ date:today, result, score:score??0,
      solvedOnHint: result==="win"?solvedOnHint:null, usedClue, gaveUp:result!=="win" });
  }

  async function submitScoreToLeaderboard(score, hintNumber, clueUsed) {
    if (!isLoggedIn || !session) return;
    try {
      await axios.post(`${API_BASE}/api/scores`, {
        language,
        date: getTodayLocal(),
        score,
        hint_number: hintNumber,
        clue_used: clueUsed,
      }, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
    } catch (err) {
      console.error("Failed to submit score:", err.message);
    }
  }

  function handleRevealClue(){
    if (!hasHints||gaveUp||showAnswer) return;
    setRevealedClues(prev=>{
      if (prev.has(currentHintIdx)) return prev;
      return new Set([...prev, currentHintIdx]);
    });
  }

  function goToHint(newIdx){
    if (!hasHints) return;
    if (newIdx<0||newIdx>=hintsToday.length) return;
    // Only clear search when game is still in progress
    if (!isGameFinished) {
      setSelectedTrack(null);
      setStatus("");
      setSearchKey(k=>k+1);
    }
    setCurrentHintIdx(newIdx);
  }

  function revealAnswer(){
    if (!hasHints||!currentHint||gaveUp) return;
    const sheetSong  = currentHint["Song Name"]  || "";
    const sheetAlbum = currentHint["Album Name"] || "";
    const userSong   = selectedTrack?.trackName  || "";
    const userAlbum  = selectedTrack?.albumName  || "";
    const nSS=normalize(sheetSong), nUS=normalize(userSong);
    const nSA=normalize(sheetAlbum), nUA=normalize(userAlbum);
    const songMatch  = nSS===nUS||nSS.includes(nUS)||nUS.includes(nSS);
    const albumMatch = sheetAlbum.trim().length===0
      ? true : nSA===nUA||nUA.includes(nSA)||nSA.includes(nUA);

    if (songMatch && albumMatch){
      setShowAnswer(true);
      setStatus("Nice! You got it right.");
      const score = Math.max(100-currentHintIdx*20-(revealedClues.has(currentHintIdx)?5:0), 0);
      setFinalScore(score);
      recordGame("win", score, currentHintIdx+1);
      submitScoreToLeaderboard(score, currentHintIdx+1, revealedClues.has(currentHintIdx));
      setHasFinishedToday(true);
      setShowResultModal(true);
    } else {
      // Wrong answer: show message, clear search box, move to next hint automatically
      setStatus("Not quite! Moving to the next hint…");
      setSelectedTrack(null);
      setSearchKey(k=>k+1);
      // Auto-advance to next hint after brief delay (if not on last hint)
      if (currentHintIdx < hintsToday.length - 1){
        setTimeout(()=>{
          setStatus("");
          setCurrentHintIdx(idx=>idx+1);
        }, 900);
      }
    }
  }

  function handleGiveUp(){
    if (!hasHints||!currentHint) return;
    setGaveUp(true); setShowAnswer(true); setFinalScore(0);
    recordGame("lose",0,"raatl");
    submitScoreToLeaderboard(0, null, false);
    setHasFinishedToday(true); setShowResultModal(true);
  }

  const aggregates = computeAggregates(stats.games);

  const handleShare = useCallback(async ()=>{
    if (!currentHint||finalScore===null) return;
    const text = buildShareText({
      date:getTodayLocal(), solvedOnHint:gaveUp?null:currentHintIdx+1,
      totalHints:hintsToday.length||5, score:finalScore,
      usedClue:revealedClues.has(currentHintIdx), gaveUp, language
    });
    try { await navigator.clipboard.writeText(text); setShareStatus("Copied! Challenge your friends 🎵"); }
    catch { setShareStatus("Could not copy. Share manually."); }
    setTimeout(()=>setShareStatus(""),2500);
  },[currentHint,finalScore,hintsToday.length,gaveUp,currentHintIdx,revealedClues,language]);

  // ── Veena fret tracker ───────────────────────────────────────────────────
  function VeenaTracker(){
    return (
      <div className="hint-progress-wrap">
        <div className="veena-string" />
        <div className="hint-progress">
          {hintsToday.map((_,idx)=>{
            let cls = "fret-unlit", labelCls = "fret-label";
            if (isGameFinished){
              if (gaveUp)                  cls="fret-lost";
              else if (idx===currentHintIdx) cls="fret-won";
              else if (idx<currentHintIdx)   cls="fret-past";
            } else {
              if (idx===currentHintIdx)  { cls="fret-current"; labelCls="fret-label fret-label-current"; }
              else if (idx<currentHintIdx) cls="fret-past";
            }
            return (
              <div className="hint-step" key={idx}>
                <button
                  className={`fret-btn ${cls}`}
                  onClick={()=>goToHint(idx)}
                  title={`Hint ${idx+1}`}
                >
                  {idx+1}
                </button>
                <span className={labelCls}>H{idx+1}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`game-wrapper lang-${language}`}>
      {/* Topbar */}
      <div className="game-topbar">
        <button className="topbar-btn" onClick={()=>navigate("/")}>← Back</button>
        <div className="topbar-right">
          <button className="topbar-btn topbar-btn-sm" onClick={()=>setShowHelp(true)} title="How to play">✦ Help</button>
          {isLoggedIn ? (
            <>
              <span className="topbar-user">
                {profile ? `${profile.username}${profile.alter_ego ? ` aka ${profile.alter_ego}` : ""}` : ""}
              </span>
              <button className="topbar-btn" onClick={()=>setShowLeaderboard(true)}>🏆</button>
              <button className="topbar-btn topbar-btn-sm" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="topbar-btn" onClick={()=>setShowLeaderboard(true)}>🏆</button>
              <button className="topbar-btn topbar-join" onClick={()=>setShowAuth(true)}>Join Leaderboard</button>
            </>
          )}
          <button
            className="diya-toggle"
            onClick={onToggleTheme}
            title={theme==="light"?"Switch to dark mode":"Switch to light mode"}
            aria-label="Toggle theme"
          >
            🪔
          </button>
        </div>
      </div>

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          onClose={()=>setShowAuth(false)}
          onSuccess={()=>setShowAuth(false)}
        />
      )}

      {/* Profile setup — shown automatically after first login */}
      {needsProfile && <ProfileSetup onComplete={()=>{}} />}

      {/* Leaderboard modal */}
      {showLeaderboard && <Leaderboard onClose={()=>setShowLeaderboard(false)} />}

      {/* Help modal */}
      {showHelp && <HelpModal onClose={()=>setShowHelp(false)} />}

      {/* Stats modal — must be outside game-container to avoid stacking context trap */}
      {showStats && (
        <div className="stats-overlay" onClick={e=>e.target===e.currentTarget&&setShowStats(false)}>
          <div className="stats-modal">
            <div className="stats-header">
              <h2>✦ Your Stats ✦</h2>
              <button className="stats-close" onClick={()=>setShowStats(false)}>✕</button>
            </div>
            <div className="stats-grid">
              <div className="stats-item">🎵 Played <span>{aggregates.totalGames}</span></div>
              <div className="stats-item">🏆 Won <span>{aggregates.wins}</span></div>
              <div className="stats-item">🥇 Win % <span>{aggregates.winRate}%</span></div>
              <div className="stats-item">🔥 Streak <span>{aggregates.currentStreak}</span></div>
              <div className="stats-item">💪 Best <span>{aggregates.bestStreak}</span></div>
              <div className="stats-item">⭐ Avg <span>{aggregates.avgScore}</span></div>
            </div>
            <div className="stats-distribution">
              <h3>Guess Distribution</h3>
              {[1,2,3,4,5].map(n=>(
                <div className="stats-dist-row" key={n}>
                  <span>{["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][n-1]} Hint {n}</span>
                  <span>{aggregates.dist[`hint${n}`]}</span>
                </div>
              ))}
              <div className="stats-dist-row"><span>❌ Gave up</span><span>{aggregates.dist.raatl}</span></div>
            </div>
            <button className="button" style={{marginTop:"16px", display:"block", margin:"16px auto 0"}} onClick={()=>setShowStats(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="game-container">
        {/* Title block */}
        <div className="game-title-block">
          <p className="wtl-heading">What To Listen?</p>
          <div className="wtl-subheading">PRESENTS</div>
          <h1 className="title">{languageTitles[language]}</h1>
          <div className="title-divider"><span className="title-divider-icon">✦</span></div>
        </div>

        {/* Stats button */}
        <div className="game-controls-row">
          <button className="button button-outline" onClick={()=>setShowStats(true)}>
            📊 Stats
          </button>
        </div>

        {loading && <div className="status-text" style={{marginTop:"24px"}}>Loading today's song…</div>}
        {!loading && !hasHints && <div className="status-text" style={{marginTop:"24px"}}>No hints for today. Check back soon!</div>}

        {!loading && hasHints && (
          <>
            {/* Veena fret tracker */}
            <VeenaTracker />

            <div className="hint-block">
              <span className="hint-number-text">Hint {currentHint["HintNumber"]} of {hintsToday.length}</span>

              {currentHint["Audio Hint Link"] && (
                <div className="audio-hint">
                  <audio controls src={currentHint["Audio Hint Link"]}
                    onError={e=>{e.target.style.display="none";}}>
                    Your browser does not support audio.
                  </audio>
                </div>
              )}

              {/* Clue row — hidden after game ends */}
              {!isGameFinished && (
                <div className="hint-row">
                  {currentHintIdx >= 2 ? (
                    <>
                      <button className="button" onClick={handleRevealClue}
                        disabled={revealedClues.has(currentHintIdx)}>
                        {buttonTexts[language].clueButton}
                      </button>
                      {revealedClues.has(currentHintIdx) && (
                        <span className="hint-inline-text">"{currentHint["Clue"]}"</span>
                      )}
                    </>
                  ) : (
                    <p className="hint-available-note">Text clue unlocks from Hint 3</p>
                  )}
                </div>
              )}

              <div className="hint-nav">
                <button className="button" onClick={()=>goToHint(currentHintIdx-1)}
                  disabled={currentHintIdx<=0}>
                  {buttonTexts[language].prevHint}
                </button>
                <button className="button" onClick={()=>goToHint(currentHintIdx+1)}
                  disabled={currentHintIdx>=hintsToday.length-1}>
                  {buttonTexts[language].nextHint}
                </button>
              </div>
            </div>

            <div className="guess-block">
              <span className="section-label">Guess the song</span>

              {/* key prop forces remount → clears input on wrong answer or hint change */}
              <SpotifyAutocomplete
                key={searchKey}
                value=""
                onSelect={track=>setSelectedTrack(track)}
                disabled={isGameFinished}
              />

              {selectedTrack && !isGameFinished && (
                <div className="selected-track">✦ {selectedTrack.trackName}</div>
              )}

              <button className="button reveal-button" onClick={revealAnswer}
                disabled={isGameFinished||!selectedTrack}>
                {buttonTexts[language].submit}
              </button>
              <button className="button" onClick={handleGiveUp} disabled={isGameFinished}>
                {buttonTexts[language].giveUpButton}
              </button>

              {status && !hasFinishedToday && <div className="status-text">{status}</div>}

              {hasFinishedToday && !showResultModal && (
                <button className="button" style={{marginTop:"16px"}} onClick={()=>setShowResultModal(true)}>
                  View today's result
                </button>
              )}
              {shareStatus && <div className="status-text">{shareStatus}</div>}
            </div>
          </>
        )}

      </div>

      {/* Result modal — outside game-container to avoid stacking context trap */}
      {showResultModal && currentHint && (
        <div className="stats-overlay" onClick={e=>e.target===e.currentTarget&&setShowResultModal(false)}>
          <div className="stats-modal result-modal">
            <div className="stats-header">
              <h2>{gaveUp?"Better luck tomorrow!":"✦ You got it! ✦"}</h2>
              <button className="stats-close" onClick={()=>setShowResultModal(false)}>✕</button>
            </div>
            <div className="result-body">
              {!gaveUp && <div className="result-line">Solved on Hint {currentHintIdx+1} 🎉</div>}
              <div className="result-line">
                🎵 <strong>{currentHint["Song Name"]||"Unknown"}</strong>
                {currentHint["Album Name"] ? ` — ${currentHint["Album Name"]}` : ""}
              </div>
              <div className="result-line">
                Score: <strong>{finalScore!==null?`${finalScore}/100`:"0/100"}</strong>
              </div>
              {currentHint["Song Link"] && (
                <a href={currentHint["Song Link"]} target="_blank" rel="noreferrer" className="spotify-link">
                  <img src="/spotify-icon.png" alt="Spotify" className="spotify-icon"/>
                  <span>Listen on Spotify</span>
                </a>
              )}
            </div>
            <div className="result-footer">
              <button className="button" onClick={handleShare}>📤 Challenge friends</button>
              <button className="button button-outline" onClick={()=>setShowResultModal(false)}>Close</button>
            </div>
            {shareStatus && <div className="status-text" style={{marginTop:"8px"}}>{shareStatus}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
