import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LanguageSelector from "./LanguageSelector";
import Home from "./Home";
import AdminApp from "./admin/AdminApp";
import "./App.css";
import "./leaderboard.css";

function App() {
  const [theme, setTheme] = useState("light");
  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");

  return (
    <AuthProvider>
      <Router>
        <div className={`App App--${theme}`}>
          <Routes>
            <Route path="/"       element={<LanguageSelector theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/telugu" element={<Home language="telugu" theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/tamil"  element={<Home language="tamil"  theme={theme} onToggleTheme={toggleTheme} />} />
            <Route path="/admin"  element={<AdminApp />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
