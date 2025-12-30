// client/src/App.js
/*import React, { useState } from "react";
import Home from "./Home";
import "./App.css";

function App() {
  const [theme, setTheme] = useState("light");

  const toggleTheme = () =>
    setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <div className={`App App--${theme}`}>
      <header className="app-header">
        <div className="app-title-block">
          <h1 className="app-title">What To Listen ?</h1>
          <div className="app-subtitle">presents</div>
        </div>

        <button className="theme-toggle" onClick={toggleTheme}>
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
      </header>

      <Home />
    </div>
  );
}

export default App;
*/
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LanguageSelector from "./LanguageSelector";
import Home from "./Home";
import "./App.css";

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Landing page */}
          <Route path="/" element={<LanguageSelector />} />
          
          {/* Language-specific game routes */}
          <Route path="/telugu" element={<Home language="telugu" />} />
          <Route path="/tamil" element={<Home language="tamil" />} />
          <Route path="/hindi" element={<Home language="hindi" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;

