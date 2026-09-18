'use client';

import React, { useState, createContext, useContext } from 'react';
import { signOut } from 'firebase/auth';
import { 
  auth, 
  UserRole, 
  clearAuthSessionStorage 
} from '@/lib/firebase';
import LoginScreen from '@/components/LoginScreen';

export interface AuthSession {
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: false,
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  // Default to null session and loading=false to immediately render the LoginScreen with no auto-verification on mount
  const [session, setSession] = useState<AuthSession | null>(null);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    clearAuthSessionStorage();
    setSession(null);
  };

  // Immediate default to LoginScreen when no active session exists
  if (!session) {
    return (
      <LoginScreen 
        onLoginSuccess={(user) => {
          setSession(user);
        }}
      />
    );
  }

  return (
    <AuthContext.Provider value={{ session, loading: false, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
