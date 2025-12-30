import React, { useEffect, useState } from "react";
import axios from "axios";
import SpotifyAutocomplete from "./SpotifyAutoComplete";
import { useNavigate } from "react-router-dom";
// Publish this sheet tab as CSV and use that URL here
const SHEET_URLS = {
  telugu: "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=0",
  tamil: "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=1054205430",
  hindi: "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=569384496"
};
const buttonTexts = {
  telugu: {
    clueButton: "Clue Kavalentra",
    giveUpButton: "Raatleda",
    prevHint: "Previous hint",
    nextHint: "Next hint",
    submit: "Submit"
  },
  tamil: {
    clueButton: "Clue Veenuma",
    giveUpButton: "Varaatha",
    prevHint: "Previous hint",
    nextHint: "Next hint",
    submit: "Submit"
  },
  hindi: {
    clueButton: "Clue Chahiye kya",
    giveUpButton: "Nahi aa raha kya",
    prevHint: "Previous hint",
    nextHint: "Next hint",
    submit: "Submit"
  }
};
const getStatsKey = (lang) => `wtl_stats_${lang}`;

const languageTitles = {
  telugu: "అంత్యాక్షరి",
  tamil: "அந்தாக்ஷரி",
  hindi: "अंताक्षरी"
};
// Set this to the first date in your sheet (YYYY-MM-DD)
const GAME_START_DATE = "2024-12-01";

// Normalize helper for text comparison
function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTodayLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCsv(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || "").trim();
    });
    return row;
  });
}

// ===== STATS HELPERS (localStorage) =====



function loadStats(lang) {
  try {
    const raw = localStorage.getItem(getStatsKey(lang));
    if (!raw) return { games: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.games)) return { games: [] };
    return { games: parsed.games };
  } catch {
    return { games: [] };
  }
}

function saveStats(stats, lang) {
  try {
    localStorage.setItem(getStatsKey(lang), JSON.stringify(stats));
  } catch {
    // ignore storage errors
  }
}

// Compute aggregate stats + guess distribution
function computeAggregates(games) {
  if (!games.length) {
    return {
      totalGames: 0,
      wins: 0,
      winRate: 0,
      avgScore: 0,
      currentStreak: 0,
      bestStreak: 0,
      dist: {
        hint1: 0,
        hint2: 0,
        hint3: 0,
        hint4: 0,
        hint5: 0,
        raatl: 0,
      },
    };
  }

  const totalGames = games.length;
  const wins = games.filter((g) => g.result === "win").length;
  const winRate = Math.round((wins / totalGames) * 100);

  const avgScore =
    Math.round(
      (games.reduce((sum, g) => sum + (g.score || 0), 0) / totalGames) * 10
    ) / 10;

  // streaks based on chronological order
  let currentStreak = 0;
  let bestStreak = 0;
  for (const g of games) {
    if (g.result === "win") {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const dist = {
    hint1: 0,
    hint2: 0,
    hint3: 0,
    hint4: 0,
    hint5: 0,
    raatl: 0,
  };

  for (const g of games) {
    if (g.result === "lose" || g.solvedOnHint === "raatl") {
      dist.raatl += 1;
    } else {
      switch (g.solvedOnHint) {
        case 1:
          dist.hint1 += 1;
          break;
        case 2:
          dist.hint2 += 1;
          break;
        case 3:
          dist.hint3 += 1;
          break;
        case 4:
          dist.hint4 += 1;
          break;
        case 5:
          dist.hint5 += 1;
          break;
        default:
          break;
      }
    }
  }

  return {
    totalGames,
    wins,
    winRate,
    avgScore,
    currentStreak,
    bestStreak,
    dist,
  };
}

// Day number like Wordle (#1, #2, ...)
function getDayNumber(dateStr) {
  try {
    const start = new Date(GAME_START_DATE + "T00:00:00");
    const current = new Date(dateStr + "T00:00:00");
    const diffMs = current.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays + 1; // start at 1
  } catch {
    return 1;
  }
}

// Build share text
function buildShareText({
  date,
  solvedOnHint,
  totalHints,
  score,
  usedClue,
  gaveUp,
  language // ADD THIS PARAMETER
}) {
  const dayNumber = getDayNumber(date);
  const langName = language === "telugu" ? "Telugu" : language === "tamil" ? "Tamil" : "Hindi"; // ADD THIS
  
  const header = gaveUp
    ? `WTL's Anthyakshari (${langName}) #${dayNumber} X/${totalHints}` // UPDATE THIS
    : `WTL's Anthyakshari (${langName}) #${dayNumber} ${solvedOnHint}/${totalHints}`; // UPDATE THIS

  const scoreLine = gaveUp
    ? "Score: 0/100"  // REMOVE the Telugu text
    : `Score: ${score}/100${usedClue ? " (clue used)" : ""}`;

  const cells = [];
  for (let i = 1; i <= totalHints; i++) {
    if (gaveUp && i === totalHints) {
      cells.push("❌");
    } else if (!gaveUp && i === solvedOnHint) {
      cells.push("🟩");
    } else {
      cells.push("⬜");
    }
  }
  const gridLine = cells.join("");

  const linkLine = `Play your turn: https://anthyakshari.netlify.app/${language}`; // UPDATE THIS

  return `${header}\n${scoreLine}\n${gridLine}\n${linkLine}`;
}


export default function Home({ language = "telugu" }) {
  const navigate = useNavigate();
  const [hintsToday, setHintsToday] = useState([]);
  const [currentHintIdx, setCurrentHintIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  // store full selected track info from SpotifyAutocomplete
  const [selectedTrack, setSelectedTrack] = useState(null);

  const [showAnswer, setShowAnswer] = useState(false);
  const [status, setStatus] = useState("");

  // which hint indices have had their clue revealed
  const [revealedClues, setRevealedClues] = useState(new Set());

  const [gaveUp, setGaveUp] = useState(false);
  const [finalScore, setFinalScore] = useState(null); // null => game not finished

  // stats state
  const [stats, setStats] = useState(() => loadStats(language));
  const [showStats, setShowStats] = useState(false);

  // share status
  const [shareStatus, setShareStatus] = useState("");

  // result modal
  const [showResultModal, setShowResultModal] = useState(false);
  const [hasFinishedToday, setHasFinishedToday] = useState(false);

  useEffect(() => {
  async function loadSheet() {
    try {
      const sheetUrl = SHEET_URLS[language]; // Get the correct sheet URL
      const res = await axios.get(sheetUrl);
      const rows = parseCsv(res.data);

      const today = getTodayLocal();

      const todaysRows = rows
        .filter((r) => r["Date"] === today)
        .sort(
          (a, b) =>
            Number(a["HintNumber"] || 0) - Number(b["HintNumber"] || 0)
        );

      setHintsToday(todaysRows);
    } catch (err) {
      console.error("Failed to load sheet:", err);
      setHintsToday([]);
    } finally {
      setLoading(false);
    }
  }

  loadSheet();
}, [language]); // Add language as dependency


  const hasHints = hintsToday.length > 0;
  const currentHint = hasHints ? hintsToday[currentHintIdx] : null;

  // game finished flag (used to disable input after submission)
  const isGameFinished = showAnswer || gaveUp;

  // save one game to stats
function recordGame(result, score, solvedOnHint) {
  if (!currentHint) return;
  const today = getTodayLocal();

  const newGame = {
    date: today,
    result,
    score: score ?? 0,
    hintNumber: Number(currentHint["HintNumber"] || currentHintIdx + 1),
    solvedOnHint: result === "win" ? solvedOnHint : "raatl",
    usedClue: revealedClues.has(currentHintIdx),
    timestamp: Date.now(),
  };

  setStats((prev) => {
    const nextGames = [...prev.games, newGame];
    const next = { games: nextGames };
    saveStats(next, language); // Pass language here
    return next;
  });
}


  function handleRevealClue() {
    if (!hasHints || gaveUp || showAnswer) return;

    setRevealedClues((prev) => {
      if (prev.has(currentHintIdx)) return prev; // already revealed on this hint
      const next = new Set(prev);
      next.add(currentHintIdx);
      return next;
    });
  }

  function goToHint(newIdx) {
    if (!hasHints || gaveUp || showAnswer) return;
    if (newIdx < 0 || newIdx >= hintsToday.length) return;

    setSelectedTrack(null);
    setShowAnswer(false);
    setStatus("");
    setCurrentHintIdx(newIdx);
  }

  function prevHint() {
    goToHint(currentHintIdx - 1);
  }

  function nextHint() {
    goToHint(currentHintIdx + 1);
  }

  // VALIDATION + SCORING (song + album; album optional)
  function revealAnswer() {
  if (!hasHints || !currentHint || gaveUp) return;

  const sheetSong = currentHint["Song Name"] || "";
  const sheetAlbum = currentHint["Album Name"] || "";

  // Use pure track title and album for comparison
  const userSong = selectedTrack ? selectedTrack.trackName || "" : "";
  const userAlbum = selectedTrack ? selectedTrack.albumName || "" : "";

  console.log("==== GUESS DEBUG START ====");
  console.log("Sheet song:", sheetSong);
  console.log("User selected song:", userSong);
  console.log("Sheet album:", sheetAlbum);
  console.log("User selected album:", userAlbum);

  const nSheetSong = normalize(sheetSong);
  const nUserSong = normalize(userSong);
  const nSheetAlbum = normalize(sheetAlbum);
  const nUserAlbum = normalize(userAlbum);

  console.log("Normalized sheet song:", nSheetSong);
  console.log("Normalized user song:", nUserSong);
  console.log("Normalized sheet album:", nSheetAlbum);
  console.log("Normalized user album:", nUserAlbum);
  console.log("==== GUESS DEBUG END ====");

  // Song match: allow one to contain the other
  const songMatch =
    nSheetSong === nUserSong ||
    nSheetSong.includes(nUserSong) ||
    nUserSong.includes(nSheetSong);

  // Album match: allow user album to have extra words
  const albumMatch =
    sheetAlbum.trim().length === 0
      ? true
      : nSheetAlbum === nUserAlbum ||
        nUserAlbum.includes(nSheetAlbum) ||
        nSheetAlbum.includes(nUserAlbum);

  const isCorrect = songMatch && albumMatch;

  if (isCorrect) {
    setShowAnswer(true);
    setStatus("Nice! You got it right.");

    // 100 point system:
    // Hint 1: 100, Hint 2: 80, Hint 3: 60, Hint 4: 40, Hint 5: 20
    const base = 100 - currentHintIdx * 20;

    const usedClueOnThisHint = revealedClues.has(currentHintIdx);
    const cluePenalty = usedClueOnThisHint ? 5 : 0;

    const score = Math.max(base - cluePenalty, 0);
    setFinalScore(score);
    recordGame("win", score, currentHintIdx + 1);

    setHasFinishedToday(true);
    setShowResultModal(true);
  } else {
    setStatus("Not quite. Try the next hint.");
  }
}


  function handleRaatleda() {
    if (!hasHints || !currentHint) return;

    setGaveUp(true);
    setShowAnswer(true);
    setFinalScore(0);
    setStatus("Raatleda! Better luck tomorrow.");
    recordGame("lose", 0, "raatl");

    setHasFinishedToday(true);
    setShowResultModal(true);
  }

  const aggregates = computeAggregates(stats.games);

  async function handleShare() {
    if (!currentHint || finalScore === null) return;

    const today = getTodayLocal();
    const totalHints = hintsToday.length || 5;
    const solvedOnHint = gaveUp ? null : currentHintIdx + 1;
    const usedClue = revealedClues.has(currentHintIdx);

    const text = buildShareText({
      date: today,
      solvedOnHint,
      totalHints,
      score: finalScore,
      usedClue,
      gaveUp,
      language
    });

    try {
      await navigator.clipboard.writeText(text);
      setShareStatus("Copied result to clipboard!");
    } catch (e) {
      console.error("Share copy failed:", e);
      setShareStatus("Could not copy. You can share manually.");
    }

    setTimeout(() => setShareStatus(""), 2500);
  }

  return (
    <div className="game-container">
     <button
      className="button"
      onClick={() => navigate("/")}
      style={{ 
        position: "absolute", 
        top: "20px", 
        left: "20px", 
        zIndex: 10 
      }}
    >
      ← Back
    </button>
    
    <div className="game-title-block">
  <h2 className="wtl-heading">What To Listen?</h2>
  <div className="wtl-subheading">presents</div>
  <h1 className="title">{languageTitles[language]}</h1>
</div>


      {/* Stats button */}
      <button
        className="button"
        style={{ marginBottom: "12px" }}
        onClick={() => setShowStats(true)}
      >
        View stats
      </button>

      {/* Stats modal */}
      {showStats && (
        <div className="stats-overlay">
          <div className="stats-modal">
            <div className="stats-header">
              <h2>WTL&apos;s Anthyakshari</h2>
              <button
                className="stats-close"
                onClick={() => setShowStats(false)}
              >
                ✖
              </button>
            </div>

            <div className="stats-grid">
              <div className="stats-item">
                🎵 Times played:
                <span>{aggregates.totalGames}</span>
              </div>
              <div className="stats-item">
                🏆 Times won:
                <span>{aggregates.wins}</span>
              </div>
              <div className="stats-item">
                🥇 Win percentage:
                <span>{aggregates.winRate}%</span>
              </div>
              <div className="stats-item">
                🔥 Current streak:
                <span>{aggregates.currentStreak}</span>
              </div>
              <div className="stats-item">
                💪 Best streak:
                <span>{aggregates.bestStreak}</span>
              </div>
              <div className="stats-item">
                ⭐ Average score:
                <span>{aggregates.avgScore}</span>
              </div>
            </div>

            <div className="stats-distribution">
              <h3>📊 Guess distribution</h3>
              <div className="stats-dist-row">
                1️⃣ Hint 1: <span>{aggregates.dist.hint1}</span>
              </div>
              <div className="stats-dist-row">
                2️⃣ Hint 2: <span>{aggregates.dist.hint2}</span>
              </div>
              <div className="stats-dist-row">
                3️⃣ Hint 3: <span>{aggregates.dist.hint3}</span>
              </div>
              <div className="stats-dist-row">
                4️⃣ Hint 4: <span>{aggregates.dist.hint4}</span>
              </div>
              <div className="stats-dist-row">
                5️⃣ Hint 5: <span>{aggregates.dist.hint5}</span>
              </div>
              <div className="stats-dist-row">
                ❌ Raatleda: <span>{aggregates.dist.raatl}</span>
              </div>
            </div>

            <button
              className="button"
              style={{ marginTop: "16px" }}
              onClick={() => setShowStats(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {loading && <div className="status-text">Loading daily song...</div>}

      {!loading && !hasHints && (
        <div className="status-text">No hints for today!</div>
      )}

      {!loading && hasHints && (
        <>
          <div className="hint-block">
            <h2>
              Hint {currentHint["HintNumber"]} of {hintsToday.length}
            </h2>

            {currentHint["Audio Hint Link"] && (
              <div className="audio-hint">
                <audio controls src={currentHint["Audio Hint Link"]}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            <div className="hint-row">
  {currentHintIdx >= 2 && ( /* Only show from hint 3 onwards (index 2) */
    <>
      <button
        className="button"
        onClick={handleRevealClue}
        disabled={
          gaveUp ||
          showAnswer ||
          revealedClues.has(currentHintIdx)
        }
      >
        {buttonTexts[language].clueButton}
      </button>

      {revealedClues.has(currentHintIdx) && (
        <span className="hint-inline-text">
          {currentHint["Clue"]}
        </span>
      )}
    </>
  )}
  
  {currentHintIdx < 2 && ( /* For hints 1 and 2, show a message */
    <p style={{ color: "#666", fontSize: "0.9rem", fontStyle: "italic" }}>
      Text clue available from Hint 3 onwards
    </p>
  )}
</div>


            <div className="hint-nav">
              <button
                className="button"
                onClick={prevHint}
                disabled={gaveUp || showAnswer || currentHintIdx <= 0}
              >
                {buttonTexts[language].prevHint}
              </button>
              <button
                className="button"
                onClick={nextHint}
                disabled={
                  gaveUp ||
                  showAnswer ||
                  currentHintIdx >= hintsToday.length - 1
                }
              >
                 {buttonTexts[language].nextHint}
              </button>
            </div>
          </div>

          <div className="guess-block">
            <h3>Guess the song</h3>

            <SpotifyAutocomplete
              value=""
              onSelect={(track) => setSelectedTrack(track)}
              disabled={isGameFinished}
            />

            {selectedTrack && (
              <div className="selected-track">
                You chose: {selectedTrack.trackName}
              </div>
            )}

            <button
              className="button reveal-button"
              onClick={revealAnswer}
              disabled={isGameFinished || !selectedTrack}
            >
              {buttonTexts[language].submit}
            </button>

            <button
              className="button"
              onClick={handleRaatleda}
              disabled={isGameFinished}
            >
              {buttonTexts[language].giveUpButton}
            </button>

            {status && !hasFinishedToday && (
              <div className="status-text">{status}</div>
            )}

            {/* After game ends and modal is closed, allow re-opening result */}
            {hasFinishedToday && !showResultModal && (
              <button
                className="button"
                style={{ marginTop: "16px" }}
                onClick={() => setShowResultModal(true)}
              >
                View today&apos;s result
              </button>
            )}

            {shareStatus && (
              <div className="status-text">{shareStatus}</div>
            )}
          </div>
        </>
      )}

      {/* Result modal */}
      {showResultModal && currentHint && (
        <div className="stats-overlay">
          <div className="stats-modal result-modal">
            <div className="stats-header">
              <h2>Today&apos;s result</h2>
              <button
                className="stats-close"
                onClick={() => setShowResultModal(false)}
              >
                ✖
              </button>
            </div>

            <div className="result-body">
              <div className="result-line">
                {gaveUp
                  ? "Raatleda! Better luck tomorrow."
                  : `Nice! You solved it on Hint ${currentHintIdx + 1}.`}
              </div>
              <div className="result-line">
                Song: {currentHint["Song Name"] || "Unknown"} (
                {currentHint["Album Name"] || "Unknown album"})
              </div>
              <div className="result-line">
                Score: {finalScore !== null ? `${finalScore}/100` : "0/100"}
              </div>

              {currentHint["Song Link"] && (
                <a
                  href={currentHint["Song Link"]}
                  target="_blank"
                  rel="noreferrer"
                  className="spotify-link"
                >
                  <img
                    src="/spotify-icon.png"
                    alt="Spotify"
                    className="spotify-icon"
                  />
                  <span>Listen on Spotify</span>
                </a>
              )}
            </div>

            <div className="result-footer">
              <button
                className="button"
                onClick={handleShare}
                style={{ marginRight: "8px" }}
              >
                Share result
              </button>
              <button
                className="button"
                onClick={() => setShowResultModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
