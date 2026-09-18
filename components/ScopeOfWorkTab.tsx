'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  RefreshCw, 
  X, 
  Save, 
  Sparkles, 
  Layers, 
  Check, 
  PlusCircle, 
  Tags,
  Shield,
  Upload
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ScopeDocument, 
  PRESET_SCOPES, 
  handleFirestoreError, 
  OperationType 
} from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';

interface ScopeOfWorkTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

export default function ScopeOfWorkTab({ currentEmail, currentRole }: ScopeOfWorkTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageScopes = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const [scopes, setScopes] = useState<ScopeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScopeId, setEditingScopeId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    hasSubServices: boolean;
    subServices: string[];
    newSubServiceInput: string;
  }>({
    name: '',
    hasSubServices: true,
    subServices: [],
    newSubServiceInput: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirmation Modal State
  const [scopeToDelete, setScopeToDelete] = useState<ScopeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: COLLECTIONS.SCOPES
  });
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  // Load scopes from Firestore
  const loadScopes = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.SCOPES));
      const rawList: ScopeDocument[] = [];
      snap.forEach((docSnap) => {
        rawList.push({ ...(docSnap.data() as ScopeDocument), id: docSnap.id });
      });
      
      const list = Array.from(new Map(rawList.map(item => [item.name.toUpperCase(), item])).values());

      // Sort by createdAt or name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setScopes(list);
      return list;
    } catch (err) {
      console.error('Error fetching scopes of work:', err);
      const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.SCOPES);
      setErrorMsg(`Failed to load scopes of work: ${errInfo.error}`);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initFetch = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.SCOPES));
        const rawList: ScopeDocument[] = [];
        snap.forEach((docSnap) => {
          rawList.push({ ...(docSnap.data() as ScopeDocument), id: docSnap.id });
        });
        
        const list = Array.from(new Map(rawList.map(item => [item.name.toUpperCase(), item])).values());

        if (list.length === 0 && canManageScopes) {
          if (isMounted) setScopes([]);
        } else {
          list.sort((a, b) => a.name.localeCompare(b.name));
          if (isMounted) {
            setScopes(list);
          }
        }
      } catch (err) {
        console.error('Error in scope tab init:', err);
        const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.SCOPES);
        if (isMounted) {
          setErrorMsg(`Failed to fetch scopes: ${errInfo.error}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (canManageScopes) {
      initFetch();
    }

    return () => {
      isMounted = false;
    };
  }, [canManageScopes]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      for (const item of PRESET_SCOPES) {
        // Check if scope with name already exists
        const exists = scopes.some((s) => s.name.toUpperCase() === item.name.toUpperCase());
        if (!exists) {
          const docRef = doc(collection(db, COLLECTIONS.SCOPES));
          batch.set(docRef, {
            name: item.name,
            hasSubServices: item.hasSubServices,
            subServices: item.subServices,
            createdAt: new Date().toISOString()
          });
        }
      }
      await batch.commit();
      setSuccessMsg('Solarithm preset scope entries populated.');
      await loadScopes();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error seeding scopes:', err);
      handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.SCOPES);
      setErrorMsg('Failed to seed default scope presets.');
    } finally {
      setSeeding(false);
    }
  };

  const openAddModal = () => {
    setEditingScopeId(null);
    setFormData({
      name: '',
      hasSubServices: true,
      subServices: [],
      newSubServiceInput: ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (scopeItem: ScopeDocument) => {
    setEditingScopeId(scopeItem.id || null);
    setFormData({
      name: scopeItem.name,
      hasSubServices: scopeItem.hasSubServices,
      subServices: scopeItem.subServices || [],
      newSubServiceInput: ''
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleToggleSubServices = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      hasSubServices: checked,
      subServices: checked ? prev.subServices : []
    }));
  };

  const handleAddSubServiceTag = () => {
    const tag = formData.newSubServiceInput.trim();
    if (!tag) return;
    if (formData.subServices.some((s) => s.toLowerCase() === tag.toLowerCase())) {
      setFormError(`Sub-service tier "${tag}" already exists.`);
      return;
    }

    setFormData((prev) => ({
      ...prev,
      subServices: [...prev.subServices, tag],
      newSubServiceInput: ''
    }));
    setFormError(null);
  };

  const handleRemoveSubServiceTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      subServices: prev.subServices.filter((s) => s !== tagToRemove)
    }));
  };

  const handlePresetSelect = (presetName: string) => {
    const preset = PRESET_SCOPES.find((p) => p.name === presetName);
    if (preset) {
      setFormData((prev) => ({
        ...prev,
        name: preset.name,
        hasSubServices: preset.hasSubServices,
        subServices: preset.hasSubServices ? preset.subServices : []
      }));
    } else {
      setFormData((prev) => ({ ...prev, name: presetName }));
    }
  };

  const handleSaveScope = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nameTrimmed = formData.name.trim();
    if (!nameTrimmed) {
      setFormError('Please provide a scope name (e.g., PRE DESIGN, CEIG, PVSYST).');
      return;
    }

    // Check duplicate name
    const duplicate = scopes.some(
      (s) => s.name.toUpperCase() === nameTrimmed.toUpperCase() && s.id !== editingScopeId
    );

    if (duplicate) {
      setFormError(`A scope of work with name "${nameTrimmed}" already exists.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: ScopeDocument = {
        name: nameTrimmed,
        hasSubServices: formData.hasSubServices,
        subServices: formData.hasSubServices ? formData.subServices : [],
        createdAt: new Date().toISOString()
      };

      if (editingScopeId) {
        // Edit
        const scopeRef = doc(db, COLLECTIONS.SCOPES, editingScopeId);
        await setDoc(scopeRef, payload, { merge: true });
        setSuccessMsg(`Scope of Work "${nameTrimmed}" updated successfully.`);
      } else {
        // Add New with unique key upsert
        const uniqueKey = nameTrimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const newScopeRef = doc(db, COLLECTIONS.SCOPES, uniqueKey);
        await setDoc(newScopeRef, payload, { merge: true });
        setSuccessMsg(`New Scope of Work "${nameTrimmed}" created.`);
      }

      setIsModalOpen(false);
      await loadScopes();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error saving scope:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.SCOPES);
      setFormError(`Firestore write error: ${errInfo.error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id?: string, collectionName: string = COLLECTIONS.SCOPES, label?: string) => {
    if (!id) {
      setErrorMsg("Cannot delete: Document ID is missing.");
      return;
    }
    setDeleteModalState({
      isOpen: true,
      id,
      collectionName,
      label
    });
  };

  const executeDelete = async () => {
    const { id, collectionName } = deleteModalState;
    if (!id) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, collectionName, id));
      setScopes(prev => {
        const updated = prev.filter(s => s.id !== id && s.name.toLowerCase().replace(/[^a-z0-9]/g, '_') !== id);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('scopes', JSON.stringify(updated));
          }
        } catch (e) {
          console.warn('Could not update localStorage scopes cache', e);
        }
        return updated;
      });
      setSuccessMsg('Scope of work record permanently deleted.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error deleting scope:', err);
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
      setErrorMsg("Failed to delete record. Check your Firebase Security Rules.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteRecord = (firstArg?: string, secondArg?: string) => {
    if (secondArg) {
      return handleDelete(secondArg, firstArg);
    }
    return handleDelete(firstArg);
  };

  const handleWipeScopeData = () => {
    setIsWipeModalOpen(true);
  };

  const executeWipeScopeData = async () => {
    setDeleting(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.SCOPES));
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.SCOPES, docSnap.id));
      }
      setScopes([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('scopes');
      }
      setSuccessMsg('All scope records in this module have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error wiping scopes:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.SCOPES);
      setErrorMsg('Failed to wipe scope records. Check your Firebase Security Rules.');
    } finally {
      setDeleting(false);
    }
  };

  const handleImportScopes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let importedList: Partial<ScopeDocument>[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          importedList = Array.isArray(parsed) ? parsed : [parsed];
        } else {
          // CSV parsing
          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length <= 1) {
            setErrorMsg('CSV file is empty or missing headers.');
            return;
          }
          const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
            const rowObj: any = {};
            headers.forEach((h, idx) => {
              rowObj[h] = cols[idx] || '';
            });
            const subServicesRaw = rowObj.subservices || rowObj['sub services'] || rowObj.subservice || '';
            const subServices = subServicesRaw ? subServicesRaw.split(';').map((s: string) => s.trim()).filter(Boolean) : [];
            importedList.push({
              name: rowObj.name || rowObj['scope name'] || rowObj.scope || '',
              hasSubServices: subServices.length > 0,
              subServices: subServices
            });
          }
        }

        if (importedList.length === 0) {
          setErrorMsg('No valid scope records found in file.');
          return;
        }

        setSubmitting(true);
        let count = 0;
        const updatedScopes = [...scopes];

        for (const item of importedList) {
          const name = item.name?.trim() || '';
          if (!name) continue;

          // Unique key for upsert
          const uniqueKey = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const payload: ScopeDocument = {
            name: name,
            hasSubServices: Boolean(item.hasSubServices || (item.subServices && item.subServices.length > 0)),
            subServices: item.subServices || [],
            createdAt: item.createdAt || new Date().toISOString()
          };

          // Strict upsert with setDoc and merge: true
          await setDoc(doc(db, COLLECTIONS.SCOPES, uniqueKey), payload, { merge: true });

          const existingIndex = updatedScopes.findIndex(s => 
            s.id === uniqueKey || s.name.toLowerCase() === name.toLowerCase()
          );

          if (existingIndex >= 0) {
            updatedScopes[existingIndex] = { ...updatedScopes[existingIndex], ...payload, id: uniqueKey };
          } else {
            updatedScopes.push({ ...payload, id: uniqueKey });
          }
          count++;
        }

        setScopes(updatedScopes);
        if (typeof window !== 'undefined') {
          localStorage.setItem('scopes', JSON.stringify(updatedScopes));
        }

        setSuccessMsg(`Successfully imported and deduplicated ${count} scope record(s).`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err) {
        console.error('Error importing scopes:', err);
        setErrorMsg('Failed to parse and import scope file.');
      } finally {
        setSubmitting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Filtered scopes list
  const rawFilteredScopes = scopes.filter((s) => {
    const q = searchQuery.toLowerCase();
    const hasMatchInSubServices = s.subServices?.some((sub) => sub.toLowerCase().includes(q));
    return s.name.toLowerCase().includes(q) || hasMatchInSubServices;
  });

  const filteredScopes = Array.from(
    new Map(rawFilteredScopes.map((item) => [item.name.toUpperCase(), item])).values()
  );

  // Access check card for restricted roles
  if (!canManageScopes) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Scope of Work</span> configuration module is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Engineering Module
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Scope of Work <span className="text-[#D4AF37]">Management</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Define solar engineering scope offerings and tier sub-services saved in the <code className="text-amber-400 font-mono">scopes</code> collection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="file"
            id="scope-import-input"
            className="hidden"
            accept=".csv,.json"
            onChange={handleImportScopes}
          />

          <button
            onClick={loadScopes}
            disabled={loading}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleWipeScopeData}
            disabled={deleting}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all scope records"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe Scope Test Data
          </button>

          <button
            onClick={() => document.getElementById('scope-import-input')?.click()}
            disabled={submitting}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV / JSON
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center gap-1.5 shadow-lg shadow-[#D4AF37]/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Scope
          </button>
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

      {/* Search & Filter Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scope by name or sub-service..."
            className="w-full pl-10 pr-4 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
          <span>Active Scopes:</span>
          <span className="font-bold text-white bg-[#2A2A2A] px-2.5 py-0.5 rounded-lg border border-[#333333]">
            {filteredScopes.length} of {scopes.length}
          </span>
        </div>
      </div>

      {/* Scope Items Table */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading scopes of work from Firestore...</p>
          </div>
        ) : filteredScopes.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-3">
            <p>No Scope of Work documents found.</p>
            <button
              onClick={handleSeedDefaults}
              className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] text-[#D4AF37] rounded-lg text-sm font-mono transition-all cursor-pointer"
            >
              Click to seed standard Solarithm presets
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                <tr>
                  <th className="p-3.5 pl-6">Scope Name</th>
                  <th className="p-3.5">Has Sub-Services</th>
                  <th className="p-3.5">Sub-Services List</th>
                  <th className="p-3.5">Created Date</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {filteredScopes.map((item) => (
                  <tr key={item.id || item.name} className="hover:bg-[#2A2A2A] transition-colors group">
                    <td className="p-3.5 pl-6 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#D4AF37] shrink-0" />
                        <span className="font-mono text-base tracking-wide text-amber-400">{item.name}</span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      {item.hasSubServices ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                          <Check className="w-3 h-3 stroke-[3]" /> True
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-gray-500/10 border border-gray-500/30 text-gray-400 font-mono">
                          <X className="w-3 h-3 stroke-[3]" /> False
                        </span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {item.hasSubServices && item.subServices.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {item.subServices.map((sub) => (
                            <span
                              key={sub}
                              className="px-2 py-0.5 bg-[#2A2A2A] border border-[#2A2A2A] text-gray-200 text-sm rounded-md font-mono flex items-center gap-1"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
                              {sub}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500 font-mono italic text-sm">
                          No sub-services required
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-400 font-mono text-sm">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-3.5 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          title="Edit Scope"
                          className="p-1.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37] text-gray-200 hover:text-[#D4AF37] rounded-lg transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id || item.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), COLLECTIONS.SCOPES, item.name)}
                          disabled={deleting}
                          title="Delete Scope"
                          className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#2A2A2A] hover:border-rose-500/30 text-gray-200 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Scope Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#D4AF37]" />
                {editingScopeId ? 'Edit Scope of Work' : 'Add New Scope of Work'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScope} className="space-y-5">
              {/* Preset Selector Chips */}
              {!editingScopeId && (
                <div>
                  <label className="block text-xs font-mono text-gray-400 uppercase mb-2">
                    Quick Presets (Click to Auto-Fill)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl">
                    {PRESET_SCOPES.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handlePresetSelect(p.name)}
                        className={`px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                          formData.name === p.name
                            ? 'bg-[#D4AF37] text-black font-bold border-[#D4AF37]'
                            : 'bg-[#1E1E1E] text-gray-200 border-[#333333] hover:border-[#D4AF37]/50'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider">
                  Scope Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                  placeholder="e.g. PRE DESIGN, CEIG, PVSYST, POST DESIGN + PVSYST"
                  required
                  className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all font-mono tracking-wide"
                />
              </div>

              {/* Has Sub-Services Toggle Checkbox */}
              <div className="p-4 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Tags className="w-4 h-4 text-[#D4AF37]" /> Has Sub-Services
                    </span>
                    <p className="text-xs text-gray-400">
                      Enable if this scope requires tier sub-services (e.g. Standard, Special, Premium).
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={formData.hasSubServices}
                    onChange={(e) => handleToggleSubServices(e.target.checked)}
                    className="w-5 h-5 accent-[#D4AF37] rounded cursor-pointer"
                  />
                </label>

                {/* Sub-Services Editor */}
                {formData.hasSubServices && (
                  <div className="pt-3 border-t border-[#2A2A2A] space-y-3">
                    <label className="block text-sm font-semibold text-gray-200">
                      Sub-Services Tiers
                    </label>

                    {/* Sub-Services Tag Cloud */}
                    <div className="flex flex-wrap gap-2">
                      {formData.subServices.map((sub) => (
                        <span
                          key={sub}
                          className="px-2.5 py-1 bg-[#1E1E1E] border border-[#2A2A2A] text-amber-400 text-sm rounded-lg font-mono flex items-center gap-1.5 shadow-sm"
                        >
                          <span>{sub}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubServiceTag(sub)}
                            className="text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}

                      {formData.subServices.length === 0 && (
                        <span className="text-sm text-amber-400/80 italic font-mono">
                          No sub-services defined. Add below or uncheck box.
                        </span>
                      )}
                    </div>

                    {/* Add Custom Sub-Service Input */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={formData.newSubServiceInput}
                        onChange={(e) => setFormData({ ...formData, newSubServiceInput: e.target.value })}
                        placeholder="Add new sub-service tier..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubServiceTag();
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-[#1E1E1E] border border-[#333333] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleAddSubServiceTag}
                        className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] text-sm font-semibold text-gray-200 hover:text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Add Tag
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-[#2A2A2A]">
                {editingScopeId ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      const idToDelete = editingScopeId;
                      setIsModalOpen(false);
                      if (idToDelete) handleDelete(idToDelete, 'scopes', formData.name);
                    }}
                    className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-400 text-rose-400 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                    title="Permanently Delete Scope"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Scope
                  </button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-medium text-gray-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/10"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        {editingScopeId ? 'Update Scope' : 'Save Scope'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={executeDelete}
        title="Delete Scope of Work"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete scope "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this scope record? This action cannot be undone.'
        }
        confirmText="Delete Scope"
        variant="danger"
        isLoading={deleting}
      />

      {/* Custom Wipe All Module Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipeScopeData}
        title="Wipe All Scope Records"
        message="This will permanently delete ALL scope of work records in this module from Firestore. This action cannot be undone."
        confirmText="Wipe All Records"
        variant="danger"
        requireConfirmationText="WIPE"
        inputPlaceholder='Type "WIPE" to confirm'
        isLoading={deleting}
      />
    </div>
  );
}
