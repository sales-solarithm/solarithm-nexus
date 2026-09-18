/* eslint-disable react-hooks/set-state-in-effect */
'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";
import { ConfirmModal, PromptModal } from './ConfirmModal';
import * as XLSX from 'xlsx';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Layers, 
  Sparkles, 
  Tag, 
  FileSpreadsheet, 
  Shield,
  HelpCircle,
  Users,
  IndianRupee,
  Briefcase,
  UserCheck
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ScopeDocument, 
  PRESET_SCOPES, 
  PricingCategory, 
  CapacityUnit, 
  PriceType, 
  CapacityRow, 
  PricingRuleDocument, 
  CommissionRuleDocument,
  DEFAULT_PRICING_CATEGORIES, 
  DEFAULT_12_CAPACITY_ROWS, 
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
  writeBatch
} from 'firebase/firestore';

interface PriceEngineTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

type CommissionMasterState = {
  designer: Record<string, Record<string, CapacityRow[]>>;
  sales: Record<string, Record<string, CapacityRow[]>>;
};

const DEFAULT_COMMISSION_ROWS: CapacityRow[] = [];

export default function PriceEngineTab({ currentEmail, currentRole }: PriceEngineTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManagePricing = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  // State
  const [activeMatrixTab, setActiveMatrixTab] = useState<'client-pricing' | 'employee-commission'>('client-pricing');
  const [allRules, setAllRules] = useState<(PricingRuleDocument & { id: string })[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  
  const [selectedCategory, setSelectedCategory] = useState<PricingCategory>('T1');
  const [selectedScopeName, setSelectedScopeName] = useState<string>('PRE DESIGN');
  const [selectedSubService, setSelectedSubService] = useState<string>('');
  
  const [capacityRows, setCapacityRows] = useState<CapacityRow[]>([]);
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Additions State (Pricing)
  const [manualCategories, setManualCategories] = useState<string[]>([]);
  const [manualScopes, setManualScopes] = useState<string[]>([]);
  const [manualSubServices, setManualSubServices] = useState<string[]>([]);

  // Commission Matrix State (Independent from Pricing Matrix & synced with commissionRules collection)
  const [allCommissionRules, setAllCommissionRules] = useState<(CommissionRuleDocument & { id: string })[]>([]);
  const [loadingCommissionRules, setLoadingCommissionRules] = useState(true);
  const [savingCommissionRule, setSavingCommissionRule] = useState(false);
  const [isCommissionDirty, setIsCommissionDirty] = useState(false);

  const [commissionRole, setCommissionRole] = useState<'Designer' | 'Sales'>('Designer');
  const [maxCaps, setMaxCaps] = useState<{ designer: string | number; sales: string | number }>({
    designer: 50000,
    sales: 50000,
  });
  const [selectedCommissionScopeName, setSelectedCommissionScopeName] = useState<string>('PRE DESIGN');
  const [selectedCommissionSubService, setSelectedCommissionSubService] = useState<string>('');

  // Master state storing all commission data grouped by Role -> Scope -> SubService
  const [masterCommissionState, setMasterCommissionState] = useState<CommissionMasterState>({
    designer: {},
    sales: {}
  });

  const [manualCommissionScopes, setManualCommissionScopes] = useState<string[]>([]);
  const [manualCommissionSubServices, setManualCommissionSubServices] = useState<string[]>([]);

  // Dialog & Modal States
  const [promptModalState, setPromptModalState] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    placeholder?: string;
    initialValue?: string;
    onSubmit: (val: string) => void;
  }>({
    isOpen: false,
    title: '',
    onSubmit: () => {}
  });

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
    action?: 'generic' | 'category';
    catName?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: ''
  });

  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  const [csvOverwriteModal, setCsvOverwriteModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onOverwrite: () => void;
    onMerge: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onOverwrite: () => {},
    onMerge: () => {}
  });

  // Active slice computed from masterCommissionState based on current visual filters (Role, Scope, SubService)
  const currentRoleKey = commissionRole.toLowerCase() as 'designer' | 'sales';
  const currentEffectiveSubService = selectedCommissionSubService || 'N/A';
  const currentCommissionRows: CapacityRow[] =
    masterCommissionState[currentRoleKey]?.[selectedCommissionScopeName]?.[currentEffectiveSubService] ||
    [];

  // Helper to mutate active slice within the masterCommissionState without resetting other combinations
  const updateActiveCommissionSlice = (updatedRows: CapacityRow[]) => {
    setMasterCommissionState(prev => {
      const roleObj = prev[currentRoleKey] || {};
      const scopeObj = roleObj[selectedCommissionScopeName] || {};
      return {
        ...prev,
        [currentRoleKey]: {
          ...roleObj,
          [selectedCommissionScopeName]: {
            ...scopeObj,
            [currentEffectiveSubService]: updatedRows
          }
        }
      };
    });
    setIsCommissionDirty(true);
  };

  const handleAddNewCommissionScope = () => {
    setPromptModalState({
      isOpen: true,
      title: 'New Commission Scope of Work',
      message: 'Enter the Scope of Work name for employee commission rules:',
      placeholder: 'e.g. Detailed Engineering',
      onSubmit: (name: string) => {
        if (name && name.trim() !== '') {
          const scope = name.trim();
          setManualCommissionScopes(prev => Array.from(new Set([...prev, scope])));
          setSelectedCommissionScopeName(scope);
          setMasterCommissionState(prev => {
            const roleObj = prev[currentRoleKey] || {};
            if (!roleObj[scope]) {
              return {
                ...prev,
                [currentRoleKey]: {
                  ...roleObj,
                  [scope]: { [currentEffectiveSubService]: [...DEFAULT_COMMISSION_ROWS] }
                }
              };
            }
            return prev;
          });
          setIsCommissionDirty(true);
        }
      }
    });
  };

  const handleAddNewCommissionSubService = () => {
    setPromptModalState({
      isOpen: true,
      title: 'New Commission Sub-Service Tier',
      message: 'Enter the Sub-Service Tier name for employee commission:',
      placeholder: 'e.g. Standard Tier',
      onSubmit: (name: string) => {
        if (name && name.trim() !== '') {
          const sub = name.trim();
          setManualCommissionSubServices(prev => Array.from(new Set([...prev, sub])));
          setSelectedCommissionSubService(sub);
          setMasterCommissionState(prev => {
            const roleObj = prev[currentRoleKey] || {};
            const scopeObj = roleObj[selectedCommissionScopeName] || {};
            if (!scopeObj[sub]) {
              return {
                ...prev,
                [currentRoleKey]: {
                  ...roleObj,
                  [selectedCommissionScopeName]: {
                    ...scopeObj,
                    [sub]: [...DEFAULT_COMMISSION_ROWS]
                  }
                }
              };
            }
            return prev;
          });
          setIsCommissionDirty(true);
        }
      }
    });
  };

  const handleCommissionAddRow = () => {
    const newRow: CapacityRow = {
      capacityRange: '100-200',
      unit: 'KW',
      price: 0,
      priceType: 'Per KW'
    };
    updateActiveCommissionSlice([...currentCommissionRows, newRow]);
  };

  const handleCommissionUpdateRow = (index: number, field: keyof CapacityRow, value: any) => {
    const updated = currentCommissionRows.map((r, idx) => (idx === index ? { ...r, [field]: value } : r));
    updateActiveCommissionSlice(updated);
  };

  const handleCommissionDeleteRow = (index: number) => {
    const updated = currentCommissionRows.filter((_, idx) => idx !== index);
    updateActiveCommissionSlice(updated);
  };

  const handleResetCommissionDefaultRows = () => {
    updateActiveCommissionSlice([]);
    setSuccessMsg('Commission rows reset to empty list.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleAddNewCategory = () => {
    setPromptModalState({
      isOpen: true,
      title: 'New Pricing Category',
      message: 'Enter new Pricing Category code (e.g. T4):',
      placeholder: 'T4',
      onSubmit: (name: string) => {
        if (name && name.trim() !== '') {
          const cat = name.trim().toUpperCase();
          setManualCategories(prev => Array.from(new Set([...prev, cat])));
          setSelectedCategory(cat);
        }
      }
    });
  };

  const handleAddNewScope = () => {
    setPromptModalState({
      isOpen: true,
      title: 'New Scope of Work',
      message: 'Enter new Scope of Work name:',
      placeholder: 'e.g. Turnkey Civil Works',
      onSubmit: (name: string) => {
        if (name && name.trim() !== '') {
          const scope = name.trim();
          setManualScopes(prev => Array.from(new Set([...prev, scope])));
          setSelectedScopeName(scope);
        }
      }
    });
  };

  const handleAddNewSubService = () => {
    setPromptModalState({
      isOpen: true,
      title: 'New Sub-Service Tier',
      message: 'Enter new Sub-Service Tier name:',
      placeholder: 'e.g. Standard Tier',
      onSubmit: (name: string) => {
        if (name && name.trim() !== '') {
          const sub = name.trim();
          setManualSubServices(prev => Array.from(new Set([...prev, sub])));
          setSelectedSubService(sub);
        }
      }
    });
  };

  const fetchAllRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PRICING_RULES));
      const rules = snap.docs.map(d => ({ ...d.data(), id: d.id } as PricingRuleDocument & { id: string }));
      setAllRules(rules);
    } catch (err) {
      console.error('Error fetching all rules:', err);
      setErrorMsg('Failed to load pricing matrix.');
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const fetchAllCommissionRules = useCallback(async () => {
    setLoadingCommissionRules(true);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.COMMISSION_RULES));
      const rules = snap.docs.map(d => ({ ...d.data(), id: d.id } as CommissionRuleDocument & { id: string }));
      setAllCommissionRules(rules);

      const newMasterState: CommissionMasterState = {
        designer: {},
        sales: {}
      };

      const newCaps = { designer: 50000, sales: 50000 };

      rules.forEach((rule) => {
        const role = (rule.role?.toLowerCase().includes('sale') ? 'sales' : 'designer') as 'designer' | 'sales';
        const scope = rule.scope || 'PRE DESIGN';
        const sub = rule.subService || 'N/A';

        if (!newMasterState[role][scope]) {
          newMasterState[role][scope] = {};
        }

        newMasterState[role][scope][sub] =
          rule.capacityRows && rule.capacityRows.length > 0
            ? rule.capacityRows
            : [];

        const capVal = (rule as any).maxCommission ?? (rule as any).maxCap ?? (rule as any).max_cap ?? (rule as any).designerMaxCap;
        if (capVal !== undefined && capVal !== null && capVal !== '') {
          const parsed = Number(capVal);
          if (!isNaN(parsed) && parsed > 0) {
            newCaps[role] = parsed;
          }
        }
      });

      setMasterCommissionState(newMasterState);
      setMaxCaps(newCaps);
      setIsCommissionDirty(false);
    } catch (err) {
      console.error('Error fetching commission rules:', err);
      setErrorMsg('Failed to load commission matrix.');
    } finally {
      setLoadingCommissionRules(false);
    }
  }, []);

  useEffect(() => {
    if (canManagePricing) {
      fetchAllRules();
      fetchAllCommissionRules();
    }
  }, [canManagePricing, fetchAllRules, fetchAllCommissionRules]);

  // Deduplicate tier names case-insensitively, strictly preferring live uppercase/non-default casing
  const deduplicateTiers = (items: (string | undefined | null)[]): string[] => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      if (!item) return;
      const trimmed = item.trim();
      if (!trimmed || trimmed.toLowerCase() === 'n/a') return;
      const lowerKey = trimmed.toLowerCase();
      if (!map.has(lowerKey)) {
        map.set(lowerKey, trimmed);
      } else {
        const existing = map.get(lowerKey)!;
        if (trimmed === trimmed.toUpperCase() && existing !== existing.toUpperCase()) {
          map.set(lowerKey, trimmed);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  };

  // Derived state for dropdowns strictly from live data
  const displayCategories = Array.from(new Set([...allRules.map(r => r.category), ...manualCategories])).sort();
  
  const displayScopes = Array.from(new Set([
    ...allRules.filter(r => r.category === selectedCategory).map(r => r.scope),
    ...manualScopes
  ])).sort();
  
  const displaySubServices = deduplicateTiers([
    ...allRules.filter(r => r.category === selectedCategory && r.scope === selectedScopeName).map(r => r.subService),
    ...manualSubServices
  ]);

  // Commission dropdown derived states strictly from live Firebase data
  const currentCommRoleKey = commissionRole.toLowerCase() as 'designer' | 'sales';
  const roleCommissionRules = allCommissionRules.filter(
    r => (r.role?.toLowerCase().includes('sale') ? 'sales' : 'designer') === currentCommRoleKey
  );

  const displayCommissionScopes = Array.from(new Set([
    ...roleCommissionRules.map(r => r.scope),
    ...Object.keys(masterCommissionState[currentCommRoleKey] || {}),
    ...allRules.map(r => r.scope),
    ...allCommissionRules.map(r => r.scope),
    ...manualScopes,
    ...manualCommissionScopes
  ])).filter(Boolean).sort();

  const roleMaster = masterCommissionState[currentCommRoleKey] || {};
  const masterSubsForScope = selectedCommissionScopeName && roleMaster[selectedCommissionScopeName]
    ? Object.keys(roleMaster[selectedCommissionScopeName])
    : Object.values(roleMaster).flatMap(s => Object.keys(s));

  const displayCommissionSubServices = deduplicateTiers([
    ...roleCommissionRules
      .filter(r => !selectedCommissionScopeName || r.scope === selectedCommissionScopeName)
      .map(r => r.subService),
    ...masterSubsForScope,
    ...allCommissionRules
      .filter(r => !selectedCommissionScopeName || r.scope === selectedCommissionScopeName)
      .map(r => r.subService),
    ...manualCommissionSubServices
  ]);

  // Auto-select when dropdown options change
  useEffect(() => {
    if (displayCategories.length > 0 && !displayCategories.includes(selectedCategory)) {
      setSelectedCategory(displayCategories[0]);
    }
  }, [displayCategories, selectedCategory]);

  useEffect(() => {
    if (displayScopes.length > 0 && !displayScopes.includes(selectedScopeName)) {
      setSelectedScopeName(displayScopes[0]);
    } else if (displayScopes.length === 0) {
      setSelectedScopeName('');
    }
  }, [displayScopes, selectedScopeName, selectedCategory]);

  useEffect(() => {
    if (displaySubServices.length > 0 && !displaySubServices.includes(selectedSubService)) {
      setSelectedSubService(displaySubServices[0]);
    } else if (displaySubServices.length === 0) {
      setSelectedSubService('');
    }
  }, [displaySubServices, selectedSubService, selectedScopeName, selectedCategory]);

  useEffect(() => {
    if (displayCommissionScopes.length > 0 && !displayCommissionScopes.includes(selectedCommissionScopeName)) {
      setSelectedCommissionScopeName(displayCommissionScopes[0]);
    }
  }, [displayCommissionScopes, selectedCommissionScopeName]);

  useEffect(() => {
    if (displayCommissionSubServices.length > 0 && !displayCommissionSubServices.includes(selectedCommissionSubService)) {
      setSelectedCommissionSubService(displayCommissionSubServices[0]);
    }
  }, [displayCommissionSubServices, selectedCommissionSubService]);

  // Sync active pricing rule with selected dropdowns
  useEffect(() => {
    const activeRule = allRules.find(r => 
      r.category === selectedCategory && 
      r.scope === selectedScopeName && 
      r.subService === selectedSubService
    );
    
    if (activeRule) {
      setExistingDocId(activeRule.id);
      setCapacityRows(activeRule.capacityRows || []);
    } else {
      setExistingDocId(null);
      setCapacityRows([]);
    }
  }, [selectedCategory, selectedScopeName, selectedSubService, allRules]);

  const handleScopeChange = (newScopeName: string) => {
    setSelectedScopeName(newScopeName);
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = (id: string, collectionName: string, label?: string) => {
    if (!id) {
      setErrorMsg("Cannot delete: Document ID is missing.");
      return;
    }
    setDeleteModalState({
      isOpen: true,
      id,
      collectionName,
      label: label || `record (${id})`,
      action: 'generic'
    });
  };

  const confirmDeleteCategory = (cat: string) => {
    setDeleteModalState({
      isOpen: true,
      id: cat,
      collectionName: COLLECTIONS.PRICING_CATEGORIES,
      label: `Category "${cat}"`,
      action: 'category',
      catName: cat
    });
  };

  const executeDelete = async () => {
    const { id, collectionName, action, catName } = deleteModalState;
    if (!id) return;

    setIsDeleting(true);
    setErrorMsg(null);
    try {
      if (action === 'category' && catName) {
        setDeletingCategory(catName);
        // Delete from DB
        const snap = await getDocs(query(collection(db, COLLECTIONS.PRICING_CATEGORIES), where('name', '==', catName)));
        if (!snap.empty) {
          await deleteDoc(doc(db, COLLECTIONS.PRICING_CATEGORIES, snap.docs[0].id));
        } else {
          await deleteDoc(doc(db, COLLECTIONS.PRICING_CATEGORIES, catName));
        }
        
        // Update clients
        const clientsSnap = await getDocs(query(collection(db, COLLECTIONS.CLIENTS), where('pricingCategory', '==', catName)));
        if (!clientsSnap.empty) {
          const batch = writeBatch(db);
          clientsSnap.docs.forEach((d) => {
            batch.update(doc(db, COLLECTIONS.CLIENTS, d.id), { pricingCategory: 'Nil' });
          });
          await batch.commit();
        }

        setSuccessMsg(`Category "${catName}" deleted successfully.`);

        if (selectedCategory === catName) {
          setSelectedCategory(displayCategories.find(c => c !== catName) || 'T1');
        }
        
        await fetchAllRules(); // Re-sync state
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        await deleteDoc(doc(db, collectionName, id));
        if (collectionName === COLLECTIONS.PRICING_RULES) {
          setAllRules(prev => prev.filter(r => r.id !== id));
          if (existingDocId === id) {
            setExistingDocId(null);
            setCapacityRows([]);
          }
        } else if (collectionName === COLLECTIONS.COMMISSION_RULES) {
          setAllCommissionRules(prev => prev.filter(r => r.id !== id));
        } else if (collectionName === COLLECTIONS.PRICING_CATEGORIES) {
          setManualCategories(prev => prev.filter(c => c !== id));
        }
        setSuccessMsg('Record permanently deleted.');
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err) {
      console.error('Error deleting record from Firestore:', err);
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
      setErrorMsg("Failed to delete record. Check your Firebase Security Rules.");
    } finally {
      setIsDeleting(false);
      setDeletingCategory(null);
      setDeleteModalState(prev => ({ ...prev, isOpen: false }));
    }
  };

  // Row Manipulation Handlers
  const handleAddRow = () => {
    const newRow: CapacityRow = {
      capacityRange: '100-200',
      unit: 'KW',
      price: 0,
      priceType: 'Per KW'
    };
    setCapacityRows((prev) => [...prev, newRow]);
  };

  const handleUpdateRow = (index: number, field: keyof CapacityRow, value: any) => {
    setCapacityRows((prev) =>
      prev.map((r, idx) => (idx === index ? { ...r, [field]: value } : r))
    );
  };

  const handleDeleteRow = (index: number) => {
    setCapacityRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleResetDefaultRows = () => {
    setCapacityRows([]);
    setSuccessMsg('Capacity rows reset to empty list.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Save Matrix Handler
  const handleSaveMatrix = async () => {
    setSavingRule(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const effectiveSubService = selectedSubService || 'N/A';
    try {
      const batch = writeBatch(db);

      // 1. Ensure all Categories exist (including active and any uncommitted manual ones)
      const categoriesToCommit = Array.from(new Set([...manualCategories, selectedCategory]));
      categoriesToCommit.forEach(cat => {
        const catRef = doc(db, COLLECTIONS.PRICING_CATEGORIES, cat);
        batch.set(catRef, { name: cat, updatedAt: new Date().toISOString() }, { merge: true });
      });

      // 2. Ensure all Scopes exist
      const scopesToCommit = Array.from(new Set([...manualScopes, selectedScopeName]));
      for (const s of scopesToCommit) {
        if (!s) continue;
        const sId = s.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sRef = doc(db, COLLECTIONS.SCOPES, sId);
        
        // We only append the active sub-service to the ACTIVE scope.
        // For other manual scopes, we just ensure they exist.
        if (s === selectedScopeName) {
          const scopeSnap = await getDocs(query(collection(db, COLLECTIONS.SCOPES), where('name', '==', s)));
          let currentSubServices: string[] = [];
          if (!scopeSnap.empty) {
            currentSubServices = scopeSnap.docs[0].data().subServices || [];
          }
          if (!currentSubServices.some(sub => sub.toLowerCase() === effectiveSubService.toLowerCase()) && effectiveSubService !== 'N/A') {
             currentSubServices.push(effectiveSubService);
          }
          batch.set(sRef, {
            name: s,
            hasSubServices: true,
            subServices: currentSubServices,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else {
          batch.set(sRef, { name: s, hasSubServices: true, updatedAt: new Date().toISOString() }, { merge: true });
        }
      }

      // We clear manual arrays here so we don't keep rewriting them unnecessarily, but it's fine if they remain.
      setManualCategories([]);
      setManualScopes([]);
      setManualSubServices([]);

      // 3. Register Pricing Rule
      let targetDocId = existingDocId;
      if (!targetDocId) {
        targetDocId = `${selectedCategory}_${selectedScopeName}_${effectiveSubService}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      }
      const ruleRef = doc(db, COLLECTIONS.PRICING_RULES, targetDocId);
      
      const enhancedCapacityRows = capacityRows.map(row => ({
        ...row,
        category: selectedCategory,
        scope: selectedScopeName,
        subService: effectiveSubService
      }));

      const payload: PricingRuleDocument = {
        category: selectedCategory,
        scope: selectedScopeName,
        subService: effectiveSubService,
        capacityRows: enhancedCapacityRows,
        updatedAt: new Date().toISOString()
      };
      
      batch.set(ruleRef, payload, { merge: true });

      await batch.commit();

      setExistingDocId(targetDocId);
      await fetchAllRules(); // Re-sync state from DB to persist manual additions

      setSuccessMsg(`Pricing matrix saved successfully for ${selectedCategory} > ${selectedScopeName} (${effectiveSubService}).`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error saving pricing rule:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.PRICING_RULES);
      setErrorMsg(`Failed to save matrix: ${errInfo.error}`);
    } finally {
      setSavingRule(false);
    }
  };

  // Global Save Commission Matrix Handler (Commits ALL slices in masterCommissionState for the active Role at once)
  const handleSaveCommissionMatrix = async () => {
    setSavingCommissionRule(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const roleKey = commissionRole.toLowerCase() as 'designer' | 'sales';
    const currentCap = maxCaps[roleKey];
    const numCap = typeof currentCap === 'number' ? currentCap : parseFloat(String(currentCap)) || 0;

    try {
      const batch = writeBatch(db);

      // 1. Ensure Scopes exist in 'scopes' collection
      const roleMaster = masterCommissionState[roleKey] || {};
      const allRoleScopes = Array.from(new Set([
        ...manualCommissionScopes,
        ...Object.keys(roleMaster),
        selectedCommissionScopeName
      ])).filter(Boolean);

      for (const s of allRoleScopes) {
        const sId = s.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const sRef = doc(db, COLLECTIONS.SCOPES, sId);

        const subServicesInScope = Object.keys(roleMaster[s] || {});
        if (s === selectedCommissionScopeName && currentEffectiveSubService !== 'N/A') {
          if (!subServicesInScope.some(sub => sub.toLowerCase() === currentEffectiveSubService.toLowerCase())) {
            subServicesInScope.push(currentEffectiveSubService);
          }
        }

        batch.set(sRef, {
          name: s,
          hasSubServices: true,
          subServices: subServicesInScope.filter(sub => sub !== 'N/A'),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      setManualCommissionScopes([]);
      setManualCommissionSubServices([]);

      // 2. Iterate through all Scopes and Sub-Services in masterState for active role and batch-save
      let totalCombinations = 0;
      let totalTiers = 0;

      for (const scope of allRoleScopes) {
        const subMap = roleMaster[scope] || { [currentEffectiveSubService]: currentCommissionRows };
        const allSubs = Object.keys(subMap).length > 0 ? Object.keys(subMap) : [currentEffectiveSubService];

        for (const subService of allSubs) {
          const rows = subMap[subService] || (scope === selectedCommissionScopeName && subService === currentEffectiveSubService ? currentCommissionRows : DEFAULT_COMMISSION_ROWS);
          if (!rows || rows.length === 0) continue;

          const targetDocId = `${roleKey}_${scope}_${subService}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          const ruleRef = doc(db, COLLECTIONS.COMMISSION_RULES, targetDocId);

          const enhancedCapacityRows = rows.map(row => ({
            ...row,
            role: roleKey,
            scope,
            subService
          }));

          const payload: CommissionRuleDocument = {
            role: roleKey,
            scope,
            subService,
            maxCommission: numCap,
            capacityRows: enhancedCapacityRows,
            updatedAt: new Date().toISOString()
          };

          batch.set(ruleRef, payload, { merge: true });
          totalCombinations++;
          totalTiers += rows.length;
        }
      }

      await batch.commit();

      setIsCommissionDirty(false);
      await fetchAllCommissionRules();

      setSuccessMsg(`Successfully saved all ${totalCombinations} commission configurations (${totalTiers} tiers) for ${commissionRole} to Firestore.`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      console.error('Error batch-saving commission matrix:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.COMMISSION_RULES);
      setErrorMsg(`Failed to save commission matrix: ${errInfo.error}`);
    } finally {
      setSavingCommissionRule(false);
    }
  };

  // Download Template (CSV Export)
  const handleDownloadTemplate = () => {
    const effectiveSubService = selectedSubService || 'N/A';
    const csvRows = [
      ['Category', 'Scope', 'SubService', 'CapacityRange', 'Unit', 'Price', 'PriceType'],
      ...capacityRows.map((r) => [
        selectedCategory,
        `"${selectedScopeName}"`,
        `"${effectiveSubService}"`,
        `"${r.capacityRange}"`,
        r.unit,
        r.price,
        r.priceType
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PriceEngine_${selectedCategory}_${selectedScopeName}_${effectiveSubService}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMsg('Price matrix CSV template exported.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Download Commission Template (CSV Export)
  const handleDownloadCommissionTemplate = () => {
    const roleKey = commissionRole.toLowerCase() as 'designer' | 'sales';
    const currentCap = maxCaps[roleKey];
    const effectiveCap = typeof currentCap === 'number' ? currentCap : parseFloat(String(currentCap)) || 50000;
    const csvRows = [
      ['Role', 'Scope', 'SubService', 'MaxCommission', 'CapacityRange', 'Unit', 'Price', 'PriceType'],
      ...currentCommissionRows.map((r) => [
        commissionRole,
        `"${selectedCommissionScopeName}"`,
        `"${currentEffectiveSubService}"`,
        effectiveCap,
        `"${r.capacityRange}"`,
        r.unit,
        r.price,
        r.priceType
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CommissionMatrix_${commissionRole}_${selectedCommissionScopeName}_${currentEffectiveSubService}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMsg('Commission matrix CSV template exported.');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Helper to parse file into 2D rows (supports .xlsx, .xls, .csv, .txt)
  const parseWorkbookRows = async (file: File): Promise<any[][]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
    return rawRows.filter(row => row && Array.isArray(row) && row.some(cell => String(cell).trim().length > 0));
  };

  // Helper to group parsed commission rows into unique documents by Role, Scope, and Sub-Service
  const groupCommissionData = (
    rawRows: any[][],
    activeMaxCaps: { designer: string | number; sales: string | number }
  ) => {
    interface GroupedCommissionPayload {
      role: 'designer' | 'sales';
      scope: string;
      subService: string;
      maxCommission: number;
      maxCap: number;
      capacityRows: CapacityRow[];
    }

    const groups: Record<string, GroupedCommissionPayload> = {};
    let rowCount = 0;
    let detectedDesignerMaxCap: number | null = null;
    let detectedSalesMaxCap: number | null = null;

    // 1. Scan the whole sheet for standalone Max Cap declarations or key-value cells
    for (const row of rawRows) {
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c] || '').trim();
        if (/designer.*(?:max|cap)|(?:max|cap).*designer/i.test(cellStr)) {
          const nextVal = String(row[c + 1] || '').replace(/[^0-9.]/g, '');
          const parsed = parseFloat(nextVal);
          if (!isNaN(parsed) && parsed > 0) {
            detectedDesignerMaxCap = parsed;
          } else {
            const inlineMatch = cellStr.match(/(\d+[\d,.]*)/);
            if (inlineMatch) {
              const inlineParsed = parseFloat(inlineMatch[1].replace(/,/g, ''));
              if (!isNaN(inlineParsed) && inlineParsed > 0) detectedDesignerMaxCap = inlineParsed;
            }
          }
        } else if (/sales.*(?:max|cap)|(?:max|cap).*sales/i.test(cellStr)) {
          const nextVal = String(row[c + 1] || '').replace(/[^0-9.]/g, '');
          const parsed = parseFloat(nextVal);
          if (!isNaN(parsed) && parsed > 0) {
            detectedSalesMaxCap = parsed;
          }
        }
      }
    }

    // 2. Identify header row
    let headerRowIdx = -1;
    let roleIdx = -1;
    let scopeIdx = -1;
    let subServiceIdx = -1;
    let maxCapIdx = -1;
    let capacityIdx = -1;
    let unitIdx = -1;
    let priceIdx = -1;
    let priceTypeIdx = -1;

    for (let r = 0; r < Math.min(6, rawRows.length); r++) {
      const row = rawRows[r].map((c) => String(c).trim().toLowerCase());
      const hasKeyHeaders = row.some((c) => /role|scope|sub|tier|capacity|price|rate|cap/i.test(c));
      if (hasKeyHeaders) {
        headerRowIdx = r;
        row.forEach((col, idx) => {
          if (/role|employee/i.test(col)) roleIdx = idx;
          else if (/scope/i.test(col)) scopeIdx = idx;
          else if (/sub|tier/i.test(col)) subServiceIdx = idx;
          else if (
            /max.*cap|max.*commission|designer.*cap|cap.*limit|maxcap|maxcommission/i.test(col) ||
            (col.includes('cap') && !col.includes('capacity')) ||
            (col.includes('max') && !col.includes('capacity'))
          ) {
            maxCapIdx = idx;
          } else if (/capacity|range|plant/i.test(col)) capacityIdx = idx;
          else if (/unit/i.test(col)) unitIdx = idx;
          else if (/price.*type|rate.*type|type/i.test(col)) priceTypeIdx = idx;
          else if (/price|rate|amount|fee/i.test(col) || (col.includes('commission') && !col.includes('max'))) priceIdx = idx;
        });
        break;
      }
    }

    // Default positional fallbacks if missing header row or certain indices
    if (headerRowIdx === -1) {
      headerRowIdx = -1;
      roleIdx = 0;
      scopeIdx = 1;
      subServiceIdx = 2;
      maxCapIdx = 3;
      capacityIdx = 4;
      unitIdx = 5;
      priceIdx = 6;
      priceTypeIdx = 7;
    } else {
      if (roleIdx === -1) roleIdx = 0;
      if (scopeIdx === -1) scopeIdx = 1;
      if (subServiceIdx === -1) subServiceIdx = 2;
      if (maxCapIdx === -1 && rawRows[headerRowIdx].length >= 8) maxCapIdx = 3;
      if (capacityIdx === -1) capacityIdx = maxCapIdx === 3 ? 4 : 3;
      if (unitIdx === -1) unitIdx = maxCapIdx === 3 ? 5 : 4;
      if (priceIdx === -1) priceIdx = maxCapIdx === 3 ? 6 : 5;
      if (priceTypeIdx === -1) priceTypeIdx = maxCapIdx === 3 ? 7 : 6;
    }

    // 3. Process data rows
    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    for (let i = startRow; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawRole = String(row[roleIdx] ?? '').trim();
      const scope = String(row[scopeIdx] ?? '').trim();
      const sub = String(row[subServiceIdx] ?? '').trim() || 'N/A';

      if (!rawRole && !scope) continue;
      if (/role/i.test(rawRole) && /scope/i.test(scope)) continue;

      const role: 'designer' | 'sales' = rawRole.toLowerCase().includes('sale') ? 'sales' : 'designer';

      // Check max cap in row
      let rowMaxCap: number | null = null;
      if (maxCapIdx !== -1 && row[maxCapIdx] !== undefined && row[maxCapIdx] !== '') {
        const parsed = parseFloat(String(row[maxCapIdx]).replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed) && parsed > 0) {
          rowMaxCap = parsed;
          if (role === 'designer' && !detectedDesignerMaxCap) {
            detectedDesignerMaxCap = parsed;
          } else if (role === 'sales' && !detectedSalesMaxCap) {
            detectedSalesMaxCap = parsed;
          }
        }
      }

      const cap = String(row[capacityIdx] ?? '').trim();
      const rawUnit = String(row[unitIdx] ?? '').trim().toUpperCase();
      const unit: CapacityUnit = ['W', 'KW', 'MW'].includes(rawUnit) ? (rawUnit as CapacityUnit) : 'KW';
      const rawPrice = String(row[priceIdx] ?? '').replace(/[^0-9.]/g, '');
      const price = parseFloat(rawPrice) || 0;
      const rawType = String(row[priceTypeIdx] ?? '').trim();
      const priceType: PriceType = ['Fixed', 'Per KW', 'Per MW', 'Per W'].includes(rawType) ? (rawType as PriceType) : 'Fixed';

      const groupKey = `${role}_${scope}_${sub}`.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const fallbackCap = typeof activeMaxCaps[role] === 'number'
        ? activeMaxCaps[role]
        : parseFloat(String(activeMaxCaps[role])) || 50000;

      const effectiveMaxCap = rowMaxCap ||
        (role === 'designer' ? detectedDesignerMaxCap : detectedSalesMaxCap) ||
        fallbackCap;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          role,
          scope,
          subService: sub,
          maxCommission: Number(effectiveMaxCap),
          maxCap: Number(effectiveMaxCap),
          capacityRows: []
        };
      } else if (rowMaxCap && rowMaxCap > 0) {
        groups[groupKey].maxCommission = Number(rowMaxCap);
        groups[groupKey].maxCap = Number(rowMaxCap);
      }

      groups[groupKey].capacityRows.push({
        capacityRange: cap || 'Range',
        unit,
        price: Number(price),
        priceType
      });
      rowCount++;
    }

    return { groups, rowCount, detectedDesignerMaxCap, detectedSalesMaxCap };
  };

  // Process Commission Data (from parsed rows)
  const processCommissionData = async (rawRows: any[][], shouldOverwrite: boolean) => {
    try {
      if (rawRows.length <= 1) {
        setErrorMsg('File is empty or missing data rows.');
        return;
      }

      const { groups, rowCount, detectedDesignerMaxCap, detectedSalesMaxCap } = groupCommissionData(rawRows, maxCaps);

      if (rowCount === 0 || Object.keys(groups).length === 0) {
        setErrorMsg('Could not parse valid commission rows. Ensure file includes Role, Scope, SubService/Tier, CapacityRange, Unit, Price, PriceType, and optional Max Cap.');
        return;
      }

      setSavingCommissionRule(true);
      setErrorMsg(null);
      
      const batch = writeBatch(db);

      if (shouldOverwrite) {
        allCommissionRules.forEach((rule) => {
          const ruleRef = doc(db, COLLECTIONS.COMMISSION_RULES, rule.id);
          batch.delete(ruleRef);
        });
      } else {
        // Purge old case variations (e.g. "Standard" when uploading "STANDARD") so duplicate entries don't stack up
        Object.values(groups).forEach((data) => {
          allCommissionRules.forEach((existingRule) => {
            const existingRole = existingRule.role?.toLowerCase().includes('sale') ? 'sales' : 'designer';
            if (
              existingRole === data.role &&
              existingRule.scope?.toLowerCase() === data.scope.toLowerCase() &&
              existingRule.subService?.toLowerCase() === data.subService.toLowerCase() &&
              (existingRule.id !== `${data.role}_${data.scope}_${data.subService}`.toLowerCase().replace(/[^a-z0-9]/g, '_') ||
               existingRule.subService !== data.subService)
            ) {
              batch.delete(doc(db, COLLECTIONS.COMMISSION_RULES, existingRule.id));
            }
          });
        });
      }

      Object.entries(groups).forEach(([docId, data]) => {
        const ruleRef = doc(db, COLLECTIONS.COMMISSION_RULES, docId);
        const payload = {
          role: data.role === 'sales' ? 'Sales' : 'Designer',
          scope: data.scope,
          subService: data.subService,
          maxCommission: Number(data.maxCommission),
          maxCap: Number(data.maxCap),
          capacityRows: data.capacityRows,
          updatedAt: new Date().toISOString()
        };
        batch.set(ruleRef, payload, { merge: true });
      });

      await batch.commit();

      // Update maxCaps UI state immediately so tool reflects it
      setMaxCaps((prev) => ({
        ...prev,
        designer: detectedDesignerMaxCap || prev.designer,
        sales: detectedSalesMaxCap || prev.sales,
      }));

      setIsCommissionDirty(false);
      await fetchAllCommissionRules();

      const groupCount = Object.keys(groups).length;
      const designerCapMsg = detectedDesignerMaxCap ? ` (Designer Max Cap set to ${detectedDesignerMaxCap})` : '';
      setSuccessMsg(`Successfully imported ${groupCount} commission rule combinations with ${rowCount} capacity tiers${designerCapMsg}.`);
      setTimeout(() => setSuccessMsg(null), 5000);

    } catch (err) {
      console.error('Commission Import Error:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.COMMISSION_RULES);
      setErrorMsg(`Error processing commission data: ${errInfo.error}`);
    } finally {
      setSavingCommissionRule(false);
    }
  };

  // Process Pricing Rules Data (from parsed rows)
  const processPricingData = async (rawRows: any[][], shouldOverwrite: boolean) => {
    try {
      if (rawRows.length <= 1) {
        setErrorMsg('File is empty or missing data rows.');
        return;
      }

      // Identify header row
      let headerRowIdx = -1;
      let catIdx = 0;
      let scopeIdx = 1;
      let subIdx = 2;
      let capIdx = 3;
      let unitIdx = 4;
      let priceIdx = 5;
      let priceTypeIdx = 6;

      for (let r = 0; r < Math.min(6, rawRows.length); r++) {
        const row = rawRows[r].map((c) => String(c).trim().toLowerCase());
        if (row.some((c) => /cat|scope|sub|tier|capacity|price|rate/i.test(c))) {
          headerRowIdx = r;
          row.forEach((col, idx) => {
            if (/cat/i.test(col)) catIdx = idx;
            else if (/scope/i.test(col)) scopeIdx = idx;
            else if (/sub|tier/i.test(col)) subIdx = idx;
            else if (/capacity|range/i.test(col)) capIdx = idx;
            else if (/unit/i.test(col)) unitIdx = idx;
            else if (/price.*type|rate.*type|type/i.test(col)) priceTypeIdx = idx;
            else if (/price|rate|amount|fee/i.test(col)) priceIdx = idx;
          });
          break;
        }
      }

      const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
      const groups: Record<string, { category: string; scope: string; subService: string; capacityRows: CapacityRow[] }> = {};
      let rowCount = 0;

      for (let i = startRow; i < rawRows.length; i++) {
        const cols = rawRows[i];
        if (!cols || cols.length === 0) continue;

        const cat = String(cols[catIdx] ?? '').trim();
        const scope = String(cols[scopeIdx] ?? '').trim();
        const sub = String(cols[subIdx] ?? '').trim();

        if (!cat || !scope || !sub) continue;
        if (/category/i.test(cat) && /scope/i.test(scope)) continue;

        const cap = String(cols[capIdx] ?? '').trim();
        const rawUnit = String(cols[unitIdx] ?? '').trim().toUpperCase();
        const unit: CapacityUnit = ['W', 'KW', 'MW'].includes(rawUnit) ? (rawUnit as CapacityUnit) : 'KW';
        const rawPrice = String(cols[priceIdx] ?? '').replace(/[^0-9.]/g, '');
        const price = parseFloat(rawPrice) || 0;
        const rawType = String(cols[priceTypeIdx] ?? '').trim();
        const priceType: PriceType = ['Fixed', 'Per KW', 'Per MW', 'Per W'].includes(rawType) ? (rawType as PriceType) : 'Fixed';

        const groupKey = `${cat}_${scope}_${sub}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        if (!groups[groupKey]) {
          groups[groupKey] = {
            category: cat,
            scope,
            subService: sub,
            capacityRows: []
          };
        }

        groups[groupKey].capacityRows.push({
          capacityRange: cap || 'Range',
          unit,
          price: Number(price),
          priceType
        });
        rowCount++;
      }

      if (rowCount === 0 || Object.keys(groups).length === 0) {
        setErrorMsg('Could not parse valid pricing rows. Ensure file has Category, Scope, SubService/Tier, CapacityRange, Unit, Price, PriceType.');
        return;
      }

      setSavingRule(true);
      const batch = writeBatch(db);

      if (shouldOverwrite) {
        allRules.forEach((rule) => {
          const ruleRef = doc(db, COLLECTIONS.PRICING_RULES, rule.id);
          batch.delete(ruleRef);
        });
      } else {
        // Overwrite old case variations so they don't stack up
        Object.values(groups).forEach((groupData) => {
          allRules.forEach((existingRule) => {
            if (
              existingRule.category?.toLowerCase() === groupData.category.toLowerCase() &&
              existingRule.scope?.toLowerCase() === groupData.scope.toLowerCase() &&
              existingRule.subService?.toLowerCase() === groupData.subService.toLowerCase() &&
              (existingRule.id !== `${groupData.category}_${groupData.scope}_${groupData.subService}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() ||
               existingRule.subService !== groupData.subService)
            ) {
              batch.delete(doc(db, COLLECTIONS.PRICING_RULES, existingRule.id));
            }
          });
        });
      }

      Object.entries(groups).forEach(([groupId, groupData]) => {
        const ruleRef = doc(db, COLLECTIONS.PRICING_RULES, groupId);
        batch.set(ruleRef, { ...groupData, updatedAt: new Date().toISOString() }, { merge: true });
      });

      await batch.commit();
      await fetchAllRules();

      setSuccessMsg(`Successfully imported ${rowCount} pricing rows across ${Object.keys(groups).length} matrix rule(s).`);
      setTimeout(() => setSuccessMsg(null), 4000);

    } catch (err) {
      console.error('Pricing Import Error:', err);
      setErrorMsg('Error processing pricing data.');
    } finally {
      setSavingRule(false);
    }
  };

  // Import from Excel / CSV File
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const rows = await parseWorkbookRows(file);
      if (rows.length <= 1) {
        setErrorMsg('Uploaded file is empty or contains no data rows.');
        return;
      }

      const sampleRows = rows.slice(0, 10);
      const isCommission = sampleRows.some((row) =>
        row.some((cell) => /designer|sales|commission|max.*cap|role/i.test(String(cell)))
      );
      const isPricing = sampleRows.some((row) =>
        row.some((cell) => /\bt1\b|\bt2\b|\bt3\b|\bt4\b|\bt5\b|category/i.test(String(cell)))
      );

      const targetMode: 'commission' | 'pricing' =
        isCommission && !isPricing
          ? 'commission'
          : isPricing && !isCommission
          ? 'pricing'
          : activeMatrixTab === 'employee-commission'
          ? 'commission'
          : 'pricing';

      if (targetMode === 'commission') {
        if (allCommissionRules.length > 0) {
          setCsvOverwriteModal({
            isOpen: true,
            title: 'Import Commission Rules',
            message: 'Existing commission rules were found in Firestore. Do you want to overwrite all existing rules with this file, or merge/update them?',
            onOverwrite: () => processCommissionData(rows, true),
            onMerge: () => processCommissionData(rows, false)
          });
        } else {
          await processCommissionData(rows, false);
        }
      } else {
        if (allRules.length > 0) {
          setCsvOverwriteModal({
            isOpen: true,
            title: 'Import Pricing Rules',
            message: 'Existing pricing rules were found in Firestore. Do you want to overwrite all existing rules with this file, or merge/update them?',
            onOverwrite: () => processPricingData(rows, true),
            onMerge: () => processPricingData(rows, false)
          });
        } else {
          await processPricingData(rows, false);
        }
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMsg(`Failed to read file: ${err.message || 'Unknown error'}`);
    }
  };

  const executeWipePriceEngineData = async () => {
    setSavingRule(true);
    setErrorMsg(null);
    try {
      // 1. Delete pricingRules
      const pricingSnap = await getDocs(collection(db, COLLECTIONS.PRICING_RULES));
      for (const d of pricingSnap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.PRICING_RULES, d.id));
      }

      // 2. Delete commissionRules
      const commSnap = await getDocs(collection(db, COLLECTIONS.COMMISSION_RULES));
      for (const d of commSnap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.COMMISSION_RULES, d.id));
      }

      // 3. Reset local states
      setAllRules([]);
      setCapacityRows([]);
      setAllCommissionRules([]);
      setMasterCommissionState({ designer: {}, sales: {} });

      setSuccessMsg('All pricing and commission rules in Price Engine have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error wiping Price Engine data:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.PRICING_RULES);
      setErrorMsg('Failed to wipe Price Engine records.');
    } finally {
      setSavingRule(false);
      setIsWipeModalOpen(false);
    }
  };

  // Permission Restriction Screen
  if (!canManagePricing) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Price Engine</span> setup matrix is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
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
      {/* Hidden File Input for Excel / CSV Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportCSV}
        accept=".csv,.xlsx,.xls,.txt"
        className="hidden"
      />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Commercial Pricing Engine
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Pricing Matrix <span className="text-[#D4AF37]">Configuration</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {activeMatrixTab === 'client-pricing' ? (
              <>Configure dynamic capacity pricing rules saved in the <code className="text-amber-400 font-mono">pricingRules</code> collection.</>
            ) : (
              <>Configure role-based employee commission tiers saved in the <code className="text-amber-400 font-mono">commissionRules</code> collection.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => { fetchAllRules(); fetchAllCommissionRules(); }}
            disabled={loadingRules || loadingCommissionRules}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loadingRules || loadingCommissionRules) ? 'animate-spin text-[#D4AF37]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => setIsWipeModalOpen(true)}
            disabled={savingRule || savingCommissionRule}
            className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all pricing and commission rules"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe Price Engine Test Data
          </button>

          <button
            onClick={activeMatrixTab === 'client-pricing' ? handleDownloadTemplate : handleDownloadCommissionTemplate}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            Download CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-emerald-500/30 text-emerald-400 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import Excel / CSV
          </button>
        </div>
      </div>

      {/* Matrix Type Switcher Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2A2A2A] pb-2">
        <div className="flex items-center gap-2 p-1 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl w-fit">
          <button
            onClick={() => setActiveMatrixTab('client-pricing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeMatrixTab === 'client-pricing'
                ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/15'
                : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Client Pricing Matrix
          </button>
          <button
            onClick={() => setActiveMatrixTab('employee-commission')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activeMatrixTab === 'employee-commission'
                ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black shadow-md shadow-[#D4AF37]/15'
                : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Employee Commission Matrix
          </button>
        </div>

        <div className="text-sm text-gray-500 font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
          <span>Active View: <strong className="text-gray-200">{activeMatrixTab === 'client-pricing' ? 'Client Pricing Matrix' : 'Employee Commission Matrix'}</strong></span>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {activeMatrixTab === 'client-pricing' ? (
        <>
          {/* 1. Category Tabs Selector */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-3 shadow-md">
            <div className="text-xs font-mono text-gray-400 uppercase tracking-wider mb-2 px-1 flex items-center justify-between">
              <span>1. Select Pricing Category</span>
              <span className="text-[#D4AF37]">Active: {selectedCategory}</span>
            </div>
            <div className="w-full grid grid-cols-3 sm:grid-cols-6 gap-2">
              {displayCategories.map((cat) => {
                const isActive = selectedCategory === cat;
                return (
                  <div key={cat} className="relative flex group">
                    <button
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15 scale-[1.02]'
                          : 'bg-[#2A2A2A] border-[#2A2A2A] text-gray-200 hover:text-white hover:border-[#2A2A2A]'
                      }`}
                    >
                      {cat}
                    </button>
                    {canManagePricing && displayCategories.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDeleteCategory(cat); }}
                        disabled={deletingCategory === cat}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 z-10 shadow-md cursor-pointer"
                        title="Delete Category"
                      >
                        {deletingCategory === cat ? (
                          <div className="w-2.5 h-2.5 border border-rose-500/30 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-2.5 h-2.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {canManagePricing && (
                <button
                  onClick={handleAddNewCategory}
                  className="text-[#D4AF37] text-base ml-2 hover:underline"
                >
                  + Add New
                </button>
              )}
            </div>
          </div>

          {/* 2 & 3. Scope & Sub-Service Selection Controls */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-5 shadow-md">
            {/* Scope Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#D4AF37]" /> 2. Scope of Work
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedScopeName}
                  onChange={(e) => handleScopeChange(e.target.value)}
                  disabled={loadingRules}
                  className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none font-mono tracking-wide"
                >
                  {displayScopes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {canManagePricing && (
                  <button
                    onClick={handleAddNewScope}
                    className="text-[#D4AF37] text-base ml-2 hover:underline"
                  >
                    + Add New
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Service Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#D4AF37]" /> 3. Sub-Service Tier
              </label>
              <div className="flex items-center gap-2">
                {displaySubServices.length > 0 ? (
                  <select
                    value={selectedSubService}
                    onChange={(e) => setSelectedSubService(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-amber-400 focus:outline-none font-mono"
                  >
                    {displaySubServices.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl text-sm text-gray-500 font-mono flex items-center justify-between">
                    <span>N/A (No sub-services)</span>
                  </div>
                )}
                {canManagePricing && (
                  <button
                    onClick={handleAddNewSubService}
                    className="text-[#D4AF37] text-base ml-2 hover:underline"
                  >
                    + Add New
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. Dynamic Capacity Rows Table */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl space-y-0">
            {/* Table Control Toolbar */}
            <div className="p-4 bg-[#2A2A2A] border-b border-[#2A2A2A] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  4. Capacity Pricing Rows ({capacityRows.length})
                </h3>
                {existingDocId && (
                  <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded font-mono">
                    Saved in Firestore
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetDefaultRows}
                  className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-gray-200 hover:text-white transition-all cursor-pointer font-mono"
                >
                  Reset 12 Ranges
                </button>

                <button
                  onClick={handleAddRow}
                  className="px-3 py-1.5 bg-[#D4AF37]/10 hover:bg-[#2A2A2A]/20 border border-[#D4AF37]/40 text-[#D4AF37] hover:text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            {/* Rows Table */}
            {loadingRules ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading pricing rule matrix from Firestore...</p>
              </div>
            ) : capacityRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                <p>No pricing rules found. Import pricing data from Excel to populate the matrix.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6 w-12">#</th>
                      <th className="p-3.5 min-w-[180px]">Capacity Range</th>
                      <th className="p-3.5 min-w-[120px]">Unit</th>
                      <th className="p-3.5 min-w-[140px]">Price</th>
                      <th className="p-3.5 min-w-[160px]">Price Type</th>
                      <th className="p-3.5 pr-6 text-right w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {capacityRows.map((row, index) => (
                      <tr key={index} className="hover:bg-[#2A2A2A] transition-colors">
                        <td className="p-3.5 pl-6 text-gray-500 font-mono text-sm">{index + 1}</td>
                        
                        {/* Capacity Range Input */}
                        <td className="p-3.5">
                          <input
                            type="text"
                            value={row.capacityRange}
                            onChange={(e) => handleUpdateRow(index, 'capacityRange', e.target.value)}
                            placeholder="e.g. 3-9, 10-20, ABOVE 500"
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white font-mono focus:outline-none"
                          />
                        </td>

                        {/* Unit Selector */}
                        <td className="p-3.5">
                          <select
                            value={row.unit}
                            onChange={(e) => handleUpdateRow(index, 'unit', e.target.value as CapacityUnit)}
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-amber-400 font-mono focus:outline-none"
                          >
                            <option value="W">W</option>
                            <option value="KW">KW</option>
                            <option value="MW">MW</option>
                          </select>
                        </td>

                        {/* Price Number Input */}
                        <td className="p-3.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">$</span>
                            <input
                              type="number"
                              step="any"
                              value={row.price}
                              onChange={(e) => handleUpdateRow(index, 'price', parseFloat(e.target.value) || 0)}
                              className="w-full pl-6 pr-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-emerald-400 font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* Price Type Selector */}
                        <td className="p-3.5">
                          <select
                            value={row.priceType}
                            onChange={(e) => handleUpdateRow(index, 'priceType', e.target.value as PriceType)}
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white font-mono focus:outline-none"
                          >
                            <option value="Fixed">Fixed</option>
                            <option value="Per KW">Per KW</option>
                            <option value="Per MW">Per MW</option>
                            <option value="Per W">Per W</option>
                          </select>
                        </td>

                        {/* Delete Action */}
                        <td className="p-3.5 pr-6 text-right">
                          <button
                            onClick={() => handleDeleteRow(index)}
                            title="Delete Capacity Row"
                            className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#2A2A2A] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Save Matrix Callout */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-400 space-y-0.5">
              <p className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" /> Current Context Summary
              </p>
              <p className="font-mono text-sm text-gray-400">
                Category: <span className="text-amber-400 font-bold">{selectedCategory}</span> | Scope:{' '}
                <span className="text-amber-400 font-bold">{selectedScopeName}</span> | Sub-Service:{' '}
                <span className="text-amber-400 font-bold">{selectedSubService || 'N/A'}</span>
              </p>
            </div>

            <button
              onClick={handleSaveMatrix}
              disabled={savingRule}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/10 cursor-pointer disabled:opacity-50"
            >
              {savingRule ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Persisting Matrix to Firestore...
                </span>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Matrix Configuration
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 1. Commission Role & Max Cap Selector */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 shadow-md">
            {/* Role Selector Toggle Buttons */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#D4AF37]" /> 1. Select Commission Role
              </label>
              <div className="w-full grid grid-cols-2 gap-2 bg-[#2A2A2A] p-1 border border-[#2A2A2A] rounded-xl">
                <button
                  type="button"
                  onClick={() => setCommissionRole('Designer')}
                  className={`py-2 px-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                    commissionRole === 'Designer'
                      ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black border-[#D4AF37] shadow-md shadow-[#D4AF37]/15'
                      : 'bg-transparent border-transparent text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Designer
                </button>
                <button
                  type="button"
                  onClick={() => setCommissionRole('Sales')}
                  className={`py-2 px-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                    commissionRole === 'Sales'
                      ? 'bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black border-[#D4AF37] shadow-md shadow-[#D4AF37]/15'
                      : 'bg-transparent border-transparent text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Sales
                </button>
              </div>
            </div>

            {/* Max Limit Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-2 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5 text-[#D4AF37]" /> Max Commission Cap (₹) per Project ({commissionRole})
                </span>
                <span className="text-xs text-gray-500 font-mono">Upper Payout Limit</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-base font-bold">₹</span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={maxCaps[commissionRole.toLowerCase() as 'designer' | 'sales'] || ''}
                  onChange={(e) => {
                    setMaxCaps(prev => ({ ...prev, [commissionRole.toLowerCase()]: e.target.value }));
                    setIsCommissionDirty(true);
                  }}
                  placeholder="e.g. 50000"
                  className="w-full pl-8 pr-4 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-emerald-400 font-mono font-bold focus:outline-none placeholder:text-gray-500"
                />
              </div>
            </div>
          </div>

          {/* 2 & 3. Scope & Sub-Service Selection Controls */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-5 shadow-md">
            {/* Scope Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#D4AF37]" /> 2. Scope of Work
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedCommissionScopeName}
                  onChange={(e) => setSelectedCommissionScopeName(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none font-mono tracking-wide"
                >
                  {displayCommissionScopes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {canManagePricing && (
                  <button
                    onClick={handleAddNewCommissionScope}
                    className="text-[#D4AF37] text-base ml-2 hover:underline cursor-pointer"
                  >
                    + Add New
                  </button>
                )}
              </div>
            </div>

            {/* Sub-Service Dropdown */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#D4AF37]" /> 3. Sub-Service Tier
              </label>
              <div className="flex items-center gap-2">
                {displayCommissionSubServices.length > 0 ? (
                  <select
                    value={selectedCommissionSubService}
                    onChange={(e) => setSelectedCommissionSubService(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-amber-400 focus:outline-none font-mono"
                  >
                    {displayCommissionSubServices.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex-1 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl text-sm text-gray-500 font-mono flex items-center justify-between">
                    <span>N/A (No sub-services)</span>
                  </div>
                )}
                {canManagePricing && (
                  <button
                    onClick={handleAddNewCommissionSubService}
                    className="text-[#D4AF37] text-base ml-2 hover:underline cursor-pointer"
                  >
                    + Add New
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. Capacity Pricing Rows Dynamic Table for Commission */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl space-y-0">
            {/* Table Control Toolbar */}
            <div className="p-4 bg-[#2A2A2A] border-b border-[#2A2A2A] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  4. Capacity Pricing Rows ({currentCommissionRows.length})
                </h3>
                <span className="text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded font-mono">
                  Commission Tier Rates
                </span>
                {!isCommissionDirty ? (
                  <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/10 animate-pulse" />
                    Saved in Firestore
                  </span>
                ) : (
                  <span className="text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded font-mono">
                    Draft (Unsaved)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetCommissionDefaultRows}
                  className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-gray-200 hover:text-white transition-all cursor-pointer font-mono"
                >
                  Reset 12 Ranges
                </button>

                <button
                  onClick={handleCommissionAddRow}
                  className="px-3 py-1.5 bg-[#D4AF37]/10 hover:bg-[#2A2A2A]/20 border border-[#D4AF37]/40 text-[#D4AF37] hover:text-white rounded-lg text-sm font-semibold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>
            </div>

            {/* Rows Table */}
            {loadingCommissionRules ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading commission rules from Firestore...</p>
              </div>
            ) : currentCommissionRows.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                <p>No commission rules found. Click &quot;Add Row&quot; or &quot;Reset 12 Ranges&quot; to configure.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6 w-12">#</th>
                      <th className="p-3.5 min-w-[180px]">Capacity Range</th>
                      <th className="p-3.5 min-w-[120px]">Unit</th>
                      <th className="p-3.5 min-w-[140px]">Rate (₹)</th>
                      <th className="p-3.5 min-w-[160px]">Price Type</th>
                      <th className="p-3.5 pr-6 text-right w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {currentCommissionRows.map((row, index) => (
                      <tr key={index} className="hover:bg-[#2A2A2A] transition-colors">
                        <td className="p-3.5 pl-6 text-gray-500 font-mono text-sm">{index + 1}</td>
                        
                        {/* Capacity Range Input */}
                        <td className="p-3.5">
                          <input
                            type="text"
                            value={row.capacityRange}
                            onChange={(e) => handleCommissionUpdateRow(index, 'capacityRange', e.target.value)}
                            placeholder="e.g. 3-9, 10-20, ABOVE 500"
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white font-mono focus:outline-none"
                          />
                        </td>

                        {/* Unit Selector */}
                        <td className="p-3.5">
                          <select
                            value={row.unit}
                            onChange={(e) => handleCommissionUpdateRow(index, 'unit', e.target.value as CapacityUnit)}
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-amber-400 font-mono focus:outline-none"
                          >
                            <option value="W">W</option>
                            <option value="KW">KW</option>
                            <option value="MW">MW</option>
                          </select>
                        </td>

                        {/* Price Number Input */}
                        <td className="p-3.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">₹</span>
                            <input
                              type="number"
                              step="any"
                              value={row.price}
                              onChange={(e) => handleCommissionUpdateRow(index, 'price', parseFloat(e.target.value) || 0)}
                              className="w-full pl-6 pr-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-emerald-400 font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </td>

                        {/* Price Type Selector */}
                        <td className="p-3.5">
                          <select
                            value={row.priceType}
                            onChange={(e) => handleCommissionUpdateRow(index, 'priceType', e.target.value as PriceType)}
                            className="w-full px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white font-mono focus:outline-none"
                          >
                            <option value="Fixed">Fixed</option>
                            <option value="Per KW">Per KW</option>
                            <option value="Per MW">Per MW</option>
                            <option value="Per W">Per W</option>
                          </select>
                        </td>

                        {/* Delete Action */}
                        <td className="p-3.5 pr-6 text-right">
                          <button
                            onClick={() => handleCommissionDeleteRow(index)}
                            title="Delete Capacity Row"
                            className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#2A2A2A] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Context Summary Callout & Manual Save Action */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-400 space-y-0.5">
              <p className="font-bold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" /> Commission Context Summary
              </p>
              <p className="font-mono text-sm text-gray-400">
                Role: <span className="text-amber-400 font-bold">{commissionRole}</span> | Max Cap:{' '}
                <span className="text-emerald-400 font-bold">₹{Number(maxCaps[commissionRole.toLowerCase() as 'designer' | 'sales'] || 0).toLocaleString()}</span> | Scope:{' '}
                <span className="text-amber-400 font-bold">{selectedCommissionScopeName}</span> | Sub-Service:{' '}
                <span className="text-amber-400 font-bold">{selectedCommissionSubService || 'N/A'}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
              <div className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/10" />
                CSV Auto-Batch Active
              </div>

              <button
                onClick={handleSaveCommissionMatrix}
                disabled={savingCommissionRule}
                className={`w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/10 cursor-pointer ${
                  savingCommissionRule ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {savingCommissionRule ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Saving Manual Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Manual Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}
      {/* Prompt Modal for adding categories, scopes, and sub-services */}
      <PromptModal
        isOpen={promptModalState.isOpen}
        onClose={() => setPromptModalState(prev => ({ ...prev, isOpen: false }))}
        onSubmit={promptModalState.onSubmit}
        title={promptModalState.title}
        message={promptModalState.message}
        placeholder={promptModalState.placeholder}
        initialValue={promptModalState.initialValue}
        submitText="Save"
        cancelText="Cancel"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={executeDelete}
        title="Delete Confirmation"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this record? This action cannot be undone.'
        }
        confirmText="Delete"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Wipe All Price Engine Data Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipePriceEngineData}
        title="Wipe Price Engine Records"
        message="Are you sure you want to permanently delete ALL pricing rules and commission rules in Firebase? This action cannot be undone."
        confirmText="Wipe Everything"
        requireConfirmationText="WIPE"
        inputPlaceholder="Type 'WIPE' to confirm"
        variant="danger"
        isLoading={savingRule}
      />

      {/* CSV Import Overwrite / Merge Modal */}
      <ConfirmModal
        isOpen={csvOverwriteModal.isOpen}
        onClose={() => {
          csvOverwriteModal.onMerge();
          setCsvOverwriteModal(prev => ({ ...prev, isOpen: false }));
        }}
        onConfirm={() => {
          csvOverwriteModal.onOverwrite();
          setCsvOverwriteModal(prev => ({ ...prev, isOpen: false }));
        }}
        title={csvOverwriteModal.title}
        message={csvOverwriteModal.message}
        confirmText="Overwrite Existing"
        cancelText="Merge / Keep Existing"
        variant="warning"
      />
    </div>
  );
}
