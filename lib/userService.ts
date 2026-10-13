import { 
  collection, 
  doc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, isOwnerEmail } from '@/lib/firebase';
import { COLLECTIONS } from '@/src/config/schema';
import {
  sanitizeFirestorePayload,
  normalizeEmployeeProfilePayload,
  safeSetDoc,
  safeUpdateDoc,
  safeString
} from '@/lib/firestoreSanitizer';

export {
  sanitizeFirestorePayload,
  normalizeEmployeeProfilePayload,
  safeSetDoc,
  safeUpdateDoc
};

/**
 * Standard Canonical User Profile Schema conforming to Executive Dashboard & Nexus RBAC
 */
export interface CanonicalUserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'employee' | string;
  pricingCategory?: string;
  status: 'ACTIVE' | string;
  createdAt: any;
  updatedAt: any;
  department?: string;
  designation?: string;
  phone?: string;
  employeeId?: string;
  basicPay?: number;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  panCardNumber?: string;
  aadhaarCardNumber?: string;
  houseAddress?: string;
  personalEmailAddress?: string;
  personalEmail?: string;
  accessibleApps?: string[];
  [key: string]: any;
}

/**
 * DAT-01: Treat identification, tax, and banking numeric fields strictly as strings
 * Prevents precision loss on numbers exceeding Number.MAX_SAFE_INTEGER and scientific notation.
 */
export function safeStringIdentifier(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 })
      : '';
  }
  return String(value).trim();
}

/**
 * Standardize roles into canonical uppercase Solarithm system roles:
 * - "Owner" / "Executive Owner" -> OWNER
 * - "Designer" -> DESIGNER
 * - "Lead Designer" -> LEAD_DESIGNER
 * - "Sales" / "Lead Sales" -> SALES / LEAD_SALES
 * - "Admin" -> ADMIN
 * - Standard staff -> EMPLOYEE
 */
export function normalizeRole(role?: string): string {
  if (!role) return 'EMPLOYEE';
  const r = role.trim().toLowerCase().replace(/[-_]/g, ' ');
  
  if (r === 'owner' || r.includes('owner') || r.includes('founder') || r.includes('super admin') || r.includes('superadmin') || r === 'director' || r.includes('managing director') || r.includes('executive owner')) {
    return 'OWNER';
  }
  if (r.includes('lead designer') || r.includes('design lead') || r.includes('chief designer') || r.includes('senior designer') || r.includes('sr designer') || r.includes('head of design') || r.includes('lead solar designer')) {
    return 'LEAD_DESIGNER';
  }
  if (r === 'designer' || r.includes('designer') || r.includes('cad') || r.includes('pv design') || r.includes('solar design') || r.includes('drafting')) {
    return 'DESIGNER';
  }
  if (r.includes('lead sales') || r.includes('sales lead') || r.includes('head of sales')) {
    return 'LEAD_SALES';
  }
  if (r === 'sales' || r.includes('sales') || r.includes('business dev') || r.includes('bdm') || r.includes('bde') || r.includes('commercial sales')) {
    return 'SALES';
  }
  if (r === 'admin' || r.includes('admin') || r === 'administrator' || r === 'hr' || r.includes('human resources')) {
    return 'ADMIN';
  }
  if (r === 'manager' || r.includes('manager') || r.includes('team lead') || r.includes('operations lead') || r.includes('project manager')) {
    return 'MANAGER';
  }
  if (r === 'accountant' || r.includes('account') || r.includes('finance') || r.includes('billing')) {
    return 'ACCOUNTANT';
  }
  if (r === 'technician' || r.includes('technician') || r.includes('installer') || r.includes('electrician')) {
    return 'TECHNICIAN';
  }
  if (r === 'engineer' || r.includes('engineer')) {
    return 'ENGINEER';
  }
  if (r === 'employee' || r === 'staff' || r === 'associate' || r === 'user') {
    return 'EMPLOYEE';
  }
  return r.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Lookup existing user document by lowercase, trimmed email in /users
 */
export async function findUserByEmail(email: string): Promise<{ uid: string; user: CanonicalUserProfile } | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;
  try {
    const q = query(
      collection(db, COLLECTIONS.USERS),
      where('email', '==', cleanEmail),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data() as CanonicalUserProfile;
      return { uid: data.uid || d.id, user: { ...data, uid: data.uid || d.id } };
    }

    // DIRECTIVE 2: Dual email lookup (also check personalEmail and personalEmailAddress)
    const qPers = query(
      collection(db, COLLECTIONS.USERS),
      where('personalEmail', '==', cleanEmail),
      limit(1)
    );
    const snapPers = await getDocs(qPers);
    if (!snapPers.empty) {
      const d = snapPers.docs[0];
      const data = d.data() as CanonicalUserProfile;
      return { uid: data.uid || d.id, user: { ...data, uid: data.uid || d.id } };
    }

    const qPersAddr = query(
      collection(db, COLLECTIONS.USERS),
      where('personalEmailAddress', '==', cleanEmail),
      limit(1)
    );
    const snapPersAddr = await getDocs(qPersAddr);
    if (!snapPersAddr.empty) {
      const d = snapPersAddr.docs[0];
      const data = d.data() as CanonicalUserProfile;
      return { uid: data.uid || d.id, user: { ...data, uid: data.uid || d.id } };
    }
  } catch (err) {
    console.warn('Error querying user by email in /users:', err);
  }
  return null;
}

/**
 * SEC-01 & DAT-01: Atomic User Document Keying & Provisioning Service
 * Keys user documents by canonical Firebase Auth uid (/users/{uid}) rather than slugified strings.
 * Includes standard profile fields: uid, email, name, role, pricingCategory, status: "ACTIVE", createdAt: serverTimestamp()
 */
export async function provisionUserRecord(
  data: Partial<CanonicalUserProfile> & { email: string; name?: string; uid?: string }
): Promise<{ uid: string; user: CanonicalUserProfile }> {
  const cleanEmail = (data.email || '').trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('Email is required to provision a user profile.');
  }

  // 1. Resolve canonical UID: use provided UID, lookup existing record, or generate a Firestore auto-ID
  let targetUid = data.uid?.trim();
  let existingData: any = null;

  if (!targetUid) {
    const existing = await findUserByEmail(cleanEmail);
    if (existing) {
      targetUid = existing.uid;
      existingData = existing.user;
    } else {
      targetUid = doc(collection(db, COLLECTIONS.USERS)).id;
    }
  } else {
    try {
      const snap = await getDoc(doc(db, COLLECTIONS.USERS, targetUid));
      if (snap.exists()) {
        existingData = snap.data();
      }
    } catch {
      // ignore read error
    }
  }

  const rawRole = (data.role || existingData?.role || '').toString().toLowerCase();
  const role = (rawRole === 'owner' || cleanEmail === 'jayjalpa2002@gmail.com' || cleanEmail === 'jay.solarithm@gmail.com')
    ? 'owner'
    : (rawRole === 'admin' ? 'admin' : normalizeRole(data.role || existingData?.role));
  const pan = safeStringIdentifier(data.panCardNumber || data.panNumber || existingData?.panCardNumber || existingData?.panNumber);
  const aadhaar = safeStringIdentifier(data.aadhaarCardNumber || data.aadhaarNumber || existingData?.aadhaarCardNumber || existingData?.aadhaarNumber);
  const acct = safeStringIdentifier(data.accountNumber || existingData?.accountNumber);
  const phone = safeStringIdentifier(data.phone || existingData?.phone);
  const ifsc = safeStringIdentifier(data.ifscCode || existingData?.ifscCode).toUpperCase();
  const empId = safeStringIdentifier(data.employeeId || existingData?.employeeId).toUpperCase();

  const rawPayload: CanonicalUserProfile = {
    ...existingData,
    ...data,
    uid: targetUid,
    id: targetUid,
    email: cleanEmail,
    name: (data.name || existingData?.name || cleanEmail.split('@')[0]).trim(),
    role,
    pricingCategory: data.pricingCategory ?? existingData?.pricingCategory ?? '',
    status: 'ACTIVE',
    department: data.department || existingData?.department || 'Operations',
    designation: data.designation || existingData?.designation || 'Staff',
    employeeId: empId,
    phone,
    panCardNumber: pan,
    panNumber: pan,
    aadhaarCardNumber: aadhaar,
    aadhaarNumber: aadhaar,
    bankName: data.bankName || existingData?.bankName || '',
    accountNumber: acct,
    ifscCode: ifsc,
    bankDetails: {
      bankName: data.bankName || existingData?.bankName || '',
      accountNumber: acct,
      ifscCode: ifsc
    },
    houseAddress: data.houseAddress || existingData?.houseAddress || '',
    personalEmailAddress: data.personalEmailAddress || data.personalEmail || existingData?.personalEmailAddress || '',
    personalEmail: data.personalEmailAddress || data.personalEmail || existingData?.personalEmail || '',
    accessibleApps: data.accessibleApps || existingData?.accessibleApps || [],
    createdAt: existingData?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const payload = normalizeEmployeeProfilePayload(rawPayload) as CanonicalUserProfile;

  // 2. Atomic write to /users/{uid} strictly using canonical Firebase Auth UID
  const userDocRef = doc(db, COLLECTIONS.USERS, targetUid);
  await safeSetDoc(userDocRef, payload, { merge: true });

  // 3. DIRECTIVE 3 #3: Maintain canonical Employee ID in /employees while linking Auth UID
  try {
    const empDocId = empId || targetUid;
    const empDocRef = doc(db, COLLECTIONS.EMPLOYEES || 'employees', empDocId);
    await safeSetDoc(empDocRef, {
      ...payload,
      id: empDocId,
      authUid: targetUid,
      uid: targetUid
    }, { merge: true });
  } catch (syncErr) {
    console.warn('Sync to employees collection notice:', syncErr);
  }

  // 4. Cleanup legacy slug document if it exists (e.g., user_at_domain_com)
  const legacySlug = cleanEmail.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
  if (legacySlug && legacySlug !== targetUid) {
    try {
      const legacyDocRef = doc(db, COLLECTIONS.USERS, legacySlug);
      const legacySnap = await getDoc(legacyDocRef);
      if (legacySnap.exists()) {
        await deleteDoc(legacyDocRef).catch(() => {});
      }
    } catch {
      // non-blocking
    }
  }

  return { uid: targetUid, user: payload };
}

/**
 * Canonical partner definitions conforming to Directives 1, 2, and 3:
 * Single Source of Truth for company partners (Jay Shah, Deep Davara)
 * - Canonical Employee IDs: SDM-JS-001, SDM-DD-002
 * - Primary work email: @solarithmdesign.com
 * - Personal email: @gmail.com
 * - Roles: OWNER
 */
export const CANONICAL_PARTNERS: CanonicalUserProfile[] = [
  {
    uid: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
    id: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
    name: 'Jay Shah',
    role: 'OWNER',
    designation: 'Company Partner & Lead Solar Designer',
    department: 'Executive Management',
    email: 'jayshah.03@solarithmdesign.com',
    personalEmail: 'jayjalpa2002@gmail.com',
    personalEmailAddress: 'jayjalpa2002@gmail.com',
    employeeId: 'SDM-JS-001',
    status: 'ACTIVE',
    createdAt: null,
    updatedAt: null
  },
  {
    uid: 'sdm-dd-002-master',
    id: 'sdm-dd-002-master',
    name: 'Deep Davara',
    role: 'OWNER',
    designation: 'Company Partner & Senior Solar Designer',
    department: 'Executive Management',
    email: 'deepdavara@solarithmdesign.com',
    personalEmail: 'deepdavara@gmail.com',
    personalEmailAddress: 'deepdavara@gmail.com',
    employeeId: 'SDM-DD-002',
    status: 'ACTIVE',
    createdAt: null,
    updatedAt: null
  }
];

/**
 * Ensures both canonical company partners (Jay Shah & Deep Davara) exist in /users and /employees
 * with their official work email, personal email, and canonical employee IDs.
 */
export async function ensureCanonicalPartnersExist(): Promise<void> {
  for (const partner of CANONICAL_PARTNERS) {
    try {
      const userDocRef = doc(db, COLLECTIONS.USERS, partner.uid);
      const snap = await getDoc(userDocRef);
      const existing = snap.exists() ? snap.data() : null;

      const payload = normalizeEmployeeProfilePayload({
        ...(existing || {}),
        ...partner,
        authUid: partner.uid,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await safeSetDoc(userDocRef, payload, { merge: true });
      try {
        const empDocId = partner.employeeId || partner.uid;
        const empDocRef = doc(db, COLLECTIONS.EMPLOYEES || 'employees', empDocId);
        await safeSetDoc(empDocRef, {
          ...payload,
          id: empDocId,
          authUid: partner.uid,
          uid: partner.uid
        }, { merge: true });
      } catch (e) {
        console.warn('Sync partner to employees notice:', e);
      }
    } catch (err) {
      console.warn('Error ensuring canonical partner:', partner.name, err);
    }
  }
}

/**
 * Explicitly verifies and provisions the canonical owner user document in /users
 * for jayjalpa2002@gmail.com / jayshah.03@solarithmdesign.com (UID: oIZpuLeftqaj3j5KS9ZIvurklEE2)
 * Ensuring { role: 'OWNER', employeeId: 'SDM-JS-001', status: 'ACTIVE' }
 */
export async function ensureOwnerDocumentExists(): Promise<CanonicalUserProfile> {
  const ownerUid = 'oIZpuLeftqaj3j5KS9ZIvurklEE2';
  const ownerEmail = 'jayshah.03@solarithmdesign.com';
  const personalEmail = 'jayjalpa2002@gmail.com';
  const userDocRef = doc(db, COLLECTIONS.USERS, ownerUid);
  try {
    // Also guarantee all company partners in background
    ensureCanonicalPartnersExist().catch((e) => console.warn('Ensure partners background notice:', e));

    const snap = await getDoc(userDocRef);
    const existing = snap.exists() ? snap.data() : null;

    const rawPayload: CanonicalUserProfile = {
      ...(existing || {}),
      uid: ownerUid,
      id: ownerUid,
      email: ownerEmail,
      personalEmail: personalEmail,
      personalEmailAddress: personalEmail,
      name: 'Jay Shah',
      role: 'OWNER',
      status: 'ACTIVE',
      department: 'Executive Management',
      designation: 'Company Partner & Lead Solar Designer',
      employeeId: 'SDM-JS-001',
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const payload = normalizeEmployeeProfilePayload(rawPayload) as CanonicalUserProfile;
    await safeSetDoc(userDocRef, payload, { merge: true });
    try {
      const empDocRef = doc(db, COLLECTIONS.EMPLOYEES || 'employees', 'SDM-JS-001');
      await safeSetDoc(empDocRef, {
        ...payload,
        id: 'SDM-JS-001',
        authUid: ownerUid,
        uid: ownerUid
      }, { merge: true });
    } catch (e) {
      console.warn('Sync owner to employees collection notice:', e);
    }
    return payload;
  } catch (err) {
    console.warn('Verify owner document caught:', err);
    return {
      uid: ownerUid,
      id: ownerUid,
      email: ownerEmail,
      personalEmail: personalEmail,
      name: 'Jay Shah',
      role: 'OWNER',
      employeeId: 'SDM-JS-001',
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
  }
}

/**
 * Ensures user document in /users is keyed strictly by Auth UID (auth.currentUser.uid)
 * and verifies/provisions canonical partner and designer details.
 */
export async function syncUserDocumentOnLogin(currentUser: {
  uid: string;
  email: string | null;
  displayName?: string | null;
  role?: string;
  name?: string;
}): Promise<CanonicalUserProfile> {
  const cleanEmail = (currentUser.email || '').trim().toLowerCase();
  const uid = currentUser.uid.trim();
  const isOwner = isOwnerEmail(cleanEmail) || cleanEmail === 'jayjalpa2002@gmail.com' || cleanEmail === 'jay.solarithm@gmail.com' || uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' || cleanEmail.includes('deepdavara');
  const role = isOwner ? 'OWNER' : (currentUser.role ? (currentUser.role.toUpperCase() === 'OWNER' ? 'OWNER' : normalizeRole(currentUser.role)) : 'EMPLOYEE');

  // If this is the primary owner UID or email, ensure canonical properties
  if (uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' || cleanEmail === 'jayjalpa2002@gmail.com' || cleanEmail.includes('jayshah')) {
    await ensureOwnerDocumentExists().catch((err) => console.warn('Ensure owner document caught:', err));
  } else {
    ensureCanonicalPartnersExist().catch((err) => console.warn('Ensure partners caught:', err));
  }

  const userDocRef = doc(db, COLLECTIONS.USERS, uid);
  let existingData: any = null;
  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      existingData = snap.data();
    }
  } catch (err) {
    console.warn('Warning reading user doc by UID:', err);
  }

  // Canonical Partner Metadata Resolution
  let resolvedName = (currentUser.name || currentUser.displayName || existingData?.name || cleanEmail.split('@')[0] || 'User').trim();
  let canonicalEmpId = existingData?.employeeId || (isOwner ? 'SDM-JS-001' : `SOL-${uid.slice(0, 5)}`.toUpperCase());
  let canonicalWorkEmail = cleanEmail;
  let canonicalPersonalEmail = existingData?.personalEmail || existingData?.personalEmailAddress || '';
  let designation = existingData?.designation || (isOwner ? 'Company Partner & Lead Solar Designer' : 'Staff');
  let department = existingData?.department || (isOwner ? 'Executive Management' : 'Operations');

  if (
    uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' ||
    cleanEmail.includes('jayjalpa') ||
    cleanEmail.includes('jayshah') ||
    resolvedName.toLowerCase().includes('jay shah')
  ) {
    resolvedName = 'Jay Shah';
    canonicalEmpId = 'SDM-JS-001';
    canonicalWorkEmail = 'jayshah.03@solarithmdesign.com';
    canonicalPersonalEmail = 'jayjalpa2002@gmail.com';
    designation = 'Company Partner & Lead Solar Designer';
    department = 'Executive Management';
  } else if (
    cleanEmail.includes('deepdavara') ||
    resolvedName.toLowerCase().includes('deep davara')
  ) {
    resolvedName = 'Deep Davara';
    canonicalEmpId = 'SDM-DD-002';
    canonicalWorkEmail = 'deepdavara@solarithmdesign.com';
    canonicalPersonalEmail = 'deepdavara@gmail.com';
    designation = 'Company Partner & Senior Solar Designer';
    department = 'Executive Management';
  }

  const rawPayload: CanonicalUserProfile = {
    ...existingData,
    uid,
    id: uid,
    email: canonicalWorkEmail,
    personalEmail: canonicalPersonalEmail,
    personalEmailAddress: canonicalPersonalEmail,
    name: resolvedName,
    role: isOwner ? 'OWNER' : role,
    status: 'ACTIVE',
    updatedAt: serverTimestamp(),
    createdAt: existingData?.createdAt || serverTimestamp(),
    department,
    designation,
    employeeId: canonicalEmpId
  };

  const payload = normalizeEmployeeProfilePayload(rawPayload) as CanonicalUserProfile;

  // Atomically write to /users/{uid} using canonical Auth UID
  await safeSetDoc(userDocRef, payload, { merge: true });

  // DIRECTIVE 3 #3: Mirror to /employees maintaining canonical Employee ID as doc ID while linking Auth UID
  try {
    const empDocId = canonicalEmpId || uid;
    const empDocRef = doc(db, COLLECTIONS.EMPLOYEES || 'employees', empDocId);
    await safeSetDoc(empDocRef, {
      ...payload,
      id: empDocId,
      authUid: uid,
      uid
    }, { merge: true });
  } catch (empErr) {
    console.warn('Sync to employees collection notice:', empErr);
  }

  // Purge any legacy document keyed by email slug if present
  const emailSlug = cleanEmail.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
  if (emailSlug && emailSlug !== uid) {
    try {
      const slugDocRef = doc(db, COLLECTIONS.USERS, emailSlug);
      const slugSnap = await getDoc(slugDocRef);
      if (slugSnap.exists()) {
        await deleteDoc(slugDocRef).catch(() => {});
      }
    } catch {
      // non-blocking
    }
  }

  return payload;
}

/**
 * Update an existing canonical user record under /users/{uid}
 */
export async function updateUserRecord(
  uid: string,
  updates: Partial<CanonicalUserProfile>
): Promise<void> {
  if (!uid) throw new Error('User UID is required for updates.');

  const safeUpdates: Record<string, any> = { ...updates };

  if (updates.email) {
    safeUpdates.email = updates.email.trim().toLowerCase();
  }
  if (updates.role) {
    safeUpdates.role = normalizeRole(updates.role);
  }
  if ('panCardNumber' in updates || 'panNumber' in updates) {
    const pan = safeStringIdentifier(updates.panCardNumber || updates.panNumber);
    safeUpdates.panCardNumber = pan;
    safeUpdates.panNumber = pan;
  }
  if ('aadhaarCardNumber' in updates || 'aadhaarNumber' in updates) {
    const aadhaar = safeStringIdentifier(updates.aadhaarCardNumber || updates.aadhaarNumber);
    safeUpdates.aadhaarCardNumber = aadhaar;
    safeUpdates.aadhaarNumber = aadhaar;
  }
  if ('accountNumber' in updates) {
    safeUpdates.accountNumber = safeStringIdentifier(updates.accountNumber);
  }
  if ('phone' in updates) {
    safeUpdates.phone = safeStringIdentifier(updates.phone);
  }
  if ('employeeId' in updates) {
    safeUpdates.employeeId = safeStringIdentifier(updates.employeeId).toUpperCase();
  }
  if ('ifscCode' in updates) {
    safeUpdates.ifscCode = safeStringIdentifier(updates.ifscCode).toUpperCase();
  }

  safeUpdates.updatedAt = serverTimestamp();

  const cleanUpdates = sanitizeFirestorePayload(safeUpdates);

  await safeUpdateDoc(doc(db, COLLECTIONS.USERS, uid), cleanUpdates);

  try {
    const empDocId = safeUpdates.employeeId || uid;
    await safeUpdateDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', empDocId), cleanUpdates).catch(async () => {
      // If employee doc was keyed by uid, update that too
      await safeUpdateDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', uid), cleanUpdates).catch(() => {});
    });
  } catch (err) {
    console.warn('Sync update to employees collection notice:', err);
  }
}

/**
 * Delete a user record across /users and /employees
 */
export async function deleteUserRecord(uid: string, email?: string): Promise<void> {
  if (uid) {
    await deleteDoc(doc(db, COLLECTIONS.USERS, uid)).catch(() => {});
    await deleteDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', uid)).catch(() => {});
  }
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const legacySlug = cleanEmail.replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
    if (legacySlug && legacySlug !== uid) {
      await deleteDoc(doc(db, COLLECTIONS.USERS, legacySlug)).catch(() => {});
      await deleteDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', legacySlug)).catch(() => {});
    }
  }
}
