import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('REBATE_TOKEN');
    const u = localStorage.getItem('REBATE_USER');
    if (t && u) {
      setToken(t);
      setUser(JSON.parse(u));
    }
    setLoading(false);
  }, []);

  const login = async (data) => {
    const resp = await api.auth.login(data);
    localStorage.setItem('REBATE_TOKEN', resp.token);
    localStorage.setItem('REBATE_USER', JSON.stringify(resp.user));
    setToken(resp.token);
    setUser(resp.user);
    return resp;
  };

  const logout = () => {
    localStorage.removeItem('REBATE_TOKEN');
    localStorage.removeItem('REBATE_USER');
    setToken(null);
    setUser(null);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  const roleName = (role) => ({admin:'运营管理员',channel_manager:'渠道经理',finance:'财务复核',risk:'风控',dealer:'经销商'}[role] || role);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasRole, roleName, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
