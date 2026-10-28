'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Edit2, 
  Trash2, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  RefreshCw, 
  X, 
  Save,
  Shield,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Printer,
  Sparkles,
  Briefcase,
  Eye,
  EyeOff,
  Copy,
  Check,
  Calculator,
  IndianRupee,
  Layers,
  ArrowRight,
  Upload,
  Download,
  ShieldCheck
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  UserDocument, 
  DepartmentDocument,
  handleFirestoreError, 
  OperationType 
} from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  writeBatch,
  onSnapshot
} from 'firebase/firestore';
import { COLLECTIONS, CLIENT_FIELDS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';
import * as XLSX from 'xlsx';
import { useDataCache } from '@/components/DataCacheContext';
import { 
  provisionUserRecord, 
  updateUserRecord, 
  safeStringIdentifier, 
  normalizeRole,
  syncEmployeesAndUsers
} from '@/lib/userService';
import {
  safeSetDoc,
  normalizeEmployeeProfilePayload,
  sanitizeFirestorePayload
} from '@/lib/firestoreSanitizer';
import { 
  ingestEmployeeSpreadsheet, 
  deduplicateEmployeeList, 
  parseAndNormalizeRole,
  executeDeduplicationSweep
} from '@/lib/employeeImportService';

const FALLBACK_ADMIN = 'jay.solarithm@gmail.com';

const STANDARD_DEPARTMENTS = [
  'Sales & Business Development',
  'Solar Engineering & Design',
  'Operations & Projects',
  'Accounts & Finance',
  'Human Resources & Admin',
  'Executive Management',
  'Field Installation & Quality'
];

export const DEFAULT_FALLBACK_DEPARTMENTS: DepartmentDocument[] = [
  {
    name: 'Sales & Business Development',
    code: 'SALES',
    availableRoles: ['sales', 'manager', 'admin'],
    description: 'Client acquisition, commercial proposals, and regional solar project partnerships.'
  },
  {
    name: 'Solar Engineering & Design',
    code: 'ENG',
    availableRoles: ['designer', 'lead designer', 'manager', 'admin'],
    description: 'PV array layout, single-line diagrams, shading simulation, and PVSyst analysis.'
  },
  {
    name: 'Operations & Projects',
    code: 'OPS',
    availableRoles: ['manager', 'admin'],
    description: 'Procurement, on-site commissioning, project timeline tracking, and client handover.'
  },
  {
    name: 'Accounts & Finance',
    code: 'FIN',
    availableRoles: ['admin', 'manager'],
    description: 'Vendor billing, payroll disbursement, tax filings, and financial reconciliations.'
  },
  {
    name: 'Human Resources & Admin',
    code: 'HR',
    availableRoles: ['admin', 'manager'],
    description: 'Talent management, employee directory, office operations, and policy compliance.'
  },
  {
    name: 'Executive Management',
    code: 'EXEC',
    availableRoles: ['owner', 'admin'],
    description: 'Strategic leadership, governance, enterprise vision, and company administration.'
  },
  {
    name: 'Field Installation & Quality',
    code: 'FIELD',
    availableRoles: ['designer', 'manager'],
    description: 'Civil structure validation, electrical cabling safety, and CEIG approvals.'
  }
];

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  sales: 'Proposals, CRM & Client Deals',
  designer: 'Solar PV & CAD Engineering',
  'lead designer': 'Senior Solar PV & CAD Engineering Oversight',
  manager: 'Department Team Lead & Oversight',
  admin: 'Personnel & Operational Administration',
  owner: 'Enterprise Ownership & Full Control',
  engineer: 'Site Quality & Commissioning',
  technician: 'Field Installation & Mounting',
  accountant: 'Financials & Payroll'
};

export function getDeptRoles(dept?: Partial<DepartmentDocument> | null): string[] {
  if (!dept) return ['sales', 'manager', 'admin', 'designer', 'lead designer', 'owner'];
  if (dept.availableRoles && Array.isArray(dept.availableRoles) && dept.availableRoles.length > 0) {
    return dept.availableRoles;
  }
  const deptName = (dept.name || '').toLowerCase();
  const fallback = DEFAULT_FALLBACK_DEPARTMENTS.find(
    d => d.name.toLowerCase() === deptName ||
         d.name.toLowerCase().includes(deptName) ||
         deptName.includes(d.name.toLowerCase()) ||
         (d.code && d.code.toLowerCase() === deptName)
  );
  if (fallback && fallback.availableRoles && fallback.availableRoles.length > 0) {
    return fallback.availableRoles;
  }
  if (deptName.includes('design') || deptName.includes('engineering') || deptName.includes('cad')) {
    return ['designer', 'lead designer', 'manager', 'admin'];
  }
  if (deptName.includes('sale') || deptName.includes('business')) {
    return ['sales', 'manager', 'admin'];
  }
  if (deptName.includes('exec') || deptName.includes('manage') || deptName.includes('director')) {
    return ['owner', 'admin', 'manager'];
  }
  return ['sales', 'manager', 'admin', 'designer', 'lead designer'];
}

interface UserManagementTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

// Safely normalize diverse date representations (DD-MM-YYYY, YYYY/MM/DD, ISO, Excel serial) to standard YYYY-MM-DD
export function normalizeDateToYMD(dateVal: any): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'number') {
    if (dateVal > 1e11) {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    if (dateVal > 30000 && dateVal < 70000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + dateVal * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }

  const str = String(dateVal).trim();
  if (!str) return '';

  // Already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // YYYY-MM-DDTHH:mm:ss...
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return str.split('T')[0];
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymd = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymd && Number(ymd[1]) > 1900) {
    const y = ymd[1];
    const m = String(ymd[2]).padStart(2, '0');
    const d = String(ymd[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) {
    const d = String(dmy[1]).padStart(2, '0');
    const m = String(dmy[2]).padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  // Fallback to JS Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

// Helper to convert number to words for Indian Rupees
function numberToWordsINR(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  }

  const rounded = Math.round(num);
  return (inWords(rounded).trim() + ' Rupees Only').replace(/\s+/g, ' ');
}

export default function UserManagementTab({ currentEmail, currentRole }: UserManagementTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageUsers = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const {
    employees: cachedEmps,
    setCachedEmployees,
    departments: cachedDepts,
    setCachedDepartments,
  } = useDataCache();

  const [users, setUsers] = useState<UserDocument[]>(() => {
    if (cachedEmps && cachedEmps.length > 0) return cachedEmps;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('employees');
        return cached ? JSON.parse(cached) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(canManageUsers && (!cachedEmps || cachedEmps.length === 0));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [revealedBankIds, setRevealedBankIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);

  // Add/Edit Employee Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingOriginalUser, setEditingOriginalUser] = useState<UserDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    employeeId: string;
    name: string;
    email: string;
    role: UserRole;
    department: string;
    designation: string;
    dateOfJoining: string;
    dateOfBirth: string;
    basicPay: string | number;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    // KYC & Personal Details
    panCardNumber: string;
    aadhaarCardNumber: string;
    houseAddress: string;
    personalEmail: string;
    personalEmailAddress: string;
    phone?: string;
  }>({
    employeeId: '',
    name: '',
    email: '',
    role: 'sales',
    department: 'Sales & Business Development',
    designation: '',
    dateOfJoining: new Date().toISOString().split('T')[0],
    dateOfBirth: '',
    basicPay: 45000,
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    panCardNumber: '',
    aadhaarCardNumber: '',
    houseAddress: '',
    personalEmail: '',
    personalEmailAddress: '',
    phone: ''
  });

  // Dynamic Departments from Firestore
  const [departmentsList, setDepartmentsList] = useState<DepartmentDocument[]>([]);

  // Delete & Wipe Modal State
  const [deleting, setDeleting] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    email?: string;
    employeeId?: string;
    collectionName?: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    email: '',
    employeeId: '',
    collectionName: 'employees'
  });
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  // Salary Generator / Payslip Modal State
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [selectedSalaryEmployee, setSelectedSalaryEmployee] = useState<UserDocument | null>(null);
  const [salaryMonth, setSalaryMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [workingDays, setWorkingDays] = useState<number>(30);
  const [daysWorked, setDaysWorked] = useState<number>(30);
  const [customHra, setCustomHra] = useState<number | ''>('');
  const [specialAllowance, setSpecialAllowance] = useState<number>(0);
  const [incentiveBonus, setIncentiveBonus] = useState<number>(0);
  const [customPf, setCustomPf] = useState<number | ''>('');
  const [profTax, setProfTax] = useState<number>(0);
  const [tdsDeduction, setTdsDeduction] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [userSnap, empSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.USERS)),
        getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => ({ forEach: () => {} } as any))
      ]);
      const userList: UserDocument[] = [];
      const empList: UserDocument[] = [];
      userSnap.forEach((docSnap) => {
        userList.push({ ...(docSnap.data() as UserDocument), id: docSnap.id });
      });
      empSnap.forEach((docSnap: any) => {
        empList.push({ ...(docSnap.data() as UserDocument), id: docSnap.id });
      });

      const { mergedEmployees } = syncEmployeesAndUsers(userList, empList);

      setUsers(mergedEmployees);
      setCachedEmployees(mergedEmployees);
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('employees', JSON.stringify(mergedEmployees));
        }
      } catch (e) {
        console.warn('Could not save employees to localStorage', e);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
      const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.USERS);
      setErrorMsg(`Failed to load employee directory: ${errInfo.error}`);
    } finally {
      setLoading(false);
    }
  }, [setCachedEmployees]);

  useEffect(() => {
    let isMounted = true;

    // Use memory cache to prevent redundant round-trips when switching tabs
    if (cachedEmps && cachedEmps.length > 0) {
      return;
    }

    const fetchUsers = async () => {
      try {
        const [userSnap, empSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.USERS)),
          getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => ({ forEach: () => {} } as any))
        ]);
        const rawList: UserDocument[] = [];
        userSnap.forEach((docSnap) => {
          rawList.push({ ...(docSnap.data() as UserDocument), id: docSnap.id });
        });
        empSnap.forEach((docSnap: any) => {
          rawList.push({ ...(docSnap.data() as UserDocument), id: docSnap.id });
        });

        const { dedupedList, duplicateDocIdsToPurge } = deduplicateEmployeeList(rawList);
        dedupedList.forEach((u) => {
          if (u.role) u.role = normalizeRole(u.role);
        });
        dedupedList.sort((a, b) => {
          if (a.employeeId && b.employeeId) {
            return a.employeeId.localeCompare(b.employeeId);
          }
          return (a.name || '').localeCompare(b.name || '');
        });

        if (isMounted) {
          setUsers(dedupedList);
          setCachedEmployees(dedupedList);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('employees', JSON.stringify(dedupedList));
            }
          } catch (e) {
            console.warn('Could not save employees to localStorage', e);
          }
        }
      } catch (err) {
        console.error('Error fetching employees:', err);
        const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.USERS);
        if (isMounted) {
          setErrorMsg(`Failed to load employee directory: ${errInfo.error}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (canManageUsers) {
      fetchUsers();
    }

    return () => {
      isMounted = false;
    };
  }, [canManageUsers, cachedEmps, setCachedEmployees]);

  // Fetch departments collection on component load and listen for real-time updates
  useEffect(() => {
    let isMounted = true;

    const fetchDepartments = async () => {
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.DEPARTMENTS));
        if (!isMounted) return;
        const list: DepartmentDocument[] = [];
        snap.forEach((docSnap) => {
          const raw = docSnap.data() as DepartmentDocument;
          list.push({
            ...raw,
            id: docSnap.id,
            availableRoles: getDeptRoles(raw)
          });
        });
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (list.length > 0) {
          setDepartmentsList(list);
        } else {
          setDepartmentsList(DEFAULT_FALLBACK_DEPARTMENTS);
        }
      } catch (err) {
        console.warn('Direct fetch of departments collection warning:', err);
        if (isMounted) {
          setDepartmentsList((prev) => (prev.length > 0 ? prev : DEFAULT_FALLBACK_DEPARTMENTS));
        }
      }
    };

    fetchDepartments();

    // Real-time updates subscription
    const unsub = onSnapshot(collection(db, COLLECTIONS.DEPARTMENTS), (snap) => {
      if (!isMounted) return;
      const list: DepartmentDocument[] = [];
      snap.forEach((docSnap) => {
        const raw = docSnap.data() as DepartmentDocument;
        list.push({
          ...raw,
          id: docSnap.id,
          availableRoles: getDeptRoles(raw)
        });
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (list.length > 0) {
        setDepartmentsList(list);
      } else {
        setDepartmentsList(DEFAULT_FALLBACK_DEPARTMENTS);
      }
    }, (err) => {
      console.warn('Snapshot listener caught:', err);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Combined department options
  const departmentOptions = useMemo(() => {
    if (departmentsList.length > 0) {
      return departmentsList.map(d => ({ name: d.name, code: d.code || '' }));
    }
    return DEFAULT_FALLBACK_DEPARTMENTS.map(d => ({ name: d.name, code: d.code || '' }));
  }, [departmentsList]);

  // Active department document for currently selected department in Employee form
  const activeDepartmentDoc = useMemo(() => {
    const selectedName = (formData.department || '').trim().toLowerCase();
    return (
      departmentsList.find(d => (d.name || '').toLowerCase() === selectedName) ||
      DEFAULT_FALLBACK_DEPARTMENTS.find(d => (d.name || '').toLowerCase() === selectedName) ||
      departmentsList[0] ||
      DEFAULT_FALLBACK_DEPARTMENTS[0]
    );
  }, [departmentsList, formData.department]);

  // Reactive available roles filtered strictly for the currently selected department
  const activeAvailableRoles = useMemo(() => {
    return getDeptRoles(activeDepartmentDoc);
  }, [activeDepartmentDoc]);

  // Reactive department change handler - automatically filters system role
  const handleDepartmentChange = (newDeptName: string) => {
    const targetDept = 
      departmentsList.find(d => (d.name || '').toLowerCase() === newDeptName.trim().toLowerCase()) ||
      DEFAULT_FALLBACK_DEPARTMENTS.find(d => (d.name || '').toLowerCase() === newDeptName.trim().toLowerCase());
    
    const allowedRoles = getDeptRoles(targetDept);
    // If current role is already allowed in this department, retain it; otherwise reset to first available role
    const newRole = allowedRoles.includes(formData.role) ? formData.role : (allowedRoles[0] || 'sales');

    setFormData(prev => ({
      ...prev,
      department: newDeptName,
      role: newRole as UserRole
    }));
  };

  // Generate next Employee ID (e.g. SOL-EMP-06)
  const generateNextEmployeeId = () => {
    const empNumbers = users
      .map(u => {
        const match = (u.employeeId || '').match(/SOL-EMP-(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n) && n > 0);

    const maxNum = empNumbers.length > 0 ? Math.max(...empNumbers) : users.length;
    const nextNum = String(maxNum + 1).padStart(2, '0');
    return `SOL-EMP-${nextNum}`;
  };

  const openAddModal = () => {
    setEditingUserId(null);
    setEditingOriginalUser(null);
    const firstDept = departmentsList.length > 0 ? departmentsList[0] : DEFAULT_FALLBACK_DEPARTMENTS[0];
    const initialDept = firstDept.name;
    const allowedRoles = getDeptRoles(firstDept);
    const initialRole = (allowedRoles[0] || 'sales') as UserRole;

    setFormData({
      employeeId: generateNextEmployeeId(),
      name: '',
      email: '',
      role: initialRole,
      department: initialDept,
      designation: 'Solar Sales Associate',
      dateOfJoining: new Date().toISOString().split('T')[0],
      dateOfBirth: '1998-01-01',
      basicPay: 0,
      bankName: 'HDFC Bank',
      accountNumber: '',
      ifscCode: '',
      panCardNumber: '',
      aadhaarCardNumber: '',
      houseAddress: '',
      personalEmail: '',
      personalEmailAddress: '',
      phone: ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserDocument) => {
    setEditingUserId(user.id || user.uid || user.employeeId || null);
    setEditingOriginalUser(user);
    const userDept = user.department || (departmentsList[0]?.name || 'Sales & Business Development');
    const targetDept = 
      departmentsList.find(d => (d.name || '').toLowerCase() === userDept.toLowerCase()) ||
      DEFAULT_FALLBACK_DEPARTMENTS.find(d => (d.name || '').toLowerCase() === userDept.toLowerCase());
    const allowedRoles = getDeptRoles(targetDept);
    const initialRole = (user.role || allowedRoles[0] || 'sales') as UserRole;

    const dojNorm = normalizeDateToYMD(user.dateOfJoining || user.doj || '');
    const dobNorm = normalizeDateToYMD(user.dateOfBirth || user.dob || '');

    const isPartnerJay = (user.name || '').toLowerCase().includes('jay shah') || (user.email || '').includes('jayshah') || (user.personalEmail || '').includes('jayjalpa') || (user.personalEmailAddress || '').includes('jayjalpa') || (user.employeeId || '').includes('JS-001');
    const isPartnerDeep = (user.name || '').toLowerCase().includes('deep davara') || (user.email || '').includes('deepdavara') || (user.personalEmail || '').includes('deepdavara') || (user.personalEmailAddress || '').includes('deepdavara') || (user.employeeId || '').includes('DD-002');
    const resolvedEmpId = isPartnerJay ? 'SDM-JS-001' : (isPartnerDeep ? 'SDM-DD-002' : (user.employeeId || `SOL-EMP-${String(users.indexOf(user) + 1).padStart(2, '0')}`));
    const persEmail = user.personalEmail || user.personalEmailAddress || '';

    setFormData({
      employeeId: resolvedEmpId,
      name: user.name || '',
      email: user.email || (user as any).officialEmail || '',
      role: initialRole,
      department: userDept,
      designation: user.designation || '',
      dateOfJoining: dojNorm,
      dateOfBirth: dobNorm,
      basicPay: user.basicPay !== undefined && user.basicPay !== null && !isNaN(Number(user.basicPay)) ? Number(user.basicPay) : 0,
      bankName: user.bankDetails?.bankName || user.bankName || '',
      accountNumber: safeStringIdentifier(user.bankDetails?.accountNumber || user.accountNumber || ''),
      ifscCode: safeStringIdentifier(user.bankDetails?.ifscCode || user.ifscCode || '').toUpperCase(),
      panCardNumber: safeStringIdentifier(user.panCardNumber || user.panNumber || '').toUpperCase(),
      aadhaarCardNumber: safeStringIdentifier(user.aadhaarCardNumber || user.aadhaarNumber || ''),
      houseAddress: user.houseAddress || '',
      personalEmail: persEmail,
      personalEmailAddress: persEmail,
      phone: safeStringIdentifier((user as any).phone || '')
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nameTrimmed = formData.name.trim();
    const emailTrimmed = formData.email.trim().toLowerCase();
    const empIdTrimmed = (formData.employeeId || generateNextEmployeeId()).trim().toUpperCase();
    const basicPayNum = Number(formData.basicPay) || 0;
    const panTrimmed = formData.panCardNumber.trim().toUpperCase();
    const aadhaarTrimmed = formData.aadhaarCardNumber.trim();
    const addressTrimmed = formData.houseAddress.trim();
    const personalEmailTrimmed = (formData.personalEmail || formData.personalEmailAddress || '').trim().toLowerCase();

    if (!nameTrimmed) {
      setFormError('Please enter the employee full name.');
      return;
    }
    if (!emailTrimmed || !emailTrimmed.includes('@')) {
      setFormError('Please enter a valid work email address.');
      return;
    }

    // Mandatory KYC Validations
    if (!panTrimmed) {
      setFormError('Validation Error: PAN Card Number is mandatory.');
      return;
    }
    if (!aadhaarTrimmed) {
      setFormError('Validation Error: Aadhaar Card Number is mandatory.');
      return;
    }
    if (!addressTrimmed) {
      setFormError('Validation Error: House Address is mandatory.');
      return;
    }
    if (!personalEmailTrimmed || !personalEmailTrimmed.includes('@')) {
      setFormError('Validation Error: A valid Personal Email Address is mandatory.');
      return;
    }

    const safeEmpId = safeStringIdentifier(empIdTrimmed).toUpperCase();
    const originalEmail = (editingOriginalUser?.email || '').trim().toLowerCase();
    const originalEmpId = (editingOriginalUser?.employeeId || '').trim().toUpperCase();

    // Validation: Unique Email Check (skip current employee)
    const emailExists = users.some((u) => {
      const uEmail = (u.email || '').toLowerCase().trim();
      const uPersonal = (u.personalEmail || u.personalEmailAddress || '').toLowerCase().trim();
      const isSelf = 
        (editingUserId && u.id === editingUserId) ||
        (editingOriginalUser && (u.id === editingOriginalUser.id || (editingOriginalUser.uid && u.uid === editingOriginalUser.uid))) ||
        (safeEmpId && (u.employeeId || '').toUpperCase() === safeEmpId) ||
        (originalEmail && uEmail === originalEmail);
      if (isSelf) return false;
      return uEmail === emailTrimmed || (uPersonal && uPersonal === emailTrimmed);
    });

    if (emailExists) {
      setFormError(`Validation Error: The email "${emailTrimmed}" is already registered to another employee.`);
      return;
    }

    // Validation: Unique Employee ID Check (skip current employee)
    const empIdExists = users.some((u) => {
      const uEmpId = (u.employeeId || '').toUpperCase().trim();
      const isSelf = 
        (editingUserId && u.id === editingUserId) ||
        (editingOriginalUser && (u.id === editingOriginalUser.id || (editingOriginalUser.uid && u.uid === editingOriginalUser.uid))) ||
        (originalEmpId && uEmpId === originalEmpId) ||
        (originalEmail && (u.email || '').toLowerCase().trim() === originalEmail);
      if (isSelf) return false;
      return uEmpId === safeEmpId;
    });

    if (empIdExists) {
      setFormError(`Validation Error: The Employee ID "${safeEmpId}" is already assigned to another employee.`);
      return;
    }

    setSubmitting(true);
    try {
      const safeAcct = safeStringIdentifier(formData.accountNumber);
      const safeIfsc = safeStringIdentifier(formData.ifscCode).toUpperCase();
      const safeBankName = formData.bankName.trim();
      const safePan = safeStringIdentifier(panTrimmed).toUpperCase();
      const safeAadhaar = safeStringIdentifier(aadhaarTrimmed);
      const safePhone = safeStringIdentifier(formData.phone);
      const canonicalRole = normalizeRole(formData.role);

      const bankDetailsObj = {
        bankName: safeBankName,
        accountNumber: safeAcct,
        ifscCode: safeIfsc
      };

      const dojNormalized = normalizeDateToYMD(formData.dateOfJoining);
      const dobNormalized = normalizeDateToYMD(formData.dateOfBirth);

      const employeePayload: Record<string, any> = {
        employeeId: safeEmpId,
        empId: safeEmpId,
        name: nameTrimmed,
        email: emailTrimmed,
        officialEmail: emailTrimmed,
        role: canonicalRole,
        department: formData.department.trim(),
        designation: formData.designation.trim(),
        phone: safePhone,
        dateOfJoining: dojNormalized,
        doj: dojNormalized,
        dateOfBirth: dobNormalized,
        dob: dobNormalized,
        basicPay: basicPayNum,
        bankName: safeBankName,
        accountNumber: safeAcct,
        ifscCode: safeIfsc,
        bankDetails: bankDetailsObj,
        panCardNumber: safePan,
        panNumber: safePan,
        aadhaarCardNumber: safeAadhaar,
        aadhaarNumber: safeAadhaar,
        houseAddress: addressTrimmed,
        personalEmailAddress: personalEmailTrimmed,
        personalEmail: personalEmailTrimmed,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      };

      if (editingUserId || editingOriginalUser) {
        // Edit Existing User: Key strictly by canonical Auth UID or Employee ID
        const existingUser = editingOriginalUser || users.find((u) => u.id === editingUserId || u.employeeId === safeEmpId);

        const isPartnerJay = 
          nameTrimmed.toLowerCase().includes('jay shah') || 
          emailTrimmed.includes('jayshah') || 
          personalEmailTrimmed.includes('jayjalpa') || 
          safeEmpId.includes('JS-001');
        const isPartnerDeep = 
          nameTrimmed.toLowerCase().includes('deep davara') || 
          emailTrimmed.includes('deepdavara') || 
          personalEmailTrimmed.includes('deepdavara') || 
          safeEmpId.includes('DD-002');

        const canonicalEmpId = isPartnerJay 
          ? 'SDM-JS-001' 
          : (isPartnerDeep ? 'SDM-DD-002' : safeEmpId);

        const isAuthUid = (id?: string | null) => Boolean(id && id.length >= 20 && !id.includes('@') && !id.includes('_') && !id.startsWith('SOL-') && !id.startsWith('SDM-'));
        const candidateAuthUid = 
          (existingUser?.uid && isAuthUid(existingUser.uid) ? existingUser.uid : null) ||
          ((existingUser as any)?.authUid && isAuthUid((existingUser as any).authUid) ? (existingUser as any).authUid : null) ||
          (existingUser?.id && isAuthUid(existingUser.id) ? existingUser.id : null);

        const canonicalUserDocId = candidateAuthUid || canonicalEmpId;

        const userRef = doc(db, COLLECTIONS.USERS, canonicalUserDocId);
        const empDocRef = doc(db, COLLECTIONS.EMPLOYEES || 'employees', canonicalEmpId);
        
        const oldDep = String(existingUser?.department || existingUser?.role || (existingUser as any)?.assignedRole || '').toLowerCase().trim();
        const newDep = formData.department.toLowerCase();
        
        const batch = writeBatch(db);

        const cleanPayload = normalizeEmployeeProfilePayload({
          ...employeePayload,
          employeeId: canonicalEmpId,
          empId: canonicalEmpId,
          id: canonicalUserDocId,
          uid: canonicalUserDocId,
          authUid: candidateAuthUid || canonicalUserDocId,
          assignedRole: canonicalRole,
          createdAt: existingUser?.createdAt || new Date().toISOString()
        });

        // 1. Dual-Collection Atomic Sync: Write to /users/{authUid || empId}
        batch.set(userRef, cleanPayload, { merge: true });
        
        // 2. Dual-Collection Atomic Sync: Write to /employees/{empId}
        batch.set(empDocRef, {
          ...cleanPayload,
          id: canonicalEmpId,
          employeeId: canonicalEmpId,
          empId: canonicalEmpId,
          authUid: candidateAuthUid || canonicalUserDocId,
          uid: candidateAuthUid || canonicalUserDocId
        }, { merge: true });

        // 3. Clean up orphaned email-slug documents to prevent ghost records resurrecting old emails
        const oldSlugsToDelete = new Set<string>();
        if (existingUser?.id && existingUser.id !== canonicalUserDocId && existingUser.id !== canonicalEmpId) {
          oldSlugsToDelete.add(existingUser.id);
        }
        if (editingUserId && editingUserId !== canonicalUserDocId && editingUserId !== canonicalEmpId) {
          oldSlugsToDelete.add(editingUserId);
        }
        if (originalEmail) {
          oldSlugsToDelete.add(originalEmail);
          oldSlugsToDelete.add(originalEmail.replace(/[@.]/g, '_'));
          oldSlugsToDelete.add(originalEmail.toLowerCase().replace(/[^a-z0-9]/g, '_'));
          oldSlugsToDelete.add(safeStringIdentifier(originalEmail));
        }
        const originalPersonal = (editingOriginalUser?.personalEmail || editingOriginalUser?.personalEmailAddress || '').trim().toLowerCase();
        if (originalPersonal) {
          oldSlugsToDelete.add(originalPersonal);
          oldSlugsToDelete.add(originalPersonal.replace(/[@.]/g, '_'));
          oldSlugsToDelete.add(originalPersonal.toLowerCase().replace(/[^a-z0-9]/g, '_'));
        }
        oldSlugsToDelete.delete(canonicalUserDocId);
        oldSlugsToDelete.delete(canonicalEmpId);

        for (const oldSlug of oldSlugsToDelete) {
          if (oldSlug && oldSlug.length > 2) {
            batch.delete(doc(db, COLLECTIONS.USERS, oldSlug));
            batch.delete(doc(db, COLLECTIONS.EMPLOYEES || 'employees', oldSlug));
          }
        }

        // 4. Update active projects and clients referencing old corporate email
        const emailChanged = Boolean(originalEmail && originalEmail !== emailTrimmed);
        if (emailChanged) {
          try {
            const pDesignerQuery = query(collection(db, COLLECTIONS.PROJECTS), where('designerEmail', '==', originalEmail));
            const pDesignerSnap = await getDocs(pDesignerQuery).catch(() => null);
            if (pDesignerSnap && !pDesignerSnap.empty) {
              pDesignerSnap.forEach(pDoc => {
                batch.update(pDoc.ref, { designerEmail: emailTrimmed });
              });
            }

            const pSalesQuery = query(collection(db, COLLECTIONS.PROJECTS), where('salesPersonEmail', '==', originalEmail));
            const pSalesSnap = await getDocs(pSalesQuery).catch(() => null);
            if (pSalesSnap && !pSalesSnap.empty) {
              pSalesSnap.forEach(pDoc => {
                batch.update(pDoc.ref, { salesPersonEmail: emailTrimmed });
              });
            }

            // Update clients referencing old email
            const cSalesQuery = query(collection(db, COLLECTIONS.CLIENTS), where(CLIENT_FIELDS.SALES_PERSON_EMAIL, '==', originalEmail));
            const cSalesSnap = await getDocs(cSalesQuery).catch(() => null);
            if (cSalesSnap && !cSalesSnap.empty) {
              cSalesSnap.forEach(cDoc => {
                batch.update(cDoc.ref, { 
                  [CLIENT_FIELDS.SALES_PERSON_EMAIL]: emailTrimmed,
                  originalSalesEmail: emailTrimmed
                });
              });
            }
          } catch (migrErr) {
            console.warn('Non-blocking project/client email reference migration warning:', migrErr);
          }
        }

        // Reassignment logic if role changed from sales
        if (oldDep.includes('sales') && !newDep.includes('sales')) {
          const clientsRef = collection(db, COLLECTIONS.CLIENTS);
          const q = query(clientsRef, where(CLIENT_FIELDS.SALES_PERSON_EMAIL, '==', originalEmail || emailTrimmed));
          const snap = await getDocs(q).catch(() => null);
          if (snap && !snap.empty) {
            snap.forEach((clientDoc) => {
              batch.update(clientDoc.ref, {
                [CLIENT_FIELDS.SALES_PERSON_EMAIL]: FALLBACK_ADMIN,
                originalSalesEmail: emailTrimmed
              });
            });
          }
        }

        await batch.commit();

        // 5. Update local state immediately so UI table reflects the new email with NO refresh required
        const updatedLocalUser: UserDocument = {
          ...(existingUser || {}),
          ...employeePayload,
          name: nameTrimmed,
          id: canonicalEmpId,
          uid: canonicalUserDocId,
          employeeId: canonicalEmpId,
          empId: canonicalEmpId,
          email: emailTrimmed,
          officialEmail: emailTrimmed,
          role: canonicalRole,
          personalEmail: personalEmailTrimmed,
          personalEmailAddress: personalEmailTrimmed,
          createdAt: existingUser?.createdAt || new Date().toISOString()
        };

        const nextUsers = users.map(u => {
          const matchesThis = 
            u.id === editingUserId || 
            (editingOriginalUser && u.id === editingOriginalUser.id) ||
            (u.employeeId && u.employeeId.toUpperCase() === canonicalEmpId) ||
            (originalEmpId && (u.employeeId || '').toUpperCase() === originalEmpId) ||
            (originalEmail && (u.email || '').toLowerCase() === originalEmail);
          return matchesThis ? updatedLocalUser : u;
        });

        setUsers(nextUsers);
        setCachedEmployees(nextUsers);

        setSuccessMsg(`Employee record "${nameTrimmed}" [${canonicalEmpId}] updated successfully.`);
      } else {
        // SEC-01: Atomic User Document Keying via canonical /users/{uid}
        await provisionUserRecord({
          ...employeePayload,
          email: emailTrimmed,
          name: nameTrimmed,
          role: canonicalRole,
          employeeId: safeEmpId,
          status: 'ACTIVE'
        });
        setSuccessMsg(`Employee "${nameTrimmed}" [${safeEmpId}] created successfully.`);
      }

      await loadUsers();
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4500);
    } catch (err: any) {
      console.error('Error saving employee:', err);
      handleFirestoreError(err, OperationType.UPDATE, 'users');
      setFormError(`Failed to save employee to server: ${err?.message || 'Please check Firestore rules and network.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (targetOrId?: UserDocument | string, collectionName: string = 'employees', label?: string) => {
    if (!targetOrId) {
      setErrorMsg("Cannot delete: Employee reference is missing.");
      return;
    }
    if (typeof targetOrId === 'object') {
      const u = targetOrId;
      setDeleteModalState({
        isOpen: true,
        id: u.id || u.employeeId || '',
        email: u.email || '',
        employeeId: u.employeeId || '',
        collectionName: 'employees',
        label: u.name || u.email || u.employeeId || 'Employee'
      });
    } else {
      const foundUser = users.find(u => u.id === targetOrId || u.employeeId === targetOrId || u.email === targetOrId);
      setDeleteModalState({
        isOpen: true,
        id: targetOrId,
        email: foundUser?.email || (targetOrId.includes('@') ? targetOrId : ''),
        employeeId: foundUser?.employeeId || '',
        collectionName: collectionName || 'employees',
        label: label || foundUser?.name || foundUser?.email || targetOrId
      });
    }
  };

  const executeDelete = async () => {
    const { id, email, employeeId, label } = deleteModalState;
    if (!id && !email && !employeeId) {
      setDeleteModalState(prev => ({ ...prev, isOpen: false }));
      return;
    }

    setDeleting(true);
    setErrorMsg(null);
    try {
      const targetId = (id || '').trim();
      const targetEmail = (email || '').trim().toLowerCase();
      const targetEmpId = (employeeId || '').trim();

      // 1. Optimistically update local state & localStorage to prevent dangling offline references
      setUsers(prev => {
        const updated = prev.filter(u => {
          const uId = (u.id || '').trim();
          const uEmail = (u.email || '').trim().toLowerCase();
          const uEmpId = (u.employeeId || '').trim();
          if (targetId && uId === targetId) return false;
          if (targetEmail && uEmail === targetEmail) return false;
          if (targetEmpId && uEmpId === targetEmpId) return false;
          return true;
        });
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('employees', JSON.stringify(updated));
          }
        } catch (e) {
          console.warn('Could not update localStorage employees cache', e);
        }
        return updated;
      });

      // 2. Reset selectedSalaryEmployee if it was the deleted employee
      setSelectedSalaryEmployee(prev => {
        if (!prev) return null;
        const isTarget = 
          (targetId && prev.id === targetId) || 
          (targetEmail && (prev.email || '').trim().toLowerCase() === targetEmail) ||
          (targetEmpId && prev.employeeId === targetEmpId);
        return isTarget ? null : prev;
      });

      // 3. Primary delete: explicitly await deleteDoc for 'employees' collection
      if (targetEmpId) {
        await deleteDoc(doc(db, 'employees', targetEmpId)).catch((e) => console.warn('Not in employees by employeeId:', e));
      }
      if (targetId) {
        await deleteDoc(doc(db, 'employees', targetId)).catch((e) => console.warn('Not in employees by targetId:', e));
        await deleteDoc(doc(db, COLLECTIONS.USERS, targetId)).catch((e) => console.warn('Not in users by targetId:', e));
      }
      if (targetEmpId && targetEmpId !== targetId) {
        await deleteDoc(doc(db, COLLECTIONS.USERS, targetEmpId)).catch((e) => console.warn('Not in users by employeeId:', e));
      }

      // 4. Deterministic key deletion (sanitized empId or email)
      const uniqueKey = (targetEmpId || targetEmail).replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
      if (uniqueKey && uniqueKey !== targetId && uniqueKey !== targetEmpId) {
        await deleteDoc(doc(db, 'employees', uniqueKey)).catch(() => {});
        await deleteDoc(doc(db, COLLECTIONS.USERS, uniqueKey)).catch(() => {});
      }

      // 5. Query and delete any remaining documents matching by email in 'employees' and 'users'
      if (targetEmail) {
        const empEmailQuery = query(collection(db, 'employees'), where('email', '==', targetEmail));
        const empSnap = await getDocs(empEmailQuery).catch(() => null);
        if (empSnap && !empSnap.empty) {
          for (const d of empSnap.docs) {
            await deleteDoc(d.ref).catch(() => {});
          }
        }

        const usersEmailQuery = query(collection(db, COLLECTIONS.USERS), where('email', '==', targetEmail));
        const userSnap = await getDocs(usersEmailQuery).catch(() => null);
        if (userSnap && !userSnap.empty) {
          for (const d of userSnap.docs) {
            await deleteDoc(d.ref).catch(() => {});
          }
        }
      }

      // 6. Clean state re-fetch directly from Firestore to confirm synchronization
      await loadUsers();

      setSuccessMsg(`Employee "${label || 'record'}" permanently deleted from database.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error deleting employee from Firestore:', err);
      handleFirestoreError(err, OperationType.DELETE, `employees/${deleteModalState.id}`);
      setErrorMsg("Failed to delete record from server. Please check permissions.");
    } finally {
      setDeleting(false);
      setDeleteModalState(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleDeleteRecord = (firstArg?: string, secondArg?: string) => {
    if (secondArg) {
      return handleDelete(secondArg, firstArg);
    }
    return handleDelete(firstArg);
  };

  const handleWipeEmployeeData = () => {
    setIsWipeModalOpen(true);
  };

  const executeWipeEmployeeData = async () => {
    setDeleting(true);
    setErrorMsg(null);
    try {
      const [userSnap, empSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.USERS)).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => ({ docs: [] } as any))
      ]);
      const deletePromises: Promise<any>[] = [];
      userSnap.docs.forEach((docSnap: any) => deletePromises.push(deleteDoc(docSnap.ref)));
      empSnap.docs.forEach((docSnap: any) => deletePromises.push(deleteDoc(docSnap.ref)));
      await Promise.all(deletePromises);

      setUsers([]);
      setSelectedSalaryEmployee(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('employees');
      }
      setSuccessMsg('All employee records in this module have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadUsers();
    } catch (err) {
      console.error('Error wiping employees:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.USERS);
      setErrorMsg('Failed to wipe employee records. Check your Firebase Security Rules.');
    } finally {
      setDeleting(false);
      setIsWipeModalOpen(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'Employee ID',
      'Full Name',
      'Official Work Email',
      'Role',
      'Department',
      'Designation',
      'Basic Monthly Pay',
      'Date of Joining (YYYY-MM-DD)',
      'Date of Birth (YYYY-MM-DD)',
      'Bank Name',
      'Account Number',
      'IFSC Code',
      'PAN Card Number',
      'Aadhaar Card Number',
      'House Address',
      'Personal Email Address'
    ];

    const sampleRow = [
      'SOL-EMP-01',
      'Aditya Sharma',
      'aditya.s@solarithm.com',
      'sales',
      'Sales & Business Development',
      'Senior Solar Solutions Consultant',
      '65000',
      '2023-04-15',
      '1994-08-22',
      'HDFC Bank',
      '50100456123490',
      'HDFC0001024',
      'ABCDE1234F',
      '123456789012',
      '"Flat 402, Green Meadows, 5th Main, Indiranagar, Bengaluru - 560038"',
      'aditya.personal@gmail.com'
    ];

    const csvContent = headers.join(',') + '\n' + sampleRow.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'solarithm_employee_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportEmployees = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value immediately so user can re-upload same file if desired
    e.target.value = '';

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Parse input file: supports .xlsx, .xls, .csv, .tsv, .txt, .json
      let rawRows: Record<string, any>[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        rawRows = list.map((item: any) => {
          const normalized: Record<string, any> = {};
          Object.keys(item).forEach((k) => {
            normalized[k.trim().toLowerCase()] = item[k];
          });
          return normalized;
        });
      } else {
        // Read via XLSX (handles binary .xlsx, .xls and text .csv, .tsv)
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setErrorMsg('Uploaded workbook contains no readable sheets.');
          return;
        }
        const worksheet = workbook.Sheets[firstSheetName];
        // DAT-01: raw: false preserves string representation of long integers without scientific notation
        const grid = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];

        if (grid.length <= 1) {
          setErrorMsg('Uploaded file is empty or contains no employee data rows.');
          return;
        }

        const headers = grid[0].map(h => String(h || '').trim().toLowerCase().replace(/^"|"$/g, ''));
        for (let i = 1; i < grid.length; i++) {
          const row = grid[i];
          if (!row || !Array.isArray(row) || !row.some(cell => cell !== '' && cell !== null && cell !== undefined)) {
            continue;
          }
          const rowObj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = row[idx] !== undefined ? row[idx] : '';
          });
          rawRows.push(rowObj);
        }
      }

      if (rawRows.length === 0) {
        setErrorMsg('No valid employee records found in the uploaded file.');
        return;
      }

      // 2. Execute strict upsert, deduplication, and role mapping workflow
      const { updatedCount, insertedCount, purgedDuplicatesCount, finalEmployees } = 
        await ingestEmployeeSpreadsheet(rawRows);

      setUsers(finalEmployees);
      setCachedEmployees(finalEmployees);
      if (typeof window !== 'undefined') {
        localStorage.setItem('employees', JSON.stringify(finalEmployees));
      }

      const dupMessage = purgedDuplicatesCount > 0 ? `, ${purgedDuplicatesCount} duplicate record(s) merged & cleaned` : '';
      setSuccessMsg(
        `Import complete: ${updatedCount} existing employee(s) updated, ${insertedCount} new employee(s) added${dupMessage}. All system roles and permissions were preserved.`
      );
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      console.error('Error importing employees:', err);
      setErrorMsg('Failed to parse and import employee file.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeduplicateSweep = async () => {
    setSweeping(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await executeDeduplicationSweep();
      setUsers(result.mergedEmployees);
      setCachedEmployees(result.mergedEmployees);
      if (typeof window !== 'undefined') {
        localStorage.setItem('employees', JSON.stringify(result.mergedEmployees));
      }
      setSuccessMsg(
        `Deduplication sweep completed: Scanned ${result.totalScanned} records, consolidated into ${result.uniqueCount} verified employee profiles, and purged ${result.purgedCount} duplicate documents.`
      );
      setTimeout(() => setSuccessMsg(null), 8000);
    } catch (err) {
      console.error('Error during deduplication sweep:', err);
      setErrorMsg('Failed to run deduplication sweep on directory.');
    } finally {
      setSweeping(false);
    }
  };

  // Open Salary Slip Generator for an employee
  const openSalaryGenerator = (employee?: UserDocument) => {
    const target = employee || users[0] || null;
    setSelectedSalaryEmployee(target);
    setCustomHra('');
    setCustomPf('');
    setSpecialAllowance(0);
    setIncentiveBonus(0);
    setProfTax(0);
    setTdsDeduction(0);
    setOtherDeductions(0);
    setWorkingDays(30);
    setDaysWorked(30);
    setIsSalaryModalOpen(true);
  };

  const toggleRevealBank = (id: string) => {
    setRevealedBankIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered and searched employee records
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.employeeId || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.designation || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q) ||
        (u.bankName || u.bankDetails?.bankName || '').toLowerCase().includes(q)
      );

      const matchesDept = selectedDeptFilter === 'ALL' || (u.department || '').toLowerCase().includes(selectedDeptFilter.toLowerCase());
      return matchesSearch && matchesDept;
    });
  }, [users, searchQuery, selectedDeptFilter]);

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalPayroll = users.reduce((acc, u) => acc + (Number(u.basicPay) || 0), 0);
    const uniqueDepts = new Set(users.map(u => u.department).filter(Boolean));
    return {
      totalEmployees: users.length,
      totalPayroll,
      activeDepts: uniqueDepts.size
    };
  }, [users]);

  // Salary Calculations for Selected Employee
  const salaryCalculations = useMemo(() => {
    if (!selectedSalaryEmployee) {
      return {
        basic: 0,
        hra: 0,
        specialAllowance: 0,
        incentive: 0,
        gross: 0,
        pf: 0,
        pt: 0,
        tds: 0,
        otherDed: 0,
        totalDeductions: 0,
        netPayable: 0,
        payableInWords: 'Zero Rupees Only'
      };
    }

    const rawBasic = selectedSalaryEmployee.basicPay !== undefined && selectedSalaryEmployee.basicPay !== null && !isNaN(Number(selectedSalaryEmployee.basicPay))
      ? Math.max(0, Number(selectedSalaryEmployee.basicPay))
      : 0;
    // Prorated basic based on attendance
    const attendanceFactor = workingDays > 0 ? Math.min(1, Math.max(0, daysWorked / workingDays)) : 1;
    const basic = Math.round(rawBasic * attendanceFactor);

    // HRA (only if explicitly entered, no auto-injected 40%)
    const hra = customHra !== '' && !isNaN(Number(customHra)) ? Math.max(0, Number(customHra)) : 0;
    const specAllow = Number(specialAllowance) || 0;
    const bonus = Number(incentiveBonus) || 0;
    const gross = basic + hra + specAllow + bonus;

    // Deductions (only if explicitly entered or configured)
    const pf = customPf !== '' && !isNaN(Number(customPf)) ? Math.max(0, Number(customPf)) : 0;
    const pt = Number(profTax) || 0;
    const tds = Number(tdsDeduction) || 0;
    const other = Number(otherDeductions) || 0;
    const totalDeductions = pf + pt + tds + other;

    const netPayable = Math.max(0, gross - totalDeductions);
    const payableInWords = netPayable === 0 ? 'Zero Rupees Only' : numberToWordsINR(netPayable);

    return {
      basic,
      hra,
      specialAllowance: specAllow,
      incentive: bonus,
      gross,
      pf,
      pt,
      tds,
      otherDed: other,
      totalDeductions,
      netPayable,
      payableInWords
    };
  }, [selectedSalaryEmployee, workingDays, daysWorked, customHra, specialAllowance, incentiveBonus, customPf, profTax, tdsDeduction, otherDeductions]);

  const getRoleBadgeStyle = (r: UserRole) => {
    const roleNormalized = String(r || '').toLowerCase().replace(/[\s-]/g, '_');
    switch (roleNormalized) {
      case 'owner':
        return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400 font-bold';
      case 'admin':
        return 'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/80 dark:border-purple-500/60 dark:text-purple-300 font-bold';
      case 'lead_sales':
        return 'bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-500/15 dark:border-teal-500/40 dark:text-teal-300 font-bold';
      case 'sales':
        return 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 font-semibold';
      case 'lead_designer':
        return 'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-500/15 dark:border-indigo-500/40 dark:text-indigo-300 font-bold';
      case 'designer':
        return 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-400 font-semibold';
      case 'manager':
        return 'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-300 font-semibold';
      case 'engineer':
        return 'bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-300 font-medium';
      case 'technician':
        return 'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-300 font-medium';
      case 'accountant':
        return 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 font-medium';
      case 'employee':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-gray-500/10 dark:border-gray-500/30 dark:text-gray-200 font-medium';
    }
  };

  if (!canManageUsers) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Employee Administration</span> module is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
          </p>
          <div className="pt-2 text-sm text-gray-500 font-mono">
            Your logged in role: <span className="uppercase font-bold text-white">{currentRole}</span> ({currentEmail})
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 w-full max-w-full">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Employee Administration Console
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Employee Directory
          </h2>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            Central repository for employee credentials, designations, and bank disbursement records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <input
            type="file"
            id="employee-import-input"
            className="hidden"
            accept=".csv,.xlsx,.xls,.json"
            onChange={handleImportEmployees}
          />

          <button
            onClick={loadUsers}
            disabled={loading}
            className="px-3.5 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleDeduplicateSweep}
            disabled={sweeping || loading}
            className="px-3.5 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-amber-500/40 text-amber-400 hover:text-amber-300 font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            title="Scan existing records for duplicates (by ID, PAN, Email, Name) and merge into single primary documents"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${sweeping ? 'animate-spin' : ''}`} />
            {sweeping ? 'Cleaning...' : 'Clean Duplicate Records'}
          </button>

          <button
            onClick={handleWipeEmployeeData}
            disabled={deleting}
            className="px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all employee records"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe Employee Test Data
          </button>

          <button
            onClick={() => document.getElementById('employee-import-input')?.click()}
            disabled={submitting}
            className="px-3.5 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV / Excel
          </button>

          <button
            onClick={handleDownloadTemplate}
            type="button"
            className="px-3.5 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] hover:border-[#D4AF37]/50 text-gray-200 hover:text-[#D4AF37] font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Download CSV template with required headers including KYC fields"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            Download Template
          </button>

          <button
            onClick={() => openSalaryGenerator()}
            className="px-3.5 sm:px-4 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#D4AF37]/40 text-[#D4AF37] hover:text-white font-semibold text-sm rounded-lg transition-all flex items-center gap-2 shadow-md cursor-pointer"
          >
            <Calculator className="w-4 h-4 text-[#D4AF37]" />
            Salary Generator & Payslips
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center gap-2 shadow-lg shadow-[#D4AF37]/10 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add New Employee
          </button>
        </div>
      </div>

      {/* Metrics Quick Stats Strip - Scaled for 1 col mobile, 2 cols tablet/desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Total Headcount</span>
            <div className="text-2xl font-bold text-white mt-0.5">{stats.totalEmployees}</div>
            <span className="text-xs text-emerald-400 font-medium">Active Personnel</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#D4AF37]">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Active Departments</span>
            <div className="text-2xl font-bold text-white mt-0.5">{stats.activeDepts}</div>
            <span className="text-xs text-gray-400 font-medium">Functional Units</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Directory Search & Filter Controls */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, name, email, designation, or bank..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#161B22] border border-[#30363D] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400 uppercase">Department:</span>
            <select
              value={selectedDeptFilter}
              onChange={(e) => setSelectedDeptFilter(e.target.value)}
              className="bg-[#161B22] border border-[#30363D] text-white text-xs font-mono px-3 py-2 rounded-lg focus:outline-none focus:border-[#D4AF37] cursor-pointer"
            >
              <option value="ALL">All Departments ({users.length})</option>
              {departmentOptions.map((dept) => (
                <option key={dept.name} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-700 dark:text-gray-400 font-mono bg-slate-100 dark:bg-[#161B22] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#30363D]">
            Showing <span className="font-bold text-slate-900 dark:text-white">{filteredUsers.length}</span> of {users.length} Records
          </div>
        </div>
      </div>

      {/* Main Employees Directory Table View */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading data from server...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-2">
            <p>No matching employee records found.</p>
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSelectedDeptFilter('ALL'); }}
                className="text-[#D4AF37] underline hover:text-white cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className="w-full overflow-x-auto whitespace-nowrap">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-xs uppercase font-semibold tracking-wider">
                <tr>
                  <th className="p-3.5 pl-6">Employee ID</th>
                  <th className="p-3.5">Name & Email</th>
                  <th className="p-3.5">Department & Designation</th>
                  <th className="p-3.5">KYC & Identity</th>
                  <th className="p-3.5">DOJ / DOB</th>
                  <th className="p-3.5">Basic Pay</th>
                  <th className="p-3.5">Bank Details</th>
                  <th className="p-3.5">System Role</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {filteredUsers.map((u, idx) => {
                  const isCurrentLoggedIn = (u.email || '').toLowerCase() === currentEmail.toLowerCase();
                  const isPartnerJay = (u.name || '').toLowerCase().includes('jay shah') || (u.email || '').includes('jayshah') || (u.personalEmail || '').includes('jayjalpa') || (u.personalEmailAddress || '').includes('jayjalpa') || (u.employeeId || '').includes('JS-001');
                  const isPartnerDeep = (u.name || '').toLowerCase().includes('deep davara') || (u.email || '').includes('deepdavara') || (u.personalEmail || '').includes('deepdavara') || (u.personalEmailAddress || '').includes('deepdavara') || (u.employeeId || '').includes('DD-002');
                  const empId = isPartnerJay ? 'SDM-JS-001' : (isPartnerDeep ? 'SDM-DD-002' : (u.employeeId || `SOL-EMP-${String(idx + 1).padStart(2, '0')}`));
                  const bankName = u.bankDetails?.bankName || u.bankName || '';
                  const rawAcc = u.bankDetails?.accountNumber || u.accountNumber || '';
                  const ifsc = u.bankDetails?.ifscCode || u.ifscCode || '';
                  const hasBankDetails = Boolean(bankName || rawAcc || ifsc);
                  const maskedAcc = rawAcc.length > 4 ? `••••${rawAcc.slice(-4)}` : (rawAcc || 'N/A');
                  const basicPayVal = Number(u.basicPay) || 0;
                  const panVal = u.panCardNumber || u.panNumber || '';
                  const aadhaarVal = u.aadhaarCardNumber || u.aadhaarNumber || '';
                  const personalMailVal = u.personalEmailAddress || u.personalEmail || '';

                  return (
                    <tr key={u.id || u.email || idx} className="hover:bg-slate-100/90 dark:hover:bg-white/5 transition-colors group">
                      {/* Employee ID */}
                      <td className="p-3.5 pl-6">
                        <span className="text-sm font-semibold text-[#D4AF37]">
                          {empId}
                        </span>
                      </td>

                      {/* Name & Work Email */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                            {u.name}
                            {isCurrentLoggedIn && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{u.email}</div>
                          {personalMailVal && (
                            <div className="text-[11px] text-gray-500 font-sans truncate max-w-[200px]" title={personalMailVal}>
                              Personal: {personalMailVal}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Department & Designation */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-200">
                            {u.designation || 'Solar Professional'}
                          </span>
                          <span className="text-xs text-gray-400 mt-0.5">
                            {u.department || 'General'}
                          </span>
                        </div>
                      </td>

                      {/* KYC & Identity */}
                      <td className="p-3.5 text-xs font-mono">
                        <div className="flex flex-col space-y-0.5">
                          <div className="flex items-center gap-1.5 text-gray-300">
                            <span className="text-[10px] uppercase font-bold text-gray-500">PAN:</span>
                            <span className={panVal ? "font-bold text-amber-300 tracking-wider" : "text-gray-500 font-normal"}>
                              {panVal || 'Pending'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="text-[10px] uppercase font-bold text-gray-500">UID:</span>
                            <span className={aadhaarVal ? "text-gray-300" : "text-gray-500"}>
                              {aadhaarVal ? (
                                aadhaarVal.length > 4 ? `•••• ${aadhaarVal.slice(-4)}` : aadhaarVal
                              ) : 'Pending'}
                            </span>
                          </div>
                          {u.houseAddress && (
                            <div className="text-[10px] text-gray-500 font-sans truncate max-w-[140px]" title={u.houseAddress}>
                              {u.houseAddress}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* DOJ & DOB */}
                      <td className="p-3.5 text-xs">
                        <div className="text-gray-200">
                          <span className="text-gray-400">DOJ:</span> {u.dateOfJoining || u.doj || 'N/A'}
                        </div>
                        {(u.dateOfBirth || u.dob) && (
                          <div className="text-gray-400 mt-0.5">
                            <span className="text-gray-500">DOB:</span> {u.dateOfBirth || u.dob}
                          </div>
                        )}
                      </td>

                      {/* Basic Pay */}
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <div className="text-sm font-semibold text-white">
                            ₹{basicPayVal.toLocaleString('en-IN')}
                          </div>
                          <span className="text-xs text-gray-400 mt-0.5">Per Month</span>
                        </div>
                      </td>

                      {/* Bank Details */}
                      <td className="p-3.5">
                        {!hasBankDetails ? (
                          <span className="text-xs text-gray-500">Not Set</span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-200">
                              {bankName || 'Bank Account'}
                            </span>
                            <span className="text-xs text-gray-400 mt-0.5">
                              A/C: {maskedAcc} • IFSC: {ifsc || 'N/A'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* System Role */}
                      <td className="p-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${getRoleBadgeStyle(u.role)}`}>
                            {normalizeRole(u.role)}
                          </span>
                          {(normalizeRole(u.role) === 'OWNER' || String(u.role || '').toUpperCase() === 'OWNER') && (
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm"
                              title="Executive Partner eligible for solar design engineering assignments"
                            >
                              <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                              DESIGNER ELIGIBLE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openSalaryGenerator(u)}
                            title="Generate Salary Slip & Compensation Preview"
                            className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37] text-[#D4AF37] text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Payslip</span>
                          </button>

                          <button
                            onClick={() => openEditModal(u)}
                            title="Edit Employee Details"
                            className="p-1.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37] text-gray-200 hover:text-[#D4AF37] rounded-lg transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(u)}
                            disabled={deleting}
                            title="Delete Employee"
                            className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Employee Administrative Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#333333] rounded-xl p-4 sm:p-6 md:p-8 space-y-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A2A2A]">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-[#B38728] dark:text-[#D4AF37]" />
                  {editingUserId ? 'Edit Employee Profile' : 'New Employee Registration'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Complete official credentials, designation, compensation, and disbursement banking details.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-5">
              {/* Section 1: Basic Identity */}
              <div className="space-y-3">
                <div className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> 1. Personnel Identification
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Employee ID *
                    </label>
                    <input
                      type="text"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value.toUpperCase() })}
                      placeholder="SOL-EMP-01"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Dana Designer"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Official Work Email *
                    </label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="e.g. designer@solarithm.com"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Official Designation *
                    </label>
                    <input
                      type="text"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="e.g. Lead Solar PV Engineer"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Department & Role Access */}
              <div className="space-y-3 pt-2 border-t border-[#2A2A2A]">
                <div className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> 2. Department & System Role Access
                  </span>
                  <span className="text-[11px] text-gray-400 font-normal">
                    Roles react dynamically to selected department
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Dynamic Department Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Department *
                      </label>
                      <span className="text-[10px] font-mono text-[#D4AF37]">
                        {departmentsList.length} Available
                      </span>
                    </div>
                    <select
                      id="employee-form-department"
                      value={formData.department}
                      onChange={(e) => handleDepartmentChange(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="" disabled>-- Select Department --</option>
                      {formData.department && !departmentsList.some(d => d.name.toLowerCase() === formData.department.toLowerCase()) && (
                        <option value={formData.department}>{formData.department} (Current)</option>
                      )}
                      {departmentsList.map((dept) => (
                        <option key={dept.id || dept.name} value={dept.name}>
                          {dept.name} {dept.code ? `(${dept.code})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Configured in Organization Departments
                    </p>
                  </div>

                  {/* Reactive System Role Dropdown */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Assigned System Role *
                      </label>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {activeAvailableRoles.length} mapped role{activeAvailableRoles.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <select
                      id="employee-form-role"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all"
                    >
                      {!activeAvailableRoles.includes(formData.role) && (
                        <option value={formData.role}>
                          {formData.role} (Current assigned)
                        </option>
                      )}
                      {activeAvailableRoles.map((roleKey) => (
                        <option key={roleKey} value={roleKey}>
                          {roleKey} {ROLE_DESCRIPTIONS[roleKey] ? `- ${ROLE_DESCRIPTIONS[roleKey]}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-amber-400 font-mono mt-1 truncate">
                      ⚡ Filtered to: {activeAvailableRoles.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Date of Joining (DOJ)
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfJoining}
                      onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Date of Birth (DOB)
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Basic Monthly Pay (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={formData.basicPay}
                      onChange={(e) => setFormData({ ...formData, basicPay: e.target.value })}
                      placeholder="50000"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono font-bold text-amber-300 focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: KYC & Personal Details */}
              <div className="space-y-3 pt-2 border-t border-[#2A2A2A]">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> 3. KYC & Personal Details
                  </div>
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded font-mono font-medium">
                    Mandatory Compliance
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      PAN Card Number *
                    </label>
                    <input
                      type="text"
                      value={formData.panCardNumber}
                      onChange={(e) => setFormData({ ...formData, panCardNumber: e.target.value.toUpperCase() })}
                      placeholder="e.g. ABCDE1234F"
                      required
                      maxLength={10}
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono uppercase focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Aadhaar Card Number *
                    </label>
                    <input
                      type="text"
                      value={formData.aadhaarCardNumber}
                      onChange={(e) => setFormData({ ...formData, aadhaarCardNumber: e.target.value })}
                      placeholder="e.g. 12-digit Aadhaar Number"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Personal Email Address *
                    </label>
                    <input
                      type="email"
                      value={formData.personalEmail || formData.personalEmailAddress || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        personalEmail: e.target.value.toLowerCase(), 
                        personalEmailAddress: e.target.value.toLowerCase() 
                      })}
                      placeholder="e.g. employee.personal@gmail.com"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      House Address *
                    </label>
                    <input
                      type="text"
                      value={formData.houseAddress}
                      onChange={(e) => setFormData({ ...formData, houseAddress: e.target.value })}
                      placeholder="e.g. Flat 402, Green Meadows, Bengaluru"
                      required
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Bank Details */}
              <div className="space-y-3 pt-2 border-t border-[#2A2A2A]">
                <div className="text-xs font-mono text-[#D4AF37] uppercase tracking-wider font-bold flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> 4. Banking & Salary Disbursement Details
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="e.g. HDFC Bank"
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\s+/g, '') })}
                      placeholder="e.g. 50100456123490"
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1 uppercase tracking-wider">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={formData.ifscCode}
                      onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. HDFC0001024"
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono uppercase focus:outline-none transition-all placeholder:text-gray-500"
                    />
                  </div>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-[#2A2A2A]">
                {editingUserId ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      const userToDelete = users.find(u => u.id === editingUserId) || {
                        id: editingUserId,
                        name: formData.name,
                        email: formData.email,
                        employeeId: formData.employeeId
                      };
                      setIsModalOpen(false);
                      handleDelete(userToDelete as UserDocument);
                    }}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-400 text-rose-400 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                    title="Permanently Delete Employee"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Employee
                  </button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-[#161B22] hover:bg-[#2A2A2A] border border-[#30363D] rounded-lg text-sm font-medium text-gray-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/10"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingUserId ? 'Save Changes' : 'Register Employee'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Generator & Printable Payslip Modal */}
      {isSalaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#333333] rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl relative my-6 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-[#2A2A2A] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#D4AF37]">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Solarithm Salary Generator & <span className="text-[#B38728] dark:text-[#D4AF37]">Payslip Engine</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    Live calculation and printable A4 salary slip synced directly from employee directory records.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSalaryModalOpen(false)}
                className="text-gray-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Two Columns (Controls + Live Preview) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1">
              {/* Left Column: Payroll Parameters */}
              <div className="lg:col-span-5 space-y-4">
                {/* Employee Selector */}
                <div className="bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-xl p-4 space-y-3">
                  <label className="block text-xs font-mono text-[#B38728] dark:text-[#D4AF37] uppercase font-bold">
                    Select Employee
                  </label>
                  <select
                    value={selectedSalaryEmployee?.id || ''}
                    onChange={(e) => {
                      const emp = users.find(u => u.id === e.target.value);
                      if (emp) {
                        setSelectedSalaryEmployee(emp);
                        setCustomHra('');
                        setCustomPf('');
                        setSpecialAllowance(0);
                        setIncentiveBonus(0);
                        setProfTax(0);
                        setTdsDeduction(0);
                        setOtherDeductions(0);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded-lg text-sm font-semibold focus:outline-none focus:border-[#D4AF37]"
                  >
                    {users.length === 0 ? (
                      <option value="">No active employees in directory</option>
                    ) : (
                      users.map((u, idx) => (
                        <option key={u.id || idx} value={u.id}>
                          {u.employeeId || `SOL-EMP-${idx+1}`} — {u.name} ({u.designation || u.department || 'Staff'})
                        </option>
                      ))
                    )}
                  </select>

                  {selectedSalaryEmployee && (
                    <div className="pt-2 border-t border-slate-200 dark:border-[#2A2A2A] text-xs space-y-1 text-slate-600 dark:text-gray-400 font-mono">
                      <div><span className="text-slate-500 dark:text-gray-500">Designation:</span> <span className="text-slate-800 dark:text-gray-200">{selectedSalaryEmployee.designation || 'Specialist'}</span></div>
                      <div><span className="text-slate-500 dark:text-gray-500">Department:</span> <span className="text-slate-800 dark:text-gray-200">{selectedSalaryEmployee.department}</span></div>
                      <div><span className="text-slate-500 dark:text-gray-500">Bank:</span> <span className="text-slate-800 dark:text-gray-200">{selectedSalaryEmployee.bankName || selectedSalaryEmployee.bankDetails?.bankName || 'HDFC'}</span> (A/C: {selectedSalaryEmployee.accountNumber || selectedSalaryEmployee.bankDetails?.accountNumber || 'N/A'})</div>
                      <div><span className="text-slate-500 dark:text-gray-500">Base Pay:</span> <span className="text-[#B38728] dark:text-[#D4AF37] font-bold">₹{Number(selectedSalaryEmployee.basicPay || 0).toLocaleString('en-IN')}</span></div>
                    </div>
                  )}
                </div>

                {/* Period & Attendance */}
                <div className="bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-xl p-4 space-y-3">
                  <span className="block text-xs font-mono text-[#B38728] dark:text-[#D4AF37] uppercase font-bold">
                    Salary Period & Attendance
                  </span>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3">
                      <label className="block text-[11px] text-slate-600 dark:text-gray-400 mb-1">Pay Period (Month/Year)</label>
                      <input
                        type="month"
                        value={salaryMonth}
                        onChange={(e) => setSalaryMonth(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded-lg text-xs font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-600 dark:text-gray-400 mb-1">Total Days</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={workingDays}
                        onChange={(e) => setWorkingDays(Number(e.target.value) || 30)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[11px] text-slate-600 dark:text-gray-400 mb-1">Paid / Worked Days</label>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        value={daysWorked}
                        onChange={(e) => setDaysWorked(Number(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Allowances & Deductions Adjustments */}
                <div className="bg-slate-50 dark:bg-[#161B22] border border-slate-200 dark:border-[#30363D] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="block text-xs font-mono text-[#B38728] dark:text-[#D4AF37] uppercase font-bold">
                      Allowances & Deductions (₹)
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">
                      Overrides
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">House Rent (HRA)</label>
                      <input
                        type="number"
                        min="0"
                        value={customHra}
                        placeholder="0"
                        onChange={(e) => setCustomHra(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">Special Allowance</label>
                      <input
                        type="number"
                        min="0"
                        value={specialAllowance || ''}
                        placeholder="0"
                        onChange={(e) => setSpecialAllowance(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">Performance Bonus</label>
                      <input
                        type="number"
                        min="0"
                        value={incentiveBonus || ''}
                        placeholder="0"
                        onChange={(e) => setIncentiveBonus(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">Provident Fund (PF)</label>
                      <input
                        type="number"
                        min="0"
                        value={customPf}
                        placeholder="0"
                        onChange={(e) => setCustomPf(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">Prof. Tax (PT)</label>
                      <input
                        type="number"
                        min="0"
                        value={profTax || ''}
                        placeholder="0"
                        onChange={(e) => setProfTax(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">TDS / Income Tax</label>
                      <input
                        type="number"
                        min="0"
                        value={tdsDeduction || ''}
                        placeholder="0"
                        onChange={(e) => setTdsDeduction(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-slate-600 dark:text-gray-400 mb-0.5">Other Deductions</label>
                      <input
                        type="number"
                        min="0"
                        value={otherDeductions || ''}
                        placeholder="0"
                        onChange={(e) => setOtherDeductions(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2.5 py-1 bg-white dark:bg-[#1E1E1E] border border-slate-300 dark:border-[#30363D] text-slate-900 dark:text-white rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: High Fidelity Printable A4 Payslip Document */}
              <div className="lg:col-span-7 bg-white text-black p-6 rounded-xl shadow-2xl flex flex-col justify-between border border-gray-300 font-sans" id="printable-payslip">
                <div>
                  {/* Company Letterhead */}
                  <div className="flex items-center justify-between border-b-2 border-[#D4AF37] pb-3">
                    <div>
                      <div className="text-xl font-black tracking-tight text-gray-900">
                        SOLARITHM <span className="text-[#B38728]">ENERGY</span>
                      </div>
                      <div className="text-[10px] text-gray-600 font-medium">
                        Solar Engineering, Turnkey Solutions & Administrative Services
                      </div>
                      <div className="text-[9px] text-gray-500 font-mono">
                        CIN: U40106GJ2022PTC128910 | support@solarithm.com
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block bg-gray-900 text-[#D4AF37] text-xs font-bold font-mono px-2.5 py-1 rounded">
                        PAYSLIP
                      </span>
                      <div className="text-[11px] font-bold text-gray-800 mt-1">
                        Period: {salaryMonth}
                      </div>
                    </div>
                  </div>

                  {/* Employee Details Matrix */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 my-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                    <div>
                      <span className="text-gray-500 font-medium">Employee Name:</span>{' '}
                      <span className="font-bold text-gray-900">{selectedSalaryEmployee?.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Employee ID:</span>{' '}
                      <span className="font-bold font-mono text-gray-900">{selectedSalaryEmployee?.employeeId || 'SOL-EMP-01'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Designation:</span>{' '}
                      <span className="font-semibold text-gray-800">{selectedSalaryEmployee?.designation || 'Specialist'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Department:</span>{' '}
                      <span className="font-semibold text-gray-800">{selectedSalaryEmployee?.department || 'Operations'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Date of Joining:</span>{' '}
                      <span className="font-mono text-gray-800">{selectedSalaryEmployee?.dateOfJoining || selectedSalaryEmployee?.doj || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Paid Days:</span>{' '}
                      <span className="font-mono font-bold text-gray-900">{daysWorked} / {workingDays}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Bank Name:</span>{' '}
                      <span className="text-gray-800 font-medium">{selectedSalaryEmployee?.bankName || selectedSalaryEmployee?.bankDetails?.bankName || 'HDFC Bank'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">A/C Number:</span>{' '}
                      <span className="font-mono text-gray-800">{selectedSalaryEmployee?.accountNumber || selectedSalaryEmployee?.bankDetails?.accountNumber || '••••••••••'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">PAN Number:</span>{' '}
                      <span className="font-mono font-bold text-gray-900">{selectedSalaryEmployee?.panCardNumber || selectedSalaryEmployee?.panNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Personal Email:</span>{' '}
                      <span className="text-gray-800 font-mono text-[11px] truncate">{selectedSalaryEmployee?.personalEmailAddress || selectedSalaryEmployee?.personalEmail || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Earnings vs Deductions Table */}
                  <div className="border border-gray-300 rounded-lg overflow-hidden text-xs">
                    <div className="grid grid-cols-2 bg-gray-800 text-white font-bold text-[11px] p-2">
                      <div className="pl-2">EARNINGS & ALLOWANCES</div>
                      <div className="pl-2 border-l border-gray-700">DEDUCTIONS & TAXES</div>
                    </div>

                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      {/* Left: Earnings */}
                      <div className="p-2 space-y-1">
                        <div className="flex justify-between py-0.5">
                          <span className="text-gray-600">Basic Pay</span>
                          <span className="font-mono font-semibold">₹{salaryCalculations.basic.toLocaleString('en-IN')}</span>
                        </div>
                        {salaryCalculations.hra > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">House Rent Allowance (HRA)</span>
                            <span className="font-mono font-semibold">₹{salaryCalculations.hra.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.specialAllowance > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">Special Allowance</span>
                            <span className="font-mono font-semibold">₹{salaryCalculations.specialAllowance.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.incentive > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">Performance Incentive</span>
                            <span className="font-mono font-semibold">₹{salaryCalculations.incentive.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Deductions */}
                      <div className="p-2 space-y-1">
                        {salaryCalculations.pf > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">Provident Fund (PF)</span>
                            <span className="font-mono font-semibold text-rose-700">₹{salaryCalculations.pf.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.pt > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">Professional Tax (PT)</span>
                            <span className="font-mono font-semibold text-rose-700">₹{salaryCalculations.pt.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.tds > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">TDS / Income Tax</span>
                            <span className="font-mono font-semibold text-rose-700">₹{salaryCalculations.tds.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.otherDed > 0 && (
                          <div className="flex justify-between py-0.5">
                            <span className="text-gray-600">Other Deductions</span>
                            <span className="font-mono font-semibold text-rose-700">₹{salaryCalculations.otherDed.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {salaryCalculations.totalDeductions === 0 && (
                          <div className="text-gray-400 italic text-[11px] py-1 text-center">
                            No deductions applied
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Subtotals */}
                    <div className="grid grid-cols-2 bg-gray-100 font-bold p-2 border-t border-gray-300">
                      <div className="flex justify-between pr-2">
                        <span>Total Gross Pay:</span>
                        <span className="font-mono text-emerald-800">₹{salaryCalculations.gross.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between pl-2 border-l border-gray-300">
                        <span>Total Deductions:</span>
                        <span className="font-mono text-rose-800">₹{salaryCalculations.totalDeductions.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Salary Callout */}
                  <div className="my-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">NET SALARY PAYABLE</div>
                      <div className="text-xs text-gray-700 font-medium italic mt-0.5">
                        {salaryCalculations.payableInWords}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-amber-950 font-mono">
                        ₹{salaryCalculations.netPayable.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Disclaimers & Signature */}
                <div className="pt-4 border-t border-gray-200 text-[10px] text-gray-500 flex items-end justify-between">
                  <div>
                    <p>This is a computer generated document and does not require physical stamp.</p>
                    <p className="font-mono text-[9px] text-gray-400 mt-0.5">Solarithm HRMS • Certified Payroll Engine</p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-800">Solarithm Energy Pvt Ltd</div>
                    <div className="text-[9px] text-gray-500">Authorized Signatory</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-[#2A2A2A] shrink-0">
              <div className="text-xs text-slate-500 dark:text-gray-400 font-mono">
                Employee: <span className="text-slate-900 dark:text-white font-bold">{selectedSalaryEmployee?.name}</span> | Net: <span className="text-[#B38728] dark:text-[#D4AF37] font-bold">₹{salaryCalculations.netPayable.toLocaleString('en-IN')}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const text = `Solarithm Payslip Summary (${salaryMonth})\nEmployee: ${selectedSalaryEmployee?.name} (${selectedSalaryEmployee?.employeeId})\nDesignation: ${selectedSalaryEmployee?.designation}\nBasic: ₹${salaryCalculations.basic}\nGross Earnings: ₹${salaryCalculations.gross}\nTotal Deductions: ₹${salaryCalculations.totalDeductions}\nNet Take-Home: ₹${salaryCalculations.netPayable}\nBank: ${selectedSalaryEmployee?.bankName} (A/C: ${selectedSalaryEmployee?.accountNumber})`;
                    copyToClipboard(text, 'salary-summary');
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#161B22] dark:hover:bg-[#2A2A2A] border border-slate-300 dark:border-[#30363D] text-slate-700 dark:text-gray-300 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === 'salary-summary' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === 'salary-summary' ? 'Copied' : 'Copy Summary'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (printErr) {
                      console.warn('Sandbox print guard caught SecurityError:', printErr);
                    }
                  }}
                  className="px-5 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-xs rounded-lg hover:brightness-110 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/10 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Export PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Custom Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={executeDelete}
        title="Delete Employee"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete employee "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this employee record? This action cannot be undone.'
        }
        confirmText="Delete Employee"
        variant="danger"
        isLoading={deleting}
      />

      {/* Custom Wipe All Module Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipeEmployeeData}
        title="Wipe All Employee Data"
        message="This will permanently delete ALL employee records in this module. This action cannot be undone."
        confirmText="Wipe All Records"
        variant="danger"
        requireConfirmationText="WIPE"
        inputPlaceholder='Type "WIPE" to confirm'
        isLoading={deleting}
      />
    </div>
  );
}
