/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  X, 
  RefreshCw, 
  Briefcase, 
  Building2, 
  User, 
  Phone, 
  FileText, 
  Package, 
  Calculator, 
  Calendar, 
  Sparkles, 
  IndianRupee, 
  ShieldCheck, 
  SlidersHorizontal,
  Lock,
  Unlock,
  RotateCcw,
  Layers
} from 'lucide-react';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  db, 
  ClientDocument, 
  ProposalDocument, 
  handleFirestoreError, 
  OperationType 
} from '@/lib/firebase';
import { 
  COLLECTIONS, 
  CLIENT_STATUS, 
  CLIENT_FIELDS, 
  PackagePlanDocument, 
  ClientSubscriptionPlan, 
  PricingCategoryHistoryEntry, 
  CommercialModel 
} from '@/src/config/schema';
import { safeStringIdentifier } from '@/lib/userService';
import { CANONICAL_DEFAULT_PACKAGE_PLANS } from './PackagePlansMatrix';

export interface ApproveClientModalProps {
  isOpen: boolean;
  client: ClientDocument | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currentEmail: string;
}

export default function ApproveClientModal({
  isOpen,
  client,
  onClose,
  onSuccess,
  currentEmail
}: ApproveClientModalProps) {
  // Commercial Model
  const [commercialModel, setCommercialModel] = useState<CommercialModel>('PER_KW');

  // Dynamic Categories (Tiers)
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(true);
  const [assignedCategory, setAssignedCategory] = useState<string>('');

  // Package Plans State
  const [packagePlans, setPackagePlans] = useState<PackagePlanDocument[]>(CANONICAL_DEFAULT_PACKAGE_PLANS);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('pre_design_100_3m');
  
  // Custom package overrides
  const [packageScope, setPackageScope] = useState<string>('Pre Design');
  const [packagePpm, setPackagePpm] = useState<number>(100);
  const [packageDuration, setPackageDuration] = useState<number>(3);
  const [packageUpfrontPrice, setPackageUpfrontPrice] = useState<number>(70000);
  const [packageBonus, setPackageBonus] = useState<number>(15);
  const [packageStartDate, setPackageStartDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [fallbackCategory, setFallbackCategory] = useState<string>('T4');
  const [isPriceEngineMapped, setIsPriceEngineMapped] = useState<boolean>(true);
  const [isCustomOverride, setIsCustomOverride] = useState<boolean>(false);

  const [approving, setApproving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Combine live Firestore package plans and canonical defaults
  const allKnownPackagePlans = useMemo(() => {
    const list: PackagePlanDocument[] = [];
    const ids = new Set<string>();

    if (packagePlans && packagePlans.length > 0) {
      packagePlans.forEach(p => {
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
  }, [packagePlans]);

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

  const [isCustomFeeUnlocked, setIsCustomFeeUnlocked] = useState(false);

  // Reactive mapping helper: finds matching plan in Price Engine synchronously
  const handleUpdateMatrixParam = (params: {
    scopeCovered?: string;
    projectsPerMonth?: number;
    durationMonths?: number;
    startDate?: string;
  }) => {
    const nextScope = (params.scopeCovered !== undefined ? params.scopeCovered : packageScope).trim();
    const nextPpm = params.projectsPerMonth !== undefined ? Number(params.projectsPerMonth) : packagePpm;
    const nextDur = params.durationMonths !== undefined ? Number(params.durationMonths) : packageDuration;
    const nextStart = params.startDate !== undefined ? params.startDate : packageStartDate;

    if (params.scopeCovered !== undefined) setPackageScope(nextScope);
    if (params.projectsPerMonth !== undefined) setPackagePpm(nextPpm);
    if (params.durationMonths !== undefined) setPackageDuration(nextDur);
    if (params.startDate !== undefined) setPackageStartDate(nextStart);

    const matched = allKnownPackagePlans.find(p =>
      (p.scope || '').trim().toLowerCase() === nextScope.toLowerCase() &&
      Number(p.projectsPerMonth) === nextPpm &&
      Number(p.durationMonths) === nextDur
    );

    if (matched) {
      setPackageUpfrontPrice(Number(matched.upfrontPrice) || 0);
      setPackageBonus(Number(matched.bonusProjects) || 0);
      setSelectedPlanId(matched.id);
      setIsPriceEngineMapped(true);
      setIsCustomOverride(false);
    } else {
      setSelectedPlanId('custom');
      setIsPriceEngineMapped(false);
      setIsCustomOverride(true);
    }
    setIsCustomFeeUnlocked(false);
  };

  const handleManualUpfrontPriceChange = (val: number) => {
    setPackageUpfrontPrice(Math.max(0, val));
    setIsCustomOverride(true);
    setIsPriceEngineMapped(false);
    setSelectedPlanId('custom');
  };

  const handleManualBonusChange = (val: number) => {
    setPackageBonus(Math.max(0, val));
    setIsCustomOverride(true);
    setIsPriceEngineMapped(false);
    setSelectedPlanId('custom');
  };

  const handleResetFeeToEngine = () => {
    handleUpdateMatrixParam({});
  };

  // 1. DYNAMIC CATEGORY FETCHING (pricingRules & pricingCategories)
  useEffect(() => {
    if (!isOpen) return;

    let rulesCategories: string[] = [];
    let explicitCategories: string[] = [];
    let rulesDone = false;
    let explicitDone = false;

    const syncCategories = () => {
      const categoryMap = new Map<string, string>();

      [...rulesCategories, ...explicitCategories].forEach((cat) => {
        if (!cat) return;
        const trimmed = String(cat).trim();
        if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed.toLowerCase() === 'nil') return;
        const key = trimmed.toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, trimmed);
        } else {
          const current = categoryMap.get(key)!;
          if (trimmed === trimmed.toUpperCase() && current !== current.toUpperCase()) {
            categoryMap.set(key, trimmed);
          }
        }
      });

      const uniqueSorted = Array.from(categoryMap.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );

      setCategories(uniqueSorted);
      setAssignedCategory((prev) => prev || (uniqueSorted.length > 0 ? uniqueSorted[0] : ''));
      setFallbackCategory((prev) => prev || (uniqueSorted.includes('T4') ? 'T4' : uniqueSorted[0] || 'T4'));

      if (rulesDone && explicitDone) {
        setLoadingCategories(false);
      }
    };

    const unsubRules = onSnapshot(
      collection(db, COLLECTIONS.PRICING_RULES),
      (snap) => {
        rulesDone = true;
        const list: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data?.category && typeof data.category === 'string') {
            list.push(data.category.trim());
          }
        });
        rulesCategories = list;
        syncCategories();
      },
      (err) => {
        console.warn('Snapshot listener caught:', err);
        rulesDone = true;
        syncCategories();
      }
    );

    const unsubCategories = onSnapshot(
      collection(db, COLLECTIONS.PRICING_CATEGORIES),
      (snap) => {
        explicitDone = true;
        const list: string[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const name = data?.name || d.id;
          if (name && typeof name === 'string') {
            list.push(name.trim());
          }
        });
        explicitCategories = list;
        syncCategories();
      },
      (err) => {
        console.warn('Snapshot listener caught:', err);
        explicitDone = true;
        syncCategories();
      }
    );

    // 1b. Listen to live Package Plans from /packagePlans
    const unsubPackagePlans = onSnapshot(
      collection(db, COLLECTIONS.PACKAGE_PLANS),
      (snap) => {
        setLoadingPlans(false);
        if (!snap.empty) {
          const loaded: PackagePlanDocument[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data() as PackagePlanDocument;
            loaded.push({ ...data, id: docSnap.id });
          });
          const activeOnly = loaded.filter((p) => p.status !== 'inactive');
          if (activeOnly.length > 0) {
            setPackagePlans(activeOnly);
          }
        }
      },
      (err) => {
        console.warn('Error fetching live package plans:', err);
        setLoadingPlans(false);
      }
    );

    return () => {
      unsubRules();
      unsubCategories();
      unsubPackagePlans();
    };
  }, [isOpen]);

  // 2. AUTO-SELECT LINKED PROPOSAL OR CLIENT EXISTING CATEGORY & MODEL
  useEffect(() => {
    if (!isOpen || !client) return;

    let isCancelled = false;

    // Detect if client had a prior commercialModel
    if (client.commercialModel) {
      setCommercialModel(client.commercialModel);
    } else {
      setCommercialModel('PER_KW');
    }

    if (client.subscriptionPlan) {
      const sub = client.subscriptionPlan;
      if (sub.scopeCovered) setPackageScope(sub.scopeCovered);
      if (sub.projectsPerMonth) setPackagePpm(Number(sub.projectsPerMonth));
      if (sub.durationMonths) setPackageDuration(Number(sub.durationMonths));
      if (sub.upfrontPrice !== undefined) setPackageUpfrontPrice(Number(sub.upfrontPrice));
      if (sub.bonusProjects !== undefined) setPackageBonus(Number(sub.bonusProjects));
      if (sub.startDate) setPackageStartDate(sub.startDate.includes('T') ? sub.startDate.split('T')[0] : sub.startDate);
      if (sub.planId) setSelectedPlanId(sub.planId);
      setIsPriceEngineMapped(sub.planId ? sub.planId !== 'custom' : true);
      setIsCustomOverride(sub.planId === 'custom');
    }

    const resolveCategory = async () => {
      const propNumber = client.proposalNumber?.trim();
      let matchedCategory = '';

      if (propNumber) {
        try {
          const propQuery = query(
            collection(db, COLLECTIONS.PROPOSALS),
            where('proposalNumber', '==', propNumber)
          );
          const propSnap = await getDocs(propQuery);
          if (!propSnap.empty) {
            const data = propSnap.docs[0].data() as ProposalDocument;
            matchedCategory = (data.pricingCategory || (data as any).category || '').trim();
          }
        } catch (err) {
          console.warn('Could not auto-fetch linked proposal category:', err);
        }
      }

      if (isCancelled) return;

      if (matchedCategory) {
        setAssignedCategory(matchedCategory);
        setFallbackCategory(matchedCategory);
      } else if (client.pricingCategory) {
        setAssignedCategory(client.pricingCategory);
        setFallbackCategory(client.pricingCategory);
      } else if (categories.length > 0) {
        setAssignedCategory(categories[0]);
        setFallbackCategory(categories.includes('T4') ? 'T4' : categories[0]);
      }
    };

    resolveCategory();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, client, categories]);

  // 4. Dynamic Package Calculations
  const calculatedTotalQuota = useMemo(() => {
    return (packagePpm * packageDuration) + packageBonus;
  }, [packagePpm, packageDuration, packageBonus]);

  const calculatedEffectiveCostPerProject = useMemo(() => {
    if (calculatedTotalQuota <= 0) return 0;
    return Math.round(packageUpfrontPrice / calculatedTotalQuota);
  }, [packageUpfrontPrice, calculatedTotalQuota]);

  const calculatedEndDate = useMemo(() => {
    try {
      const start = new Date(packageStartDate);
      if (isNaN(start.getTime())) return '';
      const end = new Date(start);
      end.setMonth(end.getMonth() + (Number(packageDuration) || 1));
      return end.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }, [packageStartDate, packageDuration]);

  if (!isOpen || !client) {
    return null;
  }

  // 5. APPROVE HANDLER WITH PACKAGE CALCULATIONS & TIER HISTORY
  const handleApprove = async () => {
    if (!client.id) return;
    setApproving(true);
    setErrorMessage(null);

    const effectiveCategory = commercialModel === 'FIXED_PACKAGE'
      ? (fallbackCategory || assignedCategory || 'T4')
      : (assignedCategory || (categories.length > 0 ? categories[0] : 'UNASSIGNED'));

    const nowIso = new Date().toISOString();
    const effectiveFromDate = commercialModel === 'FIXED_PACKAGE' && packageStartDate
      ? new Date(packageStartDate).toISOString()
      : nowIso;

    try {
      // Build subscriptionPlan object if fixed package
      let subscriptionPlanPayload: ClientSubscriptionPlan | null = null;
      if (commercialModel === 'FIXED_PACKAGE') {
        const startIso = packageStartDate ? new Date(packageStartDate).toISOString() : nowIso;
        const endIso = calculatedEndDate ? new Date(calculatedEndDate).toISOString() : nowIso;
        
        subscriptionPlanPayload = {
          planId: selectedPlanId || `pkg_${safeStringIdentifier(packageScope)}_${packagePpm}_${packageDuration}m`,
          scopeCovered: packageScope,
          projectsPerMonth: packagePpm,
          durationMonths: packageDuration,
          upfrontPrice: packageUpfrontPrice,
          bonusProjects: packageBonus,
          totalAllowedProjects: calculatedTotalQuota,
          startDate: startIso,
          endDate: endIso,
          status: 'active'
        };
      }

      // Initial Pricing Category History entry
      const initialHistoryEntry: PricingCategoryHistoryEntry = {
        category: effectiveCategory,
        effectiveFrom: effectiveFromDate,
        effectiveTo: null,
        updatedBy: currentEmail,
        updatedAt: nowIso,
        reason: commercialModel === 'FIXED_PACKAGE'
          ? `Initial Retainer Package Approval: ${packageScope} ${packagePpm} PPM (${packageDuration}M) with fallback tier ${effectiveCategory}`
          : 'Initial client approval with assigned pricing category'
      };

      // 5a. Update /clients/{clientId}
      const clientRef = doc(db, COLLECTIONS.CLIENTS, client.id);
      const clientUpdatePayload: Record<string, any> = {
        [CLIENT_FIELDS.STATUS]: CLIENT_STATUS.APPROVED,
        [CLIENT_FIELDS.COMMERCIAL_MODEL]: commercialModel,
        [CLIENT_FIELDS.PRICING_CATEGORY]: effectiveCategory,
        [CLIENT_FIELDS.PRICING_CATEGORY_HISTORY]: [initialHistoryEntry],
        approvedAt: nowIso,
        approvedBy: currentEmail
      };

      if (commercialModel === 'FIXED_PACKAGE' && subscriptionPlanPayload) {
        clientUpdatePayload[CLIENT_FIELDS.SUBSCRIPTION_PLAN] = subscriptionPlanPayload;
      }

      // Retain the linked proposal reference intact
      if (client.proposalNumber) {
        clientUpdatePayload[CLIENT_FIELDS.PROPOSAL_NUMBER] = safeStringIdentifier(client.proposalNumber);
      }

      await updateDoc(clientRef, clientUpdatePayload);

      // 5b. Update linked proposal document
      const propNumber = client.proposalNumber?.trim();
      if (propNumber) {
        try {
          const propUpper = propNumber.toUpperCase();
          const proposalsRef = collection(db, COLLECTIONS.PROPOSALS);

          const propQuery = query(proposalsRef, where('proposalNumber', '==', propNumber));
          const propSnap = await getDocs(propQuery);

          const proposalPatch: Record<string, any> = {
            pricingCategory: effectiveCategory,
            category: effectiveCategory,
            commercialModel: commercialModel,
            updatedAt: nowIso
          };
          if (commercialModel === 'FIXED_PACKAGE' && subscriptionPlanPayload) {
            proposalPatch.subscriptionPlan = subscriptionPlanPayload;
          }

          if (!propSnap.empty) {
            for (const pDoc of propSnap.docs) {
              await setDoc(doc(db, COLLECTIONS.PROPOSALS, pDoc.id), proposalPatch, { merge: true });
            }
          } else {
            const sanitizedKey = propNumber.toLowerCase().replace(/[^a-z0-9]/g, '_');
            await setDoc(
              doc(db, COLLECTIONS.PROPOSALS, sanitizedKey),
              {
                proposalNumber: propNumber,
                ...proposalPatch,
                createdAt: nowIso
              },
              { merge: true }
            );
          }
        } catch (propErr) {
          console.error('Error synchronizing linked proposal document:', propErr);
        }
      }

      const successDetail = commercialModel === 'FIXED_PACKAGE'
        ? `Client "${client.companyName}" approved on Fixed Package Plan "${packageScope} (${packagePpm} PPM)" with ${calculatedTotalQuota} quota and fallback ${effectiveCategory}.`
        : `Client "${client.companyName}" approved with Pricing Category "${effectiveCategory}".`;

      onSuccess(successDetail);
      onClose();
    } catch (err: any) {
      console.error('Error approving client in ApproveClientModal:', err);
      handleFirestoreError(err, OperationType.UPDATE, `clients/${client.id}`);
      setErrorMessage(err.message || 'Failed to approve client. Please verify database permissions.');
    } finally {
      setApproving(false);
    }
  };

  const safeCompanyName = client.companyName || 'Unnamed Client';
  const safeContactPerson = client.contactPerson || 'N/A';
  const safeCity = client.city || 'N/A';
  const safeGstin = safeStringIdentifier(client.gstin);
  const safePhone = safeStringIdentifier(client.phone);
  const safeProposalNumber = safeStringIdentifier(client.proposalNumber);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#1E1E1E] border border-[#333333] rounded-2xl p-6 md:p-7 space-y-5 shadow-2xl relative text-gray-200 my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Approve Client & Commercial Setup
          </h3>
          <button
            onClick={onClose}
            disabled={approving}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
            {errorMessage}
          </div>
        )}

        {/* Client KYC & Identification Overview */}
        <div className="p-3.5 bg-[#2A2A2A] border border-[#3A3A3A] rounded-xl space-y-2 text-sm font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
              <Building2 className="w-4 h-4 shrink-0" />
              {safeCompanyName}
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
              Pending Approval
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-gray-300">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{safeContactPerson} ({safeCity})</span>
            </div>
            {safePhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>{safePhone}</span>
              </div>
            )}
            {safeGstin && (
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span>GST: {safeGstin}</span>
              </div>
            )}
          </div>

          {safeProposalNumber && (
            <div className="text-emerald-400 text-xs pt-1 flex items-center gap-1.5 border-t border-[#3A3A3A] mt-2">
              <Briefcase className="w-3.5 h-3.5 shrink-0" />
              <span>Linked Proposal Reference: <strong className="font-semibold">{safeProposalNumber}</strong></span>
            </div>
          )}
        </div>

        {/* Phase 2: Commercial Model Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Commercial Model
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#252525] border border-[#333333] rounded-xl">
            <button
              type="button"
              onClick={() => setCommercialModel('PER_KW')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                commercialModel === 'PER_KW'
                  ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/15'
                  : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              Per kW Slabs
            </button>
            <button
              type="button"
              onClick={() => setCommercialModel('FIXED_PACKAGE')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                commercialModel === 'FIXED_PACKAGE'
                  ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/15'
                  : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Fixed Package Retainer
            </button>
          </div>
        </div>

        {/* Conditional Configuration Area */}
        {commercialModel === 'PER_KW' ? (
          /* Standard Per kW Pricing Category Selector */
          <div className="space-y-2 p-4 bg-[#252525] border border-[#333333] rounded-xl">
            <label className="block text-xs font-semibold text-gray-200 uppercase tracking-wider">
              Assign Pricing Category (Slab Matrix Tier)
            </label>

            <select
              value={assignedCategory}
              onChange={(e) => setAssignedCategory(e.target.value)}
              disabled={loadingCategories || approving}
              className="w-full px-3.5 py-2.5 bg-[#1E1E1E] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-xl text-sm text-amber-400 focus:outline-none font-mono disabled:opacity-60 cursor-pointer transition-all"
            >
              {loadingCategories ? (
                <option value="" disabled>
                  Loading categories from Price Engine...
                </option>
              ) : categories.length === 0 ? (
                <option value="" disabled>
                  No categories configured in Price Engine
                </option>
              ) : (
                categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))
              )}
            </select>

            <p className="text-xs text-gray-400 pt-1">
              Projects under this client will be dynamically billed per kW based on the{' '}
              <strong className="text-amber-300 font-mono">{assignedCategory || 'selected'}</strong> slab rate matrix.
            </p>
          </div>
        ) : (
          /* Fixed Package / Subscription Calculations Area */
          <div className="space-y-4 p-4 bg-[#252525] border border-[#333333] rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Fixed Package Retainer Configuration
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                {allKnownPackagePlans.length} engine plans
              </span>
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#1E1E1E] border border-[#333333] rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-mono text-[10px] uppercase">Engine Status:</span>
                {isPriceEngineMapped ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Price Engine Matched
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                    Custom Plan Override
                  </span>
                )}
              </div>
              {isCustomOverride && (
                <button
                  type="button"
                  onClick={handleResetFeeToEngine}
                  className="inline-flex items-center gap-1 text-[10px] text-[#D4AF37] hover:underline cursor-pointer font-mono"
                >
                  <RotateCcw className="w-3 h-3" />
                  Re-sync Rate
                </button>
              )}
            </div>

            {/* 3-Step Matrix Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              {/* Step 1: Scope */}
              <div>
                <label className="text-[10px] text-gray-400 font-mono uppercase block mb-1">1. Scope of Work *</label>
                <select
                  value={packageScope}
                  onChange={(e) => handleUpdateMatrixParam({ scopeCovered: e.target.value })}
                  className="w-full px-2.5 py-2 bg-[#1E1E1E] border border-[#3A3A3A] rounded-lg text-gray-200 focus:border-[#D4AF37] focus:outline-none cursor-pointer"
                >
                  {availableScopes.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: PPM Quota */}
              <div>
                <label className="text-[10px] text-gray-400 font-mono uppercase block mb-1">2. PPM Quota *</label>
                <div className="grid grid-cols-3 gap-1">
                  {[100, 200, 300].map((ppmVal) => (
                    <button
                      key={ppmVal}
                      type="button"
                      onClick={() => handleUpdateMatrixParam({ projectsPerMonth: ppmVal })}
                      className={`py-1.5 px-1 text-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        packagePpm === ppmVal
                          ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-sm border border-[#D4AF37]'
                          : 'bg-[#1E1E1E] text-gray-300 hover:text-white border border-[#3A3A3A]'
                      }`}
                    >
                      {ppmVal}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Duration */}
              <div>
                <label className="text-[10px] text-gray-400 font-mono uppercase block mb-1">3. Duration *</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { months: 1, label: '1M' },
                    { months: 3, label: '3M' },
                    { months: 6, label: '6M' }
                  ].map((durItem) => (
                    <button
                      key={durItem.months}
                      type="button"
                      onClick={() => handleUpdateMatrixParam({ durationMonths: durItem.months })}
                      className={`py-1.5 px-1 text-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        packageDuration === durItem.months
                          ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-sm border border-[#D4AF37]'
                          : 'bg-[#1E1E1E] text-gray-300 hover:text-white border border-[#3A3A3A]'
                      }`}
                    >
                      {durItem.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Financial Terms & Start Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              {/* Start Date */}
              <div>
                <label className="text-[10px] text-gray-400 font-mono uppercase block mb-1">Retainer Start Date *</label>
                <input
                  type="date"
                  value={packageStartDate}
                  onChange={(e) => handleUpdateMatrixParam({ startDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#1E1E1E] border border-[#3A3A3A] rounded-lg text-gray-200 font-mono focus:border-[#D4AF37] focus:outline-none"
                />
              </div>

              {/* Upfront Retainer Fee */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-gray-400 font-mono uppercase">Upfront Fee (₹) *</label>
                  <button
                    type="button"
                    onClick={() => setIsCustomFeeUnlocked(prev => !prev)}
                    className="inline-flex items-center gap-1 text-[9px] text-[#D4AF37] hover:underline cursor-pointer font-mono"
                  >
                    {isCustomFeeUnlocked ? (
                      <>
                        <Lock className="w-2.5 h-2.5" /> Lock
                      </>
                    ) : (
                      <>
                        <Unlock className="w-2.5 h-2.5" /> Custom
                      </>
                    )}
                  </button>
                </div>
                {isCustomFeeUnlocked ? (
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={packageUpfrontPrice}
                    onChange={(e) => handleManualUpfrontPriceChange(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-[#1E1E1E] border border-amber-500/50 rounded-lg text-amber-300 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#1E1E1E] border border-[#3A3A3A] rounded-lg text-emerald-400 font-mono font-bold text-xs">
                    <span>₹{packageUpfrontPrice.toLocaleString('en-IN')}</span>
                    <span className="text-[9px] text-emerald-400/80 font-normal">Auto</span>
                  </div>
                )}
              </div>

              {/* Bonus Projects */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-gray-400 font-mono uppercase">Bonus Projects</label>
                  {packageBonus > 0 && !isCustomFeeUnlocked && (
                    <span className="text-[9px] text-emerald-400 font-mono font-semibold">
                      +{packageBonus} Free
                    </span>
                  )}
                </div>
                {isCustomFeeUnlocked ? (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={packageBonus}
                    onChange={(e) => handleManualBonusChange(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-[#1E1E1E] border border-amber-500/50 rounded-lg text-purple-300 font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#1E1E1E] border border-[#3A3A3A] rounded-lg text-purple-300 font-mono font-bold text-xs">
                    <span>{packageBonus} Projects</span>
                    <span className="text-[9px] text-purple-400/80 font-normal">Free</span>
                  </div>
                )}
              </div>
            </div>

            {/* Calculations Breakdown Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono">
              <div className="p-2.5 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center">
                <span className="text-[10px] text-gray-400 uppercase block">Total Quota</span>
                <span className="text-base font-bold text-amber-400">
                  {calculatedTotalQuota} <span className="text-[10px] text-gray-400 font-normal">proj</span>
                </span>
                <span className="text-[9px] text-gray-500 block">({packagePpm * packageDuration} + {packageBonus} bonus)</span>
              </div>

              <div className="p-2.5 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center">
                <span className="text-[10px] text-gray-400 uppercase block">Upfront Fee</span>
                <span className="text-base font-bold text-emerald-400">
                  ₹{packageUpfrontPrice.toLocaleString('en-IN')}
                </span>
                <span className="text-[9px] text-gray-500 block">Excl. GST</span>
              </div>

              <div className="p-2.5 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center">
                <span className="text-[10px] text-gray-400 uppercase block">Cost / Project</span>
                <span className="text-base font-bold text-cyan-400">
                  ₹{calculatedEffectiveCostPerProject.toLocaleString('en-IN')}
                </span>
                <span className="text-[9px] text-gray-500 block">Effective rate</span>
              </div>

              <div className="p-2.5 bg-[#1E1E1E] border border-[#333333] rounded-xl text-center">
                <span className="text-[10px] text-gray-400 uppercase block">End Date</span>
                <span className="text-xs font-bold text-gray-200 mt-1 block">
                  {calculatedEndDate || 'N/A'}
                </span>
                <span className="text-[9px] text-gray-500 block">{packageDuration} Months Cycle</span>
              </div>
            </div>

            {/* Fallback Tier for Out-of-Plan / Over-Quota Projects */}
            <div className="pt-2 border-t border-[#333333] space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-300">
                  Fallback Slab Tier (for Over-Quota / Out-of-Scope deliverables)
                </label>
                <span className="text-[11px] text-amber-400 font-mono">Billed per kW</span>
              </div>
              <select
                value={fallbackCategory}
                onChange={(e) => setFallbackCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-lg text-xs text-amber-400 font-mono cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-500">
                Any deliverable beyond {calculatedTotalQuota} projects or outside &quot;{packageScope}&quot; (e.g. SLD, CEIG, PVsyst) will be evaluated dynamically using this slab tier.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#2A2A2A]">
          <button
            type="button"
            onClick={onClose}
            disabled={approving}
            className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] rounded-lg text-sm text-gray-300 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={approving || loadingCategories}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            {approving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Approving Client...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Confirm &amp; Activate Client
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
