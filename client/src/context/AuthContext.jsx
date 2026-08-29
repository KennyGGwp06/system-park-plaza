import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api("/auth/me")
      .then((data) => setUser(normalizeUser(data.user)))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    const normalizedUser = normalizeUser(data.user);
    setUser(normalizedUser);
    return normalizedUser;
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  function hasPermission(permission) {
    if (!permission) return true;
    if (user?.role === "SUPERADMIN") return true;
    return user?.permissions?.includes(permission);
  }

  function can(module, action = "VER") {
    return hasPermission(`${module}:${action}`);
  }

  const value = useMemo(() => ({ user, loading, login, logout, hasPermission, can, isAuthenticated: Boolean(user) }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

function normalizeUser(user) {
  return {
    ...user,
    role: user.displayRole || user.role,
    permissions: (user.permissions || []).map((permission) => {
      if (typeof permission === "string") return permission;
      return `${permission.module}:${permission.action}`;
    })
  };
}

