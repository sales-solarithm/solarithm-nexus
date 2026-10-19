'use client';

import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  Key, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Sparkles 
} from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updatePassword,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDocs, query, collection, where } from 'firebase/firestore';
import { auth, db, isOwnerEmail, OWNER_EMAILS, SUPER_ADMIN_EMAILS } from '@/lib/firebase';
import { COLLECTIONS } from '@/src/config/schema';

interface OwnerLoginProps {
  onSuccess?: (ownerData: { email: string; uid: string; role: string }) => void;
  onCancel?: () => void;
}

/**
 * OwnerLogin & Owner Password Security Portal
 * Conforms to Solarithm Insights Executive Dashboard and Nexus Governance architecture.
 * Ensures that whenever an owner registers or updates their password, the exact Firebase Auth
 * email is stored in `authEmail` across both /users/{uid} and /employees/{empId}.
 */
export default function OwnerLogin({ onSuccess, onCancel }: OwnerLoginProps) {
  const [mode, setMode] = useState<'login' | 'security_portal'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Helper to resolve canonical employee ID (SDM-JS-001, SDM-DD-002, etc.)
  const findOwnerEmpId = async (cleanEmail: string): Promise<string | null> => {
    try {
      if (cleanEmail.includes('deepdavara')) return 'SDM-DD-002';
      if (cleanEmail.includes('jayjalpa') || cleanEmail.includes('jayshah')) return 'SDM-JS-001';

      const qEmp = query(
        collection(db, COLLECTIONS.EMPLOYEES || 'employees'),
        where('email', '==', cleanEmail)
      );
      const snap = await getDocs(qEmp);
      if (!snap.empty) {
        const d = snap.docs[0];
        return (d.data().employeeId || d.data().empId || d.id || '').toUpperCase();
      }

      const qPers = query(
        collection(db, COLLECTIONS.EMPLOYEES || 'employees'),
        where('personalEmail', '==', cleanEmail)
      );
      const snapPers = await getDocs(qPers);
      if (!snapPers.empty) {
        const d = snapPers.docs[0];
        return (d.data().employeeId || d.data().empId || d.id || '').toUpperCase();
      }
    } catch (err) {
      console.warn('Error resolving owner empId:', err);
    }
    return null;
  };

  /**
   * Owner Password Security Portal:
   * Sets or updates an Executive Owner password and synchronizes authEmail to /users and /employees.
   */
  const handleSaveOwnerPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid executive email address.');
      return;
    }

    if (!isOwnerEmail(cleanEmail) && !SUPER_ADMIN_EMAILS.includes(cleanEmail)) {
      setErrorMsg('Access Denied: The Owner Password Security Portal is strictly restricted to verified Executive Owners.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      let authUser: any = null;

      // 1. Attempt creating account in Firebase Auth
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        authUser = cred.user;
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-in-use') {
          // If already in use, sign in and update password
          try {
            const signCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
            authUser = signCred.user;
          } catch (signErr: any) {
            // If sign-in with current credentials fails, user might need password reset or alternate sign-in
            throw new Error(`Account "${cleanEmail}" exists. If updating existing password, please ensure previous password is verified or reset.`);
          }
        } else {
          throw createErr;
        }
      }

      if (!authUser) {
        throw new Error('Could not establish verified Firebase Auth session.');
      }

      // 2. Synchronize /users/{authUser.uid}
      await setDoc(doc(db, COLLECTIONS.USERS, authUser.uid), {
        authEmail: cleanEmail,
        email: cleanEmail,
        role: 'owner',
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 3. Synchronize /employees matching employeeId / empId
      const empId = await findOwnerEmpId(cleanEmail);
      if (empId) {
        await setDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', empId), {
          authEmail: cleanEmail,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      setSuccessMsg(`Executive credentials registered successfully for ${cleanEmail}. The Nexus Admin Console and Executive Dashboard are now in full synchronization.`);
      if (onSuccess) {
        onSuccess({
          email: cleanEmail,
          uid: authUser.uid,
          role: 'owner'
        });
      }
    } catch (err: any) {
      console.error('Owner Password Security Portal error:', err);
      setErrorMsg(err.message || 'Failed to configure executive password.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resilient Owner Login with Dual-Email Alias Resolution
   */
  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const inputEmail = email.trim().toLowerCase();
    if (!inputEmail || !inputEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    let authTargetEmail = inputEmail;

    // Check Firestore /users and /employees to resolve canonical alias
    try {
      let userQuery = query(collection(db, COLLECTIONS.USERS), where('email', '==', inputEmail));
      let userSnap = await getDocs(userQuery);

      if (userSnap.empty) {
        userQuery = query(collection(db, COLLECTIONS.USERS), where('personalEmail', '==', inputEmail));
        userSnap = await getDocs(userQuery);
      }
      if (userSnap.empty) {
        userQuery = query(collection(db, COLLECTIONS.USERS), where('personalEmailAddress', '==', inputEmail));
        userSnap = await getDocs(userQuery);
      }

      if (userSnap.empty) {
        const empQuery = query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('email', '==', inputEmail));
        const empSnap = await getDocs(empQuery);
        if (!empSnap.empty) {
          userSnap = empSnap;
        } else {
          const empPersonalQuery = query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('personalEmail', '==', inputEmail));
          const empPersonalSnap = await getDocs(empPersonalQuery);
          if (!empPersonalSnap.empty) userSnap = empPersonalSnap;
        }
      }

      if (!userSnap.empty) {
        const matchedData = userSnap.docs[0].data();
        if (matchedData.authEmail) {
          authTargetEmail = matchedData.authEmail.trim().toLowerCase();
        } else if (matchedData.personalEmail && inputEmail.includes('@solarithmdesign.com')) {
          authTargetEmail = (matchedData.personalEmail || matchedData.personalEmailAddress || '').trim().toLowerCase();
        } else if (matchedData.email && !inputEmail.includes('@solarithmdesign.com')) {
          authTargetEmail = (matchedData.email || (matchedData as any).officialEmail || '').trim().toLowerCase();
        }
      }
    } catch (lookupErr) {
      console.warn('Pre-auth alias lookup warning:', lookupErr);
    }

    try {
      let authUser: any = null;
      let loggedInEmail = inputEmail;

      // 1. First attempt with entered email
      try {
        const cred = await signInWithEmailAndPassword(auth, inputEmail, password);
        authUser = cred.user;
        loggedInEmail = inputEmail;
      } catch (firstErr: any) {
        // 2. Fallback retry with alias if invalid-credential
        if ((firstErr.code === 'auth/invalid-credential' || firstErr.code === 'auth/user-not-found') && authTargetEmail !== inputEmail) {
          try {
            const secondCred = await signInWithEmailAndPassword(auth, authTargetEmail, password);
            authUser = secondCred.user;
            loggedInEmail = authTargetEmail;
          } catch {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      if (!authUser) {
        throw new Error('Authentication failed.');
      }

      // Update authEmail in Firestore to keep cache warm
      await setDoc(doc(db, COLLECTIONS.USERS, authUser.uid), {
        authEmail: loggedInEmail,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      if (onSuccess) {
        onSuccess({
          email: inputEmail,
          uid: authUser.uid,
          role: 'owner'
        });
      }
    } catch (err: any) {
      console.error('Owner login failure:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setErrorMsg('Invalid credentials. Please verify your password or use the Owner Password Security Portal.');
      } else {
        setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-[#1A1A1A] border border-[#2E2E2E] rounded-2xl shadow-2xl relative text-white">
      {/* Top Gold Accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] rounded-t-2xl" />

      {/* Header */}
      <div className="text-center mb-6 pt-2">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mb-3">
          <Sparkles className="w-6 h-6 text-[#D4AF37]" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">
          SOLARITHM <span className="text-[#D4AF37]">EXECUTIVE</span>
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          {mode === 'login' ? 'Executive Owner Access & Verification' : 'Owner Password Security Portal'}
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex bg-[#121212] p-1 rounded-lg border border-[#2A2A2A] mb-5 text-xs font-semibold">
        <button
          type="button"
          onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 py-2 rounded-md transition-all ${
            mode === 'login' ? 'bg-[#2A2A2A] text-[#D4AF37] shadow' : 'text-gray-400 hover:text-white'
          }`}
        >
          Owner Sign In
        </button>
        <button
          type="button"
          onClick={() => { setMode('security_portal'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 py-2 rounded-md transition-all ${
            mode === 'security_portal' ? 'bg-[#2A2A2A] text-[#D4AF37] shadow' : 'text-gray-400 hover:text-white'
          }`}
        >
          Password Security Portal
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {mode === 'login' ? (
        <form onSubmit={handleOwnerLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@solarithmdesign.com"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-[#121212] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-xl text-sm focus:outline-none transition-all placeholder:text-gray-600"
              />
              <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-10 py-2.5 bg-[#121212] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-xl text-sm focus:outline-none transition-all placeholder:text-gray-600"
              />
              <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold rounded-xl text-sm shadow-lg hover:brightness-110 active:brightness-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In as Owner</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSaveOwnerPassword} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Executive Owner Email *
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. deepdavara23@gmail.com"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-[#121212] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-xl text-sm focus:outline-none transition-all placeholder:text-gray-600"
              />
              <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              New Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-10 py-2.5 bg-[#121212] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-xl text-sm focus:outline-none transition-all placeholder:text-gray-600"
              />
              <Key className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Confirm New Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-10 py-2.5 bg-[#121212] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-xl text-sm focus:outline-none transition-all placeholder:text-gray-600"
              />
              <Key className="w-4 h-4 text-gray-500 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold rounded-xl text-sm shadow-lg hover:brightness-110 active:brightness-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Save Owner Password</span>
              </>
            )}
          </button>
        </form>
      )}

      {onCancel && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
          >
            Return to Standard Portal
          </button>
        </div>
      )}
    </div>
  );
}
