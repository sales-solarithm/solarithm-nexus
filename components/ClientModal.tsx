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
  FileText
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  db, 
  ClientDocument, 
  UserDocument, 
  ProposalDocument,
  DEFAULT_PRICING_CATEGORIES,
  handleFirestoreError,
  OperationType
} from '@/lib/firebase';
import { 
  COLLECTIONS, 
  CLIENT_STATUS, 
  CLIENT_FIELDS, 
  CommercialModel, 
  PricingCategoryHistoryEntry 
} from '@/src/config/schema';

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
  pricingCategories = DEFAULT_PRICING_CATEGORIES,
  currentEmail
}: ClientModalProps) {
  const isEditing = Boolean(client && client.id);

  // Form State
  const [formData, setFormData] = useState<Record<string, any>>(() => getClientInitialState(client, currentEmail));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isManualProposal, setIsManualProposal] = useState(() => !client?.proposalNumber);

  // Adjust state during render when client or isOpen changes without triggering effect lint errors
  const [prevClientRef, setPrevClientRef] = useState<{ id?: string; client: typeof client; isOpen: boolean }>({
    id: client?.id,
    client,
    isOpen
  });

  if (client !== prevClientRef.client || isOpen !== prevClientRef.isOpen) {
    setPrevClientRef({ id: client?.id, client, isOpen });
    setFormData(getClientInitialState(client, currentEmail));
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
  // Review the condition that disables the button:
  // DO NOT lock the button if existing client already has valid fields
  const isValid = Boolean(
    formData.companyName?.trim() &&
    formData.contactPerson?.trim() &&
    formData.city?.trim()
  );

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValid) {
      setErrorMsg('Please provide Company Name, Contact Person, and City.');
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
      if (formData.subscriptionPlan) {
        payload.subscriptionPlan = formData.subscriptionPlan;
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
                    setFormData({
                      ...formData,
                      proposalNumber: e.target.value
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
                    setFormData({
                      ...formData,
                      proposalNumber: selectedPropNum,
                      proposalDate: matchedProp?.createdAt || (matchedProp as any)?.proposalDate || formData.proposalDate || '',
                      // Automatically sync pricing category/tier if available on the proposal
                      pricingCategory: matchedProp?.pricingCategory || (matchedProp as any)?.tier || formData.pricingCategory || 'Nil'
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
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Pricing Tier / Category
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
                {pricingCategories.filter(c => c !== 'Nil').map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider pl-1">
                Commercial Pricing Model
              </label>
              <select
                value={formData.commercialModel || 'PER_KW'}
                onChange={(e) => {
                  setFormData({ ...formData, commercialModel: e.target.value as CommercialModel });
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all cursor-pointer font-mono"
              >
                <option value="PER_KW">Standard Per kW Slabs</option>
                <option value="FIXED_PACKAGE">Fixed Package Retainer Plan</option>
              </select>
            </div>
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
