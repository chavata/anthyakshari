import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import ProfileSetup from "./ProfileSetup";
import { LeaderboardInline } from "./Leaderboard";
import HelpModal from "./HelpModal";
import "./LanguageSelector.css";

export default function LanguageSelector({ theme = "light", onToggleTheme }) {
  const navigate = useNavigate();
  const { isLoggedIn, profile, needsProfile, signOut } = useAuth();

  const [showAuth, setShowAuth] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const languages = [
    {
      code: "telugu",
      name: "Daily Dose of Telugu",
      script: "తెలుగు",
      gradientFrom: "#388e3c",
      gradientTo: "#81c784",
      glowColor: "#4caf50",
    },
    {
      code: "tamil",
      name: "Daily Dose of Tamil",
      script: "தமிழ்",
      gradientFrom: "#e65100",
      gradientTo: "#ffa726",
      glowColor: "#ff9800",
    },
    {
      code: "malayalam",
      name: "Daily Dose of Malayalam",
      script: "മലയാളം",
      gradientFrom: "#1565c0",
      gradientTo: "#64b5f6",
      glowColor: "#2196f3",
      comingSoon: true,
    },
    {
      code: "hindi",
      name: "Daily Dose of Hindi",
      script: "हिन्दी",
      gradientFrom: "#6a1b9a",
      gradientTo: "#ba68c8",
      glowColor: "#9c27b0",
      comingSoon: true,
    },
  ];

  const gameModes = [
    {
      code: "daily",
      name: "Daily Challenge",
      desc: "Solo song. New every day.",
      icon: "🎯",
      live: true,
    },
    {
      code: "1v1",
      name: "1 vs 1 Challenge",
      desc: "Race a friend on the same song.",
      icon: "⚔️",
      comingSoon: true,
    },
    {
      code: "rooms",
      name: "Game Rooms",
      desc: "Create a room. Play with up to 8 friends.",
      icon: "🏟️",
      comingSoon: true,
    },
  ];

  return (
    <div className="language-selector-container">
      {/* Top bar */}
      <div className="ls-topbar">
        <button className="topbar-btn" onClick={() => setShowHelp(true)} title="How to play">
          ✦ How to Play
        </button>
        <div className="topbar-right">
          {isLoggedIn ? (
            <>
              <span className="topbar-user">
                {profile ? `${profile.username}${profile.alter_ego ? ` aka ${profile.alter_ego}` : ""}` : ""}
              </span>
              <button className="topbar-btn topbar-btn-sm" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="topbar-btn topbar-join" onClick={() => setShowAuth(true)}>
              Join Leaderboard
            </button>
          )}
          <button
            className="ls-theme-toggle"
            onClick={onToggleTheme}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            aria-label="Toggle theme"
          >
            🪔
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="language-selector-header">
        <span className="ls-ornament">🎵</span>
        <h1 className="main-title">What To Listen?</h1>
        <p className="subtitle">PRESENTS</p>
        <h2 className="site-name">Anthyakshari</h2>
        <div className="ls-divider">
          <span className="ls-divider-dot"></span>
        </div>
        <h3 className="choose-title">Choose your daily dose</h3>
      </div>

      {/* Language cards */}
      <div className="language-cards">
        {languages.map((lang) => (
          <div
            key={lang.code}
            className={`language-card ${lang.comingSoon ? "is-coming-soon" : ""}`}
            onClick={() => !lang.comingSoon && navigate(`/${lang.code}`)}
          >
            {lang.comingSoon && <div className="coming-soon-badge">Coming Soon</div>}
            <div
              className="language-card-banner"
              style={{ background: `linear-gradient(90deg, ${lang.gradientFrom}, ${lang.gradientTo})` }}
            />
            <div
              className="language-card-glow"
              style={{ background: `radial-gradient(ellipse, ${lang.glowColor}, transparent)` }}
            />
            <div className="language-card-inner">
              <div className="language-script">{lang.script}</div>
              <div className="language-name">{lang.name}</div>
              <div className="card-divider" />
              <button
                className="play-button"
                style={{ background: `linear-gradient(135deg, ${lang.gradientFrom}, ${lang.gradientTo})` }}
                disabled={lang.comingSoon}
                onClick={(e) => { e.stopPropagation(); if (!lang.comingSoon) navigate(`/${lang.code}`); }}
              >
                {lang.comingSoon ? "Coming Soon" : "Play Now →"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Game modes section */}
      <div className="game-modes-section">
        <h3 className="section-title">Game Modes</h3>
        <div className="game-modes-grid">
          {gameModes.map((mode) => (
            <div
              key={mode.code}
              className={`game-mode-card ${mode.comingSoon ? "is-coming-soon" : ""}`}
            >
              {mode.comingSoon && <div className="coming-soon-badge">Coming Soon</div>}
              {mode.live && <div className="live-badge">Live</div>}
              <div className="game-mode-icon">{mode.icon}</div>
              <div className="game-mode-name">{mode.name}</div>
              <div className="game-mode-desc">{mode.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline leaderboard */}
      <div className="ls-leaderboard-section">
        <LeaderboardInline />
      </div>

      {/* Footer */}
      <footer className="ls-footer">
        <span>© 2026 Anthyakshari</span>
        <span className="ls-footer-sep">·</span>
        <span>
          Inspired by{" "}
          <a href="https://raagalahari.netlify.app/" target="_blank" rel="noopener noreferrer">
            Raagalahari
          </a>
        </span>
        <span className="ls-footer-sep">·</span>
        <span>Made with ♥</span>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} onSuccess={() => setShowAuth(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {needsProfile && <ProfileSetup onComplete={() => {}} />}
    </div>
  );
}
