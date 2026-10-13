import { 
  collection, 
  doc, 
  getDocs, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, UserRole, UserDocument } from '@/lib/firebase';
import { COLLECTIONS } from '@/src/config/schema';
import { safeStringIdentifier, normalizeRole } from '@/lib/userService';
import {
  sanitizeFirestorePayload,
  normalizeEmployeeProfilePayload,
  safeSetDoc,
  safeUpdateDoc
} from '@/lib/firestoreSanitizer';

/**
 * Normalizes an Employee ID for fuzzy and exact matching.
 * Handles:
 * - SOL-SO-006, SOL-S0-006 (letter 'O' vs digit '0')
 * - SOL-SO-6 vs SOL-SO-006 (zero padding variations)
 * - SOL_SO_006, sol-so-6, SOLSO006
 */
export function normalizeEmpId(val?: string | null): { 
  raw: string; 
  key: string; 
  compact: string; 
  zeroNormalized: string;
  numKey: string;
} {
  if (!val) return { raw: '', key: '', compact: '', zeroNormalized: '', numKey: '' };
  const raw = String(val).trim().toUpperCase();
  const key = raw.toLowerCase();
  const compact = key.replace(/[^a-z0-9]/g, '');
  // Map letter 'o' to digit '0' to bridge SOL-SO-006 <-> SOL-S0-006
  const zeroNormalized = compact.replace(/o/g, '0');

  // Extract trailing digits and prefix
  const match = compact.match(/^([a-z0-9]*?)(\d+)$/);
  let numKey = '';
  if (match) {
    const prefix = match[1].replace(/o/g, '0');
    const num = parseInt(match[2], 10);
    numKey = `${prefix}::${num}`;
  } else {
    numKey = zeroNormalized;
  }

  return { raw, key, compact, zeroNormalized, numKey };
}

/**
 * Compare two employee IDs with full fuzzy normalization (O vs 0, padding, separators)
 */
export function empIdsMatch(idA?: string | null, idB?: string | null): boolean {
  if (!idA || !idB) return false;
  const a = normalizeEmpId(idA);
  const b = normalizeEmpId(idB);
  if (!a.compact || !b.compact) return false;
  if (a.compact === b.compact) return true;
  if (a.zeroNormalized === b.zeroNormalized) return true;
  if (a.numKey && b.numKey && a.numKey === b.numKey) return true;
  return false;
}

/**
 * Normalizes phone numbers to clean 10-digit format
 */
export function normalizePhone(val?: string | null): string {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes email address
 */
export function normalizeEmail(val?: string | null): string {
  if (!val) return '';
  return String(val).trim().toLowerCase();
}

/**
 * Checks whether an email address belongs to the corporate domain (@solarithmdesign.com or @solarithm.com)
 */
export function isCorporateEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = normalizeEmail(email);
  return lower.endsWith('@solarithmdesign.com') || lower.endsWith('@solarithm.com') || lower.endsWith('@solarithm.in');
}

/**
 * Checks whether an email address is a personal email provider
 */
export function isPersonalEmail(email?: string | null): boolean {
  if (!email) return false;
  const lower = normalizeEmail(email);
  return (
    lower.endsWith('@gmail.com') ||
    lower.endsWith('@yahoo.com') ||
    lower.endsWith('@outlook.com') ||
    lower.endsWith('@hotmail.com') ||
    lower.endsWith('@icloud.com') ||
    lower.endsWith('@rediffmail.com') ||
    lower.endsWith('@proton.me') ||
    lower.endsWith('@protonmail.com')
  );
}

/**
 * Resolves work email vs personal email from candidate emails.
 * DIRECTIVE 2: DUAL EMAIL RESOLUTION
 * - Store corporate @solarithmdesign.com in `email` (for official authentication and routing)
 * - Store personal email (e.g. Gmail) in `personalEmail`
 * - If an incoming row contains an existing employee's personal or work email, merge it into that employee's single document
 */
export function resolveDualEmails(candidates: (string | null | undefined)[]): {
  workEmail: string;
  personalEmail: string;
} {
  const cleanList = candidates
    .map(c => normalizeEmail(c))
    .filter(c => Boolean(c && !c.endsWith('@solarithm.internal')));

  // Deduplicate candidates preserving discovery order
  const uniqueEmails = Array.from(new Set(cleanList));

  if (uniqueEmails.length === 0) {
    return { workEmail: '', personalEmail: '' };
  }

  // 1. Identify corporate email
  const corpEmail = uniqueEmails.find(e => isCorporateEmail(e));

  // 2. Identify personal email (must be different from corpEmail)
  const persEmail = uniqueEmails.find(e => e !== corpEmail && (isPersonalEmail(e) || !isCorporateEmail(e)));

  if (corpEmail) {
    return {
      workEmail: corpEmail,
      personalEmail: persEmail || ''
    };
  }

  // Fallback: If no corporate email exists yet
  return {
    workEmail: uniqueEmails[0],
    personalEmail: uniqueEmails.length > 1 ? uniqueEmails[1] : (isPersonalEmail(uniqueEmails[0]) ? uniqueEmails[0] : '')
  };
}

/**
 * Normalizes employee name and extracts word tokens
 */
export function normalizeName(val?: string | null): {
  clean: string;
  tokens: string[];
} {
  if (!val) return { clean: '', tokens: [] };
  const clean = String(val)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip common prefixes/honorifics
  const rawTokens = clean.split(' ').filter(t => t.length > 0);
  const honorifics = new Set(['mr', 'ms', 'mrs', 'shri', 'smt', 'dr', 'er']);
  const tokens = rawTokens.filter(t => !honorifics.has(t));

  return { clean, tokens };
}

/**
 * Robust name matcher that matches Indian names across variations:
 * e.g., "Sheladiya Om Mukeshbhai" <=> "Sheladiya Om" <=> "Om Sheladiya"
 */
export function namesMatch(nameA?: string | null, nameB?: string | null): boolean {
  if (!nameA || !nameB) return false;
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (!a.clean || !b.clean) return false;
  if (a.clean === b.clean) return true;

  if (a.tokens.length === 0 || b.tokens.length === 0) return false;

  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);

  // If all tokens of the shorter name are present in the longer name (minimum 2 tokens or long 1-word)
  const shorter = a.tokens.length <= b.tokens.length ? a.tokens : b.tokens;
  const longerSet = a.tokens.length <= b.tokens.length ? setB : setA;

  if (shorter.length >= 2) {
    const allInLonger = shorter.every(token => longerSet.has(token));
    if (allInLonger) return true;
  }

  // Exact set equality regardless of order (e.g. "Om Sheladiya" and "Sheladiya Om")
  if (setA.size === setB.size && shorter.length >= 2) {
    const setsEqual = a.tokens.every(token => setB.has(token));
    if (setsEqual) return true;
  }

  return false;
}

/**
 * Normalizes department string into canonical functional groups
 */
export function normalizeDepartment(val?: string | null): string {
  if (!val) return 'Operations & Projects';
  const d = String(val).trim().toLowerCase();
  if (d.includes('design') || d.includes('engineering') || d.includes('cad') || d.includes('pv')) {
    return 'Solar Engineering & Design';
  }
  if (d.includes('sales') || d.includes('business dev') || d.includes('commercial') || d.includes('marketing')) {
    return 'Sales & Business Development';
  }
  if (d.includes('account') || d.includes('finance') || d.includes('tax') || d.includes('payroll')) {
    return 'Accounts & Finance';
  }
  if (d.includes('hr') || d.includes('human') || d.includes('admin') || d.includes('talent')) {
    return 'Human Resources & Admin';
  }
  if (d.includes('exec') || d.includes('management') || d.includes('director') || d.includes('founder') || d.includes('board')) {
    return 'Executive Management';
  }
  if (d.includes('field') || d.includes('install') || d.includes('quality') || d.includes('site')) {
    return 'Field Installation & Quality';
  }
  if (d.includes('operation') || d.includes('project')) {
    return 'Operations & Projects';
  }
  return String(val).trim();
}

/**
 * Checks if two departments are equivalent or compatible
 */
export function departmentsMatch(deptA?: string | null, deptB?: string | null): boolean {
  if (!deptA || !deptB) return true; // Empty dept is compatible
  const a = normalizeDepartment(deptA).toLowerCase();
  const b = normalizeDepartment(deptB).toLowerCase();
  return a === b;
}

/**
 * Maps spreadsheet entries and employee titles to canonical uppercase system roles:
 * - "Owner" / "Executive Owner" -> OWNER
 * - "Designer" -> DESIGNER
 * - "Lead Designer" -> LEAD_DESIGNER
 * - "Sales" -> SALES
 * - "Lead Sales" -> LEAD_SALES
 * - "Admin" -> ADMIN
 * - Standard staff -> EMPLOYEE
 * - "Manager" -> MANAGER
 * - "Engineer" -> ENGINEER
 * - "Technician" -> TECHNICIAN
 * - "Accountant" -> ACCOUNTANT
 */
export function parseAndNormalizeRole(rawRole?: string, designation?: string, department?: string): UserRole {
  const r = (rawRole || '').trim().toLowerCase().replace(/[-_]/g, ' ');
  const desig = (designation || '').trim().toLowerCase().replace(/[-_]/g, ' ');
  const dept = (department || '').trim().toLowerCase().replace(/[-_]/g, ' ');

  // 1. Direct explicit role parsing from Role column
  if (r) {
    if (
      r === 'owner' || 
      r.includes('owner') || 
      r.includes('founder') || 
      r.includes('super admin') || 
      r.includes('superadmin') || 
      r === 'director' || 
      r.includes('managing director') ||
      r.includes('proprietor') ||
      r.includes('executive owner')
    ) {
      return 'OWNER';
    }
    if (
      r.includes('lead designer') || 
      r.includes('design lead') || 
      r.includes('chief designer') || 
      r.includes('senior designer') || 
      r.includes('sr designer') || 
      r.includes('sr. designer') || 
      r.includes('head of design') ||
      r.includes('lead solar designer')
    ) {
      return 'LEAD_DESIGNER';
    }
    if (
      r === 'designer' || 
      r.includes('designer') || 
      r.includes('cad') || 
      r.includes('pv design') || 
      r.includes('drafting') || 
      r.includes('solar design')
    ) {
      return 'DESIGNER';
    }
    if (
      r.includes('lead sales') ||
      r.includes('sales lead') ||
      r.includes('sales head') ||
      r.includes('head of sales')
    ) {
      return 'LEAD_SALES';
    }
    if (
      r === 'sales' || 
      r.includes('sales') || 
      r.includes('business dev') || 
      r.includes('bdm') || 
      r.includes('bde') || 
      r.includes('commercial sales') ||
      r.includes('sales executive')
    ) {
      return 'SALES';
    }
    if (
      r === 'admin' || 
      r.includes('admin') || 
      r === 'administrator' || 
      r === 'hr' || 
      r.includes('human resources')
    ) {
      return 'ADMIN';
    }
    if (
      r === 'manager' || 
      r.includes('manager') || 
      r.includes('team lead') || 
      r.includes('operations lead') ||
      r.includes('project manager')
    ) {
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
    return normalizeRole(r);
  }

  // 2. Infer from Designation if Role column was blank or omitted
  if (desig) {
    if (desig.includes('owner') || desig.includes('director') || desig.includes('founder') || desig.includes('partner') || desig.includes('managing director') || desig.includes('executive owner')) {
      return 'OWNER';
    }
    if (desig.includes('lead designer') || desig.includes('design lead') || desig.includes('chief designer') || desig.includes('senior designer') || desig.includes('sr designer') || desig.includes('head of design')) {
      return 'LEAD_DESIGNER';
    }
    if (desig.includes('designer') || desig.includes('cad') || desig.includes('solar design') || desig.includes('pv engineer') || desig.includes('drafting') || desig.includes('design engineer')) {
      return 'DESIGNER';
    }
    if (desig.includes('lead sales') || desig.includes('sales lead') || desig.includes('head of sales')) {
      return 'LEAD_SALES';
    }
    if (desig.includes('sales') || desig.includes('business development') || desig.includes('bdm') || desig.includes('bde') || desig.includes('marketing') || desig.includes('sales consultant')) {
      return 'SALES';
    }
    if (desig.includes('admin') || desig.includes('hr')) {
      return 'ADMIN';
    }
    if (desig.includes('manager') || desig.includes('lead') || desig.includes('head')) {
      return 'MANAGER';
    }
    if (desig.includes('accountant') || desig.includes('accounts') || desig.includes('finance')) {
      return 'ACCOUNTANT';
    }
    if (desig.includes('technician') || desig.includes('installer') || desig.includes('mounting')) {
      return 'TECHNICIAN';
    }
    if (desig.includes('engineer')) {
      return 'ENGINEER';
    }
  }

  // 3. Infer from Department
  if (dept) {
    if (dept.includes('design') || dept.includes('solar engineering')) {
      return 'DESIGNER';
    }
    if (dept.includes('sales') || dept.includes('business dev')) {
      return 'SALES';
    }
    if (dept.includes('executive') || dept.includes('management')) {
      return 'OWNER';
    }
    if (dept.includes('hr') || dept.includes('human resources')) {
      return 'ADMIN';
    }
    if (dept.includes('account') || dept.includes('finance')) {
      return 'ACCOUNTANT';
    }
  }

  return 'EMPLOYEE';
}

/**
 * Flexible header extraction across known aliases, plurals, and variations
 */
export function getCellVal(rowObj: Record<string, any>, aliases: string[]): string {
  const cleanRowKeys = Object.keys(rowObj).map(k => ({
    original: k,
    compact: k.toLowerCase().replace(/[^a-z0-9]/g, '')
  }));

  // 1. Exact alias match
  for (const alias of aliases) {
    const aliasCompact = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const item of cleanRowKeys) {
      if (item.compact === aliasCompact) {
        const val = rowObj[item.original];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return safeStringIdentifier(val);
        }
      }
    }
  }

  // 2. Fallback prefix/contains match for specific multi-word fields
  for (const alias of aliases) {
    const aliasCompact = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (aliasCompact.length >= 4) {
      for (const item of cleanRowKeys) {
        if (item.compact.includes(aliasCompact) || aliasCompact.includes(item.compact)) {
          const val = rowObj[item.original];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return safeStringIdentifier(val);
          }
        }
      }
    }
  }

  return '';
}

/**
 * Standardize dates (handles Excel serial integers, DD-MM-YYYY, YYYY/MM/DD, ISO) to YYYY-MM-DD
 */
export function parseDateToYMD(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    if (val > 1e11) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    if (val > 30000 && val < 70000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + val * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return str.split('T')[0];
  }

  const ymd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymd && Number(ymd[1]) > 1900) {
    const y = ymd[1];
    const m = String(ymd[2]).padStart(2, '0');
    const d = String(ymd[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const d = String(dmy[1]).padStart(2, '0');
    const m = String(dmy[2]).padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

function isGenericPlaceholderName(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return (
    n === 'employee' ||
    n === 'staff' ||
    n === 'user' ||
    n === 'unknown' ||
    n === 'test' ||
    n === 'n/a' ||
    n.length < 2
  );
}

function isProbableAuthUid(id?: string | null): boolean {
  if (!id) return false;
  return (
    id.length >= 20 &&
    !id.startsWith('SOL-') &&
    !id.includes('@') &&
    !id.includes('.') &&
    !id.includes('_')
  );
}

/**
 * Robust fuzzy matching to identify if an incoming candidate row/document matches an existing user
 * Priority order:
 * 1. Employee ID (canonical format SOL-SO-006 vs SOL-S0-006)
 * 2. PAN Card (10 chars uppercase)
 * 3. Aadhaar Card (12 digits)
 * 4. Dual Email (work corporate email or personal Gmail/Outlook against existing records)
 * 5. Phone Number (10 digits)
 * 6. Person Name (robust token subset & order-insensitive matching)
 */
export function findMatchingEmployee(
  candidate: {
    employeeId?: string | null;
    email?: string | null;
    personalEmail?: string | null;
    name?: string | null;
    phone?: string | null;
    panCardNumber?: string | null;
    aadhaarCardNumber?: string | null;
    department?: string | null;
    authUid?: string | null;
    id?: string | null;
  },
  existingList: UserDocument[]
): UserDocument | undefined {
  const candPan = (candidate.panCardNumber || '').trim().toUpperCase();
  const candAadhaar = (candidate.aadhaarCardNumber || '').replace(/\D/g, '');
  const candPhone = normalizePhone(candidate.phone);
  const candEmail = normalizeEmail(candidate.email);
  const candPersonalEmail = normalizeEmail(candidate.personalEmail);
  const candId = candidate.authUid || candidate.id;

  // 0. Explicit document / Auth UID match
  if (candId) {
    const matched = existingList.find(u => u.id === candId || u.uid === candId);
    if (matched) return matched;
  }

  // 0b. DIRECTIVE 3: Partner identity match - Single Source of Truth for Jay Shah and Deep Davara
  const isCandJay =
    (candEmail && (candEmail.includes('jayjalpa') || candEmail.includes('jayshah'))) ||
    (candPersonalEmail && (candPersonalEmail.includes('jayjalpa') || candPersonalEmail.includes('jayshah'))) ||
    (candidate.employeeId && (candidate.employeeId.includes('JS-001') || candidate.employeeId === 'SOL-EMP-01')) ||
    candId === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' ||
    (candidate.name && candidate.name.toLowerCase().includes('jay shah'));

  if (isCandJay) {
    const matchedJay = existingList.find(u => 
      u.uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' ||
      u.id === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' ||
      (u.employeeId && (u.employeeId.includes('JS-001') || u.employeeId === 'SOL-EMP-01')) ||
      (u.email && (u.email.includes('jayjalpa') || u.email.includes('jayshah'))) ||
      (u.personalEmail && (u.personalEmail.includes('jayjalpa') || u.personalEmail.includes('jayshah'))) ||
      (u.name && u.name.toLowerCase().includes('jay shah'))
    );
    if (matchedJay) return matchedJay;
  }

  const isCandDeep =
    (candEmail && candEmail.includes('deepdavara')) ||
    (candPersonalEmail && candPersonalEmail.includes('deepdavara')) ||
    (candidate.employeeId && candidate.employeeId.includes('DD-002')) ||
    (candidate.name && candidate.name.toLowerCase().includes('deep davara'));

  if (isCandDeep) {
    const matchedDeep = existingList.find(u =>
      (u.employeeId && u.employeeId.includes('DD-002')) ||
      (u.email && u.email.includes('deepdavara')) ||
      (u.personalEmail && u.personalEmail.includes('deepdavara')) ||
      (u.name && u.name.toLowerCase().includes('deep davara'))
    );
    if (matchedDeep) return matchedDeep;
  }

  // 1. Employee ID match (including SOL-SO-006 <-> SOL-S0-006)
  if (candidate.employeeId) {
    const matched = existingList.find(u => empIdsMatch(candidate.employeeId, u.employeeId));
    if (matched) return matched;
  }

  // 2. PAN Card match (definitive tax identity)
  if (candPan && candPan.length === 10) {
    const matched = existingList.find(u => {
      const uPan = (u.panCardNumber || u.panNumber || '').trim().toUpperCase();
      return uPan && uPan === candPan;
    });
    if (matched) return matched;
  }

  // 3. Aadhaar Card match (definitive national identity)
  if (candAadhaar && candAadhaar.length === 12) {
    const matched = existingList.find(u => {
      const uAadhaar = (u.aadhaarCardNumber || u.aadhaarNumber || '').replace(/\D/g, '');
      return uAadhaar && uAadhaar === candAadhaar;
    });
    if (matched) return matched;
  }

  // 4. Email matching (work corporate email or personal email)
  const isRealEmail = (e: string) => Boolean(e && !e.endsWith('@solarithm.internal'));
  if (isRealEmail(candEmail) || isRealEmail(candPersonalEmail)) {
    const matched = existingList.find(u => {
      const uEmail = normalizeEmail(u.email);
      const uPersonal = normalizeEmail(u.personalEmailAddress || u.personalEmail);

      if (isRealEmail(candEmail)) {
        if (isRealEmail(uEmail) && candEmail === uEmail) return true;
        if (isRealEmail(uPersonal) && candEmail === uPersonal) return true;
      }
      if (isRealEmail(candPersonalEmail)) {
        if (isRealEmail(uEmail) && candPersonalEmail === uEmail) return true;
        if (isRealEmail(uPersonal) && candPersonalEmail === uPersonal) return true;
      }
      return false;
    });
    if (matched) return matched;
  }

  // 5. Phone Number match (10 digits)
  if (candPhone && candPhone.length === 10) {
    const matched = existingList.find(u => {
      const uPhone = normalizePhone(u.phone);
      return uPhone && uPhone === candPhone;
    });
    if (matched) return matched;
  }

  // 6. Person Name matching (prevent matching generic placeholders like "Employee")
  if (candidate.name && !isGenericPlaceholderName(candidate.name)) {
    // Find all users whose real names match via token subset/reorder
    const nameMatches = existingList.filter(
      u => !isGenericPlaceholderName(u.name) && namesMatch(candidate.name, u.name)
    );
    if (nameMatches.length === 1) {
      return nameMatches[0];
    }
    if (nameMatches.length > 1) {
      const deptMatch = nameMatches.find(u => departmentsMatch(candidate.department, u.department));
      if (deptMatch) return deptMatch;
      return nameMatches[0];
    }
  }

  return undefined;
}

/**
 * Deduplicate a raw list of user/employee documents from Firestore
 * Identifies and merges duplicate entries sharing the same employeeId, PAN, email, phone, or person name.
 * Preserves the latest details into the primary record and flags orphaned duplicate document IDs for purging.
 */
export function deduplicateEmployeeList(rawList: UserDocument[]): {
  dedupedList: UserDocument[];
  duplicateDocIdsToPurge: Set<string>;
} {
  const result: UserDocument[] = [];
  const duplicateDocIdsToPurge = new Set<string>();

  for (const docItem of rawList) {
    const matched = findMatchingEmployee(
      {
        employeeId: docItem.employeeId,
        email: docItem.email,
        personalEmail: docItem.personalEmailAddress || docItem.personalEmail,
        name: docItem.name,
        phone: docItem.phone,
        panCardNumber: docItem.panCardNumber || docItem.panNumber,
        aadhaarCardNumber: docItem.aadhaarCardNumber || docItem.aadhaarNumber,
        department: docItem.department,
        id: docItem.id,
        authUid: docItem.uid
      },
      result
    );

    if (matched) {
      // Duplicate record detected!
      // Compare timestamps to know if docItem has newer details
      const docTime = docItem.updatedAt
        ? new Date(docItem.updatedAt).getTime()
        : (docItem.createdAt ? new Date(docItem.createdAt).getTime() : 0);
      const matchedTime = matched.updatedAt
        ? new Date(matched.updatedAt).getTime()
        : (matched.createdAt ? new Date(matched.createdAt).getTime() : 0);
      const isDocItemNewer = docTime > matchedTime;

      // Select primary document ID:
      // If docItem has a canonical Auth UID and matched does not, swap IDs so the Auth UID remains primary
      if (docItem.id && matched.id && docItem.id !== matched.id) {
        if (isProbableAuthUid(docItem.id) && !isProbableAuthUid(matched.id)) {
          duplicateDocIdsToPurge.add(matched.id);
          matched.id = docItem.id;
          matched.uid = docItem.id;
        } else {
          duplicateDocIdsToPurge.add(docItem.id);
        }
      }

      // 1. Role merging: prefer non-generic role over 'EMPLOYEE', and prefer latest specific role
      const normMatchedRole = normalizeRole(matched.role);
      const normDocRole = normalizeRole(docItem.role);
      const isDocSpecific = normDocRole && normDocRole !== 'EMPLOYEE';
      const isMatchedSpecific = normMatchedRole && normMatchedRole !== 'EMPLOYEE';

      if (isDocSpecific && !isMatchedSpecific) {
        matched.role = normDocRole;
      } else if (!isDocSpecific && isMatchedSpecific) {
        matched.role = normMatchedRole;
      } else if (normDocRole === 'LEAD_DESIGNER' && normMatchedRole === 'DESIGNER') {
        matched.role = normDocRole;
      } else if (normDocRole === 'LEAD_SALES' && normMatchedRole === 'SALES') {
        matched.role = normDocRole;
      } else if (normMatchedRole === 'LEAD_DESIGNER' && normDocRole === 'DESIGNER') {
        matched.role = normMatchedRole;
      } else if (normMatchedRole === 'LEAD_SALES' && normDocRole === 'SALES') {
        matched.role = normMatchedRole;
      } else if (isDocItemNewer && normDocRole) {
        matched.role = normDocRole;
      } else if (normMatchedRole) {
        matched.role = normMatchedRole;
      } else {
        matched.role = 'EMPLOYEE';
      }

      // 2. Employee ID canonicalization: prefer letter 'O' (SOL-SO-006) over digit '0' (SOL-S0-006)
      if (docItem.employeeId && matched.employeeId) {
        if (docItem.employeeId.includes('-SO-') && matched.employeeId.includes('-S0-')) {
          matched.employeeId = docItem.employeeId;
        } else if (matched.employeeId.includes('-SO-') && docItem.employeeId.includes('-S0-')) {
          // Keep matched.employeeId
        } else if (isDocItemNewer && docItem.employeeId) {
          matched.employeeId = docItem.employeeId;
        }
      } else {
        matched.employeeId = matched.employeeId || docItem.employeeId;
      }
      if (matched.employeeId && matched.employeeId.includes('-S0-')) {
        matched.employeeId = matched.employeeId.replace('-S0-', '-SO-');
      }

      // 3. Dual email resolution:
      // Store corporate @solarithmdesign.com in `email` (for official authentication and routing)
      // Store personal email in `personalEmail` (and mirror in personalEmailAddress)
      const { workEmail, personalEmail } = resolveDualEmails([
        matched.email,
        matched.personalEmail,
        matched.personalEmailAddress,
        docItem.email,
        docItem.personalEmail,
        docItem.personalEmailAddress
      ]);

      if (workEmail) matched.email = workEmail;
      matched.personalEmail = personalEmail;
      matched.personalEmailAddress = personalEmail;

      // 4. Person Name resolution: prefer fuller legal name or latest details
      const nameDocTokens = (docItem.name || '').trim().split(/\s+/).filter(Boolean);
      const nameMatchedTokens = (matched.name || '').trim().split(/\s+/).filter(Boolean);
      if (nameDocTokens.length > nameMatchedTokens.length && !isGenericPlaceholderName(docItem.name)) {
        matched.name = docItem.name;
      } else if (nameMatchedTokens.length > nameDocTokens.length && !isGenericPlaceholderName(matched.name)) {
        // Keep matched fuller name
      } else if (isDocItemNewer && docItem.name && !isGenericPlaceholderName(docItem.name)) {
        matched.name = docItem.name;
      } else {
        matched.name = matched.name || docItem.name;
      }

      // 5. Preserving latest details for all professional and KYC attributes:
      if (isDocItemNewer) {
        matched.department = docItem.department || matched.department;
        matched.designation = docItem.designation || matched.designation;
        matched.basicPay = (docItem.basicPay !== undefined && docItem.basicPay !== null && docItem.basicPay > 0)
          ? docItem.basicPay
          : (matched.basicPay ?? 0);
        matched.dateOfJoining = docItem.dateOfJoining || docItem.doj || matched.dateOfJoining || matched.doj;
        matched.doj = matched.dateOfJoining;
        matched.dateOfBirth = docItem.dateOfBirth || docItem.dob || matched.dateOfBirth || matched.dob;
        matched.dob = matched.dateOfBirth;
        matched.bankName = docItem.bankName || docItem.bankDetails?.bankName || matched.bankName;
        matched.accountNumber = docItem.accountNumber || docItem.bankDetails?.accountNumber || matched.accountNumber;
        matched.ifscCode = docItem.ifscCode || docItem.bankDetails?.ifscCode || matched.ifscCode;
        matched.panCardNumber = docItem.panCardNumber || docItem.panNumber || matched.panCardNumber;
        matched.panNumber = matched.panCardNumber;
        matched.aadhaarCardNumber = docItem.aadhaarCardNumber || docItem.aadhaarNumber || matched.aadhaarCardNumber;
        matched.aadhaarNumber = matched.aadhaarCardNumber;
        matched.houseAddress = docItem.houseAddress || matched.houseAddress;
        matched.phone = docItem.phone || matched.phone;
      } else {
        matched.department = matched.department || docItem.department;
        matched.designation = matched.designation || docItem.designation;
        matched.basicPay = (matched.basicPay !== undefined && matched.basicPay !== null && matched.basicPay > 0)
          ? matched.basicPay
          : (docItem.basicPay ?? 0);
        matched.dateOfJoining = matched.dateOfJoining || matched.doj || docItem.dateOfJoining || docItem.doj;
        matched.doj = matched.dateOfJoining;
        matched.dateOfBirth = matched.dateOfBirth || matched.dob || docItem.dateOfBirth || docItem.dob;
        matched.dob = matched.dateOfBirth;
        matched.bankName = matched.bankName || matched.bankDetails?.bankName || docItem.bankName || docItem.bankDetails?.bankName;
        matched.accountNumber = matched.accountNumber || matched.bankDetails?.accountNumber || docItem.accountNumber || docItem.bankDetails?.accountNumber;
        matched.ifscCode = matched.ifscCode || matched.bankDetails?.ifscCode || docItem.ifscCode || docItem.bankDetails?.ifscCode;
        matched.panCardNumber = matched.panCardNumber || matched.panNumber || docItem.panCardNumber || docItem.panNumber;
        matched.panNumber = matched.panCardNumber;
        matched.aadhaarCardNumber = matched.aadhaarCardNumber || matched.aadhaarNumber || docItem.aadhaarCardNumber || docItem.aadhaarNumber;
        matched.aadhaarNumber = matched.aadhaarCardNumber;
        matched.houseAddress = matched.houseAddress || docItem.houseAddress;
        matched.phone = matched.phone || docItem.phone;
      }

      // Sync nested bankDetails object
      matched.bankDetails = {
        bankName: matched.bankName || '',
        accountNumber: matched.accountNumber || '',
        ifscCode: matched.ifscCode || ''
      };

      if (Array.isArray(docItem.accessibleApps) && docItem.accessibleApps.length > 0) {
        const set = new Set([...(matched.accessibleApps || []), ...docItem.accessibleApps]);
        matched.accessibleApps = Array.from(set);
      }

      // Always mark merged primary record with latest timestamp and earliest creation date
      matched.createdAt = matched.createdAt || docItem.createdAt || new Date().toISOString();
      matched.updatedAt = new Date().toISOString();
    } else {
      // First time seeing this employee
      const primaryCopy = { ...docItem };
      result.push(primaryCopy);
    }
  }

  // DIRECTIVE 3: Enforce Canonical Partner Details & Guarantee Single Source of Truth
  const partnerKeysSeen = new Set<string>();
  const finalUnifiedList: UserDocument[] = [];

  for (const emp of result) {
    const lowerName = (emp.name || '').toLowerCase();
    const lowerEmail = (emp.email || '').toLowerCase();
    const lowerPers = (emp.personalEmail || emp.personalEmailAddress || '').toLowerCase();
    const empIdUpper = (emp.employeeId || '').toUpperCase();

    const isJay =
      lowerName.includes('jay shah') ||
      lowerEmail.includes('jayshah') ||
      lowerEmail.includes('jayjalpa') ||
      lowerPers.includes('jayjalpa') ||
      empIdUpper.includes('JS-001') ||
      empIdUpper === 'SOL-EMP-01' ||
      emp.id === 'oIZpuLeftqaj3j5KS9ZIvurklEE2' ||
      emp.uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2';

    const isDeep =
      lowerName.includes('deep davara') ||
      lowerEmail.includes('deepdavara') ||
      lowerPers.includes('deepdavara') ||
      empIdUpper.includes('DD-002');

    if (isJay) {
      if (partnerKeysSeen.has('JAY_SHAH')) {
        if (emp.id) duplicateDocIdsToPurge.add(emp.id);
        continue;
      }
      partnerKeysSeen.add('JAY_SHAH');
      emp.name = 'Jay Shah';
      emp.employeeId = 'SDM-JS-001';
      emp.email = 'jayshah.03@solarithmdesign.com';
      emp.personalEmail = 'jayjalpa2002@gmail.com';
      emp.personalEmailAddress = 'jayjalpa2002@gmail.com';
      emp.role = 'OWNER';
      emp.designation = 'Company Partner & Lead Solar Designer';
      emp.department = 'Executive Management';
      emp.id = emp.id || 'oIZpuLeftqaj3j5KS9ZIvurklEE2';
      emp.uid = emp.uid || 'oIZpuLeftqaj3j5KS9ZIvurklEE2';
    } else if (isDeep) {
      if (partnerKeysSeen.has('DEEP_DAVARA')) {
        if (emp.id) duplicateDocIdsToPurge.add(emp.id);
        continue;
      }
      partnerKeysSeen.add('DEEP_DAVARA');
      emp.name = 'Deep Davara';
      emp.employeeId = 'SDM-DD-002';
      emp.email = 'deepdavara@solarithmdesign.com';
      emp.personalEmail = 'deepdavara@gmail.com';
      emp.personalEmailAddress = 'deepdavara@gmail.com';
      emp.role = 'OWNER';
      emp.designation = 'Company Partner & Senior Solar Designer';
      emp.department = 'Executive Management';
    }

    finalUnifiedList.push(emp);
  }

  // If partners are missing from the raw directory, ensure they are injected as unified master records
  if (!partnerKeysSeen.has('JAY_SHAH')) {
    finalUnifiedList.unshift({
      id: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
      uid: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
      name: 'Jay Shah',
      employeeId: 'SDM-JS-001',
      email: 'jayshah.03@solarithmdesign.com',
      personalEmail: 'jayjalpa2002@gmail.com',
      personalEmailAddress: 'jayjalpa2002@gmail.com',
      role: 'OWNER',
      designation: 'Company Partner & Lead Solar Designer',
      department: 'Executive Management',
      basicPay: 150000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  if (!partnerKeysSeen.has('DEEP_DAVARA')) {
    finalUnifiedList.splice(1, 0, {
      id: 'sdm-dd-002-master',
      uid: 'sdm-dd-002-master',
      name: 'Deep Davara',
      employeeId: 'SDM-DD-002',
      email: 'deepdavara@solarithmdesign.com',
      personalEmail: 'deepdavara@gmail.com',
      personalEmailAddress: 'deepdavara@gmail.com',
      role: 'OWNER',
      designation: 'Company Partner & Senior Solar Designer',
      department: 'Executive Management',
      basicPay: 150000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  return { dedupedList: finalUnifiedList, duplicateDocIdsToPurge };
}

export interface IngestionResult {
  updatedCount: number;
  insertedCount: number;
  purgedDuplicatesCount: number;
  finalEmployees: UserDocument[];
}

function cleanFirestoreData<T extends Record<string, any>>(data: T): Record<string, any> {
  return sanitizeFirestorePayload(data) as Record<string, any>;
}

/**
 * Complete Data Ingestion & Upsert Workflow
 * Reads current Firestore state, executes deduplicated upserts, merges spreadsheet changes,
 * enforces accurate role mappings, and cleans legacy duplicates.
 */
export async function ingestEmployeeSpreadsheet(
  rawRows: Record<string, any>[]
): Promise<IngestionResult> {
  // 1. Fetch live database state from both collections
  const [userSnap, empSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.USERS)),
    getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => ({ forEach: () => {} } as any))
  ]);

  const rawDbList: UserDocument[] = [];
  userSnap.forEach((d) => {
    rawDbList.push({ ...(d.data() as UserDocument), id: d.id, uid: d.id });
  });
  empSnap.forEach((d: any) => {
    rawDbList.push({ ...(d.data() as UserDocument), id: d.id, uid: d.id });
  });

  // 2. Deduplicate existing DB state and collect legacy duplicate IDs to purge
  const { dedupedList: masterList, duplicateDocIdsToPurge } = deduplicateEmployeeList(rawDbList);

  let insertedCount = 0;
  let updatedCount = 0;

  // 3. Process spreadsheet rows
  for (const rowObj of rawRows) {
    const empIdVal = getCellVal(rowObj, [
      'employeeid', 'employee id', 'empid', 'emp id', 
      'employee code', 'emp code', 'employee no', 'emp no', 
      'staff id', 'staff code'
    ]);
    const emailVal = getCellVal(rowObj, [
      'email', 'official work email', 'official email', 'work email', 
      'email address', 'corporate email', 'office email', 'company email'
    ]);
    const nameVal = getCellVal(rowObj, [
      'fullname', 'name', 'full name', 'employee name', 'staff name', 'candidate name'
    ]);
    const roleVal = getCellVal(rowObj, [
      'system role', 'role', 'system roles', 'system role(s)', 'user role', 'user roles', 
      'assigned role', 'access role', 'roles', 'role name', 'designation / role', 
      'designation/role', 'permission role', 'access level'
    ]);
    const deptVal = getCellVal(rowObj, ['department', 'dept', 'division', 'team', 'functional unit']);
    const desigVal = getCellVal(rowObj, ['designation', 'job title', 'position', 'title', 'post']);
    const basicPayVal = getCellVal(rowObj, [
      'basic monthly pay', 'basic pay', 'basicpay', 'monthly salary', 'salary', 
      'gross salary', 'basic salary', 'ctc', 'stipend', 'basic'
    ]);
    const dojVal = getCellVal(rowObj, [
      'date of joining (yyyy-mm-dd)', 'date of joining', 'dateofjoining', 
      'doj', 'joining date', 'date of join', 'start date'
    ]);
    const dobVal = getCellVal(rowObj, [
      'date of birth (yyyy-mm-dd)', 'date of birth', 'dateofbirth', 
      'dob', 'birth date', 'birthdate'
    ]);
    const bankNameVal = getCellVal(rowObj, ['bank name', 'bankname', 'bank', 'banker']);
    const acctVal = getCellVal(rowObj, [
      'account number', 'accountnumber', 'bank account number', 'account', 
      'bank account', 'acct num', 'acct no', 'a/c no', 'acc no'
    ]);
    const ifscVal = getCellVal(rowObj, ['ifsc code', 'ifsccode', 'ifsc', 'ifsc code (rtgs/neft)']).toUpperCase();
    const panVal = getCellVal(rowObj, ['pan card number', 'pancardnumber', 'pan number', 'pan', 'pan card', 'pan no']).toUpperCase();
    const aadhaarVal = getCellVal(rowObj, [
      'aadhaar card number', 'aadhaarcardnumber', 'aadhaar number', 
      'aadhaar', 'aadhar', 'aadhar card number', 'aadhar number', 'uidai'
    ]);
    const addressVal = getCellVal(rowObj, ['house address', 'houseaddress', 'address', 'residential address', 'street address', 'permanent address']);
    const personalEmailVal = getCellVal(rowObj, ['personal email address', 'personal email', 'personalemail', 'personalemailaddress', 'alternate email']).toLowerCase();
    const phoneVal = getCellVal(rowObj, ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'cell']);

    // Skip empty row
    if (!empIdVal && !emailVal && !nameVal) {
      continue;
    }

    // Parse role accurately
    const parsedRole = parseAndNormalizeRole(roleVal, desigVal, deptVal);

    // Parse salary
    let hasBasicPay = false;
    let parsedBasicPay = 0;
    if (basicPayVal) {
      const num = Number(String(basicPayVal).replace(/[^0-9.-]+/g, ''));
      if (!isNaN(num)) {
        parsedBasicPay = num;
        hasBasicPay = true;
      }
    }

    // Match against master in-memory list
    const existingUser = findMatchingEmployee(
      {
        employeeId: empIdVal,
        email: emailVal,
        personalEmail: personalEmailVal,
        name: nameVal,
        phone: phoneVal,
        panCardNumber: panVal,
        aadhaarCardNumber: aadhaarVal,
        department: deptVal
      },
      masterList
    );

    if (existingUser) {
      // =========================================================================
      // 1. UPDATE EXISTING EMPLOYEE RECORD (Strict Upsert)
      // Enforces updates from spreadsheet, accurate role mappings, preserves credentials
      // =========================================================================
      const targetUid = existingUser.id || existingUser.uid || doc(collection(db, COLLECTIONS.USERS)).id;

      const finalName = nameVal || existingUser.name || 'Employee';

      // Dual email resolution:
      // Store corporate @solarithmdesign.com in `email` (for official authentication and routing)
      // Store personal email in `personalEmail` (and mirror in personalEmailAddress)
      const { workEmail, personalEmail } = resolveDualEmails([
        emailVal,
        personalEmailVal,
        existingUser.email,
        existingUser.personalEmail,
        existingUser.personalEmailAddress
      ]);

      const finalEmail = workEmail || existingUser.email || `${targetUid}@solarithm.internal`;
      const finalPersonalEmail = personalEmail || existingUser.personalEmail || existingUser.personalEmailAddress || '';
      
      // Update employee ID if provided, preserving letter 'O' over digit '0'
      let finalEmpId = existingUser.employeeId || `SOL-${targetUid.slice(0, 5)}`.toUpperCase();
      if (empIdVal) {
        finalEmpId = empIdVal.toUpperCase();
      } else if (finalEmpId.includes('-S0-')) {
        finalEmpId = finalEmpId.replace('-S0-', '-SO-');
      }

      // Role preservation/update:
      // If spreadsheet explicitly provides a role (or designation inferring a role), update it.
      // If role in sheet was blank, NEVER overwrite an existing non-generic role!
      let finalRole: string = existingUser.role ? normalizeRole(existingUser.role) : 'EMPLOYEE';
      if (roleVal) {
        finalRole = parsedRole;
      } else if (existingUser.role && normalizeRole(existingUser.role) !== 'EMPLOYEE') {
        finalRole = normalizeRole(existingUser.role);
      } else if (parsedRole && normalizeRole(parsedRole) !== 'EMPLOYEE') {
        finalRole = parsedRole;
      }
      finalRole = normalizeRole(finalRole);

      const finalDept = deptVal || existingUser.department || 'Operations & Projects';
      const finalDesig = desigVal || existingUser.designation || 'Staff';
      const finalBasicPay = hasBasicPay ? parsedBasicPay : (existingUser.basicPay ?? 0);
      const finalDoj = dojVal ? parseDateToYMD(dojVal) : (existingUser.dateOfJoining || existingUser.doj || '');
      const finalDob = dobVal ? parseDateToYMD(dobVal) : (existingUser.dateOfBirth || existingUser.dob || '');

      const finalBankName = bankNameVal || existingUser.bankName || existingUser.bankDetails?.bankName || '';
      const finalAcct = acctVal || existingUser.accountNumber || existingUser.bankDetails?.accountNumber || '';
      const finalIfsc = ifscVal || existingUser.ifscCode || existingUser.bankDetails?.ifscCode || '';

      const finalPan = panVal || existingUser.panCardNumber || existingUser.panNumber || '';
      const finalAadhaar = aadhaarVal || existingUser.aadhaarCardNumber || existingUser.aadhaarNumber || '';
      const finalAddress = addressVal || existingUser.houseAddress || '';
      const finalPhone = phoneVal || existingUser.phone || '';

      // Preserve security and system access properties
      const finalAccessibleApps = Array.isArray(existingUser.accessibleApps)
        ? [...existingUser.accessibleApps]
        : [];
      const finalCreatedAt = existingUser.createdAt || new Date().toISOString();

      const payload: UserDocument = {
        id: targetUid,
        uid: targetUid,
        name: finalName,
        email: finalEmail.toLowerCase(),
        employeeId: finalEmpId.toUpperCase(),
        role: finalRole,
        department: finalDept,
        designation: finalDesig,
        basicPay: finalBasicPay,
        dateOfJoining: finalDoj,
        doj: finalDoj,
        dateOfBirth: finalDob,
        dob: finalDob,
        bankName: finalBankName,
        accountNumber: finalAcct,
        ifscCode: finalIfsc,
        bankDetails: {
          bankName: finalBankName,
          accountNumber: finalAcct,
          ifscCode: finalIfsc
        },
        panCardNumber: finalPan,
        panNumber: finalPan,
        aadhaarCardNumber: finalAadhaar,
        aadhaarNumber: finalAadhaar,
        houseAddress: finalAddress,
        personalEmailAddress: finalPersonalEmail,
        personalEmail: finalPersonalEmail,
        phone: finalPhone,
        accessibleApps: finalAccessibleApps,
        pricingCategory: existingUser.pricingCategory || '',
        status: existingUser.status || 'ACTIVE',
        tempPassword: existingUser.tempPassword,
        createdAt: finalCreatedAt,
        updatedAt: new Date().toISOString()
      };

      const canonicalEmpId = (existingUser.employeeId || empIdVal || targetUid).toUpperCase();
      const cleanUpdatePayload = normalizeEmployeeProfilePayload({
        ...payload,
        id: targetUid,
        uid: targetUid,
        authUid: targetUid,
        employeeId: canonicalEmpId
      });

      // Write atomically to both /users (keyed by Auth UID) and /employees (keyed by canonical Employee ID)
      await Promise.all([
        safeSetDoc(doc(db, COLLECTIONS.USERS, targetUid), cleanUpdatePayload, { merge: true }),
        safeSetDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', canonicalEmpId), {
          ...cleanUpdatePayload,
          id: canonicalEmpId,
          authUid: targetUid,
          uid: targetUid
        }, { merge: true })
      ]);

      // Update in-memory object in masterList
      Object.assign(existingUser, payload);
      updatedCount++;
    } else {
      // =========================================================================
      // 2. INSERT NEW EMPLOYEE (Unique Canonical UID)
      // =========================================================================
      const newUid = doc(collection(db, COLLECTIONS.USERS)).id;
      
      // Dual email resolution:
      const { workEmail, personalEmail } = resolveDualEmails([emailVal, personalEmailVal]);
      const cleanEmail = workEmail || emailVal.toLowerCase() || `${(normalizeEmpId(empIdVal).compact || 'emp') + '_' + newUid.slice(0, 5)}@solarithm.internal`;
      const cleanPersonalEmail = personalEmail || personalEmailVal.toLowerCase() || '';
      const cleanEmpId = (empIdVal || `SOL-${newUid.slice(0, 5)}`).toUpperCase();

      const payload: UserDocument = {
        id: newUid,
        uid: newUid,
        name: nameVal || 'Employee',
        email: cleanEmail,
        employeeId: cleanEmpId,
        role: parsedRole ? normalizeRole(parsedRole) : 'EMPLOYEE',
        department: deptVal || 'Operations & Projects',
        designation: desigVal || 'Staff',
        basicPay: hasBasicPay ? parsedBasicPay : 0,
        dateOfJoining: dojVal ? parseDateToYMD(dojVal) : '',
        doj: dojVal ? parseDateToYMD(dojVal) : '',
        dateOfBirth: dobVal ? parseDateToYMD(dobVal) : '',
        dob: dobVal ? parseDateToYMD(dobVal) : '',
        bankName: bankNameVal,
        accountNumber: acctVal,
        ifscCode: ifscVal,
        bankDetails: {
          bankName: bankNameVal,
          accountNumber: acctVal,
          ifscCode: ifscVal
        },
        panCardNumber: panVal,
        panNumber: panVal,
        aadhaarCardNumber: aadhaarVal,
        aadhaarNumber: aadhaarVal,
        houseAddress: addressVal,
        personalEmailAddress: cleanPersonalEmail,
        personalEmail: cleanPersonalEmail,
        phone: phoneVal,
        accessibleApps: [],
        pricingCategory: '',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const cleanInsertPayload = normalizeEmployeeProfilePayload({
        ...payload,
        id: newUid,
        uid: newUid,
        authUid: newUid,
        employeeId: cleanEmpId
      });

      await Promise.all([
        safeSetDoc(doc(db, COLLECTIONS.USERS, newUid), cleanInsertPayload, { merge: true }),
        safeSetDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', cleanEmpId), {
          ...cleanInsertPayload,
          id: cleanEmpId,
          authUid: newUid,
          uid: newUid
        }, { merge: true })
      ]);

      masterList.push(payload);
      insertedCount++;
    }
  }

  // 4. Purge identified redundant duplicate documents from Firestore
  let purgedCount = 0;
  const masterIds = new Set(masterList.map(u => u.id));
  if (duplicateDocIdsToPurge.size > 0) {
    for (const dupId of duplicateDocIdsToPurge) {
      if (!masterIds.has(dupId)) {
        await Promise.all([
          deleteDoc(doc(db, COLLECTIONS.USERS, dupId)).catch(() => {}),
          deleteDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', dupId)).catch(() => {})
        ]);
        purgedCount++;
      }
    }
  }

  // Final sort
  masterList.sort((a, b) => {
    if (a.employeeId && b.employeeId) return a.employeeId.localeCompare(b.employeeId);
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    updatedCount,
    insertedCount,
    purgedDuplicatesCount: purgedCount,
    finalEmployees: masterList
  };
}

export interface DeduplicationSweepResult {
  totalScanned: number;
  uniqueCount: number;
  purgedCount: number;
  mergedEmployees: UserDocument[];
}

/**
 * DIRECTIVE 4: ONE-TIME DEDUPLICATION SWEEP
 * Comprehensive directory cleanup routine:
 * 1. Inspects the existing employees and users collection in Firestore.
 * 2. Scans for duplicate entries sharing Employee ID (including SOL-SO-006 vs SOL-S0-006), PAN, Aadhaar, Phone, Email, or Person Name.
 * 3. Merges duplicate documents into the primary record, preserving latest/richest details:
 *    - Corporate work email in `email`
 *    - Personal email in `personalEmail` and `personalEmailAddress`
 *    - Canonical uppercase role (OWNER, DESIGNER, LEAD_DESIGNER, SALES, LEAD_SALES, ADMIN, EMPLOYEE)
 *    - Standardized Employee ID with letter 'O'
 *    - KYC, banking, salary, and employment dates
 * 4. Atomically updates the merged primary records in Firestore and purges orphaned duplicate documents.
 */
export async function executeDeduplicationSweep(): Promise<DeduplicationSweepResult> {
  const [userSnap, empSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.USERS)),
    getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => ({ forEach: () => {} } as any))
  ]);

  const rawList: UserDocument[] = [];
  userSnap.forEach((d) => {
    rawList.push({ ...(d.data() as UserDocument), id: d.id, uid: d.id });
  });
  empSnap.forEach((d: any) => {
    rawList.push({ ...(d.data() as UserDocument), id: d.id, uid: d.id });
  });

  const totalScanned = rawList.length;
  const { dedupedList, duplicateDocIdsToPurge } = deduplicateEmployeeList(rawList);

  // Normalize roles and update merged primary documents in Firestore
  const updatePromises: Promise<any>[] = [];
  for (const emp of dedupedList) {
    if (emp.role) {
      emp.role = normalizeRole(emp.role);
    }
    const targetUid = emp.uid || emp.id;
    const canonicalEmpId = (emp.employeeId || targetUid || '').toUpperCase();
    if (targetUid) {
      const cleanData = normalizeEmployeeProfilePayload({
        ...emp,
        id: targetUid,
        uid: targetUid,
        authUid: targetUid,
        employeeId: canonicalEmpId,
        updatedAt: new Date().toISOString()
      });
      updatePromises.push(
        safeSetDoc(doc(db, COLLECTIONS.USERS, targetUid), cleanData, { merge: true })
      );
      if (canonicalEmpId) {
        updatePromises.push(
          safeSetDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', canonicalEmpId), {
            ...cleanData,
            id: canonicalEmpId,
            authUid: targetUid,
            uid: targetUid
          }, { merge: true })
        );
      }
    }
  }

  // Purge orphaned duplicate documents from Firestore
  let purgedCount = 0;
  const masterIds = new Set(dedupedList.map(u => u.id));
  const deletePromises: Promise<any>[] = [];
  for (const dupId of duplicateDocIdsToPurge) {
    if (!masterIds.has(dupId)) {
      deletePromises.push(
        deleteDoc(doc(db, COLLECTIONS.USERS, dupId)).catch(() => {}),
        deleteDoc(doc(db, COLLECTIONS.EMPLOYEES || 'employees', dupId)).catch(() => {})
      );
      purgedCount++;
    }
  }

  await Promise.all([...updatePromises, ...deletePromises]);

  dedupedList.sort((a, b) => {
    if (a.employeeId && b.employeeId) return a.employeeId.localeCompare(b.employeeId);
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    totalScanned,
    uniqueCount: dedupedList.length,
    purgedCount,
    mergedEmployees: dedupedList
  };
}
