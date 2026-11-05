'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, 
  X, 
  Pencil, 
  Plus, 
  Trash2, 
  Clock, 
  AlertCircle,
  FileText,
  Package,
  Layers,
  IndianRupee,
  Calendar,
  Sparkles,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  Lock,
  Unlock,
  RotateCcw
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { 
  db, 
  ClientDocument, 
  UserDocument, 
  ProposalDocument,
  ClientSubscriptionPlan,
  handleFirestoreError,
  OperationType
} from '@/lib/firebase';
import { 
  COLLECTIONS, 
  CLIENT_STATUS, 
  CLIENT_FIELDS, 
  CommercialModel, 
  PricingCategoryHistoryEntry,
  PackagePlanDocument
} from '@/src/config/schema';
import { CANONICAL_DEFAULT_PACKAGE_PLANS } from '@/components/PackagePlansMatrix';

export interface PackagePlanState {
  planId: string;
  scopeCovered: string;
  projectsPerMonth: number;
  durationMonths: number;
  upfrontPrice: number;
  bonusProjects: number;
  startDate: string;
  endDate: string;
  totalAllowedProjects: number;
  status: 'active' | 'expired' | 'cancelled';
  isPriceEngineMapped?: boolean;
  isCustomOverride?: boolean;
}

function getTodayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function computeEndDate(startDateStr: string, durationMonths: number): string {
  if (!startDateStr) return '';
  const parts = startDateStr.split('-');
  if (parts.length !== 3) return '';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return '';

  const targetDate = new Date(year, month + Number(durationMonths || 1), day);
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getInitialPackageState(client?: ClientDocument | null): PackagePlanState {
  const today = getTodayIsoDate();
  if (client?.subscriptionPlan) {
    const sub = client.subscriptionPlan;
    const sDate = sub.startDate ? (sub.startDate.includes('T') ? sub.startDate.split('T')[0] : sub.startDate) : today;
    const dur = Number(sub.durationMonths) || 3;
    const ppm = Number(sub.projectsPerMonth) || 100;
    const bonus = Number(sub.bonusProjects) || 0;
    const total = Number(sub.totalAllowedProjects) || (ppm * dur + bonus);
    const eDate = sub.endDate ? (sub.endDate.includes('T') ? sub.endDate.split('T')[0] : sub.endDate) : computeEndDate(sDate, dur);

    return {
      planId: sub.planId || 'custom',
      scopeCovered: sub.scopeCovered || 'Pre Design',
      projectsPerMonth: ppm,
      durationMonths: dur,
      upfrontPrice: Number(sub.upfrontPrice) || 0,
      bonusProjects: bonus,
      startDate: sDate,
      endDate: eDate,
      totalAllowedProjects: total,
      status: (sub.status as any) || 'active',
      isPriceEngineMapped: sub.planId ? sub.planId !== 'custom' : true,
      isCustomOverride: sub.planId === 'custom'
    };
  }

  // Canonical default package preset (Pre Design 100 PPM 3M)
  const dur = 3;
  const ppm = 100;
  const bonus = 15;
  return {
    planId: 'pre_design_100_3m',
    scopeCovered: 'Pre Design',
    projectsPerMonth: ppm,
    durationMonths: dur,
    upfrontPrice: 70000,
    bonusProjects: bonus,
    startDate: today,
    endDate: computeEndDate(today, dur),
    totalAllowedProjects: (ppm * dur) + bonus,
    status: 'active',
    isPriceEngineMapped: true,
    isCustomOverride: false
  };
}

export interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: ClientDocument | null;
  onSaveSuccess: (updatedClient: ClientDocument) => void;
  onDeleteRequest?: (clientId: string, clientName: string) => void;
  onOpenTierHistory?: (client: ClientDocument) => void;
  users?: UserDocument[];
  employees?: UserDocument[];
  proposals?: ProposalDocument[];
  pricingCategories?: string[];
  currentEmail: string;
}

function getClientInitialState(client: ClientDocument | null | undefined, currentEmail: string) {
  if (client) {
    const existingAddr = client.billingAddress || client.address || (client as any).officeAddress || '';
    const existingSalesEmail = (client.salesPersonEmail || client.submittedBy || '').trim().toLowerCase();
    const existingSalesName = client.salesPerson || (client as any).salesPersonName || '';

    return {
      id: client.id || '',
      companyName: client.companyName || '',
      contactPerson: client.contactPerson || '',
      email: client.email || '',
      phone: client.phone || '',
      city: client.city || '',
      billingAddress: existingAddr,
      address: existingAddr,
      gstin: client.gstin || '',
      pricingCategory: client.pricingCategory || 'Nil',
      salesPersonEmail: existingSalesEmail,
      salesPerson: existingSalesName,
      submittedBy: existingSalesEmail,
      proposalNumber: client.proposalNumber || '',
      proposalDate: client.proposalDate || (client as any).proposalCreatedAt || '',
      status: client.status || CLIENT_STATUS.PENDING,
      commercialModel: client.commercialModel || 'PER_KW',
      subscriptionPlan: client.subscriptionPlan || undefined,
      pricingCategoryHistory: Array.isArray(client.pricingCategoryHistory) ? client.pricingCategoryHistory : []
    };
  }

  return {
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    city: '',
    billingAddress: '',
    address: '',
    gstin: '',
    pricingCategory: 'Nil',
    salesPersonEmail: currentEmail || '',
    salesPerson: '',
    submittedBy: currentEmail || '',
    proposalNumber: '',
    proposalDate: '',
    status: CLIENT_STATUS.PENDING,
    commercialModel: 'PER_KW' as CommercialModel,
    pricingCategoryHistory: []
  };
}

export default function ClientModal({
  isOpen,
  onClose,
  client,
  onSaveSuccess,
  onDeleteRequest,
  onOpenTierHistory,
  users: initialUsers = [],
  employees: initialEmployees = [],
  proposals: initialProposals = [],
  pricingCategories: initialPricingCategories = [],
  currentEmail
}: ClientModalProps) {
  const isEditing = Boolean(client && client.id);

  // Form State
  const [formData, setFormData] = useState<Record<string, any>>(() => getClientInitialState(client, currentEmail));
  const [packageData, setPackageData] = useState<PackagePlanState>(() => getInitialPackageState(client));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isManualProposal, setIsManualProposal] = useState(() => !client?.proposalNumber);
  const [isCustomFeeUnlocked, setIsCustomFeeUnlocked] = useState(false);

  // Dynamic Price Engine categories & Package Plans fetched directly via onSnapshot when modal is open
  const [modalEngineCategories, setModalEngineCategories] = useState<string[]>([]);
  const [dbPackagePlans, setDbPackagePlans] = useState<PackagePlanDocument[]>([]);

  // Subscribe directly to pricingRules, pricingCategories, and packagePlans collections via onSnapshot when modal is open
  useEffect(() => {
    if (!isOpen) return;

    let rulesCategories: string[] = [];
    let explicitCategories: string[] = [];

    const updateCombined = () => {
      const merged = Array.from(new Set([...rulesCategories, ...explicitCategories]))
        .map(c => (c || '').trim())
        .filter(Boolean);

      merged.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      setModalEngineCategories(merged);
    };

    // 1. Listen to pricingRules collection
    const unsubRules = onSnapshot(
      collection(db, COLLECTIONS.PRICING_RULES),
      (snap) => {
        const cats: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.category && typeof data.category === 'string') {
            cats.push(data.category.trim());
          }
        });
        rulesCategories = cats;
        updateCombined();
      },
      (err) => {
        console.warn('Snapshot listener caught for pricingRules in ClientModal:', err);
      }
    );

    // 2. Listen to pricingCategories collection
    const unsubCategories = onSnapshot(
      collection(db, COLLECTIONS.PRICING_CATEGORIES),
      (snap) => {
        const cats: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const name = data?.name || d.id;
          if (name && typeof name === 'string') {
            cats.push(name.trim());
          }
        });
        explicitCategories = cats;
        updateCombined();
      },
      (err) => {
        console.warn('Snapshot listener caught for pricingCategories in ClientModal:', err);
      }
    );

    // 3. Listen to packagePlans collection (real-time package plans fetching)
    const unsubPlans = onSnapshot(
      collection(db, COLLECTIONS.PACKAGE_PLANS),
      (snap) => {
        const plans: PackagePlanDocument[] = [];
        snap.forEach((d) => {
          const data = d.data();
          plans.push({
            ...(data as PackagePlanDocument),
            id: d.id
          });
        });
        setDbPackagePlans(plans);
      },
      (err) => {
        console.warn('Snapshot listener caught for packagePlans in ClientModal:', err);
      }
    );

    return () => {
      unsubRules();
      unsubCategories();
      unsubPlans();
    };
  }, [isOpen]);

  // Combine live Firestore package plans and canonical defaults into a unified lookup pool
  const allKnownPackagePlans = useMemo(() => {
    const list: PackagePlanDocument[] = [];
    const ids = new Set<string>();

    if (dbPackagePlans && dbPackagePlans.length > 0) {
      dbPackagePlans.forEach(p => {
        if (p.status !== 'inactive') {
          list.push(p);
          ids.add(p.id);
        }
      });
    }

    CANONICAL_DEFAULT_PACKAGE_PLANS.forEach(p => {
      if (!ids.has(p.id)) {
        list.push(p);
        ids.add(p.id);
      }
    });

    return list;
  }, [dbPackagePlans]);

  // Derive available package plans from live DB or fallback to canonical plans
  const availablePackagePlans = useMemo(() => {
    if (dbPackagePlans && dbPackagePlans.length > 0) {
      const active = dbPackagePlans.filter(p => p.status === 'active' || !p.status);
      if (active.length > 0) return active;
    }
    return CANONICAL_DEFAULT_PACKAGE_PLANS;
  }, [dbPackagePlans]);

  // Derive available scopes dynamically from live/canonical package plans
  const availableScopes = useMemo(() => {
    const scopes = new Set<string>();
    allKnownPackagePlans.forEach((p) => {
      if (p.scope && p.status !== 'inactive') {
        scopes.add(p.scope.trim());
      }
    });
    if (scopes.size === 0) return ['Pre Design', 'Post Design'];
    return Array.from(scopes).sort();
  }, [allKnownPackagePlans]);

  // Calculated package metrics
  const totalAllowedQuota = useMemo(() => {
    const ppm = Number(packageData.projectsPerMonth) || 0;
    const dur = Number(packageData.durationMonths) || 1;
    const bonus = Number(packageData.bonusProjects) || 0;
    return (ppm * dur) + bonus;
  }, [packageData.projectsPerMonth, packageData.durationMonths, packageData.bonusProjects]);

  const effectiveCostPerProject = useMemo(() => {
    const total = totalAllowedQuota;
    const upfront = Number(packageData.upfrontPrice) || 0;
    return total > 0 ? Math.round(upfront / total) : 0;
  }, [totalAllowedQuota, packageData.upfrontPrice]);

  const calculatedEndDate = useMemo(() => {
    return packageData.endDate || computeEndDate(packageData.startDate, packageData.durationMonths);
  }, [packageData.endDate, packageData.startDate, packageData.durationMonths]);

  // IMMEDIATE 1:1 AUTOMATIC PRICE ENGINE MATRIX MAPPING:
  // When user picks Scope, PPM Quota, or Duration:
  // Immediately queries allKnownPackagePlans, updates Upfront Retainer Fee, Bonus Projects,
  // Total Allowed Projects, and End Date synchronously.
  // Never leaves stale pricing combinations (e.g. 300 PPM with ₹70,000 fee).
  const handleUpdateMatrixParam = (params: {
    scopeCovered?: string;
    projectsPerMonth?: number;
    durationMonths?: number;
    startDate?: string;
  }) => {
    setIsDirty(true);
    setPackageData(prev => {
      const nextScope = (params.scopeCovered !== undefined ? params.scopeCovered : prev.scopeCovered).trim();
      const nextPpm = params.projectsPerMonth !== undefined ? Number(params.projectsPerMonth) : Number(prev.projectsPerMonth);
      const nextDur = params.durationMonths !== undefined ? Number(params.durationMonths) : Number(prev.durationMonths);
      const nextStart = params.startDate !== undefined ? params.startDate : (prev.startDate || getTodayIsoDate());
      const nextEnd = computeEndDate(nextStart, nextDur);

      const matched = allKnownPackagePlans.find(p =>
        (p.scope || '').trim().toLowerCase() === nextScope.toLowerCase() &&
        Number(p.projectsPerMonth) === nextPpm &&
        Number(p.durationMonths) === nextDur
      );

      if (matched) {
        return {
          ...prev,
          planId: matched.id,
          scopeCovered: nextScope,
          projectsPerMonth: nextPpm,
          durationMonths: nextDur,
          upfrontPrice: Number(matched.upfrontPrice) || 0,
          bonusProjects: Number(matched.bonusProjects) || 0,
          totalAllowedProjects: (nextPpm * nextDur) + (Number(matched.bonusProjects) || 0),
          startDate: nextStart,
          endDate: nextEnd,
          isPriceEngineMapped: true,
          isCustomOverride: false
        };
      } else {
        return {
          ...prev,
          planId: 'custom',
          scopeCovered: nextScope,
          projectsPerMonth: nextPpm,
          durationMonths: nextDur,
          totalAllowedProjects: (nextPpm * nextDur) + Number(prev.bonusProjects || 0),
          startDate: nextStart,
          endDate: nextEnd,
          isPriceEngineMapped: false,
          isCustomOverride: true
        };
      }
    });
    setIsCustomFeeUnlocked(false);
  };

  // Custom Fee / Exception Handlers
  const handleManualFeeChange = (val: number) => {
    setIsDirty(true);
    setPackageData(prev => ({
      ...prev,
      upfrontPrice: Math.max(0, val),
      isCustomOverride: true,
      isPriceEngineMapped: false,
      planId: 'custom'
    }));
  };

  const handleManualBonusChange = (val: number) => {
    setIsDirty(true);
    setPackageData(prev => ({
      ...prev,
      bonusProjects: Math.max(0, val),
      totalAllowedProjects: (Number(prev.projectsPerMonth) * Number(prev.durationMonths)) + Math.max(0, val),
      isCustomOverride: true,
      isPriceEngineMapped: false,
      planId: 'custom'
    }));
  };

  const handleResetFeeToEngine = () => {
    handleUpdateMatrixParam({});
  };

  // Adjust state during render when client or isOpen changes without triggering effect lint errors
  const [prevClientRef, setPrevClientRef] = useState<{ id?: string; client: typeof client; isOpen: boolean }>({
    id: client?.id,
    client,
    isOpen
  });

  if (client !== prevClientRef.client || isOpen !== prevClientRef.isOpen) {
    setPrevClientRef({ id: client?.id, client, isOpen });
    setFormData(getClientInitialState(client, currentEmail));
    setPackageData(getInitialPackageState(client));
    setIsDirty(false);
    setIsManualProposal(!client?.proposalNumber);
    setErrorMsg(null);
  }

  // Local fallback lists in case parent hasn't loaded them yet
  const [fetchedProposals, setFetchedProposals] = useState<ProposalDocument[]>([]);
  const [fetchedUsers, setFetchedUsers] = useState<UserDocument[]>([]);
  const [fetchedEmployees, setFetchedEmployees] = useState<UserDocument[]>([]);

  // Derive active lists seamlessly from props or fetched fallbacks
  const proposalsList = initialProposals.length > 0 ? initialProposals : fetchedProposals;
  const userPool = initialUsers.length > 0 ? initialUsers : fetchedUsers;
  const employeePool = initialEmployees.length > 0 ? initialEmployees : fetchedEmployees;

  // Compute available dropdown options dynamically by combining:
  // 1. Categories configured in Price Engine (live snapshot from pricingRules & pricingCategories + prop)
  // 2. Categories attached to registered proposals in proposalsList
  // 3. The current client's assigned formData.pricingCategory
  const availablePricingCategories = useMemo(() => {
    const set = new Set<string>();

    // From Price Engine live snapshot
    modalEngineCategories.forEach(cat => {
      const clean = (cat || '').trim();
      if (clean && clean.toLowerCase() !== 'nil') set.add(clean);
    });

    // From parent passed categories (if any)
    initialPricingCategories.forEach(cat => {
      const clean = (cat || '').trim();
      if (clean && clean.toLowerCase() !== 'nil') set.add(clean);
    });

    // From registered proposals
    (proposalsList || []).forEach(p => {
      const cat = (p.pricingCategory || (p as any).tier || '').trim();
      if (cat && cat.toLowerCase() !== 'nil') set.add(cat);
    });

    // From client's current assigned formData.pricingCategory
    const currentCat = (formData.pricingCategory || '').trim();
    if (currentCat && currentCat.toLowerCase() !== 'nil') {
      set.add(currentCat);
    }

    // Alphabetize / naturally sort the categories
    const sorted = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Keep 'Nil' at the top of the select list
    return ['Nil', ...sorted];
  }, [modalEngineCategories, initialPricingCategories, proposalsList, formData.pricingCategory]);

  // Self-healing Firestore loader if lists are empty when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchMissingData = async () => {
      try {
        if (initialProposals.length === 0 && fetchedProposals.length === 0) {
          const propSnap = await getDocs(collection(db, COLLECTIONS.PROPOSALS)).catch(() => null);
          if (propSnap && isMounted) {
            const fetchedProps: ProposalDocument[] = [];
            propSnap.forEach(d => {
              fetchedProps.push({ ...(d.data() as ProposalDocument), id: d.id });
            });
            setFetchedProposals(fetchedProps);
          }
        }

        if (
          (initialUsers.length === 0 && fetchedUsers.length === 0) ||
          (initialEmployees.length === 0 && fetchedEmployees.length === 0)
        ) {
          const [uSnap, eSnap] = await Promise.all([
            getDocs(collection(db, COLLECTIONS.USERS)).catch(() => null),
            getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => null)
          ]);

          if (isMounted) {
            if (uSnap && fetchedUsers.length === 0) {
              const uList: UserDocument[] = [];
              uSnap.forEach(d => uList.push({ ...(d.data() as UserDocument), id: d.id }));
              setFetchedUsers(uList);
            }
            if (eSnap && fetchedEmployees.length === 0) {
              const eList: UserDocument[] = [];
              eSnap.forEach(d => eList.push({ ...(d.data() as UserDocument), id: d.id }));
              setFetchedEmployees(eList);
            }
          }
        }
      } catch (err) {
        console.warn('Notice loading modal lookup data:', err);
      }
    };

    fetchMissingData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, initialProposals.length, initialUsers.length, initialEmployees.length, fetchedProposals.length, fetchedUsers.length, fetchedEmployees.length]);

  // 2. POPULATE THE SALES PERSON DROPDOWN BROADLY:
  // Relax the filter so that anyone with sales attribution, admin, management, or owner role is included
  const salesOptions = useMemo(() => {
    const combined = [...userPool, ...employeePool];
    const uniqueMap = new Map<string, any>();

    combined.forEach((u: any) => {
      const email = (u.email || u.officialEmail || (u as any).personalEmail || '').trim().toLowerCase();
      if (email && !uniqueMap.has(email)) {
        uniqueMap.set(email, u);
      }
    });

    let filtered = Array.from(uniqueMap.values()).filter((u: any) => {
      const role = String(u.role || '').toLowerCase();
      const dept = String(u.department || '').toLowerCase();
      const desig = String(u.designation || '').toLowerCase();
      return (
        role.includes('sales') ||
        dept.includes('sales') ||
        desig.includes('sales') ||
        role.includes('business') ||
        dept.includes('business') ||
        role.includes('bd') ||
        role === 'owner' ||
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'management' ||
        role.includes('lead') ||
        role.includes('partner') ||
        role.includes('manager') ||
        role.includes('director') ||
        role.includes('executive')
      );
    });

    // If role filtering returned 0 but users exist in the system, fall back to all users
    if (filtered.length === 0 && uniqueMap.size > 0) {
      filtered = Array.from(uniqueMap.values());
    }

    // If client already has a salesPersonEmail saved, make sure it is included in options even if filter missed it
    const currentSales = (formData.salesPersonEmail || formData.submittedBy || '').trim().toLowerCase();
    if (currentSales && !filtered.some((s: any) => (s.email || '').toLowerCase() === currentSales)) {
      filtered.unshift({
        id: currentSales,
        name: formData.salesPerson || currentSales.split('@')[0],
        fullName: formData.salesPerson || currentSales.split('@')[0],
        email: currentSales,
        role: 'sales'
      });
    }

    // Sort alphabetically by name
    return filtered.sort((a, b) => {
      const nameA = (a.name || a.fullName || a.email || '').toLowerCase();
      const nameB = (b.name || b.fullName || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [userPool, employeePool, formData.salesPersonEmail, formData.submittedBy, formData.salesPerson]);

  // 3. FIX "SAVE CHANGES" BUTTON DISABLED STATE:
  // Validate basic client data and package fields if FIXED_PACKAGE is active
  const isPackageValid = formData.commercialModel !== 'FIXED_PACKAGE' || Boolean(
    packageData.scopeCovered?.trim() &&
    Number(packageData.projectsPerMonth) > 0 &&
    Number(packageData.durationMonths) > 0
  );

  const isValid = Boolean(
    formData.companyName?.trim() &&
    formData.contactPerson?.trim() &&
    formData.city?.trim() &&
    isPackageValid
  );

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValid) {
      if (formData.commercialModel === 'FIXED_PACKAGE' && !isPackageValid) {
        setErrorMsg('Please specify Scope of Work and a positive PPM Quota for the Package Plan.');
      } else {
        setErrorMsg('Please provide Company Name, Contact Person, and City.');
      }
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const nowIso = new Date().toISOString();
      const clientId = formData.id || client?.id || doc(collection(db, COLLECTIONS.CLIENTS)).id;

      // 3. IMPLEMENT EFFECTIVE-DATED TIER HISTORY (pricingCategoryHistory):
      // When an administrator updates a client's pricingCategory:
      // If the category has changed:
      // 1. Do not destructively overwrite past pricing.
      // 2. Read existing client.pricingCategoryHistory array (or initialize one).
      // 3. Determine current month boundary:
      //    currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      //    lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
      // 4. Close out the previous tier entry: effectiveTo: lastMonthEnd
      // 5. Append the new tier entry:
      //    { tier, category, effectiveFrom: currentMonthStart, effectiveTo: null, proposalNumber, updatedAt }
      let updatedHistory: PricingCategoryHistoryEntry[] = Array.isArray(client?.pricingCategoryHistory || formData.pricingCategoryHistory)
        ? [...(client?.pricingCategoryHistory || formData.pricingCategoryHistory)]
        : [];

      const oldCategory = (client?.pricingCategory || '').trim().toUpperCase();
      const newCategory = (formData.pricingCategory || '').trim().toUpperCase();
      const newProposalNumber = (formData.proposalNumber || '').trim();

      if (
        client &&
        newCategory &&
        oldCategory &&
        newCategory !== oldCategory &&
        newCategory !== 'NIL'
      ) {
        const now = new Date();
        const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

        // If history is empty, close out previous tier entry with effectiveTo = lastMonthEnd
        if (updatedHistory.length === 0) {
          const clientStart = client.createdAt
            ? (typeof client.createdAt === 'string' && client.createdAt.includes('T') ? client.createdAt.split('T')[0] : (typeof client.createdAt === 'string' ? client.createdAt : '2020-01-01'))
            : '2020-01-01';
          updatedHistory.push({
            tier: oldCategory,
            category: oldCategory,
            effectiveFrom: clientStart,
            effectiveTo: lastMonthEnd,
            proposalNumber: client.proposalNumber || '',
            updatedAt: client.createdAt || nowIso,
            updatedBy: client.approvedBy || currentEmail,
            reason: 'Prior historical tier'
          });
        } else {
          // Close out the previous active tier entry: effectiveTo: lastMonthEnd
          updatedHistory = updatedHistory.map(h => {
            if (!h.effectiveTo) {
              return { ...h, effectiveTo: lastMonthEnd };
            }
            return h;
          });
        }

        // Append the new tier entry
        updatedHistory.push({
          tier: newCategory,
          category: newCategory,
          effectiveFrom: currentMonthStart,
          effectiveTo: null, // Open-ended for current and future months
          proposalNumber: newProposalNumber || client.proposalNumber || '',
          updatedAt: nowIso,
          updatedBy: currentEmail,
          reason: 'Tier rate update via Client Management'
        });
      } else if (!client && newCategory && newCategory !== 'NIL') {
        const now = new Date();
        const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        if (updatedHistory.length === 0) {
          updatedHistory.push({
            tier: newCategory,
            category: newCategory,
            effectiveFrom: currentMonthStart,
            effectiveTo: null,
            proposalNumber: newProposalNumber || '',
            updatedAt: nowIso,
            updatedBy: currentEmail,
            reason: 'Initial client onboarding tier'
          });
        }
      }

      const cleanAddress = (formData.billingAddress || formData.address || '').trim();
      const cleanSalesEmail = (formData.salesPersonEmail || formData.submittedBy || currentEmail || '').trim().toLowerCase();
      const cleanSalesName = formData.salesPerson || salesOptions.find(s => (s.email || '').toLowerCase() === cleanSalesEmail)?.name || (cleanSalesEmail ? cleanSalesEmail.split('@')[0] : 'Unassigned');

      const matchedProp = (proposalsList || []).find(p => p.proposalNumber === newProposalNumber);

      // 5. FIRESTORE PERSISTENCE:
      // Ensure billingAddress, address, salesPersonEmail, salesPerson, proposalNumber, pricingCategory, gstin, and commercialModel persist cleanly.
      const payload: Record<string, any> = {
        companyName: formData.companyName.trim(),
        contactPerson: formData.contactPerson.trim(),
        email: (formData.email || '').trim().toLowerCase(),
        phone: (formData.phone || '').trim(),
        city: formData.city.trim(),
        address: cleanAddress,
        billingAddress: cleanAddress,
        gstin: (formData.gstin || '').trim().toUpperCase(),
        pricingCategory: formData.pricingCategory || 'Nil',
        salesPerson: cleanSalesName,
        [CLIENT_FIELDS.SALES_PERSON_EMAIL]: cleanSalesEmail,
        submittedBy: cleanSalesEmail,
        proposalNumber: newProposalNumber,
        proposalDate: formData.proposalDate || matchedProp?.createdAt || client?.proposalDate || '',
        status: formData.status || CLIENT_STATUS.PENDING,
        commercialModel: formData.commercialModel || 'PER_KW',
        pricingCategoryHistory: updatedHistory,
        updatedAt: nowIso
      };

      if (!client || !client.createdAt) {
        payload.createdAt = nowIso;
      }

      // 5. FIRESTORE PERSISTENCE:
      // When saving, if commercialModel === 'FIXED_PACKAGE', write a complete subscriptionPlan object:
      if (formData.commercialModel === 'FIXED_PACKAGE') {
        const dur = Number(packageData.durationMonths) || 1;
        const ppm = Number(packageData.projectsPerMonth) || 0;
        const bonus = Number(packageData.bonusProjects) || 0;
        const total = (ppm * dur) + bonus;
        const upfront = Number(packageData.upfrontPrice) || 0;
        const start = packageData.startDate || getTodayIsoDate();
        const end = packageData.endDate || computeEndDate(start, dur);

        payload.commercialModel = 'FIXED_PACKAGE';
        payload.subscriptionPlan = {
          planId: packageData.planId || 'custom',
          scopeCovered: (packageData.scopeCovered || 'Pre Design').trim(),
          projectsPerMonth: ppm,
          durationMonths: dur,
          upfrontPrice: upfront,
          bonusProjects: bonus,
          totalAllowedProjects: total,
          startDate: start,
          endDate: end,
          status: 'active'
        };
      } else {
        payload.commercialModel = 'PER_KW';
        // If client previously had a subscription plan, mark it cancelled so it doesn't count as an active quota
        if (client?.subscriptionPlan) {
          payload.subscriptionPlan = {
            ...client.subscriptionPlan,
            status: 'cancelled'
          };
        }
      }

      const clientDocRef = doc(db, COLLECTIONS.CLIENTS, clientId);
      await setDoc(clientDocRef, payload, { merge: true });

      const updatedClientResult: ClientDocument = {
        ...(client || {}),
        ...payload,
        id: clientId
      } as ClientDocument;

      onSaveSuccess(updatedClientResult);
      onClose();
    } catch (err: any) {
      console.error('Error saving client document to Firestore:', err);
      handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.CLIENTS);
      setErrorMsg(`Failed to save client: ${err?.message || 'Please check your connection and Firestore security rules.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
      <div className="w-full max-w-3xl bg-[#1E1E1E] border border-[#333333] rounded-2xl shadow-2xl relative max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-[#2A2A2A] bg-[#242424]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37]">
              {isEditing ? <Pencil className="w-5 h-5" /> : <Building2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
                {isEditing ? 'Edit Client Record' : 'Register New Client'}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEditing ? `Managing KYC, Pricing Tier, and Sales Attribution for "${formData.companyName || 'Client'}"` : 'Enter client KYC credentials, assigned sales attribution, and pricing'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-medium text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => {
                  setFormData({ ...formData, companyName: e.target.value });
                  setIsDirty(true);
                }}
                placeholder="e.g. Mathurusri Solar Energies"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500"
              />
            </div>

            {/* Contact Person */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Contact Person *
              </label>
              <input
                type="text"
                required
                value={formData.contactPerson}
                onChange={(e) => {
                  setFormData({ ...formData, contactPerson: e.target.value });
                  setIsDirty(true);
                }}
                placeholder="e.g. Rajesh Sharma"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Work Email Address
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  setIsDirty(true);
                }}
                placeholder="e.g. contact@mathurusri.com"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Phone / Mobile
              </label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  setIsDirty(true);
                }}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500 font-mono"
              />
            </div>

            {/* City */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                City / Location *
              </label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => {
                  setFormData({ ...formData, city: e.target.value });
                  setIsDirty(true);
                }}
                placeholder="e.g. Hyderabad, Telangana"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500"
              />
            </div>

            {/* GSTIN */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                GSTIN / Tax ID
              </label>
              <input
                type="text"
                value={formData.gstin || ''}
                onChange={(e) => {
                  setFormData({ ...formData, gstin: e.target.value.toUpperCase() });
                  setIsDirty(true);
                }}
                placeholder="e.g. 36AABCU9603R1ZX"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500 font-mono uppercase"
              />
            </div>

            {/* 1. REQUIRED: ADD FULL BILLING ADDRESS FIELD */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Billing / Registered Address *
              </label>
              <textarea
                rows={2}
                value={formData.billingAddress || formData.address || ''}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    billingAddress: e.target.value,
                    address: e.target.value
                  });
                  setIsDirty(true);
                }}
                placeholder="Street, Landmark, City, State, PIN Code"
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500 resize-none"
              />
            </div>

            {/* 2. REQUIRED: POPULATE THE SALES PERSON DROPDOWN BROADLY */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                  Sales Person *
                </label>
                <span className="text-[10px] font-mono text-[#D4AF37]">
                  {salesOptions.length} Executive{salesOptions.length === 1 ? '' : 's'}
                </span>
              </div>
              <select
                value={formData.salesPersonEmail || formData.salesPerson || ''}
                onChange={(e) => {
                  const selectedEmail = e.target.value;
                  const foundUser = salesOptions.find(u => (u.email || '').toLowerCase() === selectedEmail.toLowerCase());
                  setFormData({
                    ...formData,
                    salesPersonEmail: selectedEmail,
                    salesPerson: foundUser?.name || foundUser?.fullName || selectedEmail,
                    submittedBy: selectedEmail
                  });
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-sans"
              >
                <option value="">Select Sales Person...</option>
                {salesOptions.map((s: any) => (
                  <option key={s.email || s.id} value={s.email}>
                    {s.name || s.fullName || s.email} ({s.email})
                  </option>
                ))}
              </select>
            </div>

            {/* 4. REQUIRED: CONVERT PROPOSAL NUMBER TO A DYNAMIC DROPDOWN */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                  Proposal Number
                </label>
                <button
                  type="button"
                  onClick={() => setIsManualProposal(prev => !prev)}
                  className="text-[10px] text-[#D4AF37] hover:underline cursor-pointer font-mono"
                >
                  {isManualProposal ? 'Choose from list' : 'Custom / Manual'}
                </button>
              </div>

              {isManualProposal ? (
                <input
                  type="text"
                  value={formData.proposalNumber || ''}
                  onChange={(e) => {
                    const typedVal = e.target.value;
                    const matchedProp = (proposalsList || []).find(p => p.proposalNumber?.trim().toLowerCase() === typedVal.trim().toLowerCase());
                    const proposalTier = (matchedProp?.pricingCategory || (matchedProp as any)?.tier || '').trim();
                    setFormData({
                      ...formData,
                      proposalNumber: typedVal,
                      ...(proposalTier ? { pricingCategory: proposalTier } : {})
                    });
                    setIsDirty(true);
                  }}
                  placeholder="e.g. PROP-2026-001"
                  className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all placeholder:text-gray-500 font-mono"
                />
              ) : (
                <select
                  value={formData.proposalNumber || ''}
                  onChange={(e) => {
                    const selectedPropNum = e.target.value;
                    const matchedProp = (proposalsList || []).find(p => p.proposalNumber === selectedPropNum);
                    const proposalTier = (matchedProp?.pricingCategory || (matchedProp as any)?.tier || '').trim();
                    setFormData({
                      ...formData,
                      proposalNumber: selectedPropNum,
                      proposalDate: matchedProp?.createdAt || (matchedProp as any)?.proposalDate || formData.proposalDate || '',
                      // Automatically sync pricing category/tier if available on the proposal
                      pricingCategory: proposalTier || formData.pricingCategory || 'Nil'
                    });
                    setIsDirty(true);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-mono"
                >
                  <option value="">— Select Registered Proposal —</option>
                  {formData.proposalNumber && !proposalsList.some(p => p.proposalNumber === formData.proposalNumber) && (
                    <option value={formData.proposalNumber}>{formData.proposalNumber} (Current / Custom)</option>
                  )}
                  {(proposalsList || []).map((p) => (
                    <option key={p.id || p.proposalNumber} value={p.proposalNumber}>
                      {p.proposalNumber} ({p.pricingCategory || (p as any).tier || 'Standard'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Pricing Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1 flex items-center justify-between">
                <span>
                  {formData.commercialModel === 'FIXED_PACKAGE'
                    ? 'Fallback Slab Tier (for Over-Quota / Out-of-Scope Projects) *'
                    : 'Pricing Tier / Category *'}
                </span>
              </label>
              <select
                value={formData.pricingCategory || 'Nil'}
                onChange={(e) => {
                  setFormData({ ...formData, pricingCategory: e.target.value });
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-mono"
              >
                <option value="Nil">Nil (Unassigned)</option>
                {availablePricingCategories.filter(c => c !== 'Nil').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {formData.commercialModel === 'FIXED_PACKAGE' ? (
                <p className="text-[11px] text-amber-400/90 pl-1 leading-relaxed">
                  Any deliverable submitted beyond the package quota or outside the package scope will be billed dynamically per kW using this tier.
                </p>
              ) : (
                <p className="text-[11px] text-gray-500 pl-1">
                  Standard tier applied to per-kW engineering deliverables.
                </p>
              )}
            </div>

            {/* Client Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Verification Status
              </label>
              <select
                value={formData.status || CLIENT_STATUS.PENDING}
                onChange={(e) => {
                  setFormData({ ...formData, status: e.target.value });
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer"
              >
                <option value={CLIENT_STATUS.APPROVED}>Approved</option>
                <option value={CLIENT_STATUS.PENDING}>Pending Approval</option>
                <option value={CLIENT_STATUS.REJECTED}>Rejected</option>
              </select>
            </div>

            {/* Commercial Model */}
            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                  Commercial Pricing Model *
                </label>
                <span className="text-[11px] text-gray-400 font-mono">
                  {formData.commercialModel === 'FIXED_PACKAGE' ? 'Retainer Subscription' : 'Dynamic Per kW'}
                </span>
              </div>
              <select
                value={formData.commercialModel || 'PER_KW'}
                onChange={(e) => {
                  setFormData({ ...formData, commercialModel: e.target.value as CommercialModel });
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-mono font-medium"
              >
                <option value="PER_KW">Standard Per kW Slabs</option>
                <option value="FIXED_PACKAGE">Fixed Package Retainer Plan</option>
              </select>
            </div>

            {/* Dedicated Package Plan Configuration */}
            {formData.commercialModel === 'FIXED_PACKAGE' && (
              <div className="md:col-span-2 p-5 bg-[#222222] border-2 border-[#D4AF37]/40 rounded-2xl space-y-5 animate-in fade-in duration-200 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between pb-3.5 border-b border-[#333333]">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37]">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        Fixed Package Retainer Plan Configuration
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider font-mono font-semibold">
                          Active Retainer
                        </span>
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Configure deliverable quota, upfront commitment, scope coverage, and active duration.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1E1E1E] border border-[#333333] rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono text-[11px] uppercase tracking-wider">Engine Status:</span>
                    {packageData.isPriceEngineMapped ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Live Price Engine Matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                        Custom Plan / Manual Override
                      </span>
                    )}
                  </div>
                  {packageData.isCustomOverride && (
                    <button
                      type="button"
                      onClick={handleResetFeeToEngine}
                      className="inline-flex items-center gap-1 text-[11px] text-[#D4AF37] hover:underline cursor-pointer font-mono"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Re-sync to Price Engine
                    </button>
                  )}
                </div>

                {/* 3-Step Matrix Selector */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Step 1: Scope of Work */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1 flex items-center justify-between">
                      <span>1. Scope of Work *</span>
                      <span className="text-[10px] text-gray-500 font-normal">Active Scopes</span>
                    </label>
                    <select
                      value={packageData.scopeCovered}
                      onChange={(e) => handleUpdateMatrixParam({ scopeCovered: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-sans"
                    >
                      {availableScopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Step 2: PPM Quota (Projects / Month) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1 flex items-center justify-between">
                      <span>2. PPM Quota *</span>
                      <span className="text-[10px] text-amber-400/80 font-mono">{packageData.projectsPerMonth} PPM</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[100, 200, 300].map((ppmVal) => (
                        <button
                          key={ppmVal}
                          type="button"
                          onClick={() => handleUpdateMatrixParam({ projectsPerMonth: ppmVal })}
                          className={`py-2 px-2 text-center rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                            packageData.projectsPerMonth === ppmVal
                              ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/20 border border-[#D4AF37]'
                              : 'bg-[#2A2A2A] text-gray-300 hover:text-white hover:bg-[#333333] border border-[#3A3A3A]'
                          }`}
                        >
                          {ppmVal} PPM
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Plan Duration */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1 flex items-center justify-between">
                      <span>3. Duration *</span>
                      <span className="text-[10px] text-amber-400/80 font-mono">{packageData.durationMonths}M</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { months: 1, label: '1M' },
                        { months: 3, label: '3M' },
                        { months: 6, label: '6M' }
                      ].map((durItem) => (
                        <button
                          key={durItem.months}
                          type="button"
                          onClick={() => handleUpdateMatrixParam({ durationMonths: durItem.months })}
                          className={`py-2 px-2 text-center rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                            packageData.durationMonths === durItem.months
                              ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/20 border border-[#D4AF37]'
                              : 'bg-[#2A2A2A] text-gray-300 hover:text-white hover:bg-[#333333] border border-[#3A3A3A]'
                          }`}
                        >
                          {durItem.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Retainer Start Date & Financial Terms */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  {/* Start Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                      Retainer Start Date *
                    </label>
                    <input
                      type="date"
                      value={packageData.startDate}
                      onChange={(e) => handleUpdateMatrixParam({ startDate: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none font-mono"
                    />
                  </div>

                  {/* Upfront Retainer Fee */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                        Upfront Fee (₹) *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomFeeUnlocked(prev => !prev)}
                        className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] hover:underline cursor-pointer font-mono"
                      >
                        {isCustomFeeUnlocked ? (
                          <>
                            <Lock className="w-3 h-3" />
                            Lock Rate
                          </>
                        ) : (
                          <>
                            <Unlock className="w-3 h-3" />
                            Custom Fee
                          </>
                        )}
                      </button>
                    </div>

                    {isCustomFeeUnlocked ? (
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={packageData.upfrontPrice || ''}
                          onChange={(e) => handleManualFeeChange(parseInt(e.target.value, 10) || 0)}
                          placeholder="0"
                          className="w-full pl-8 pr-3.5 py-2.5 bg-[#2A2A2A] border border-amber-500/50 focus:border-[#D4AF37] rounded-xl text-sm text-amber-300 focus:outline-none font-mono"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl text-sm text-emerald-400 font-mono font-bold">
                        <span>₹{Number(packageData.upfrontPrice || 0).toLocaleString('en-IN')}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Auto-Mapped
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bonus Projects */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                        Bonus Projects (Free)
                      </label>
                      {Number(packageData.bonusProjects) > 0 && (
                        <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                          +{packageData.bonusProjects} Free Projects
                        </span>
                      )}
                    </div>

                    {isCustomFeeUnlocked ? (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={packageData.bonusProjects ?? 0}
                        onChange={(e) => handleManualBonusChange(parseInt(e.target.value, 10) || 0)}
                        placeholder="0"
                        className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-amber-500/50 focus:border-[#D4AF37] rounded-xl text-sm text-amber-300 focus:outline-none font-mono"
                      />
                    ) : (
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#1E1E1E] border border-[#3A3A3A] rounded-xl text-sm text-purple-300 font-mono font-bold">
                        <span>{packageData.bonusProjects || 0} Free Projects</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/80 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          Included
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Metrics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {/* Total Allowed Quota */}
                  <div className="p-3.5 bg-[#1A1A1A] border border-[#333333] rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                      Total Quota
                    </div>
                    <div className="mt-1.5 text-lg font-bold text-[#D4AF37] font-mono">
                      {totalAllowedQuota} <span className="text-xs font-normal text-gray-400">Projects</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                      {packageData.projectsPerMonth} PPM × {packageData.durationMonths}M {Number(packageData.bonusProjects) > 0 ? `+ ${packageData.bonusProjects} Bonus` : ''}
                    </div>
                  </div>

                  {/* Upfront Retainer Fee */}
                  <div className="p-3.5 bg-[#1A1A1A] border border-[#333333] rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
                      Upfront Fee
                    </div>
                    <div className="mt-1.5 text-lg font-bold text-emerald-400 font-mono">
                      ₹{Number(packageData.upfrontPrice || 0).toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      100% Upfront Commitment
                    </div>
                  </div>

                  {/* Effective Cost / Project */}
                  <div className="p-3.5 bg-[#1A1A1A] border border-[#333333] rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Effective / Proj
                    </div>
                    <div className="mt-1.5 text-lg font-bold text-blue-400 font-mono">
                      ₹{effectiveCostPerProject.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Avg rate per deliverable
                    </div>
                  </div>

                  {/* Duration / End Date */}
                  <div className="p-3.5 bg-[#1A1A1A] border border-[#333333] rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      <Calendar className="w-3.5 h-3.5 text-purple-400" />
                      Coverage End
                    </div>
                    <div className="mt-1.5 text-sm font-bold text-purple-300 font-mono">
                      {calculatedEndDate || '—'}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {packageData.durationMonths} Month{packageData.durationMonths > 1 ? 's' : ''} active period
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-5 md:p-6 border-t border-[#2A2A2A] bg-[#242424]/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isEditing && onDeleteRequest && (
              <button
                type="button"
                onClick={() => {
                  const id = client?.id;
                  const name = client?.companyName || 'Client';
                  onClose();
                  if (id) onDeleteRequest(id, name);
                }}
                className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                title="Permanently Delete Client"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Record
              </button>
            )}

            {isEditing && onOpenTierHistory && client && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTierHistory(client);
                }}
                className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#D4AF37]/30 text-[#D4AF37] rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5 font-mono"
              >
                <Clock className="w-3.5 h-3.5" />
                Tier History ({formData.pricingCategoryHistory?.length || 1})
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] rounded-lg text-xs font-semibold text-gray-300 hover:text-white cursor-pointer transition-colors"
            >
              Cancel
            </button>

            {/* 3. REQUIRED: FIX "SAVE CHANGES" BUTTON DISABLED STATE */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isValid}
              className="px-6 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold text-xs uppercase tracking-wider rounded-lg hover:brightness-110 cursor-pointer disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{isEditing ? 'Save Changes' : 'Create Client'}</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
