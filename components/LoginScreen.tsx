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
  db,
  UserRole,
  UserDocument,
  isOwnerEmail,
  SUPER_ADMIN_EMAILS,
  verifyUserCredentials
} from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  setDoc,
  query, 
  where 
} from 'firebase/firestore';
import { COLLECTIONS } from '@/src/config/schema';
import { useTheme } from '@/components/ThemeProvider';

interface LoginScreenProps {
  onLoginSuccess: (user: { email: string; role: UserRole; name: string }) => void;
  initialError?: string | null;
}

/**
 * Resolves canonical Firebase Auth email vs linked alternative (corporate / personal)
 * by querying /users and /employees collections.
 */
async function lookupEmployeeDirectoryAuthEmail(inputEmail: string): Promise<{
  found: boolean;
  canonicalAuthEmail: string;
  alternativeEmail?: string;
  docData?: UserDocument;
}> {
  const normInput = inputEmail.trim().toLowerCase();
  if (!normInput) {
    return { found: false, canonicalAuthEmail: inputEmail };
  }

  // 1. Direct Owner bypass mapping
  if (isOwnerEmail(normInput)) {
    const isAltJay = normInput === 'jay.solarithm@gmail.com' ? 'jayjalpa2002@gmail.com' : (normInput === 'jayjalpa2002@gmail.com' ? 'jayshah.03@solarithmdesign.com' : 'jay.solarithm@gmail.com');
    return {
      found: true,
      canonicalAuthEmail: normInput,
      alternativeEmail: isAltJay
    };
  }

  // 2. Query Firestore /users and /employees collections for matches on email, officialEmail, personalEmail, personalEmailAddress
  try {
    const queries = [
      getDocs(query(collection(db, COLLECTIONS.USERS), where('email', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.USERS), where('officialEmail', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.USERS), where('personalEmail', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.USERS), where('personalEmailAddress', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('email', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('officialEmail', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('personalEmail', '==', normInput))).catch(() => null),
      getDocs(query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'), where('personalEmailAddress', '==', normInput))).catch(() => null)
    ];

    const results = await Promise.all(queries);
    let matchedDoc: UserDocument | null = null;

    for (const snap of results) {
      if (snap && !snap.empty) {
        matchedDoc = snap.docs[0].data() as UserDocument;
        break;
      }
    }

    // Direct document lookup (in case doc ID is the email or email slug)
    if (!matchedDoc) {
      try {
        const directUserSnap = await getDoc(doc(db, COLLECTIONS.USERS, normInput)).catch(() => null);
        if (directUserSnap && directUserSnap.exists()) {
          matchedDoc = directUserSnap.data() as UserDocument;
        }
      } catch {}
    }

    // 3. Fallback: Check local cache if offline or cold start
    if (!matchedDoc && typeof window !== 'undefined') {
      try {
        const cachedStr = localStorage.getItem('employees');
        if (cachedStr) {
          const cachedList: UserDocument[] = JSON.parse(cachedStr);
          const found = cachedList.find(u => 
            (u.email || '').toLowerCase() === normInput ||
            ((u as any).officialEmail || '').toLowerCase() === normInput ||
            (u.personalEmail || '').toLowerCase() === normInput ||
            (u.personalEmailAddress || '').toLowerCase() === normInput
          );
          if (found) matchedDoc = found;
        }
      } catch {}
    }

    // 4. Partner identity fallback (Deep Davara / Jay Shah)
    if (!matchedDoc) {
      if (normInput.includes('deepdavara')) {
        const isCorp = normInput.endsWith('@solarithmdesign.com');
        return {
          found: true,
          canonicalAuthEmail: isCorp ? normInput : 'deepdavara23@gmail.com',
          alternativeEmail: isCorp ? 'deepdavara23@gmail.com' : 'deepdavara@solarithmdesign.com'
        };
      }
      if (normInput.includes('jayjalpa') || normInput.includes('jayshah')) {
        return {
          found: true,
          canonicalAuthEmail: normInput.includes('solarithmdesign') ? 'jayshah.03@solarithmdesign.com' : 'jayjalpa2002@gmail.com',
          alternativeEmail: normInput.includes('solarithmdesign') ? 'jayjalpa2002@gmail.com' : 'jayshah.03@solarithmdesign.com'
        };
      }
    }

    if (matchedDoc) {
      const docEmail = (matchedDoc.email || '').trim().toLowerCase();
      const docPersonal = (matchedDoc.personalEmail || matchedDoc.personalEmailAddress || '').trim().toLowerCase();
      const docAuthEmail = ((matchedDoc as any).authEmail || '').trim().toLowerCase();

      let canonicalAuthEmail = docAuthEmail || docEmail || normInput;
      let alternativeEmail: string | undefined = undefined;

      if (normInput === docEmail && docPersonal && docPersonal !== docEmail) {
        alternativeEmail = docPersonal;
      } else if ((normInput === docPersonal || normInput === docPersonal) && docEmail && docEmail !== docPersonal) {
        canonicalAuthEmail = docAuthEmail || normInput;
        alternativeEmail = docEmail;
      } else if (docPersonal && docPersonal !== docEmail) {
        alternativeEmail = docPersonal;
      }

      return {
        found: true,
        canonicalAuthEmail,
        alternativeEmail,
        docData: matchedDoc
      };
    }

    return { found: false, canonicalAuthEmail: normInput };
  } catch (err) {
    console.warn('Error resolving employee directory email:', err);
    return { found: false, canonicalAuthEmail: normInput };
  }
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
    setVerifyingClearance(false);
    setErrorMsg(null);

    let authTargetEmail = inputEmail;
    let matchedDocData: UserDocument | null = null;

    // 1. Dual-Email Alias Resolution before calling Firebase Auth:
    // Check Firestore /users and /employees to see if this email is an alias for an owner/executive
    try {
      // Query by official email in /users
      let userQuery = query(collection(db, COLLECTIONS.USERS), where('email', '==', inputEmail));
      let userSnap = await getDocs(userQuery);

      // Query by personal email if not found
      if (userSnap.empty) {
        userQuery = query(collection(db, COLLECTIONS.USERS), where('personalEmail', '==', inputEmail));
        userSnap = await getDocs(userQuery);
      }
      if (userSnap.empty) {
        userQuery = query(collection(db, COLLECTIONS.USERS), where('personalEmailAddress', '==', inputEmail));
        userSnap = await getDocs(userQuery);
      }

      // Fallback to /employees collection
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
        const matchedData = userSnap.docs[0].data() as UserDocument;
        matchedDocData = matchedData;
        if ((matchedData as any).authEmail) {
          authTargetEmail = (matchedData as any).authEmail.trim().toLowerCase();
        } else if ((matchedData.personalEmail || matchedData.personalEmailAddress) && inputEmail.includes('@solarithmdesign.com')) {
          authTargetEmail = (matchedData.personalEmail || matchedData.personalEmailAddress || '').trim().toLowerCase();
        } else if (matchedData.email && !inputEmail.includes('@solarithmdesign.com')) {
          authTargetEmail = (matchedData.email || (matchedData as any).officialEmail || '').trim().toLowerCase();
        }
      }
    } catch (lookupErr) {
      console.warn('Pre-auth alias lookup warning:', lookupErr);
    }

    // Direct fallback if offline or cold start
    if (authTargetEmail === inputEmail) {
      if (inputEmail.includes('deepdavara')) {
        authTargetEmail = inputEmail.endsWith('@solarithmdesign.com') ? 'deepdavara@gmail.com' : 'deepdavara.23@solarithmdesign.com';
      } else if (inputEmail.includes('jayjalpa') || inputEmail.includes('jayshah')) {
        authTargetEmail = inputEmail.includes('solarithmdesign') ? 'jayjalpa2002@gmail.com' : 'jayshah.03@solarithmdesign.com';
      }
    }

    // Build comprehensive candidate email list for authentication
    const candidateAuthEmails: string[] = [inputEmail];

    if (matchedDocData) {
      const dAuth = ((matchedDocData as any).authEmail || '').trim().toLowerCase();
      const dPersonal = (matchedDocData.personalEmail || matchedDocData.personalEmailAddress || '').trim().toLowerCase();
      const dEmail = (matchedDocData.email || (matchedDocData as any).officialEmail || '').trim().toLowerCase();
      if (dAuth && !candidateAuthEmails.includes(dAuth)) candidateAuthEmails.push(dAuth);
      if (dPersonal && !candidateAuthEmails.includes(dPersonal)) candidateAuthEmails.push(dPersonal);
      if (dEmail && !candidateAuthEmails.includes(dEmail)) candidateAuthEmails.push(dEmail);
    }

    if (authTargetEmail && !candidateAuthEmails.includes(authTargetEmail)) {
      candidateAuthEmails.push(authTargetEmail);
    }

    // Known partner pools for Deep Davara & Jay Shah
    if (inputEmail.includes('deepdavara')) {
      const deepPool = [
        'deepdavara@gmail.com',
        'deepdavara23@gmail.com',
        'deepdavara.23@solarithmdesign.com',
        'deepdavara@solarithmdesign.com'
      ];
      for (const cand of deepPool) {
        if (!candidateAuthEmails.includes(cand)) candidateAuthEmails.push(cand);
      }
    } else if (inputEmail.includes('jayshah') || inputEmail.includes('jayjalpa')) {
      const jayPool = [
        'jayjalpa2002@gmail.com',
        'jayshah.03@solarithmdesign.com',
        'jayshah@solarithmdesign.com',
        'jay.solarithm@gmail.com'
      ];
      for (const cand of jayPool) {
        if (!candidateAuthEmails.includes(cand)) candidateAuthEmails.push(cand);
      }
    }

    let firebaseUser: any = null;
    let authSuccessEmail = inputEmail;

    try {
      // In-memory persistence
      try {
        await setPersistence(auth, inMemoryPersistence);
      } catch (pErr) {
        console.warn('Could not set inMemoryPersistence:', pErr);
      }

      // 2. Execute Resilient Multi-Candidate Authentication with Sequential Fallbacks
      let lastAuthError: any = null;

      for (const candidate of candidateAuthEmails) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, candidate, password);
          firebaseUser = userCredential.user;
          authSuccessEmail = candidate;
          break;
        } catch (candErr: any) {
          lastAuthError = candErr;
          const code = candErr?.code || '';
          if (
            code === 'auth/invalid-credential' ||
            code === 'auth/invalid-login-credentials' ||
            code === 'auth/user-not-found' ||
            code === 'auth/wrong-password'
          ) {
            // Try next candidate alias
            continue;
          } else {
            // Rethrow non-credential errors immediately (e.g. network failure)
            throw candErr;
          }
        }
      }

      if (!firebaseUser || !firebaseUser.email) {
        throw lastAuthError || new Error('Authentication returned an invalid user profile.');
      }

      // 3. Trigger Clearance Verification
      setVerifyingClearance(true);

      // 4. Verify clearance for Nexus Admin Console (Exclusive to Owners and Admins)
      const credResult = await verifyUserCredentials(inputEmail);
      const isDirectOwner = 
        isOwnerEmail(inputEmail) || 
        isOwnerEmail(authSuccessEmail) || 
        SUPER_ADMIN_EMAILS.includes(inputEmail) || 
        SUPER_ADMIN_EMAILS.includes(authSuccessEmail);
      
      const userRole = (credResult.user?.role || matchedDocData?.role || '').toLowerCase();
      const isAuthorizedRole = isDirectOwner || userRole === 'owner' || userRole === 'admin' || userRole === 'super_admin';

      if (!isAuthorizedRole) {
        await signOut(auth);
        setVerifyingClearance(false);
        setErrorMsg('Access Denied: Nexus Admin Console is exclusively restricted to authorized Owners and Admins.');
        return;
      }

      const verifiedRole: UserRole = isDirectOwner ? 'owner' : (userRole === 'admin' ? 'admin' : 'owner');
      const verifiedName = credResult.user?.name || matchedDocData?.name || inputEmail.split('@')[0];

      // 5. Update authEmail in Firestore while strictly preserving corporate work email
      let resolvedWorkEmail = (inputEmail.includes('@solarithmdesign.com') ? inputEmail : '').trim().toLowerCase();
      let resolvedPersonalEmail = (!inputEmail.includes('@solarithmdesign.com') ? inputEmail : '').trim().toLowerCase();

      try {
        const userDocRef = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
        const empId = matchedDocData?.employeeId || (inputEmail.includes('deepdavara') ? 'SDM-DD-002' : (inputEmail.includes('jayshah') || inputEmail.includes('jayjalpa') ? 'SDM-JS-001' : null));
        const empDocRef = empId ? doc(db, COLLECTIONS.EMPLOYEES || 'employees', empId) : null;

        const [userSnap, empSnap] = await Promise.all([
          getDoc(userDocRef).catch(() => null),
          empDocRef ? getDoc(empDocRef).catch(() => null) : Promise.resolve(null)
        ]);

        const existingUserData = userSnap && userSnap.exists() ? userSnap.data() : null;
        const existingEmpData = empSnap && empSnap.exists() ? empSnap.data() : null;

        resolvedWorkEmail = (
          existingEmpData?.email ||
          existingEmpData?.officialEmail ||
          existingUserData?.email ||
          existingUserData?.officialEmail ||
          matchedDocData?.email ||
          (inputEmail.includes('@solarithmdesign.com') ? inputEmail : (inputEmail.includes('deepdavara') ? 'deepdavara.23@solarithmdesign.com' : 'jayshah.03@solarithmdesign.com'))
        ).trim().toLowerCase();

        resolvedPersonalEmail = (
          existingEmpData?.personalEmail ||
          existingEmpData?.personalEmailAddress ||
          existingUserData?.personalEmail ||
          existingUserData?.personalEmailAddress ||
          matchedDocData?.personalEmail ||
          matchedDocData?.personalEmailAddress ||
          (!inputEmail.includes('@solarithmdesign.com') ? inputEmail : (inputEmail.includes('deepdavara') ? 'deepdavara@gmail.com' : 'jayjalpa2002@gmail.com'))
        ).trim().toLowerCase();

        const userPayload = {
          authEmail: authSuccessEmail,
          email: resolvedWorkEmail,
          officialEmail: resolvedWorkEmail,
          personalEmail: resolvedPersonalEmail,
          personalEmailAddress: resolvedPersonalEmail,
          role: verifiedRole,
          name: verifiedName,
          employeeId: empId || existingUserData?.employeeId || 'SDM-DD-002',
          empId: empId || existingUserData?.employeeId || 'SDM-DD-002',
          updatedAt: new Date().toISOString()
        };

        await setDoc(userDocRef, userPayload, { merge: true });

        if (empDocRef && empId) {
          await setDoc(empDocRef, {
            ...userPayload,
            id: empId,
            authUid: firebaseUser.uid,
            uid: firebaseUser.uid
          }, { merge: true });
        }
      } catch (authDocSyncErr) {
        console.warn('Could not update authEmail in Firestore:', authDocSyncErr);
      }

      // 6. Ensure canonical /users/{uid} document synchronization using the resolved corporate email
      try {
        const { syncUserDocumentOnLogin } = await import('@/lib/userService');
        await syncUserDocumentOnLogin({
          uid: firebaseUser.uid,
          email: resolvedWorkEmail,
          name: verifiedName,
          role: verifiedRole
        });
      } catch (provErr) {
        console.warn('Could not sync user profile to /users/{uid}:', provErr);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('lockedEmail', inputEmail);
        localStorage.setItem('lockedRole', verifiedRole);
        localStorage.setItem('lockedName', verifiedName);
        localStorage.setItem('activePortal', 'executive');
      }

      onLoginSuccess({
        email: inputEmail,
        role: verifiedRole,
        name: verifiedName
      });
    } catch (err: any) {
      console.error('Nexus Console Login Error:', err);
      setVerifyingClearance(false);
      const code = err.code || '';

      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        if (authTargetEmail && authTargetEmail !== inputEmail) {
          setErrorMsg(`Registered under ${authTargetEmail}. Please use your primary registered email or click Reset Password.`);
        } else if (matchedDocData) {
          setErrorMsg(`Invalid credentials. Please verify your password for ${inputEmail} or contact your administrator.`);
        } else {
          setErrorMsg(`Access Denied: The email "${inputEmail}" was not found in the authorized employee directory.`);
        }
      } else if (code === 'auth/user-not-found') {
        if (authTargetEmail && authTargetEmail !== inputEmail) {
          setErrorMsg(`Registered under ${authTargetEmail}. Please use your primary registered email or click Reset Password.`);
        } else {
          setErrorMsg(`No account found for "${inputEmail}". Please check your credentials.`);
        }
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
