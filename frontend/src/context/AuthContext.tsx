import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest } from '../api';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'cashier' | 'stall_operator' | 'auditor';
  stall_id: number | null;
  stall_name: string | null;
  stall_code: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isOffline: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Clear any persistent localStorage tokens so opening the link starts fresh on Auth page
  try {
    localStorage.removeItem('festtoken_auth_token');
    localStorage.removeItem('festtoken_user');
  } catch {}

  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('festtoken_auth_token');
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = sessionStorage.getItem('festtoken_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const logout = () => {
    sessionStorage.removeItem('festtoken_auth_token');
    sessionStorage.removeItem('festtoken_user');
    localStorage.removeItem('festtoken_auth_token');
    localStorage.removeItem('festtoken_user');
    setToken(null);
    setUser(null);
  };

  const login = (newToken: string, newUser: User) => {
    sessionStorage.setItem('festtoken_auth_token', newToken);
    sessionStorage.setItem('festtoken_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setIsOffline(false);
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ user: User }>('/auth/me');
      setUser(data.user);
      sessionStorage.setItem('festtoken_user', JSON.stringify(data.user));
      setIsOffline(false);
    } catch (err: any) {
      if (err.status === 401) {
        logout();
      } else if (err.status === 0) {
        setIsOffline(true);
      }
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        await refreshUser();
      }
      setIsLoading(false);
    };

    checkAuth();

    // Listen for custom network offline / auth expired events
    const handleOffline = () => setIsOffline(true);
    const handleAuthExpired = () => logout();

    window.addEventListener('network:offline', handleOffline);
    window.addEventListener('auth:expired', handleAuthExpired);

    // Heartbeat every 20s to check connection health
    const interval = setInterval(async () => {
      try {
        await fetch('/api/health');
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    }, 20000);

    return () => {
      window.removeEventListener('network:offline', handleOffline);
      window.removeEventListener('auth:expired', handleAuthExpired);
      clearInterval(interval);
    };
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOffline,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
