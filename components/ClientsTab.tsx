'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import { 
  Building2,
  Search,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Eye,
  Trash2,
  RefreshCw,
  Filter,
  X,
  Download,
  ArrowRightLeft,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Upload
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ClientDocument,
  UserDocument,
  DEFAULT_PRICING_CATEGORIES,
  handleFirestoreError,
  OperationType
} from '@/lib/firebase';
import { ConfirmModal } from './ConfirmModal';

interface ClientsTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

export default function ClientsTab({ currentEmail, currentRole }: ClientsTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageClients = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const [clients, setClients] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [salesPersons, setSalesPersons] = useState<UserDocument[]>([]);
  
  // Filters
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [salesFilter, setSalesFilter] = useState('All');
  const [priceCategoryFilter, setPriceCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Bulk Actions
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catFrom, setCatFrom] = useState('Nil');
  const [catTo, setCatTo] = useState('Nil');
  
  const [showSalesModal, setShowSalesModal] = useState(false);
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  
  // Edit & View
  const [editingClient, setEditingClient] = useState<ClientDocument | null>(null);
  const [viewingClient, setViewingClient] = useState<ClientDocument | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Delete & Wipe Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: COLLECTIONS.CLIENTS
  });
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);


  const handleSaveClient = async () => {
    if (!editingClient || !editingClient.id) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      const clientRef = doc(db, COLLECTIONS.CLIENTS, editingClient.id);
      
      const updateData = {
        companyName: editingClient.companyName || '',
        contactPerson: editingClient.contactPerson || '',
        email: editingClient.email || '',
        phone: editingClient.phone || '',
        city: editingClient.city || '',
        gstin: editingClient.gstin || '',
        pricingCategory: editingClient.pricingCategory || 'Nil',
        submittedBy: editingClient.submittedBy || '',
        [CLIENT_FIELDS.SALES_PERSON_EMAIL]: editingClient.salesPersonEmail || editingClient.submittedBy || '',
        proposalNumber: editingClient.proposalNumber || '',
        status: editingClient.status || CLIENT_STATUS.PENDING
      };
      
      await updateDoc(clientRef, updateData);
      setSuccessMsg('Client updated successfully.');
      setEditingClient(null);
      await loadClientsAndUsers();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error updating client:', err);
      setErrorMsg('Failed to update client.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id?: string, collectionName: string = COLLECTIONS.CLIENTS, label?: string) => {
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
      setClients(prev => {
        const updated = prev.filter(c => c.id !== id);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('clients', JSON.stringify(updated));
          }
        } catch (e) {
          console.warn('Could not update localStorage clients cache', e);
        }
        return updated;
      });
      setSuccessMsg('Client record permanently deleted.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Error deleting client from Firestore:', err);
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

  const handleWipeClientData = () => {
    setIsWipeModalOpen(true);
  };

  const executeWipeClientData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.CLIENTS));
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.CLIENTS, docSnap.id));
      }
      setClients([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clients');
      }
      setSuccessMsg('All client records have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error wiping clients:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.CLIENTS);
      setErrorMsg('Failed to wipe client records. Check your Firebase Security Rules.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportClients = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let importedList: any[] = [];

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
              companyName: rowObj.companyname || rowObj['company name'] || rowObj.company || '',
              contactPerson: rowObj.contactperson || rowObj['contact person'] || rowObj.contact || '',
              email: rowObj.email || '',
              phone: rowObj.phone || rowObj.mobile || '',
              city: rowObj.city || '',
              gstin: rowObj.gstin || '',
              pricingCategory: rowObj.pricingcategory || rowObj['pricing category'] || rowObj.category || 'Nil',
              submittedBy: rowObj.submittedby || rowObj['submitted by'] || '',
              salesPersonEmail: rowObj.salespersonemail || rowObj['sales person email'] || rowObj.submittedby || '',
              proposalNumber: rowObj.proposalnumber || rowObj['proposal number'] || '',
              status: rowObj.status || CLIENT_STATUS.PENDING
            });
          }
        }

        if (importedList.length === 0) {
          setErrorMsg('No valid client records found in file.');
          return;
        }

        setLoading(true);
        let count = 0;
        const updatedClients = [...clients];

        for (const item of importedList) {
          const company = (item.companyName || '').trim();
          if (!company) continue;

          // Deterministic unique key based on gstin or sanitized company name
          const uniqueKey = item.id || (item.gstin ? item.gstin.toLowerCase().replace(/[^a-z0-9]/g, '') : company.toLowerCase().replace(/[^a-z0-9]/g, '_'));

          const docData = {
            companyName: company,
            contactPerson: (item.contactPerson || '').trim(),
            email: (item.email || '').trim(),
            phone: (item.phone || '').trim(),
            city: (item.city || '').trim(),
            gstin: (item.gstin || '').trim(),
            pricingCategory: item.pricingCategory || 'Nil',
            submittedBy: (item.submittedBy || '').trim(),
            salesPersonEmail: (item.salesPersonEmail || item.submittedBy || '').trim(),
            proposalNumber: (item.proposalNumber || '').trim(),
            status: item.status || CLIENT_STATUS.PENDING,
            createdAt: item.createdAt || new Date().toISOString()
          };

          // Strict upsert with setDoc and merge: true
          await setDoc(doc(db, COLLECTIONS.CLIENTS, uniqueKey), docData, { merge: true });

          const existingIndex = updatedClients.findIndex(c => 
            c.id === uniqueKey || 
            (c.gstin && docData.gstin && c.gstin.toLowerCase() === docData.gstin.toLowerCase()) || 
            c.companyName.toLowerCase() === company.toLowerCase()
          );

          if (existingIndex >= 0) {
            updatedClients[existingIndex] = { ...updatedClients[existingIndex], ...docData, id: uniqueKey };
          } else {
            updatedClients.push({ ...docData, id: uniqueKey });
          }
          count++;
        }

        setClients(updatedClients);
        if (typeof window !== 'undefined') {
          localStorage.setItem('clients', JSON.stringify(updatedClients));
        }

        setSuccessMsg(`Successfully imported and deduplicated ${count} client(s).`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err) {
        console.error('Error importing clients:', err);
        setErrorMsg('Failed to parse and import clients file.');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const loadClientsAndUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const q = query(
        collection(db, COLLECTIONS.CLIENTS),
        orderBy(CLIENT_FIELDS.CREATED_AT, 'desc')
      );
      const snap = await getDocs(q);
      const list: ClientDocument[] = [];
      snap.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as ClientDocument), id: docSnap.id });
      });
      setClients(list);
      try {
        localStorage.setItem('clients', JSON.stringify(list));
      } catch (e) {
        console.warn('Could not cache clients in localStorage', e);
      }
      
      const userQ = query(collection(db, COLLECTIONS.USERS));
      const userSnap = await getDocs(userQ);
      const usersList: UserDocument[] = [];
      userSnap.forEach((uSnap) => {
        usersList.push({ ...(uSnap.data() as UserDocument), id: uSnap.id });
      });
      const salesReps = usersList.filter(user => {
        const role = String(user.department || user.role || (user as any).assignedRole || '').toLowerCase().trim();
        return ['sales', 'owner', 'admin', 'super_admin'].includes(role);
      });
      setSalesPersons(salesReps);
    } catch (err) {
      console.error('Error loading data:', err);
      handleFirestoreError(err, OperationType.LIST, COLLECTIONS.CLIENTS);
      setErrorMsg('Failed to load clients. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageClients) {
      loadClientsAndUsers();
    }
  }, [canManageClients, loadClientsAndUsers]);

  
  const countCatMatches = clients.filter(c => (c.pricingCategory || 'Nil') === catFrom).length;
  const countSalesMatches = clients.filter(c => c.submittedBy === salesFrom).length;

  const handleChangeCategory = async () => {
    if (catFrom === catTo) {
      setErrorMsg('From and To categories cannot be the same.');
      return;
    }
    setBulkLoading(true);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      const toUpdate = clients.filter(c => (c.pricingCategory || 'Nil') === catFrom);
      
      let updatedCount = 0;
      toUpdate.forEach(c => {
        if (c.id) {
          batch.update(doc(db, COLLECTIONS.CLIENTS, c.id), { pricingCategory: catTo });
          updatedCount++;
        }
      });
      
      if (updatedCount > 0) {
        await batch.commit();
        setSuccessMsg(`${updatedCount} client(s) moved from ${catFrom} to ${catTo}.`);
        await loadClientsAndUsers();
      } else {
        setSuccessMsg('No clients found to update.');
      }
      setShowCategoryModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error changing category:', err);
      setErrorMsg('Failed to change category.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleChangeSalesPerson = async () => {
    if (!salesFrom || !salesTo || salesFrom === salesTo) {
      setErrorMsg('Invalid or identical sales persons selected.');
      return;
    }
    setBulkLoading(true);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      const toUpdate = clients.filter(c => c.submittedBy === salesFrom);
      
      let updatedCount = 0;
      toUpdate.forEach(c => {
        if (c.id) {
          batch.update(doc(db, COLLECTIONS.CLIENTS, c.id), { submittedBy: salesTo });
          updatedCount++;
        }
      });
      
      if (updatedCount > 0) {
        await batch.commit();
        const fromName = salesPersons.find(s => s.email === salesFrom)?.name || salesFrom;
        const toName = salesPersons.find(s => s.email === salesTo)?.name || salesTo;
        setSuccessMsg(`${updatedCount} client(s) moved from ${fromName} to ${toName}.`);
        await loadClientsAndUsers();
      } else {
        setSuccessMsg('No clients found to update.');
      }
      setShowSalesModal(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error changing sales person:', err);
      setErrorMsg('Failed to change sales person.');
    } finally {
      setBulkLoading(false);
    }
  };

  const sweepOrphanedClients = async () => {
    const fallbackEmail = 'jay.solarithm@gmail.com';
    const batch = writeBatch(db);
    let count = 0;

    const validReps = salesPersons.map(u => u.email.toLowerCase()); 

    clients.forEach(client => {
      const currentRep = String(client.salesPersonEmail || '').toLowerCase();
      if (currentRep && !validReps.includes(currentRep) && client.id) {
        const clientRef = doc(db, COLLECTIONS.CLIENTS, client.id);
        batch.update(clientRef, { 
          [CLIENT_FIELDS.SALES_PERSON_EMAIL]: fallbackEmail,
          originalSalesEmail: currentRep 
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      setSuccessMsg(`Successfully reassigned ${count} orphaned clients to ${fallbackEmail}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      loadClientsAndUsers();
    } else {
      setSuccessMsg('No orphaned clients found.');
      setTimeout(() => setSuccessMsg(null), 4000);
    }
  };

  const handleExportCSV = () => {
    if (sortedClients.length === 0) {
      setErrorMsg('No clients to export.');
      setTimeout(() => setErrorMsg(null), 3000);
      return;
    }
    
    const headers = ['Company Name', 'Contact Person', 'City', 'GSTIN', 'Pricing Category', 'Status', 'Submitted By', 'Proposal Number', 'Created At'];
    
    const rows = sortedClients.map(c => [
      c.companyName,
      c.contactPerson,
      c.city,
      c.gstin || '',
      c.pricingCategory || 'Nil',
      c.status,
      c.submittedBy,
      c.proposalNumber || '',
      c.createdAt
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(String).map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `clients_export_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uniqueCities = Array.from(new Set(clients.map(c => c.city).filter(Boolean))).sort();
  const pricingCategories = [...DEFAULT_PRICING_CATEGORIES, 'Nil'];

  const filteredClients = React.useMemo(() => {
    return clients.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = 
        c.companyName.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        (c.gstin && c.gstin.toLowerCase().includes(q)) ||
        (c.proposalNumber && c.proposalNumber.toLowerCase().includes(q));
        
      const matchesSales = salesFilter === 'All' || c.submittedBy === salesFilter;
      
      // For price category, treat undefined/null as 'Nil' or Unassigned
      const cat = c.pricingCategory || 'Nil';
      const matchesCategory = priceCategoryFilter === 'All' || cat === priceCategoryFilter;
      
      const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
      
      const matchesCity = cityFilter === 'All' || c.city === cityFilter;
      
      return matchesSearch && matchesSales && matchesCategory && matchesStatus && matchesCity;
    });
  }, [clients, searchQuery, salesFilter, priceCategoryFilter, statusFilter, cityFilter]);

  const salesMap = React.useMemo(() => {
    const map = new Map<string, string>();
    salesPersons.forEach(sp => map.set(sp.email, sp.name));
    return map;
  }, [salesPersons]);

  let sortedClients = [...filteredClients];
  if (sortConfig !== null) {
    sortedClients.sort((a, b) => {
      let aVal = (a as any)[sortConfig.key] || '';
      let bVal = (b as any)[sortConfig.key] || '';
      
      if (sortConfig.key === 'salesPersonName') {
         aVal = salesMap.get(a.submittedBy) || a.submittedBy;
         bVal = salesMap.get(b.submittedBy) || b.submittedBy;
      } else if (sortConfig.key === 'createdAt') {
         aVal = new Date(a.createdAt).getTime();
         bVal = new Date(b.createdAt).getTime();
      } else {
         if (typeof aVal === 'string') aVal = aVal.toLowerCase();
         if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const resetFilters = () => {
    setSearchQuery('');
    setSalesFilter('All');
    setPriceCategoryFilter('All');
    setStatusFilter('All');
    setCityFilter('All');
  };

  if (!canManageClients) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Clients</span> tab is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
          </p>
        </div>
      </div>
    );
  }

    const getCategoryBadge = (cat: string) => {
    const colorMap: Record<string, string> = {
      'T1': 'bg-[#D4AF37]/20 border-[#D4AF37]/50 text-[#D4AF37]',
      'T2': 'bg-[#C0C0C0]/20 border-[#C0C0C0]/50 text-[#C0C0C0]',
      'T3': 'bg-[#CD7F32]/20 border-[#CD7F32]/50 text-[#CD7F32]',
      'T4': 'bg-[#4A90E2]/20 border-[#4A90E2]/50 text-[#4A90E2]',
      'T5': 'bg-[#50C878]/20 border-[#50C878]/50 text-[#50C878]',
      'INCENTIVE': 'bg-[#9B59B6]/20 border-[#9B59B6]/50 text-[#9B59B6]',
      'Nil': 'bg-[#808080]/20 border-[#808080]/50 text-[#808080]'
    };
    const cssClass = colorMap[cat] || colorMap['Nil'];
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border font-mono text-xs uppercase tracking-wider ${cssClass}`}>
        {cat}
      </span>
    );
  };

  const renderSortableHeader = ({ label, sortKey, className = "" }: { label: string, sortKey: string, className?: string }) => {
    return (
      <th 
        className={`p-4 cursor-pointer hover:bg-[#2A2A2A] transition-colors select-none ${className}`}
        onClick={() => requestSort(sortKey)}
      >
        <div className="flex items-center gap-1.5">
          {label}
          {sortConfig?.key === sortKey ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-[#D4AF37]" /> : <ArrowDown className="w-3 h-3 text-[#D4AF37]" />
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-50" />
          )}
        </div>
      </th>
    );
  };

const getStatusBadge = (status: string) => {
    switch (status) {
      case CLIENT_STATUS.APPROVED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/10" /> Approved
          </span>
        );
      case CLIENT_STATUS.REJECTED:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500/10" /> Rejected
          </span>
        );
      case CLIENT_STATUS.PENDING:
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/10" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 w-full max-w-full">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
            <Building2 className="w-4 h-4 text-[#D4AF37]" /> Client Database
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Client <span className="text-[#D4AF37]">Management</span>
          </h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#2A2A2A] text-gray-200 border border-[#333333]">
              Total Clients: {clients.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="file"
            id="clients-import-input"
            className="hidden"
            accept=".csv,.json"
            onChange={handleImportClients}
          />

          <button 
            onClick={sweepOrphanedClients} 
            className="px-3.5 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-500 rounded-lg text-sm font-medium transition-all cursor-pointer"
          >
            Sync Orphans
          </button>

          <button
            onClick={loadClientsAndUsers}
            disabled={loading}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : 'text-[#D4AF37]'}`} />
            Refresh
          </button>

          <button
            onClick={handleWipeClientData}
            disabled={loading}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all client records"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe Client Test Data
          </button>

          <button
            onClick={() => document.getElementById('clients-import-input')?.click()}
            disabled={loading}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV / JSON
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}


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

      {/* Bulk Actions Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-auto">Bulk Actions</span>
        
        <button
          onClick={() => setShowCategoryModal(true)}
          className="w-full sm:w-auto px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-semibold text-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
          Change Category
        </button>

        <button
          onClick={() => setShowSalesModal(true)}
          className="w-full sm:w-auto px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-semibold text-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Users className="w-3.5 h-3.5 text-blue-400" />
          Change Sales Person
        </button>

        <button
          onClick={handleExportCSV}
          className="w-full sm:w-auto px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-emerald-500/30 rounded-lg text-sm font-semibold text-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          Export to CSV
        </button>
      </div>

      {/* Filter Section */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 md:p-5 flex flex-col gap-4 shadow-md">
        
        {/* Top Row: Search & Reset */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, contact, city, GSTIN, or proposal..."
              className="w-full pl-10 pr-4 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
          </div>
          <button
            onClick={resetFilters}
            className="w-full sm:w-auto px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] rounded-lg text-sm font-semibold text-gray-200 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Filter className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>

        {/* Bottom Row: Dropdowns */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Sales Person */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Sales Person</label>
            <select
              value={salesFilter}
              onChange={(e) => setSalesFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-gray-200 focus:outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="All">All Sales Persons</option>
              {salesPersons.map(sp => (
                <option key={sp.id} value={sp.email}>{sp.name}</option>
              ))}
            </select>
          </div>

          {/* Price Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Price Category</label>
            <select
              value={priceCategoryFilter}
              onChange={(e) => setPriceCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-gray-200 focus:outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="All">All Categories</option>
              {pricingCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-gray-200 focus:outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="All">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending_approval">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">City</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-gray-200 focus:outline-none transition-all cursor-pointer appearance-none"
            >
              <option value="All">All Cities</option>
              {uniqueCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

        </div>
        
        {/* Results Count Banner */}
        <div className="pt-3 mt-1 border-t border-[#2A2A2A] flex items-center justify-between text-sm">
          <span className="text-gray-400 font-mono">
            Showing <span className="text-[#D4AF37] font-bold">{sortedClients.length}</span> of {clients.length} clients
          </span>
          {sortedClients.length === 0 && clients.length > 0 && (
            <button onClick={resetFilters} className="text-amber-400 hover:text-amber-400 transition-colors flex items-center gap-1 cursor-pointer">
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Main Table Content */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading client database...</p>
          </div>
        ) : sortedClients.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <Building2 className="w-10 h-10 text-gray-500 mx-auto mb-2" />
            <p className="text-base text-gray-400">No clients found matching your filters.</p>
            <button 
              onClick={resetFilters}
              className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-semibold text-gray-200 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <Filter className="w-4 h-4" /> Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                <tr>
                  {renderSortableHeader({ label: "Company / Contact", sortKey: CLIENT_FIELDS.COMPANY_NAME, className: "pl-6" })}
                  {renderSortableHeader({ label: "Contact Info", sortKey: "email" })}
                  {renderSortableHeader({ label: "City", sortKey: "city" })}
                  {renderSortableHeader({ label: "Date & Propsl", sortKey: CLIENT_FIELDS.CREATED_AT })}
                  {renderSortableHeader({ label: "Sales Person", sortKey: "salesPersonName" })}
                  {renderSortableHeader({ label: "Category", sortKey: "pricingCategory" })}
                  {renderSortableHeader({ label: "Status", sortKey: CLIENT_FIELDS.STATUS })}
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {sortedClients.map((client) => (
                  <tr key={client.id} className="hover:bg-[#2A2A2A] transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-[13px]">
                          {client.companyName}
                        </span>
                        <span className="text-sm text-gray-400 mt-0.5">
                          {client.contactPerson}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-gray-200 text-[12px]">{client.email || '-'}</span>
                        <span className="text-sm text-gray-500 mt-0.5">{client.phone || '-'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-200">
                      {client.city}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-gray-400">Propsl: <span className="text-gray-200">{client.proposalNumber || '-'}</span></span>
                        <span className="text-xs text-gray-500">Date: {new Date(client.createdAt).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-gray-200 text-[12px] font-medium">
                        {client.salesPersonEmail || client.originalSalesEmail || 'Unassigned'}
                      </span>
                    </td>
                    <td className="p-4">
                      {getCategoryBadge(client.pricingCategory || 'Nil')}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(client.status)}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setViewingClient(client)}
                          className="p-1.5 text-gray-400 hover:text-white bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingClient(client)}
                          className="p-1.5 text-gray-400 hover:text-white bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg transition-colors cursor-pointer"
                          title="Edit Client"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(client.id || (client.gstin ? client.gstin.toLowerCase().replace(/[^a-z0-9]/g, '') : (client.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '_')), 'clients', client.companyName)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Delete Client"
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

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-amber-400" />
                Bulk Change Category
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">From Category</label>
                <select
                  value={catFrom}
                  onChange={(e) => setCatFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  {pricingCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To Category</label>
                <select
                  value={catTo}
                  onChange={(e) => setCatTo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  {pricingCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400/70">
                <strong className="text-amber-400">{countCatMatches}</strong> clients will be updated. Confirm?
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#2A2A2A] mt-6">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeCategory}
                disabled={bulkLoading || countCatMatches === 0 || catFrom === catTo}
                className="px-5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
              >
                {bulkLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Person Modal */}
      {showSalesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Bulk Change Sales Person
              </h3>
              <button
                onClick={() => setShowSalesModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">From Sales Person</label>
                <select
                  value={salesFrom}
                  onChange={(e) => setSalesFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select Sales Person...</option>
                  {salesPersons.map(sp => <option key={sp.id} value={sp.email}>{sp.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To Sales Person</label>
                <select
                  value={salesTo}
                  onChange={(e) => setSalesTo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select Sales Person...</option>
                  {salesPersons.map(sp => <option key={sp.id} value={sp.email}>{sp.name}</option>)}
                </select>
              </div>
              
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400/70">
                <strong className="text-amber-400">{countSalesMatches}</strong> clients will be updated. Confirm?
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#2A2A2A] mt-6">
              <button
                onClick={() => setShowSalesModal(false)}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeSalesPerson}
                disabled={bulkLoading || countSalesMatches === 0 || !salesFrom || !salesTo || salesFrom === salesTo}
                className="px-5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
              >
                {bulkLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* View Client Modal */}
      {viewingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-5">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="w-6 h-6 text-[#D4AF37]" />
                Client Details
              </h3>
              <button
                onClick={() => setViewingClient(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Company Name</p>
                <p className="text-base text-gray-200 font-medium">{viewingClient.companyName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Contact Person</p>
                <p className="text-base text-gray-200">{viewingClient.contactPerson}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Email</p>
                <p className="text-base text-gray-200">{viewingClient.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Phone</p>
                <p className="text-base text-gray-200">{viewingClient.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">City</p>
                <p className="text-base text-gray-200">{viewingClient.city}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">GSTIN</p>
                <p className="text-base text-gray-200">{viewingClient.gstin || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pricing Category</p>
                <p className="text-base text-gray-200">{viewingClient.pricingCategory || 'Nil'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sales Person</p>
                <p className="text-base text-gray-200">
                  {salesPersons.find(sp => sp.email === viewingClient.submittedBy)?.name || viewingClient.submittedBy || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Proposal Number</p>
                <p className="text-base text-gray-200">{viewingClient.proposalNumber || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</p>
                <div className="mt-1">{getStatusBadge(viewingClient.status)}</div>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Created At</p>
                <p className="text-base text-gray-400">{new Date(viewingClient.createdAt).toLocaleString()}</p>
              </div>
            </div>
            
            <div className="pt-6 mt-6 border-t border-[#2A2A2A] flex justify-end">
              <button
                onClick={() => setViewingClient(null)}
                className="px-5 py-2.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-3xl bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-5">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[#D4AF37]" />
                Edit Client
              </h3>
              <button
                onClick={() => setEditingClient(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Company Name *</label>
                <input
                  type="text"
                  value={editingClient.companyName}
                  onChange={(e) => setEditingClient({...editingClient, companyName: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Contact Person *</label>
                <input
                  type="text"
                  value={editingClient.contactPerson}
                  onChange={(e) => setEditingClient({...editingClient, contactPerson: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Email</label>
                <input
                  type="email"
                  value={editingClient.email || ''}
                  onChange={(e) => setEditingClient({...editingClient, email: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Phone</label>
                <input
                  type="text"
                  value={editingClient.phone || ''}
                  onChange={(e) => setEditingClient({...editingClient, phone: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">City *</label>
                <input
                  type="text"
                  value={editingClient.city}
                  onChange={(e) => setEditingClient({...editingClient, city: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">GSTIN</label>
                <input
                  type="text"
                  value={editingClient.gstin || ''}
                  onChange={(e) => setEditingClient({...editingClient, gstin: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Pricing Category</label>
                <select
                  value={editingClient.pricingCategory || 'Nil'}
                  onChange={(e) => setEditingClient({...editingClient, pricingCategory: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  <option value="Nil">Nil (Unassigned)</option>
                  {pricingCategories.filter(c => c !== 'Nil').map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Sales Person *</label>
                <select
                  value={editingClient.salesPersonEmail || editingClient.submittedBy || ''}
                  onChange={(e) => setEditingClient({...editingClient, salesPersonEmail: e.target.value, submittedBy: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  <option value="">Select Sales Person...</option>
                  {salesPersons.map(sp => (
                    <option key={sp.id} value={sp.email}>{sp.name} ({sp.email})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Proposal Number</label>
                <input
                  type="text"
                  value={editingClient.proposalNumber || ''}
                  onChange={(e) => setEditingClient({...editingClient, proposalNumber: e.target.value})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Status</label>
                <select
                  value={editingClient.status}
                  onChange={(e) => setEditingClient({...editingClient, status: e.target.value as any})}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white focus:outline-none transition-all cursor-pointer"
                >
                  <option value="approved">Approved</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t border-[#2A2A2A] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const idToDelete = editingClient.id;
                  const name = editingClient.companyName;
                  setEditingClient(null);
                  if (idToDelete) handleDelete(idToDelete, 'clients', name);
                }}
                className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-400 text-rose-400 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                title="Permanently Delete Client"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Record
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditingClient(null)}
                  className="px-5 py-2.5 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveClient}
                  disabled={isSaving || !editingClient.companyName || !editingClient.contactPerson || !editingClient.city || !editingClient.submittedBy}
                  className="px-6 py-2.5 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
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
        title="Delete Client"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete client "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this client record? This action cannot be undone.'
        }
        confirmText="Delete Client"
        variant="danger"
        isLoading={deleting}
      />

      {/* Custom Wipe All Module Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipeClientData}
        title="Wipe All Client Records"
        message="This will permanently delete ALL client records in this module from Firestore. This action cannot be undone."
        confirmText="Wipe All Records"
        variant="danger"
        requireConfirmationText="WIPE"
        inputPlaceholder='Type "WIPE" to confirm'
        isLoading={loading}
      />
    </div>
  );
}
