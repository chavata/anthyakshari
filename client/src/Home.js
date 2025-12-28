import React, { useEffect, useState } from "react";
import axios from "axios";
import SpotifyAutocomplete from "./SpotifyAutoComplete";

// Publish this sheet tab as CSV and use that URL here
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/14e8C0eLCxEau6vU-qybongpwDjS2Zj0qdNFMqOCxdYU/export?format=csv&gid=0";

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

export default function Home() {
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

  useEffect(() => {
    async function loadSheet() {
      try {
        const res = await axios.get(SHEET_URL);
        const rows = parseCsv(res.data);

        const today = getTodayLocal();

        // Columns: Date, SongID, HintNumber, Clue, Song Name, Album Name, Song Link, Audio Hint Link
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
  }, []);

  const hasHints = hintsToday.length > 0;
  const currentHint = hasHints ? hintsToday[currentHintIdx] : null;

  // game finished flag (used to disable input after submission)
  const isGameFinished = showAnswer || gaveUp;

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

    const userSong = selectedTrack ? selectedTrack.name || "" : "";
    const userAlbum = selectedTrack ? selectedTrack.albumName || "" : "";

    const nSheetSong = normalize(sheetSong);
    const nUserSong = normalize(userSong);
    const nSheetAlbum = normalize(sheetAlbum);
    const nUserAlbum = normalize(userAlbum);

    console.log("SHEET SONG/ALBUM:", sheetSong, sheetAlbum);
    console.log("USER  SONG/ALBUM:", userSong, userAlbum);
    console.log("NORMALIZED:", { nSheetSong, nUserSong, nSheetAlbum, nUserAlbum });

    const songMatch = nSheetSong === nUserSong;

    // allow album mismatch if sheet album is empty OR if song matches exactly
    const albumMatch =
      sheetAlbum.trim().length === 0 ? true : nSheetAlbum === nUserAlbum;

    const isCorrect = songMatch && albumMatch;

    if (isCorrect) {
      setShowAnswer(true);
      setStatus("Nice! You got it right.");

      // 100 point system:
      // Hint 1: 100
      // Hint 2: 80
      // Hint 3: 60
      // Hint 4: 40
      // Hint 5: 20
      const base = 100 - currentHintIdx * 20;

      const usedClueOnThisHint = revealedClues.has(currentHintIdx);
      const cluePenalty = usedClueOnThisHint ? 5 : 0;

      const score = Math.max(base - cluePenalty, 0);
      setFinalScore(score);
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
  }

  return (
    <div className="game-container">
      <h1 className="title">అంత్యాక్షరి</h1>

      {loading && <div className="status-text">Loading daily song...</div>}

      {!loading && !hasHints && (
        <div className="status-text">No hints for today!</div>
      )}

      {!loading && hasHints && (
        <>
          <div className="hint-block">
            <h2>
              Clue {currentHint["HintNumber"]} of {hintsToday.length}
            </h2>

            {/* Audio always visible */}
            {currentHint["Audio Hint Link"] && (
              <div className="audio-hint">
                <audio controls src={currentHint["Audio Hint Link"]}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Clue row: button + inline clue text */}
            <div className="hint-row">
              <button
                className="button"
                onClick={handleRevealClue}
                disabled={
                  gaveUp ||
                  showAnswer ||
                  revealedClues.has(currentHintIdx)
                }
              >
                Clue Kavalentra
              </button>

              {revealedClues.has(currentHintIdx) && (
                <span className="hint-inline-text">
                  {currentHint["Clue"]}
                </span>
              )}
            </div>

            {/* Previous / Next hint navigation */}
            <div className="hint-nav">
              <button
                className="button"
                onClick={prevHint}
                disabled={gaveUp || showAnswer || currentHintIdx <= 0}
              >
                Previous hint
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
                Next hint
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
                You chose: {selectedTrack.name} - {selectedTrack.artists}
              </div>
            )}

            <button
              className="button reveal-button"
              onClick={revealAnswer}
              disabled={isGameFinished || !selectedTrack}
            >
              Submit
            </button>

            <button
              className="button"
              onClick={handleRaatleda}
              disabled={isGameFinished}
            >
              Raatleda
            </button>

            {showAnswer && (
              <div className="answer-text">
                Answer: {currentHint["Song Name"] || "Unknown"} (
                {currentHint["Album Name"] || "Unknown album"})
                <br />
                {currentHint["Song Link"] && (
                  <a
                    href={currentHint["Song Link"]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Spotify
                  </a>
                )}
              </div>
            )}

            {status && <div className="status-text">{status}</div>}

            {finalScore !== null && (
              <div className="status-text">
                Your score: {finalScore}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
