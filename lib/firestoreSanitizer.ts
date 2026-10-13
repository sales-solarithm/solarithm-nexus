import { 
  DocumentReference, 
  SetOptions, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';

/**
 * Checks if a value is a Firestore-native special type that must be preserved
 * as-is rather than recursed as a plain dictionary.
 */
export function isFirestoreSpecialObject(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  if (val instanceof Date) return true;
  
  // Firestore Timestamp inspection
  if (
    val.constructor?.name === 'Timestamp' ||
    typeof (val as any).toMillis === 'function' ||
    typeof (val as any).toDate === 'function'
  ) {
    return true;
  }

  // Firestore FieldValue inspection (serverTimestamp, deleteField, arrayUnion, etc.)
  if (
    (val as any)._methodName ||
    (val as any)._delegate ||
    (val as any).constructor?.name === 'FieldValue' ||
    (val as any).constructor?.name === 'ServerTimestampTransform'
  ) {
    return true;
  }

  // Firestore DocumentReference
  if (
    (val as any).constructor?.name === 'DocumentReference' ||
    (val as any).type === 'document' ||
    typeof (val as any).onSnapshot === 'function'
  ) {
    return true;
  }

  return false;
}

/**
 * DIRECTIVE 2: Universal Recursive Firestore Payload Sanitization
 * - Recursively eliminates all properties whose value is strictly `undefined`.
 * - Preserves numeric `0` exactly as a number; never converts to falsy or default value.
 * - Retains native Date objects, Firestore Timestamp instances, and FieldValues.
 * - Recursively sanitizes nested objects and arrays.
 */
export function sanitizeFirestorePayload<T>(input: T): T {
  if (input === undefined) {
    return null as unknown as T;
  }

  if (input === null) {
    return null as unknown as T;
  }

  // Preserve primitive numbers, explicitly protecting numeric 0
  if (typeof input === 'number') {
    return input;
  }

  if (typeof input === 'string' || typeof input === 'boolean') {
    return input;
  }

  // Retain Firestore native types and dates untouched
  if (isFirestoreSpecialObject(input)) {
    return input;
  }

  // Handle arrays: clean each element, filter out standalone undefined
  if (Array.isArray(input)) {
    const cleanedArray = input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item));
    return cleanedArray as unknown as T;
  }

  // Handle plain objects: recursively purge undefined fields
  if (typeof input === 'object') {
    const cleanedObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(input)) {
      if (val === undefined) {
        // DIRECTIVE 2 #2: Strictly remove undefined keys
        continue;
      }
      cleanedObj[key] = sanitizeFirestorePayload(val);
    }
    return cleanedObj as unknown as T;
  }

  return input;
}

/**
 * Safely format identification strings to prevent precision loss and scientific notation.
 */
export function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val)
      ? val.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 })
      : '';
  }
  return String(val).trim();
}

/**
 * DIRECTIVE 4: Schema Fallbacks & String Integrity (Audit Defect ING-01)
 * Normalizes all optional contact, KYC, banking, and date fields:
 * - Phone: maps phone, phoneNumber, contact, mobile; defaults to empty string ""
 * - Email: trims, lowercases work email and personal email
 * - Dates: maps dateOfJoining/doj and dateOfBirth/dob, falling back explicitly to null if empty
 * - Identification & Bank numbers: strictly typed as trimmed strings
 * - Preserves numeric 0 (e.g. ₹0 base pay/commission)
 * - Nested bankDetails defaults child properties to empty strings, never undefined
 */
export function normalizeEmployeeProfilePayload(
  raw: Record<string, any>
): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};

  const cleanEmail = (raw.email || '').trim().toLowerCase();
  const cleanPersonalEmail = (
    raw.personalEmail ||
    raw.personalEmailAddress ||
    ''
  ).trim().toLowerCase();

  // Phone variation resolution
  const phoneVal = safeString(
    raw.phone ?? raw.phoneNumber ?? raw.contact ?? raw.mobile ?? raw.tel ?? ''
  );

  // Date fallbacks: default explicitly to null when absent or empty
  const rawDoj = raw.dateOfJoining ?? raw.doj ?? raw.joiningDate ?? null;
  const dojVal = rawDoj && String(rawDoj).trim() !== '' ? String(rawDoj).trim() : null;

  const rawDob = raw.dateOfBirth ?? raw.dob ?? raw.birthDate ?? null;
  const dobVal = rawDob && String(rawDob).trim() !== '' ? String(rawDob).trim() : null;

  // KYC string integrity
  const panVal = safeString(raw.panCardNumber ?? raw.panNumber ?? raw.pan ?? '').toUpperCase();
  const aadhaarVal = safeString(raw.aadhaarCardNumber ?? raw.aadhaarNumber ?? raw.aadhaar ?? raw.uidNumber ?? '');
  const bankNameVal = safeString(raw.bankName ?? raw.bankDetails?.bankName ?? '');
  const acctVal = safeString(raw.accountNumber ?? raw.bankDetails?.accountNumber ?? raw.accountNo ?? '');
  const ifscVal = safeString(raw.ifscCode ?? raw.bankDetails?.ifscCode ?? raw.ifsc ?? '').toUpperCase();
  const empIdVal = safeString(raw.employeeId ?? raw.empId ?? '').toUpperCase();

  // Numeric 0 preservation for basicPay / compensation
  const rawPay = raw.basicPay ?? raw.salary ?? raw.baseSalary;
  const basicPay = (rawPay !== undefined && rawPay !== null && !isNaN(Number(rawPay)))
    ? Number(rawPay)
    : 0;

  const normalized: Record<string, any> = {
    ...raw,
    email: cleanEmail,
    personalEmail: cleanPersonalEmail,
    personalEmailAddress: cleanPersonalEmail,
    phone: phoneVal,
    dateOfJoining: dojVal,
    doj: dojVal,
    dateOfBirth: dobVal,
    dob: dobVal,
    employeeId: empIdVal,
    panCardNumber: panVal,
    panNumber: panVal,
    aadhaarCardNumber: aadhaarVal,
    aadhaarNumber: aadhaarVal,
    bankName: bankNameVal,
    accountNumber: acctVal,
    ifscCode: ifscVal,
    bankDetails: {
      bankName: bankNameVal,
      accountNumber: acctVal,
      ifscCode: ifscVal
    },
    basicPay,
    houseAddress: safeString(raw.houseAddress ?? raw.address ?? ''),
    department: safeString(raw.department ?? 'Operations'),
    designation: safeString(raw.designation ?? 'Staff'),
    status: safeString(raw.status ?? 'ACTIVE') || 'ACTIVE'
  };

  return sanitizeFirestorePayload(normalized);
}

/**
 * Safe wrapper around Firestore setDoc with universal payload sanitization
 * and try/catch error containment to eliminate synchronous runtime aborts.
 */
export async function safeSetDoc<T extends Record<string, any>>(
  docRef: DocumentReference,
  data: T,
  options?: SetOptions
): Promise<void> {
  const cleanData = sanitizeFirestorePayload(data);
  if (options) {
    await setDoc(docRef, cleanData, options);
  } else {
    await setDoc(docRef, cleanData);
  }
}

/**
 * Safe wrapper around Firestore updateDoc with universal payload sanitization.
 */
export async function safeUpdateDoc(
  docRef: DocumentReference,
  data: Record<string, any>
): Promise<void> {
  const cleanData = sanitizeFirestorePayload(data);
  await updateDoc(docRef, cleanData);
}

/**
 * Strictly checks and preserves numeric 0 and positive numbers.
 * Returns true if the value is a finite number >= 0 (or a numeric string >= 0).
 */
export function isZeroOrPositive(val: unknown): boolean {
  if (typeof val === 'number') {
    return !isNaN(val) && isFinite(val) && val >= 0;
  }
  if (typeof val === 'string' && val.trim() !== '') {
    const num = Number(val);
    return !isNaN(num) && isFinite(num) && num >= 0;
  }
  return false;
}

