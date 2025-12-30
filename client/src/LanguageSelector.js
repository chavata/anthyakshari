import React from "react";
import { useNavigate } from "react-router-dom";
import "./LanguageSelector.css";

export default function LanguageSelector() {
  const navigate = useNavigate();
  
  const languages = [
    {
      code: "telugu",
      name: "Daily Dose of Telugu",
      script: "తెలుగు",
      color: "#4CAF50"
    },
    {
      code: "tamil",
      name: "Daily Dose of Tamil",
      script: "தமிழ்",
      color: "#FF9800"
    },
    {
      code: "hindi",
      name: "Daily Dose of Hindi",
      script: "हिंदी",
      color: "#2196F3"
    }
  ];

  return (
    <div className="language-selector-container">
      <div className="language-selector-header">
        <h1 className="main-title">What To Listen?</h1>
        <p className="subtitle">PRESENTS</p>
        <h2 className="site-name">Anthyakshari</h2>
        <h3 className="choose-title">Choose Your Daily Dose:</h3>
      </div>

      <div className="language-cards">
        {languages.map((lang) => (
          <div key={lang.code} className="language-card">
            <div className="language-script">{lang.script}</div>
            <div className="language-name">{lang.name}</div>
            <button
              className="play-button"
              style={{ backgroundColor: lang.color }}
              onClick={() => navigate(`/${lang.code}`)}
            >
              Play Now →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
