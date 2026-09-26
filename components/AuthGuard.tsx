'use client';

import React, { useState, createContext, useContext, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { 
  auth, 
  UserRole, 
  clearAuthSessionStorage 
} from '@/lib/firebase';
import LoginScreen from '@/components/LoginScreen';
import InactivityToast from '@/components/InactivityToast';
import { 
  useIdleTimer, 
  INACTIVITY_TIMEOUT_MS, 
  ACTIVITY_THROTTLE_MS 
} from '@/hooks/useIdleTimer';

export interface AuthSession {
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  logout: () => Promise<void>;
  resetInactivityTimer?: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: false,
  logout: async () => {},
  resetInactivityTimer: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  // Default to null session and loading=false to immediately render the LoginScreen with no auto-verification on mount
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  // Inactivity auto-logout handler: executes when user has been idle for strictly 10 minutes
  const handleInactivityLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Inactivity logout error:', err);
    }

    // Clear all storage, auth state, and tokens
    clearAuthSessionStorage();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (err) {
        console.warn('Error clearing sessionStorage:', err);
      }
    }

    setSession(null);
    setSessionExpiredNotice('Session expired due to 10 minutes of inactivity. Please log in again.');
  }, []);

  // Monitor idle time when a user session is active
  const { resetTimer } = useIdleTimer({
    timeoutMs: INACTIVITY_TIMEOUT_MS, // 600,000 ms = strictly 10 minutes
    throttleMs: ACTIVITY_THROTTLE_MS, // 1,000 ms throttle to protect CPU
    onIdle: handleInactivityLogout,
    enabled: !!session,
  });

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
    clearAuthSessionStorage();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (err) {
        console.warn('Error clearing sessionStorage:', err);
      }
    }
    setSessionExpiredNotice(null);
    setSession(null);
  };

  // Immediate default to LoginScreen when no active session exists
  if (!session) {
    return (
      <>
        {sessionExpiredNotice && (
          <InactivityToast 
            message={sessionExpiredNotice} 
            onClose={() => setSessionExpiredNotice(null)} 
          />
        )}
        <LoginScreen 
          initialError={sessionExpiredNotice}
          onLoginSuccess={(user) => {
            setSessionExpiredNotice(null);
            setSession(user);
          }}
        />
      </>
    );
  }

  return (
    <AuthContext.Provider value={{ session, loading: false, logout, resetInactivityTimer: resetTimer }}>
      {children}
    </AuthContext.Provider>
  );
}
