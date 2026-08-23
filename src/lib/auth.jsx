import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('maapsure_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const logout = () => setUser(null);
    window.addEventListener('maapsure:logout', logout);
    return () => window.removeEventListener('maapsure:logout', logout);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(email, password) {
      setLoading(true);
      try {
        const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem('maapsure_token', result.token);
        localStorage.setItem('maapsure_user', JSON.stringify(result.user));
        setUser(result.user);
        return result.user;
      } finally {
        setLoading(false);
      }
    },
    logout() {
      localStorage.removeItem('maapsure_token');
      localStorage.removeItem('maapsure_user');
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
