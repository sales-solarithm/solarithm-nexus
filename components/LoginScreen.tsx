'use client';

import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  Sun, 
  Moon, 
  Eye, 
  EyeOff, 
  AlertCircle
} from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  signOut,
  setPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { 
  auth, 
  UserRole,
  isOwnerEmail,
  SUPER_ADMIN_EMAILS,
  verifyUserCredentials
} from '@/lib/firebase';
import { useTheme } from '@/components/ThemeProvider';

interface LoginScreenProps {
  onLoginSuccess: (user: { email: string; role: UserRole; name: string }) => void;
  initialError?: string | null;
}

export default function LoginScreen({ onLoginSuccess, initialError }: LoginScreenProps) {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingClearance, setVerifyingClearance] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  const errorMsg = internalError !== null ? internalError : (initialError || null);
  const setErrorMsg = (msg: string | null) => setInternalError(msg);

  const handleAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    setVerifyingClearance(false);
    setErrorMsg(null);

    try {
      // 1. Explicitly ensure in-memory persistence to avoid any IndexedDB locking
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch (pErr) {
        console.warn('Could not set inMemoryPersistence:', pErr);
      }

      // 2. Authenticate credentials with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const firebaseUser = userCredential.user;

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error('Authentication returned an invalid user profile.');
      }

      // 3. Trigger Clearance Verification
      setVerifyingClearance(true);

      // 4. Verify clearance for Nexus Admin Console (Exclusive to Owners and Admins)
      const credResult = await verifyUserCredentials(cleanEmail);
      const isDirectOwner = isOwnerEmail(cleanEmail) || SUPER_ADMIN_EMAILS.includes(cleanEmail);
      
      const userRole = (credResult.user?.role || '').toLowerCase();
      const isAuthorizedRole = isDirectOwner || userRole === 'owner' || userRole === 'admin' || userRole === 'super_admin';

      if (!isAuthorizedRole) {
        await signOut(auth);
        setVerifyingClearance(false);
        setErrorMsg('Access Denied: Nexus Admin Console is exclusively restricted to authorized Owners and Admins.');
        return;
      }

      const verifiedRole: UserRole = isDirectOwner ? 'owner' : (userRole === 'admin' ? 'admin' : 'owner');
      const verifiedName = credResult.user?.name || cleanEmail.split('@')[0];

      // 5. Ensure canonical /users/{uid} document synchronization
      try {
        const { syncUserDocumentOnLogin } = await import('@/lib/userService');
        await syncUserDocumentOnLogin({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: verifiedName,
          role: verifiedRole
        });
      } catch (provErr) {
        console.warn('Could not sync user profile to /users/{uid}:', provErr);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('lockedEmail', cleanEmail);
        localStorage.setItem('lockedRole', verifiedRole);
        localStorage.setItem('lockedName', verifiedName);
        localStorage.setItem('activePortal', 'executive');
      }

      onLoginSuccess({
        email: cleanEmail,
        role: verifiedRole,
        name: verifiedName
      });
    } catch (err: any) {
      console.error('Nexus Console Login Error:', err);
      setVerifyingClearance(false);
      const code = err.code || '';

      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setErrorMsg('Invalid credentials. Please verify your email and password.');
      } else if (code === 'auth/user-not-found') {
        setErrorMsg('No account found for this email address. Please check your credentials.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Too many failed attempts. Please wait a few moments and try again.');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('Invalid email format.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#121212] flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2.5 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-gray-300 hover:text-[#D4AF37] rounded-xl transition-all cursor-pointer shadow-md border border-[#2E2E2E] flex items-center gap-1.5"
          id="login-theme-toggle-btn"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#D4AF37]" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-400" />
          )}
          <span className="text-xs font-semibold hidden sm:inline">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
      </div>

      {/* Subtle Ambient Background Gold Accents */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#B38728]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Centered Login Card */}
      <div className="w-full max-w-md bg-[#1A1A1A] border border-[#2E2E2E] rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black relative overflow-hidden z-10">
        {/* Top Gold Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B38728] via-[#FBF5B7] to-[#D4AF37]" />

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6 pt-2">
          {/* Solarithm Sun Icon in Gold */}
          <div className="w-14 h-14 rounded-2xl bg-[#242424] border border-[#D4AF37]/30 flex items-center justify-center mb-3 shadow-inner shadow-[#D4AF37]/10">
            <Sun className="w-7 h-7 text-[#D4AF37]" />
          </div>
          
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-wider">
              SOLARITHM
            </h1>
            <span className="text-xl sm:text-2xl font-extrabold text-[#D4AF37] tracking-wider">
              NEXUS
            </span>
          </div>
          
          <p className="text-xs text-gray-400 mt-1 font-medium tracking-wide">
            Master Admin Console &amp; Governance Hub
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMsg && (
          <div 
            id="login-error-alert"
            className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs sm:text-sm text-rose-300 flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-snug">{errorMsg}</div>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {/* Email Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="owner-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-2.5 bg-[#242424] border border-[#333333] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all font-mono"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                id="owner-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                autoComplete="current-password"
                className="w-full pl-10 pr-11 py-2.5 bg-[#242424] border border-[#333333] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Verifying Clearance Indicator */}
          {verifyingClearance && (
            <div 
              id="verifying-owner-clearance-indicator"
              className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded-xl flex items-center justify-center gap-2.5 text-xs text-amber-200 font-mono shadow-sm shadow-[#D4AF37]/10 animate-pulse"
            >
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping shrink-0" />
              <span className="font-semibold text-[#FBF5B7] tracking-wider">
                Verifying Nexus Console Clearance...
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button
            id="owner-login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold text-sm rounded-xl hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/15 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>
                  {verifyingClearance
                    ? 'Verifying Nexus Clearance...'
                    : 'Authenticating Session...'}
                </span>
              </span>
            ) : (
              <>
                <span>Sign In to Nexus Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
