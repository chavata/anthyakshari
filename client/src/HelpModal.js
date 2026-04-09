import React from "react";

const steps = [
  {
    icon: "🎵",
    title: "Listen to the hint",
    desc: "An audio clip plays — could be an intro, interlude, or a snippet. Your ears are your first weapon.",
  },
  {
    icon: "🔍",
    title: "Search & guess",
    desc: "Type the song name in the search box and pick from Spotify results. Submit when you're ready.",
  },
  {
    icon: "➡️",
    title: "Wrong? Next hint",
    desc: "A wrong guess moves you to the next hint automatically. Up to 5 hints per day.",
  },
  {
    icon: "💡",
    title: "Text clue (Hint 3+)",
    desc: "From Hint 3 onwards you can reveal a text clue — but it costs you 5 points. Use wisely.",
  },
  {
    icon: "🏅",
    title: "Scoring",
    desc: (
      <span>
        Hint 1 → <strong>100 pts</strong> &nbsp;·&nbsp;
        Hint 2 → <strong>80</strong> &nbsp;·&nbsp;
        Hint 3 → <strong>60</strong> &nbsp;·&nbsp;
        Hint 4 → <strong>40</strong> &nbsp;·&nbsp;
        Hint 5 → <strong>20</strong> &nbsp;·&nbsp;
        Gave up → <strong>0</strong>
        <br />
        <span style={{ fontSize: "12px", opacity: 0.7 }}>−5 pts if text clue was used</span>
      </span>
    ),
  },
  {
    icon: "🏆",
    title: "Leaderboard",
    desc: "Sign up to submit your scores. Compete daily, weekly, and all-time across Telugu and Tamil.",
  },
  {
    icon: "🎬",
    title: "Your alter ego",
    desc: 'After signing up, pick a movie character as your identity. Appear as "chavata aka Tyler Durden" on the leaderboard.',
  },
];

export default function HelpModal({ onClose }) {
  return (
    <div className="stats-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="stats-modal help-modal">
        <div className="stats-header">
          <h2>✦ How to Play ✦</h2>
          <button className="stats-close" onClick={onClose}>✕</button>
        </div>

        <div className="help-tagline">
          A new song. Every day. Two languages. Can you name it in one hint?
        </div>

        <ol className="help-steps">
          {steps.map((s, i) => (
            <li key={i} className="help-step">
              <div className="help-step-icon">{s.icon}</div>
              <div className="help-step-body">
                <div className="help-step-title">{s.title}</div>
                <div className="help-step-desc">{s.desc}</div>
              </div>
            </li>
          ))}
        </ol>

        <button className="button" style={{ marginTop: "16px", width: "100%" }} onClick={onClose}>
          Let's Play ✦
        </button>
      </div>
    </div>
  );
}
