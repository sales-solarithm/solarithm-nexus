/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Package, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  IndianRupee, 
  SlidersHorizontal,
  Calendar,
  Gift,
  Hash,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  collection, 
  doc, 
  getDocs, 
  writeBatch, 
  onSnapshot 
} from 'firebase/firestore';
import { db, PRESET_SCOPES } from '@/lib/firebase';
import { COLLECTIONS, PackagePlanDocument } from '@/src/config/schema';
import { isZeroOrPositive, sanitizeFirestorePayload } from '@/lib/firestoreSanitizer';

// Canonical fallback package plans (Pre Design & Post Design across 100, 200, 300 quotas for 1, 3, 6 months)
export const CANONICAL_DEFAULT_PACKAGE_PLANS: PackagePlanDocument[] = [
  // Pre Design
  {
    id: 'pre_design_100_1m',
    scope: 'Pre Design',
    projectsPerMonth: 100,
    durationMonths: 1,
    upfrontPrice: 25000,
    bonusProjects: 0,
    totalAllowedProjects: 100,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_100_3m',
    scope: 'Pre Design',
    projectsPerMonth: 100,
    durationMonths: 3,
    upfrontPrice: 70000,
    bonusProjects: 15,
    totalAllowedProjects: 315,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_100_6m',
    scope: 'Pre Design',
    projectsPerMonth: 100,
    durationMonths: 6,
    upfrontPrice: 130000,
    bonusProjects: 40,
    totalAllowedProjects: 640,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_200_1m',
    scope: 'Pre Design',
    projectsPerMonth: 200,
    durationMonths: 1,
    upfrontPrice: 48000,
    bonusProjects: 0,
    totalAllowedProjects: 200,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_200_3m',
    scope: 'Pre Design',
    projectsPerMonth: 200,
    durationMonths: 3,
    upfrontPrice: 135000,
    bonusProjects: 30,
    totalAllowedProjects: 630,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_200_6m',
    scope: 'Pre Design',
    projectsPerMonth: 200,
    durationMonths: 6,
    upfrontPrice: 250000,
    bonusProjects: 80,
    totalAllowedProjects: 1280,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_300_1m',
    scope: 'Pre Design',
    projectsPerMonth: 300,
    durationMonths: 1,
    upfrontPrice: 68000,
    bonusProjects: 0,
    totalAllowedProjects: 300,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_300_3m',
    scope: 'Pre Design',
    projectsPerMonth: 300,
    durationMonths: 3,
    upfrontPrice: 190000,
    bonusProjects: 50,
    totalAllowedProjects: 950,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'pre_design_300_6m',
    scope: 'Pre Design',
    projectsPerMonth: 300,
    durationMonths: 6,
    upfrontPrice: 350000,
    bonusProjects: 120,
    totalAllowedProjects: 1920,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },

  // Post Design
  {
    id: 'post_design_100_1m',
    scope: 'Post Design',
    projectsPerMonth: 100,
    durationMonths: 1,
    upfrontPrice: 30000,
    bonusProjects: 0,
    totalAllowedProjects: 100,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_100_3m',
    scope: 'Post Design',
    projectsPerMonth: 100,
    durationMonths: 3,
    upfrontPrice: 85000,
    bonusProjects: 15,
    totalAllowedProjects: 315,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_100_6m',
    scope: 'Post Design',
    projectsPerMonth: 100,
    durationMonths: 6,
    upfrontPrice: 160000,
    bonusProjects: 40,
    totalAllowedProjects: 640,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_200_1m',
    scope: 'Post Design',
    projectsPerMonth: 200,
    durationMonths: 1,
    upfrontPrice: 58000,
    bonusProjects: 0,
    totalAllowedProjects: 200,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_200_3m',
    scope: 'Post Design',
    projectsPerMonth: 200,
    durationMonths: 3,
    upfrontPrice: 165000,
    bonusProjects: 30,
    totalAllowedProjects: 630,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_200_6m',
    scope: 'Post Design',
    projectsPerMonth: 200,
    durationMonths: 6,
    upfrontPrice: 310000,
    bonusProjects: 80,
    totalAllowedProjects: 1280,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_300_1m',
    scope: 'Post Design',
    projectsPerMonth: 300,
    durationMonths: 1,
    upfrontPrice: 82000,
    bonusProjects: 0,
    totalAllowedProjects: 300,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_300_3m',
    scope: 'Post Design',
    projectsPerMonth: 300,
    durationMonths: 3,
    upfrontPrice: 230000,
    bonusProjects: 50,
    totalAllowedProjects: 950,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  },
  {
    id: 'post_design_300_6m',
    scope: 'Post Design',
    projectsPerMonth: 300,
    durationMonths: 6,
    upfrontPrice: 425000,
    bonusProjects: 120,
    totalAllowedProjects: 1920,
    status: 'active',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
];

export function computeTotalAllowed(projectsPerMonth: number, durationMonths: number, bonusProjects: number): number {
  const safePpm = isZeroOrPositive(projectsPerMonth) ? Number(projectsPerMonth) : 0;
  const safeDur = isZeroOrPositive(durationMonths) ? Number(durationMonths) : 1;
  const safeBonus = isZeroOrPositive(bonusProjects) ? Number(bonusProjects) : 0;
  return safePpm * safeDur + safeBonus;
}

export function generatePlanDocId(scope: string, projectsPerMonth: number, durationMonths: number): string {
  const cleanScope = (scope || 'plan').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${cleanScope}_${projectsPerMonth}_${durationMonths}m`;
}

interface PackagePlansMatrixProps {
  onNotifySuccess?: (msg: string) => void;
  onNotifyError?: (msg: string) => void;
}

export default function PackagePlansMatrix({ onNotifySuccess, onNotifyError }: PackagePlansMatrixProps) {
  const [plans, setPlans] = useState<PackagePlanDocument[]>([]);
  const [savedPlansSnapshot, setSavedPlansSnapshot] = useState<PackagePlanDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Scopes loaded dynamically from Firestore /scopes
  const [loadedScopes, setLoadedScopes] = useState<string[]>(['Pre Design', 'Post Design']);
  const [selectedScopeFilter, setSelectedScopeFilter] = useState<string>('ALL');
  const [selectedQuotaFilter, setSelectedQuotaFilter] = useState<string>('ALL'); // 'ALL' | '100' | '200' | '300' | custom
  const [customQuotaInput, setCustomQuotaInput] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    if (type === 'success' && onNotifySuccess) onNotifySuccess(message);
    if (type === 'error' && onNotifyError) onNotifyError(message);
    setTimeout(() => setFeedback(null), 4000);
  }, [onNotifySuccess, onNotifyError]);

  // 1. Fetch Scopes dynamically from Firestore /scopes
  const fetchScopes = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.SCOPES));
      const scopesFromDb: string[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const name = data?.name || data?.scope || d.id;
        if (name && typeof name === 'string') {
          scopesFromDb.push(name.trim());
        }
      });

      const presets = PRESET_SCOPES.map((p) => p.name);
      const combined = Array.from(new Set([
        'Pre Design',
        'Post Design',
        ...scopesFromDb,
        ...presets
      ])).filter(Boolean);

      setLoadedScopes(combined);
    } catch (err) {
      console.warn('Could not load scopes collection for package plans:', err);
    }
  }, []);

  // 2. Real-time Firestore listener for /packagePlans
  useEffect(() => {
    fetchScopes();

    setLoading(true);
    const plansColRef = collection(db, COLLECTIONS.PACKAGE_PLANS);
    const unsubscribe = onSnapshot(
      plansColRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const loaded: PackagePlanDocument[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            const ppm = isZeroOrPositive(data.projectsPerMonth) ? Number(data.projectsPerMonth) : 100;
            const dur = isZeroOrPositive(data.durationMonths) ? Number(data.durationMonths) : 1;
            const bonus = isZeroOrPositive(data.bonusProjects) ? Number(data.bonusProjects) : 0;
            const upfront = isZeroOrPositive(data.upfrontPrice) ? Number(data.upfrontPrice) : 0;
            const total = computeTotalAllowed(ppm, dur, bonus);

            loaded.push({
              id: d.id,
              scope: data.scope || 'Pre Design',
              projectsPerMonth: ppm,
              durationMonths: dur,
              upfrontPrice: upfront,
              bonusProjects: bonus,
              totalAllowedProjects: total,
              status: data.status === 'inactive' ? 'inactive' : 'active',
              updatedAt: data.updatedAt || new Date().toISOString(),
              createdAt: data.createdAt || new Date().toISOString()
            });
          });

          // Sort by Scope, then ProjectsPerMonth, then Duration
          loaded.sort((a, b) => {
            if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
            if (a.projectsPerMonth !== b.projectsPerMonth) return a.projectsPerMonth - b.projectsPerMonth;
            return a.durationMonths - b.durationMonths;
          });

          setPlans(loaded);
          setSavedPlansSnapshot(JSON.parse(JSON.stringify(loaded)));
        } else {
          // If Firestore is empty, initialize with canonical default plans
          const defaults = CANONICAL_DEFAULT_PACKAGE_PLANS.map((p) => ({ ...p }));
          setPlans(defaults);
          setSavedPlansSnapshot([]);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to packagePlans:', err);
        notify('error', 'Error reading package plans from server.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [fetchScopes, notify]);

  // Compute dirty state (has unsaved modifications)
  const isDirty = useMemo(() => {
    if (plans.length !== savedPlansSnapshot.length) return true;
    const strPlans = JSON.stringify(plans.map(p => ({
      id: p.id,
      scope: p.scope,
      ppm: p.projectsPerMonth,
      dur: p.durationMonths,
      upfront: p.upfrontPrice,
      bonus: p.bonusProjects,
      status: p.status
    })));
    const strSnap = JSON.stringify(savedPlansSnapshot.map(p => ({
      id: p.id,
      scope: p.scope,
      ppm: p.projectsPerMonth,
      dur: p.durationMonths,
      upfront: p.upfrontPrice,
      bonus: p.bonusProjects,
      status: p.status
    })));
    return strPlans !== strSnap;
  }, [plans, savedPlansSnapshot]);

  // Derived available scopes from loadedScopes + active plans
  const allScopes = useMemo(() => {
    const list = Array.from(new Set([
      ...loadedScopes,
      ...plans.map((p) => p.scope)
    ])).filter(Boolean);
    return list.sort();
  }, [loadedScopes, plans]);

  // Available quota tiers (e.g. 100, 200, 300, etc.)
  const availableQuotaTiers = useMemo(() => {
    const defaultQuotas = [100, 200, 300];
    const fromPlans = plans.map((p) => p.projectsPerMonth);
    return Array.from(new Set([...defaultQuotas, ...fromPlans])).sort((a, b) => a - b);
  }, [plans]);

  // Filtered plans to display
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchScope = selectedScopeFilter === 'ALL' || p.scope.toLowerCase() === selectedScopeFilter.toLowerCase();
      const matchQuota = selectedQuotaFilter === 'ALL' || String(p.projectsPerMonth) === selectedQuotaFilter;
      return matchScope && matchQuota;
    });
  }, [plans, selectedScopeFilter, selectedQuotaFilter]);

  // Edit single field in a plan
  const handleUpdateField = (id: string, field: keyof PackagePlanDocument, value: any) => {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== id) return plan;

        const updated = { ...plan };

        if (field === 'projectsPerMonth') {
          const num = isZeroOrPositive(value) ? Math.max(0, parseInt(String(value), 10) || 0) : 0;
          updated.projectsPerMonth = num;
          updated.totalAllowedProjects = computeTotalAllowed(num, updated.durationMonths, updated.bonusProjects);
        } else if (field === 'durationMonths') {
          const num = isZeroOrPositive(value) ? Math.max(1, parseInt(String(value), 10) || 1) : 1;
          updated.durationMonths = num;
          updated.totalAllowedProjects = computeTotalAllowed(updated.projectsPerMonth, num, updated.bonusProjects);
        } else if (field === 'upfrontPrice') {
          // Zero-preservation: ₹0 is valid and protected
          const num = isZeroOrPositive(value) ? Math.max(0, parseFloat(String(value)) || 0) : 0;
          updated.upfrontPrice = num;
        } else if (field === 'bonusProjects') {
          // Zero-preservation: 0 bonus projects is valid and protected
          const num = isZeroOrPositive(value) ? Math.max(0, parseInt(String(value), 10) || 0) : 0;
          updated.bonusProjects = num;
          updated.totalAllowedProjects = computeTotalAllowed(updated.projectsPerMonth, updated.durationMonths, num);
        } else if (field === 'status') {
          updated.status = value === 'inactive' ? 'inactive' : 'active';
        } else if (field === 'scope') {
          updated.scope = String(value).trim();
        }

        return updated;
      })
    );
  };

  // Add a new plan row
  const handleAddPlanRow = () => {
    const targetScope = selectedScopeFilter !== 'ALL' ? selectedScopeFilter : (allScopes[0] || 'Pre Design');
    const targetPpm = selectedQuotaFilter !== 'ALL' ? parseInt(selectedQuotaFilter, 10) || 100 : 100;
    const targetDur = 1;
    const targetBonus = 0;
    const newId = generatePlanDocId(targetScope, targetPpm, targetDur) + `_${Date.now().toString().slice(-4)}`;

    const newPlan: PackagePlanDocument = {
      id: newId,
      scope: targetScope,
      projectsPerMonth: targetPpm,
      durationMonths: targetDur,
      upfrontPrice: 0,
      bonusProjects: targetBonus,
      totalAllowedProjects: computeTotalAllowed(targetPpm, targetDur, targetBonus),
      status: 'active',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    setPlans((prev) => [newPlan, ...prev]);
    notify('success', `Added new package plan row for ${targetScope}.`);
  };

  // Delete plan row
  const handleDeletePlanRow = (id: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== id));
  };

  // Restore canonical standard plans
  const handleRestoreCanonicalDefaults = () => {
    const defaults = CANONICAL_DEFAULT_PACKAGE_PLANS.map((p) => ({
      ...p,
      updatedAt: new Date().toISOString()
    }));
    setPlans(defaults);
    notify('success', 'Reset to canonical 18 package plan tiers.');
  };

  // Batch Save all plans to Firestore /packagePlans
  const handleBatchSavePlans = async () => {
    setSaving(true);
    try {
      const batch = writeBatch(db);

      // Save each plan ensuring payload is sanitized and numbers zero-preserved
      plans.forEach((plan) => {
        const docId = plan.id || generatePlanDocId(plan.scope, plan.projectsPerMonth, plan.durationMonths);
        const planRef = doc(db, COLLECTIONS.PACKAGE_PLANS, docId);

        const rawPayload: PackagePlanDocument = {
          id: docId,
          scope: plan.scope || 'Pre Design',
          projectsPerMonth: isZeroOrPositive(plan.projectsPerMonth) ? Number(plan.projectsPerMonth) : 0,
          durationMonths: isZeroOrPositive(plan.durationMonths) ? Number(plan.durationMonths) : 1,
          upfrontPrice: isZeroOrPositive(plan.upfrontPrice) ? Number(plan.upfrontPrice) : 0,
          bonusProjects: isZeroOrPositive(plan.bonusProjects) ? Number(plan.bonusProjects) : 0,
          totalAllowedProjects: computeTotalAllowed(plan.projectsPerMonth, plan.durationMonths, plan.bonusProjects),
          status: plan.status === 'inactive' ? 'inactive' : 'active',
          updatedAt: new Date().toISOString(),
          createdAt: plan.createdAt || new Date().toISOString()
        };

        const cleanPayload = sanitizeFirestorePayload(rawPayload);
        batch.set(planRef, cleanPayload, { merge: true });
      });

      await batch.commit();
      setSavedPlansSnapshot(JSON.parse(JSON.stringify(plans)));
      notify('success', `Successfully committed ${plans.length} package plans to /${COLLECTIONS.PACKAGE_PLANS}.`);
    } catch (err: any) {
      console.error('Batch Save Error for package plans:', err);
      notify('error', `Failed to save package plans: ${err?.message || 'Server error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Download CSV export or template
  const handleDownloadCSV = () => {
    const dataToExport = filteredPlans.length > 0 ? filteredPlans : plans;
    const csvRows = [
      ['Scope', 'ProjectsPerMonth', 'DurationMonths', 'UpfrontPrice', 'BonusProjects', 'TotalAllowedProjects', 'Status'],
      ...dataToExport.map((p) => [
        `"${p.scope}"`,
        p.projectsPerMonth,
        p.durationMonths,
        p.upfrontPrice,
        p.bonusProjects,
        p.totalAllowedProjects,
        p.status
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PackagePlans_${selectedScopeFilter}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify('success', `Exported ${dataToExport.length} package plans to CSV.`);
  };

  // Import CSV / Excel File
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rawRows.length <= 1) {
        notify('error', 'Uploaded file contains no data rows.');
        return;
      }

      // Identify header row
      let headerIdx = -1;
      let scopeIdx = 0;
      let ppmIdx = 1;
      let durIdx = 2;
      let upfrontIdx = 3;
      let bonusIdx = 4;
      let totalIdx = 5;
      let statusIdx = 6;

      for (let r = 0; r < Math.min(5, rawRows.length); r++) {
        const row = rawRows[r].map((c) => String(c).trim().toLowerCase());
        const hasHeaders = row.some((c) => /scope|project|month|upfront|bonus|quota|duration/i.test(c));
        if (hasHeaders) {
          headerIdx = r;
          row.forEach((col, idx) => {
            if (/scope/i.test(col)) scopeIdx = idx;
            else if (/project.*month|ppm|quota.*month|projectspermonth/i.test(col)) ppmIdx = idx;
            else if (/duration|month/i.test(col)) durIdx = idx;
            else if (/upfront|fee|price|rate|cost/i.test(col)) upfrontIdx = idx;
            else if (/bonus/i.test(col)) bonusIdx = idx;
            else if (/total|allowed/i.test(col)) totalIdx = idx;
            else if (/status|active/i.test(col)) statusIdx = idx;
          });
          break;
        }
      }

      const startIndex = headerIdx !== -1 ? headerIdx + 1 : 1;
      const parsedPlans: PackagePlanDocument[] = [];

      for (let i = startIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0 || row.every((c) => c === undefined || c === null || c === '')) {
          continue;
        }

        const rawScope = String(row[scopeIdx] || 'Pre Design').trim();
        const rawPpm = row[ppmIdx];
        const rawDur = row[durIdx];
        const rawUpfront = row[upfrontIdx];
        const rawBonus = row[bonusIdx];
        const rawStatus = String(row[statusIdx] || 'active').trim().toLowerCase();

        const ppm = isZeroOrPositive(rawPpm) ? parseInt(String(rawPpm), 10) || 100 : 100;
        const dur = isZeroOrPositive(rawDur) ? parseInt(String(rawDur), 10) || 1 : 1;
        const upfront = isZeroOrPositive(rawUpfront) ? parseFloat(String(rawUpfront)) || 0 : 0;
        const bonus = isZeroOrPositive(rawBonus) ? parseInt(String(rawBonus), 10) || 0 : 0;
        const total = computeTotalAllowed(ppm, dur, bonus);

        const planId = generatePlanDocId(rawScope, ppm, dur);

        parsedPlans.push({
          id: planId,
          scope: rawScope,
          projectsPerMonth: ppm,
          durationMonths: dur,
          upfrontPrice: upfront,
          bonusProjects: bonus,
          totalAllowedProjects: total,
          status: rawStatus === 'inactive' ? 'inactive' : 'active',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }

      if (parsedPlans.length === 0) {
        notify('error', 'Could not parse valid package plan rows from file.');
        return;
      }

      // Upsert parsed plans into current plans state
      setPlans((prev) => {
        const map = new Map<string, PackagePlanDocument>();
        prev.forEach((p) => map.set(p.id, p));
        parsedPlans.forEach((p) => map.set(p.id, p));
        return Array.from(map.values()).sort((a, b) => {
          if (a.scope !== b.scope) return a.scope.localeCompare(b.scope);
          if (a.projectsPerMonth !== b.projectsPerMonth) return a.projectsPerMonth - b.projectsPerMonth;
          return a.durationMonths - b.durationMonths;
        });
      });

      notify('success', `Imported ${parsedPlans.length} package plans into the active matrix. Review and click "Commit All Plans to Server" to save.`);
    } catch (err: any) {
      console.error('Package plan CSV import error:', err);
      notify('error', `Error importing package plans: ${err?.message || 'Invalid file format'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for CSV/Excel */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportFile}
        accept=".csv,.xlsx,.xls,.txt"
        className="hidden"
      />

      {/* Notification Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 shadow-lg transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          )}
          <span className="text-sm font-medium">{feedback.message}</span>
        </div>
      )}

      {/* Control Bar: Scope Selector & Quota Tier Filters */}
      <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Scope Selector */}
          <div className="flex-1">
            <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              1. Filter / Select Scope of Work (from /scopes)
            </label>
            <div className="flex items-center gap-2">
              <select
                value={selectedScopeFilter}
                onChange={(e) => setSelectedScopeFilter(e.target.value)}
                className="w-full sm:w-72 px-3.5 py-2.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none font-medium"
              >
                <option value="ALL">All Scopes ({allScopes.length})</option>
                {allScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={fetchScopes}
                className="px-3 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37]/50 rounded-xl text-xs font-mono text-gray-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Reload scopes from /scopes"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
                Reload Scopes
              </button>
            </div>
          </div>

          {/* Quota Tier Filters */}
          <div className="flex-1">
            <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37]" />
              2. Filter Quota Tier (Projects / Month)
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedQuotaFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  selectedQuotaFilter === 'ALL'
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-sm'
                    : 'bg-[#2A2A2A] text-gray-400 border-transparent hover:text-white'
                }`}
              >
                All Quotas
              </button>
              {availableQuotaTiers.map((quota) => (
                <button
                  key={quota}
                  type="button"
                  onClick={() => setSelectedQuotaFilter(String(quota))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                    selectedQuotaFilter === String(quota)
                      ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-sm'
                      : 'bg-[#2A2A2A] text-gray-400 border-transparent hover:text-white'
                  }`}
                >
                  {quota} / mo
                </button>
              ))}

              {/* Add Custom Quota Quick Filter */}
              <div className="flex items-center gap-1 ml-1">
                <input
                  type="number"
                  placeholder="+ Custom"
                  value={customQuotaInput}
                  onChange={(e) => setCustomQuotaInput(e.target.value)}
                  className="w-20 px-2 py-1 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-xs text-white focus:outline-none font-mono"
                />
                {customQuotaInput && (
                  <button
                    type="button"
                    onClick={() => {
                      if (customQuotaInput) {
                        setSelectedQuotaFilter(customQuotaInput);
                        setCustomQuotaInput('');
                      }
                    }}
                    className="px-2 py-1 bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37] rounded-lg text-xs font-bold hover:bg-[#D4AF37] hover:text-black transition-all cursor-pointer"
                  >
                    Set
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons bar */}
        <div className="pt-3 border-t border-[#2A2A2A] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddPlanRow}
              className="px-3.5 py-2 bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/50 text-[#D4AF37] hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Plan Row
            </button>

            <button
              type="button"
              onClick={handleRestoreCanonicalDefaults}
              className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              title="Reset to canonical standard 18 package plan rows"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              Restore Canonical Defaults
            </button>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37]/50 text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37]/50 text-gray-300 hover:text-white rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
              Import CSV / Excel
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isDirty ? (
              <span className="text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Unsaved Draft Changes
              </span>
            ) : (
              <span className="text-xs font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Synced with /packagePlans
              </span>
            )}

            <button
              type="button"
              onClick={handleBatchSavePlans}
              disabled={saving}
              className="px-5 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:brightness-110 active:scale-[0.99] transition-all flex items-center gap-2 shadow-lg shadow-[#D4AF37]/15 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Saving Plans...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Commit All Plans to Server
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Package Plans Table */}
      <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 bg-[#252525] border-b border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Subscription & Package Plans ({filteredPlans.length} showing of {plans.length} total)
            </h3>
          </div>
          <div className="text-xs font-mono text-gray-400">
            Formula: <span className="text-[#D4AF37]">Total = (Projects/Mo × Duration) + Bonus</span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400 font-mono text-sm flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
            Loading package plans from /packagePlans...
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-gray-400 font-mono text-sm flex flex-col items-center justify-center gap-3">
            <Package className="w-8 h-8 text-gray-600" />
            <p>No package plans match the current scope & quota filters.</p>
            <button
              onClick={handleAddPlanRow}
              className="mt-2 px-4 py-2 bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37] rounded-xl text-xs font-bold hover:bg-[#D4AF37] hover:text-black transition-all cursor-pointer"
            >
              Add New Package Plan
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#2A2A2A] bg-[#222222] text-xs font-mono text-gray-400 uppercase tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Scope of Work</th>
                  <th className="py-3 px-4">Projects / Month</th>
                  <th className="py-3 px-4">Plan Duration</th>
                  <th className="py-3 px-4">Upfront Fee (₹)</th>
                  <th className="py-3 px-4">Bonus Projects</th>
                  <th className="py-3 px-4">Total Allowed Quota</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A] font-medium">
                {filteredPlans.map((plan, index) => {
                  return (
                    <tr
                      key={plan.id}
                      className="hover:bg-[#252525]/60 transition-colors group"
                    >
                      {/* Row Index */}
                      <td className="py-3 px-4 text-xs font-mono text-gray-500">
                        {index + 1}
                      </td>

                      {/* Scope Selector */}
                      <td className="py-3 px-4">
                        <select
                          value={plan.scope}
                          onChange={(e) => handleUpdateField(plan.id, 'scope', e.target.value)}
                          className="px-2.5 py-1.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-xs font-semibold text-white focus:outline-none"
                        >
                          {allScopes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Projects / Month */}
                      <td className="py-3 px-4">
                        <div className="relative flex items-center w-32">
                          <input
                            type="number"
                            min="1"
                            step="10"
                            value={plan.projectsPerMonth}
                            onChange={(e) => handleUpdateField(plan.id, 'projectsPerMonth', e.target.value)}
                            className="w-full pl-3 pr-8 py-1.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-xs font-mono text-white focus:outline-none"
                          />
                          <span className="absolute right-2.5 text-[10px] font-mono text-gray-400 pointer-events-none">
                            /mo
                          </span>
                        </div>
                      </td>

                      {/* Plan Duration */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={plan.durationMonths}
                            onChange={(e) => handleUpdateField(plan.id, 'durationMonths', e.target.value)}
                            className="px-2.5 py-1.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-xs font-mono text-white focus:outline-none"
                          >
                            <option value="1">1 Month</option>
                            <option value="3">3 Months</option>
                            <option value="6">6 Months</option>
                            <option value="12">12 Months</option>
                          </select>
                        </div>
                      </td>

                      {/* Upfront Fee (₹) */}
                      <td className="py-3 px-4">
                        <div className="relative flex items-center w-36">
                          <div className="absolute left-2.5 text-[#D4AF37] pointer-events-none flex items-center">
                            <IndianRupee className="w-3.5 h-3.5" />
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="500"
                            value={plan.upfrontPrice}
                            onChange={(e) => handleUpdateField(plan.id, 'upfrontPrice', e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 bg-[#2A2A2A] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-xs font-mono text-[#D4AF37] font-bold focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Bonus Projects */}
                      <td className="py-3 px-4">
                        <div className="relative flex items-center w-28">
                          <div className="absolute left-2.5 text-emerald-400 pointer-events-none flex items-center">
                            <Gift className="w-3 h-3" />
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="5"
                            value={plan.bonusProjects}
                            onChange={(e) => handleUpdateField(plan.id, 'bonusProjects', e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 bg-[#2A2A2A] border border-[#333333] focus:border-emerald-500 rounded-lg text-xs font-mono text-emerald-300 font-bold focus:outline-none"
                          />
                        </div>
                      </td>

                      {/* Total Allowed Quota (Auto-computed read-only) */}
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2A2A2A] border border-[#333333] text-xs font-mono font-bold text-gray-200">
                          <Hash className="w-3 h-3 text-[#D4AF37]" />
                          <span>{plan.totalAllowedProjects}</span>
                          <span className="text-[10px] text-gray-500 font-normal">
                            ({plan.projectsPerMonth}×{plan.durationMonths} + {plan.bonusProjects})
                          </span>
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleUpdateField(plan.id, 'status', plan.status === 'active' ? 'inactive' : 'active')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border ${
                            plan.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {plan.status === 'active' ? (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                              Inactive
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeletePlanRow(plan.id)}
                          className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Delete package plan row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info summary */}
        <div className="p-4 bg-[#222222] border-t border-[#2A2A2A] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>
              All plans are validated for zero-value preservation and cleaned of undefined fields before writing to Firestore.
            </span>
          </div>
          <div className="font-mono text-gray-500">
            Target Collection: <code className="text-[#D4AF37]">packagePlans</code>
          </div>
        </div>
      </div>
    </div>
  );
}
