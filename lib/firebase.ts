import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  inMemoryPersistence 
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  getDocFromServer, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  Timestamp 
} from 'firebase/firestore';
// Production Solarithm Master Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBMQYHq8sqI9eiDEqiImNAjiRrCuLJoTMQ",
  authDomain: "solarithm-master.firebaseapp.com",
  projectId: "solarithm-master",
  storageBucket: "solarithm-master.firebasestorage.app",
  messagingSenderId: "560851710395",
  appId: "1:560851710395:web:14f29e7ab994666870d49e"
};

// Ensure only one instance of the app is initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Configure Firestore with in-memory cache to prevent IndexedDB BloomFilterError and cache index corruption
let firestoreDb: ReturnType<typeof getFirestore>;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: memoryLocalCache()
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);

// Explicitly set inMemoryPersistence to prevent IndexedDB locking and "Database is closing/hidden" errors
if (typeof window !== 'undefined') {
  try {
    setPersistence(auth, inMemoryPersistence).catch((err) => {
      console.warn('Could not set inMemoryPersistence on auth:', err);
    });
  } catch (err) {
    console.warn('Error setting auth persistence:', err);
  }
}

export const OWNER_EMAILS = [
  'jay.solarithm@gmail.com',
  'jayjalpa2002@gmail.com'
];

export const SUPER_ADMIN_EMAILS = [
  'jayjalpa2002@gmail.com',
  'jay.solarithm@gmail.com'
];

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  return norm === 'jay.solarithm@gmail.com' || norm === 'jayjalpa2002@gmail.com';
}

export function clearAuthSessionStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys = [
      'lockedEmail',
      'lockedRole',
      'lockedName',
      'currentUser',
      'session',
      'solarithm_session',
      'employees',
      'users',
      'registered_apps',
      'apps',
      'clients',
      'pending_approvals',
      'projects'
    ];
    keys.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Error clearing localStorage session keys:', err);
  }
}

export type UserRole = 'owner' | 'admin' | 'sales' | 'designer' | string;

export interface UserDocument {
  id?: string;
  employeeId?: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  designation?: string;
  dateOfJoining?: string;
  doj?: string;
  dateOfBirth?: string;
  dob?: string;
  basicPay?: number;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    ifscCode: string;
  };
  // KYC & Personal Details
  panCardNumber?: string;
  aadhaarCardNumber?: string;
  houseAddress?: string;
  personalEmailAddress?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  personalEmail?: string;
  accessibleApps?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface UserAccessDocument {
  id?: string;
  email: string;
  visibleTools: string[];
}

export interface DepartmentDocument {
  id?: string;
  name: string;
  availableRoles: string[];
  code?: string;
  description?: string;
  headOfDepartment?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScopeDocument {
  id?: string;
  name: string;
  hasSubServices: boolean;
  subServices: string[];
  createdAt: string;
}

export type PricingCategory = string;
export type CapacityUnit = 'W' | 'KW' | 'MW';
export type PriceType = 'Fixed' | 'Per KW' | 'Per MW' | 'Per W';

export interface PricingCategoryDocument {
  id?: string;
  name: string;
}

export interface CapacityRow {
  capacityRange: string;
  unit: CapacityUnit;
  price: number;
  priceType: PriceType;
  category?: string;
  scope?: string;
  subService?: string;
}

export interface PricingRuleDocument {
  id?: string;
  category: PricingCategory;
  scope: string;
  subService: string | 'N/A';
  capacityRows: CapacityRow[];
  updatedAt: string;
}

export interface CommissionRuleDocument {
  id?: string;
  role: 'Designer' | 'Sales' | string;
  scope: string;
  subService: string | 'N/A';
  maxCommission: number;
  capacityRows: CapacityRow[];
  updatedAt: string;
  createdAt?: string;
}

export interface ProposalDocument {
  id?: string;
  proposalNumber: string;
  pricingCategory: PricingCategory;
  createdAt: string;
}

export interface ClientDocument {
  id?: string;
  companyName: string;
  contactPerson: string;
  email?: string;
  phone?: string;
  city: string;
  gstin?: string;
  submittedBy: string;
  salesPersonEmail?: string;
  originalSalesEmail?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  pricingCategory?: PricingCategory;
  approvedAt?: string;
  approvedBy?: string;
  proposalNumber?: string;
  createdAt: string;
}

export interface DesignDocument {
  id?: string;
  projectName: string;
  projectId?: string;
  clientName: string;
  designerEmail: string;
  plantCapacity: string;
  scopeOfWork?: string;
  status: 'pending_design_approval' | 'approved' | 'rejected' | 'IN VERIFICATION';
  createdAt: string;
}

export interface AppDocument {
  id?: string;
  appName: string;
  appId: string;
  url: string;
  description: string;
  status: 'active' | 'inactive';
  allowedRoles?: string[];
  allowedEmployees?: string[];
  createdAt: string;
}

export interface PasswordResetRequestDocument {
  id: string;
  type?: string;
  requestType?: string;
  requestedEmail: string;
  email?: string;
  appName?: string;
  appId?: string;
  employeeName?: string;
  employeeId?: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'APPROVED' | 'REJECTED' | 'PENDING' | string;
  createdAt?: any;
  timestamp?: any;
  requestedAt?: any;
  resolvedAt?: any;
  resolvedBy?: string;
  tempPassword?: string;
  collectionName?: string;
}

export const DEFAULT_PRICING_CATEGORIES: string[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'INCENTIVE'];

// Production clean slate: initialized to empty array
export const DEFAULT_12_CAPACITY_ROWS: CapacityRow[] = [];

export const PRESET_SCOPES: Array<{ name: string; hasSubServices: boolean; subServices: string[] }> = [
  { name: 'PRE DESIGN', hasSubServices: true, subServices: [] },
  { name: 'POST DESIGN', hasSubServices: true, subServices: [] },
  { name: 'CEIG', hasSubServices: false, subServices: [] },
  { name: 'PVSYST', hasSubServices: false, subServices: [] },
  { name: 'IFP PROCESS', hasSubServices: false, subServices: [] },
  { name: 'PRE DESIGN + PVSYST', hasSubServices: true, subServices: [] },
  { name: 'POST DESIGN + PVSYST', hasSubServices: true, subServices: [] },
  { name: 'PRE DESIGN + CEIG + IFP', hasSubServices: true, subServices: [] },
  { name: 'POST DESIGN + CEIG + IFP', hasSubServices: true, subServices: [] },
  { name: 'PRE DESIGN + PVSYST + CEIG + IFP', hasSubServices: true, subServices: [] },
  { name: 'POST DESIGN + PVSYST + CEIG + IFP', hasSubServices: true, subServices: [] },
];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Test connectivity on initial app boot
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    // If test document doesn't exist, it still confirms server communication!
    if (error instanceof Error && error.message.includes('offline')) {
      console.warn('Firestore offline or unreachable');
      return false;
    }
    return true;
  }
}

/**
 * Verifies if the authenticated user has Owner / Super Admin privileges.
 * Enforces hardcoded Owner Bypass for jay.solarithm@gmail.com and jayjalpa2002@gmail.com.
 * When checking the user's role against the (now empty) Firestore 'employees' or 'users' database,
 * matching owner emails are immediately granted 'owner' and Super Admin clearance, preventing lockout.
 */
export async function verifyOwnerRole(emailInput: string): Promise<{
  isOwner: boolean;
  isSuperAdmin?: boolean;
  user?: UserDocument;
  error?: string;
}> {
  if (!emailInput || !emailInput.includes('@')) {
    return { isOwner: false, error: 'Invalid email address.' };
  }

  const normalizedEmail = emailInput.trim().toLowerCase();
  const isOwnerBypass = isOwnerEmail(normalizedEmail);
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(normalizedEmail) || isOwnerBypass;

  const defaultOwnerUser: UserDocument = {
    employeeId: 'SOL-EMP-01',
    name: normalizedEmail.includes('jayjalpa') ? 'Jay Jalpa (Owner)' : 'Jay Solarithm (Owner)',
    email: normalizedEmail,
    role: 'owner',
    department: 'Executive Management',
    designation: 'Owner & Super Admin',
    createdAt: new Date().toISOString()
  };

  // Immediate Owner Bypass: if email matches owner list, guarantee clearance even if database is wiped/empty
  if (isOwnerBypass) {
    try {
      let foundUser: UserDocument | null = null;
      let foundDocId: string | null = null;

      // 1. Check 'employees' collection in Firestore
      try {
        const empRef = collection(db, 'employees');
        const empQ = query(empRef, where('email', '==', normalizedEmail));
        const empSnap = await getDocs(empQ);
        if (!empSnap.empty) {
          foundDocId = empSnap.docs[0].id;
          foundUser = empSnap.docs[0].data() as UserDocument;
        }
      } catch (e) {
        // Non-blocking query failure
      }

      // 2. Check 'users' collection in Firestore
      if (!foundUser) {
        try {
          const usersRef = collection(db, 'users');
          const usersQ = query(usersRef, where('email', '==', normalizedEmail));
          const usersSnap = await getDocs(usersQ);
          if (!usersSnap.empty) {
            foundDocId = usersSnap.docs[0].id;
            foundUser = usersSnap.docs[0].data() as UserDocument;
          }
        } catch (e) {
          // Non-blocking query failure
        }
      }

      if (foundUser) {
        return {
          isOwner: true,
          isSuperAdmin: true,
          user: {
            ...foundUser,
            id: foundDocId || foundUser.id,
            role: 'owner',
            name: foundUser.name || defaultOwnerUser.name
          }
        };
      }

      // Database is empty (wiped for production): background sync to keep persistence intact
      try {
        const usersRef = collection(db, 'users');
        const newDocRef = doc(usersRef);
        await setDoc(newDocRef, defaultOwnerUser, { merge: true });
        return {
          isOwner: true,
          isSuperAdmin: true,
          user: { ...defaultOwnerUser, id: newDocRef.id }
        };
      } catch (e) {
        // Safe to ignore if Firestore offline or write error
      }

      return {
        isOwner: true,
        isSuperAdmin: true,
        user: defaultOwnerUser
      };
    } catch (err) {
      console.error('Owner bypass check error:', err);
      return {
        isOwner: true,
        isSuperAdmin: true,
        user: defaultOwnerUser
      };
    }
  }

  // Non-owner accounts: check Firestore 'employees' then 'users'
  try {
    let foundUser: UserDocument | null = null;
    let foundDocId: string | null = null;

    // Check 'employees' collection
    try {
      const empRef = collection(db, 'employees');
      const empQ = query(empRef, where('email', '==', normalizedEmail));
      const empSnap = await getDocs(empQ);
      if (!empSnap.empty) {
        foundDocId = empSnap.docs[0].id;
        foundUser = empSnap.docs[0].data() as UserDocument;
      }
    } catch (e) {
      // ignore
    }

    // Check 'users' collection
    if (!foundUser) {
      try {
        const usersRef = collection(db, 'users');
        const usersQ = query(usersRef, where('email', '==', normalizedEmail));
        const usersSnap = await getDocs(usersQ);
        if (!usersSnap.empty) {
          foundDocId = usersSnap.docs[0].id;
          foundUser = usersSnap.docs[0].data() as UserDocument;
        }
      } catch (e) {
        // ignore
      }
    }

    if (foundUser) {
      const roleStr = (foundUser.role || '').toLowerCase();
      const isOwnerRole = roleStr === 'owner' || roleStr === 'super admin' || roleStr === 'superadmin';

      if (isOwnerRole) {
        return {
          isOwner: true,
          isSuperAdmin,
          user: { ...foundUser, id: foundDocId || foundUser.id, role: 'owner' }
        };
      } else {
        return {
          isOwner: false,
          user: { ...foundUser, id: foundDocId || foundUser.id },
          error: `Access Denied: Insufficient Permissions. Account has "${foundUser.role}" role, but Solarithm Nexus is restricted to Owner and Super Admin accounts.`
        };
      }
    }

    return {
      isOwner: false,
      error: `Access Denied: Insufficient Permissions. The account "${normalizedEmail}" is not provisioned with Owner privileges.`
    };
  } catch (err: unknown) {
    console.error('Error verifying owner role in Firestore:', err);
    return {
      isOwner: false,
      error: 'Failed to verify account permissions with database. Please try again.'
    };
  }
}

/**
 * Verify email & role in `employees` or `users` collection.
 * If Owner bypass or super admin and not present, automatically grants clearance.
 */
export async function verifyUserCredentials(emailInput: string): Promise<{
  success: boolean;
  user?: UserDocument;
  isSuperAdmin: boolean;
  message?: string;
}> {
  const normalizedEmail = emailInput.trim().toLowerCase();
  const isOwnerBypass = isOwnerEmail(normalizedEmail);
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(normalizedEmail) || isOwnerBypass;

  const defaultOwnerUser: UserDocument = {
    employeeId: 'SOL-EMP-01',
    name: normalizedEmail.includes('jayjalpa') ? 'Jay Jalpa (Owner)' : 'Jay Solarithm (Owner)',
    email: normalizedEmail,
    role: 'owner',
    department: 'Executive Management',
    designation: 'Owner & Super Admin',
    createdAt: new Date().toISOString()
  };

  if (isOwnerBypass) {
    return {
      success: true,
      user: defaultOwnerUser,
      isSuperAdmin: true,
      message: 'Owner & Super Admin bypass clearance granted.'
    };
  }

  try {
    // 1. Query employees or users collection by email
    let foundUser: UserDocument | null = null;
    let foundDocId: string | null = null;

    try {
      const empSnap = await getDocs(query(collection(db, 'employees'), where('email', '==', normalizedEmail)));
      if (!empSnap.empty) {
        foundDocId = empSnap.docs[0].id;
        foundUser = empSnap.docs[0].data() as UserDocument;
      }
    } catch (e) {
      // ignore
    }

    if (!foundUser) {
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)));
        if (!usersSnap.empty) {
          foundDocId = usersSnap.docs[0].id;
          foundUser = usersSnap.docs[0].data() as UserDocument;
        }
      } catch (e) {
        // ignore
      }
    }

    if (foundUser) {
      return {
        success: true,
        user: { ...foundUser, id: foundDocId || foundUser.id },
        isSuperAdmin
      };
    }

    // 2. Regular user not found in database
    return {
      success: false,
      isSuperAdmin: false,
      message: `Access denied. The email "${normalizedEmail}" is not authorized in Solarithm directory.`
    };
  } catch (err) {
    console.error('Error verifying user credentials:', err);
    if (isOwnerBypass || isSuperAdmin) {
      return {
        success: true,
        user: defaultOwnerUser,
        isSuperAdmin: true,
        message: 'Owner clearance granted (Fallback mode).'
      };
    }

    return {
      success: false,
      isSuperAdmin: false,
      message: 'Failed to connect to authentication server. Please try again.'
    };
  }
}

/**
 * Seed initial mock users into Firestore for testing (Owner, Admin, Sales, Designer)
 * Purged for live production clean slate: returns 0 with empty state.
 */
export async function seedInitialDirectoryUsers(): Promise<{ count: number }> {
  // Purged: live system starts with a completely clean slate
  const sampleUsers: UserDocument[] = [];

  let addedCount = 0;
  for (const user of sampleUsers) {
    const q = query(collection(db, 'users'), where('email', '==', user.email));
    const snap = await getDocs(q);
    if (snap.empty) {
      const docRef = doc(collection(db, 'users'));
      await setDoc(docRef, user);
      addedCount++;
    }
  }

  return { count: addedCount };
}
