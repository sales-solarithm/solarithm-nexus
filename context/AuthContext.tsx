'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  User as FirebaseUser, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { auth, UserRole, isOwnerEmail, clearAuthSessionStorage } from '@/lib/firebase';
import { syncUserDocumentOnLogin, ensureOwnerDocumentExists, CanonicalUserProfile } from '@/lib/userService';

export interface AuthSession {
  email: string;
  role: UserRole;
  name: string;
  uid: string;
}

interface AuthContextValue {
  session: AuthSession | null;
  user: FirebaseUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  syncProfile: () => Promise<CanonicalUserProfile | null>;
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  logout: async () => {},
  syncProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const syncProfile = useCallback(async (): Promise<CanonicalUserProfile | null> => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) return null;
    try {
      const cleanEmail = currentUser.email.trim().toLowerCase();
      const isOwner = isOwnerEmail(cleanEmail) || cleanEmail === 'jayjalpa2002@gmail.com' || currentUser.uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2';
      if (cleanEmail === 'jayjalpa2002@gmail.com' || currentUser.uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2') {
        await ensureOwnerDocumentExists().catch((e) => console.warn('Ensure owner document notice:', e));
      }
      const profile = await syncUserDocumentOnLogin({
        uid: currentUser.uid,
        email: cleanEmail,
        displayName: currentUser.displayName,
        role: isOwner ? 'owner' : undefined
      });
      const newSession: AuthSession = {
        uid: currentUser.uid,
        email: cleanEmail,
        role: (profile.role?.toLowerCase() === 'owner' ? 'owner' : profile.role) as UserRole,
        name: profile.name || currentUser.displayName || cleanEmail.split('@')[0]
      };
      setSession(newSession);
      return profile;
    } catch (err) {
      console.warn('Auth sync notice:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    // Proactively verify canonical owner user document in /users
    ensureOwnerDocumentExists().catch((err) => {
      console.warn('Initial owner check caught:', err);
    });

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser && firebaseUser.email) {
          try {
            await syncProfile();
          } catch (syncErr) {
            console.warn('Error syncing user profile on auth change:', syncErr);
          }
        } else {
          setSession(null);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('onAuthStateChanged error caught:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [syncProfile]);

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('Error signing out:', err);
    }
    clearAuthSessionStorage();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (err) {
        console.warn('Error clearing sessionStorage:', err);
      }
    }
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, logout, syncProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
