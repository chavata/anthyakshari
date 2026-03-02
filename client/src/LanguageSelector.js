import React from "react";
import { useNavigate } from "react-router-dom";
import "./LanguageSelector.css";

export default function LanguageSelector({ theme = "light", onToggleTheme }) {
  const navigate = useNavigate();

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
  ];

  return (
    <div className="language-selector-container">
      {/* Diya theme toggle */}
      <button
        className="ls-theme-toggle"
        onClick={onToggleTheme}
        title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        aria-label="Toggle theme"
      >
        🪔
      </button>

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

      <div className="language-cards">
        {languages.map((lang) => (
          <div
            key={lang.code}
            className="language-card"
            onClick={() => navigate(`/${lang.code}`)}
          >
            {/* Color banner */}
            <div
              className="language-card-banner"
              style={{ background: `linear-gradient(90deg, ${lang.gradientFrom}, ${lang.gradientTo})` }}
            />
            {/* Background glow */}
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
                onClick={(e) => { e.stopPropagation(); navigate(`/${lang.code}`); }}
              >
                Play Now →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
