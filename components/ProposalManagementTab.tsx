'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';

import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
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
  Tag, 
  Shield,
  FileText,
  Upload
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ProposalDocument, 
  PricingCategory, 
  DEFAULT_PRICING_CATEGORIES, 
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

interface ProposalManagementTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

const PRESET_PROPOSALS: Array<{ proposalNumber: string; pricingCategory: PricingCategory }> = [];

export default function ProposalManagementTab({ currentEmail, currentRole }: ProposalManagementTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageProposals = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const [proposals, setProposals] = useState<ProposalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    proposalNumber: string;
    pricingCategory: PricingCategory;
  }>({
    proposalNumber: '',
    pricingCategory: 'T1'
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [proposalToDelete, setProposalToDelete] = useState<ProposalDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: COLLECTIONS.PROPOSALS
  });
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  // Load proposals from Firestore
  const loadProposals = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PROPOSALS));
      const list: ProposalDocument[] = [];
      snap.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as ProposalDocument), id: docSnap.id });
      });

      list.sort((a, b) => (a.proposalNumber || '').localeCompare(b.proposalNumber || ''));
      setProposals(list);
      return list;
    } catch (err) {
      console.error('Error fetching proposals:', err);
      const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.PROPOSALS);
      setErrorMsg(`Failed to load proposal directory: ${errInfo.error}`);
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
        const snap = await getDocs(collection(db, COLLECTIONS.PROPOSALS));
        const list: ProposalDocument[] = [];
        snap.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as ProposalDocument), id: docSnap.id });
        });

        if (list.length === 0 && canManageProposals) {
          if (isMounted) setProposals([]);
        } else {
          list.sort((a, b) => (a.proposalNumber || '').localeCompare(b.proposalNumber || ''));
          if (isMounted) {
            setProposals(list);
          }
        }
      } catch (err) {
        console.error('Error initializing proposals:', err);
        const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.PROPOSALS);
        if (isMounted) {
          setErrorMsg(`Failed to fetch proposals: ${errInfo.error}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (canManageProposals) {
      initFetch();
    }

    return () => {
      isMounted = false;
    };
  }, [canManageProposals]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      for (const item of PRESET_PROPOSALS) {
        const exists = proposals.some((p) => p.proposalNumber.toUpperCase() === item.proposalNumber.toUpperCase());
        if (!exists) {
          const docRef = doc(collection(db, COLLECTIONS.PROPOSALS));
          batch.set(docRef, {
            proposalNumber: item.proposalNumber,
            pricingCategory: item.pricingCategory,
            createdAt: new Date().toISOString()
          });
        }
      }
      await batch.commit();
      setSuccessMsg('Sample proposal entries populated.');
      await loadProposals();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error seeding proposals:', err);
      handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.PROPOSALS);
      setErrorMsg('Failed to seed default proposal presets.');
    } finally {
      setSeeding(false);
    }
  };

  const openAddModal = () => {
    setEditingProposalId(null);
    setFormData({
      proposalNumber: '',
      pricingCategory: 'T1'
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: ProposalDocument) => {
    setEditingProposalId(item.id || null);
    setFormData({
      proposalNumber: item.proposalNumber || '',
      pricingCategory: item.pricingCategory || 'T1'
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const propNum = formData.proposalNumber.trim().toUpperCase();
    if (!propNum) {
      setFormError('Please enter a valid Proposal Number.');
      return;
    }

    // Check duplicate proposal number
    const isDuplicate = proposals.some(
      (p) => (p.proposalNumber || '').toUpperCase() === propNum && p.id !== editingProposalId
    );

    if (isDuplicate) {
      setFormError(`Proposal number "${propNum}" already exists.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: ProposalDocument = {
        proposalNumber: propNum,
        pricingCategory: formData.pricingCategory,
        createdAt: new Date().toISOString()
      };

      if (editingProposalId) {
        await setDoc(doc(db, COLLECTIONS.PROPOSALS, editingProposalId), payload, { merge: true });
        setSuccessMsg(`Proposal "${propNum}" updated.`);
      } else {
        const uniqueKey = propNum.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const newRef = doc(db, COLLECTIONS.PROPOSALS, uniqueKey);
        await setDoc(newRef, payload, { merge: true });
        setSuccessMsg(`Proposal "${propNum}" created.`);
      }

      setIsModalOpen(false);
      await loadProposals();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error saving proposal:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.PROPOSALS);
      setFormError(`Firestore write error: ${errInfo.error}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id?: string, collectionName: string = COLLECTIONS.PROPOSALS, label?: string) => {
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
      setProposals(prev => {
        const updated = prev.filter(p => p.id !== id && (p.proposalNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '_') !== id);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('proposals', JSON.stringify(updated));
          }
        } catch (e) {
          console.warn('Could not update localStorage proposals cache', e);
        }
        return updated;
      });
      setSuccessMsg('Proposal record permanently deleted.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error deleting proposal:', err);
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

  const handleWipeProposalData = () => {
    setIsWipeModalOpen(true);
  };

  const executeWipeProposalData = async () => {
    setDeleting(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PROPOSALS));
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.PROPOSALS, docSnap.id));
      }
      setProposals([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('proposals');
      }
      setSuccessMsg('All proposal records in this module have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error wiping proposals:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.PROPOSALS);
      setErrorMsg('Failed to wipe proposal records. Check your Firebase Security Rules.');
    } finally {
      setDeleting(false);
    }
  };

  const handleImportProposals = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let importedList: Partial<ProposalDocument>[] = [];

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
            importedList.push({
              proposalNumber: rowObj.proposalnumber || rowObj['proposal number'] || rowObj.proposal_number || rowObj.proposal || '',
              pricingCategory: (rowObj.pricingcategory || rowObj['pricing category'] || rowObj.category || 'T1') as PricingCategory
            });
          }
        }

        if (importedList.length === 0) {
          setErrorMsg('No valid proposal records found in file.');
          return;
        }

        setSubmitting(true);
        let count = 0;
        const updatedProposals = [...proposals];

        for (const item of importedList) {
          const propNum = (item.proposalNumber || '').trim().toUpperCase();
          if (!propNum) continue;

          const uniqueKey = propNum.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const payload: ProposalDocument = {
            proposalNumber: propNum,
            pricingCategory: item.pricingCategory || 'T1',
            createdAt: item.createdAt || new Date().toISOString()
          };

          // Strict upsert with setDoc and merge: true
          await setDoc(doc(db, COLLECTIONS.PROPOSALS, uniqueKey), payload, { merge: true });

          const existingIndex = updatedProposals.findIndex(p => 
            p.id === uniqueKey || (p.proposalNumber || '').toUpperCase() === propNum
          );

          if (existingIndex >= 0) {
            updatedProposals[existingIndex] = { ...updatedProposals[existingIndex], ...payload, id: uniqueKey };
          } else {
            updatedProposals.push({ ...payload, id: uniqueKey });
          }
          count++;
        }

        setProposals(updatedProposals);
        if (typeof window !== 'undefined') {
          localStorage.setItem('proposals', JSON.stringify(updatedProposals));
        }

        setSuccessMsg(`Successfully imported and deduplicated ${count} proposal record(s).`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err) {
        console.error('Error importing proposals:', err);
        setErrorMsg('Failed to parse and import proposals file.');
      } finally {
        setSubmitting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredProposals = proposals.filter((p) => {
    const q = searchQuery.toLowerCase();
    const propNum = (p.proposalNumber || '').toLowerCase();
    const category = (p.pricingCategory || '').toLowerCase();
    return propNum.includes(q) || category.includes(q);
  });

  if (!canManageProposals) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Proposal Management</span> directory is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
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
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Commercial Module
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Proposal <span className="text-[#D4AF37]">Management</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Maintain proposal numbers and link them to pricing categories saved in the <code className="text-amber-400 font-mono">proposals</code> collection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="file"
            id="proposal-import-input"
            className="hidden"
            accept=".csv,.json"
            onChange={handleImportProposals}
          />

          <button
            onClick={loadProposals}
            disabled={loading}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleWipeProposalData}
            disabled={deleting}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all proposal records"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe Proposal Test Data
          </button>

          <button
            onClick={() => document.getElementById('proposal-import-input')?.click()}
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
            Add Proposal
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

      {/* Search & Statistics Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search proposal number or pricing tier..."
            className="w-full pl-10 pr-4 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-400 font-mono">
          <span>Active Proposals:</span>
          <span className="font-bold text-white bg-[#2A2A2A] px-2.5 py-0.5 rounded-lg border border-[#333333]">
            {filteredProposals.length} of {proposals.length}
          </span>
        </div>
      </div>

      {/* Proposals Directory Table */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading proposals from Firestore...</p>
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-3">
            <p>No proposals found. Add proposals manually or import from Excel.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                <tr>
                  <th className="p-3.5 pl-6">Proposal Number</th>
                  <th className="p-3.5">Pricing Category</th>
                  <th className="p-3.5">Created Date</th>
                  <th className="p-3.5 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {filteredProposals.map((item, idx) => (
                  <tr key={item.id || item.proposalNumber || idx} className="hover:bg-[#2A2A2A] transition-colors">
                    <td className="p-3.5 pl-6 font-bold text-white">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#D4AF37] shrink-0" />
                        <span className="font-mono text-base tracking-wide text-amber-400">
                          {item.proposalNumber || 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono">
                        <Tag className="w-3 h-3 text-[#D4AF37]" />
                        {item.pricingCategory || 'N/A'}
                      </span>
                    </td>
                    <td className="p-3.5 text-gray-400 font-mono text-sm">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-3.5 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          title="Edit Proposal"
                          className="p-1.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37] text-gray-200 hover:text-[#D4AF37] rounded-lg transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id || (item.proposalNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '_'), 'proposals', item.proposalNumber)}
                          disabled={deleting}
                          title="Delete Proposal"
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

      {/* Add / Edit Proposal Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#D4AF37]" />
                {editingProposalId ? 'Edit Proposal Link' : 'Add Proposal Number'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProposal} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider">
                  Proposal Number
                </label>
                <input
                  type="text"
                  value={formData.proposalNumber}
                  onChange={(e) => setFormData({ ...formData, proposalNumber: e.target.value.toUpperCase() })}
                  placeholder="e.g. PROP-2026-001"
                  required
                  className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all font-mono tracking-wide"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider">
                  Linked Pricing Category
                </label>
                <select
                  value={formData.pricingCategory}
                  onChange={(e) => setFormData({ ...formData, pricingCategory: e.target.value as PricingCategory })}
                  className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-amber-400 focus:outline-none font-mono"
                >
                  {DEFAULT_PRICING_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-3 flex items-center justify-between gap-3 border-t border-[#2A2A2A]">
                {editingProposalId ? (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => {
                      const idToDelete = editingProposalId;
                      setIsModalOpen(false);
                      if (idToDelete) handleDelete(idToDelete, 'proposals', formData.proposalNumber);
                    }}
                    className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-400 text-rose-400 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                    title="Permanently Delete Proposal"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Proposal
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
                        {editingProposalId ? 'Update Proposal' : 'Save Proposal'}
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
        title="Delete Proposal"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete proposal "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this proposal record? This action cannot be undone.'
        }
        confirmText="Delete Proposal"
        variant="danger"
        isLoading={deleting}
      />

      {/* Custom Wipe All Module Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipeProposalData}
        title="Wipe All Proposal Records"
        message="This will permanently delete ALL proposal records in this module from Firestore. This action cannot be undone."
        confirmText="Wipe All Records"
        variant="danger"
        requireConfirmationText="WIPE"
        inputPlaceholder='Type "WIPE" to confirm'
        isLoading={deleting}
      />
    </div>
  );
}
