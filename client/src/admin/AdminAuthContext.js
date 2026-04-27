import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "https://anthyakshari.onrender.com";
const ADMIN_TOKEN_KEY = "anth_admin_token";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || "");

  useEffect(() => {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  }, [token]);

  async function login(email, password) {
    const res = await axios.post(`${API_BASE}/api/admin/login`, { email, password });
    setToken(res.data.token);
    return res.data.token;
  }

  function logout() { setToken(""); }

  function authHeaders() {
    return token ? { "x-admin-auth": token } : {};
  }

  return (
    <AdminAuthContext.Provider value={{ token, isLoggedIn: !!token, login, logout, authHeaders, API_BASE }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() { return useContext(AdminAuthContext); }
