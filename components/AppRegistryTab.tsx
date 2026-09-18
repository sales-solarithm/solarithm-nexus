

'use client';
import { COLLECTIONS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Blocks,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
  Pencil,
  Trash2,
  RefreshCw,
  AppWindow,
  UserPlus,
  Settings,
  Users,
  Building2,
  Filter,
  User,
  Shield,
  Check,
  Upload
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  AppDocument,
  UserDocument,
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
  writeBatch,
  arrayUnion, 
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';

interface AppRegistryTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

export default function AppRegistryTab({ currentEmail, currentRole }: AppRegistryTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageRegistry = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const [apps, setApps] = useState<AppDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<AppDocument | null>(null);
  
  // Form State
  const [appName, setAppName] = useState('');
  const [appId, setAppId] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: COLLECTIONS.APPS
  });
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  // Access Management Modal State
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [selectedAccessApp, setSelectedAccessApp] = useState<AppDocument | null>(null);
  const [accessDepartmentFilter, setAccessDepartmentFilter] = useState('All');
  const [accessEmployees, setAccessEmployees] = useState<UserDocument[]>([]);
  const [loadingAccessEmployees, setLoadingAccessEmployees] = useState(false);
  const [tempAllowedEmployees, setTempAllowedEmployees] = useState<string[]>([]);
  const [isSavingAccess, setIsSavingAccess] = useState(false);

  // Assignment Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [appToAssign, setAppToAssign] = useState<AppDocument | null>(null);
  const [users, setUsers] = useState<UserDocument[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);

  useEffect(() => {
    if (!canManageRegistry) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const q = query(collection(db, COLLECTIONS.APPS));
    const unsubscribe = onSnapshot(
      q,
      async (snap) => {
        const list: AppDocument[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            appName: data.appName || data.name || 'Unknown App',
            appId: data.appId || data.id || docSnap.id,
            url: data.appUrl || data.url || '#',
            description: data.description || 'No description provided',
            status: data.status || 'active',
            allowedRoles: Array.isArray(data.allowedRoles) ? data.allowedRoles : [],
            allowedEmployees: Array.isArray(data.allowedEmployees) ? data.allowedEmployees : [],
            createdAt: data.createdAt || new Date().toISOString(),
          });
        });

        setApps(list);
        if (typeof window !== 'undefined') {
          localStorage.setItem('registered_apps', JSON.stringify(list));
          localStorage.setItem('apps', JSON.stringify(list));
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading apps:', err);
        handleFirestoreError(err, OperationType.LIST, COLLECTIONS.APPS);
        setErrorMsg('Failed to load registered applications.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [canManageRegistry]);

  const fetchApps = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.APPS)));
      const list: AppDocument[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          appName: data.appName || data.name || 'Unknown App',
          appId: data.appId || data.id || docSnap.id,
          url: data.appUrl || data.url || '#',
          description: data.description || 'No description provided',
          status: data.status || 'active',
          allowedRoles: Array.isArray(data.allowedRoles) ? data.allowedRoles : [],
          allowedEmployees: Array.isArray(data.allowedEmployees) ? data.allowedEmployees : [],
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });
      setApps(list);
      if (typeof window !== 'undefined') {
        localStorage.setItem('registered_apps', JSON.stringify(list));
        localStorage.setItem('apps', JSON.stringify(list));
      }
    } catch (err) {
      console.error('Error refreshing apps:', err);
      handleFirestoreError(err, OperationType.LIST, COLLECTIONS.APPS);
      setErrorMsg('Failed to refresh registered applications.');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingApp(null);
    setAppName('');
    setAppId('');
    setUrl('');
    setDescription('');
    setStatus('active');
    setIsModalOpen(true);
  };

  const openEditModal = (app: AppDocument) => {
    setEditingApp(app);
    setAppName(app.appName);
    setAppId(app.appId);
    setUrl(app.url);
    setDescription(app.description);
    setStatus(app.status);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingApp(null);
  };

  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim() || !url.trim()) {
      setErrorMsg('App Name and URL are required.');
      return;
    }

    setIsSaving(true);
    try {
      const docData = {
        appName: appName.trim(),
        appId: appName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        url: url.trim(),
        description: description.trim(),
        status,
        createdAt: editingApp ? editingApp.createdAt : new Date().toISOString()
      };

      if (editingApp && editingApp.id) {
        // Update existing
        await setDoc(doc(db, COLLECTIONS.APPS, editingApp.id), docData, { merge: true });
        setSuccessMsg(`App "${docData.appName}" updated successfully.`);
      } else {
        // Create new with deterministic appId upsert
        const uniqueKey = docData.appId;
        await setDoc(doc(db, COLLECTIONS.APPS, uniqueKey), docData, { merge: true });
        setSuccessMsg(`App "${docData.appName}" registered successfully.`);
      }

      closeModal();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error saving app:', err);
      setErrorMsg('Failed to save application.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id?: string, collectionName: string = COLLECTIONS.APPS, label?: string) => {
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

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, collectionName, id));
      setSuccessMsg('Application permanently deleted.');
      setApps(prev => {
        const updated = prev.filter(a => a.id !== id && a.appId !== id);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('registered_apps', JSON.stringify(updated));
            localStorage.setItem('apps', JSON.stringify(updated));
          }
        } catch (e) {
          console.warn('Could not update localStorage apps cache', e);
        }
        return updated;
      });
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error deleting app:', err);
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
      setErrorMsg("Failed to delete record. Check your Firebase Security Rules.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteRecord = (firstArg?: string, secondArg?: string) => {
    if (secondArg) {
      return handleDelete(secondArg, firstArg);
    }
    return handleDelete(firstArg);
  };

  const handleWipeAppData = () => {
    setIsWipeModalOpen(true);
  };

  const executeWipeAppData = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.APPS));
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, COLLECTIONS.APPS, docSnap.id));
      }
      setApps([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('registered_apps');
        localStorage.removeItem('apps');
      }
      setSuccessMsg('All registered application records have been permanently wiped from Firebase.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error wiping apps:', err);
      handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.APPS);
      setErrorMsg('Failed to wipe application records. Check your Firebase Security Rules.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportApps = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
              appName: rowObj.appname || rowObj['app name'] || rowObj.name || '',
              appId: rowObj.appid || rowObj['app id'] || '',
              url: rowObj.url || rowObj.link || '',
              description: rowObj.description || '',
              status: rowObj.status || 'active'
            });
          }
        }

        if (importedList.length === 0) {
          setErrorMsg('No valid application records found in file.');
          return;
        }

        setIsSaving(true);
        let count = 0;
        const updatedApps = [...apps];

        for (const item of importedList) {
          const name = (item.appName || item.name || '').trim();
          if (!name) continue;

          const appId = (item.appId || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
          const docData = {
            appName: name,
            appId: appId,
            url: item.url || '',
            description: item.description || '',
            status: item.status || 'active',
            allowedEmployees: item.allowedEmployees || [],
            createdAt: item.createdAt || new Date().toISOString()
          };

          // Strict upsert with setDoc and merge: true
          await setDoc(doc(db, COLLECTIONS.APPS, appId), docData, { merge: true });

          const existingIndex = updatedApps.findIndex(a => 
            a.id === appId || a.appId === appId || a.appName.toLowerCase() === name.toLowerCase()
          );

          if (existingIndex >= 0) {
            updatedApps[existingIndex] = { ...updatedApps[existingIndex], ...docData, id: appId };
          } else {
            updatedApps.push({ ...docData, id: appId });
          }
          count++;
        }

        setApps(updatedApps);
        if (typeof window !== 'undefined') {
          localStorage.setItem('registered_apps', JSON.stringify(updatedApps));
          localStorage.setItem('apps', JSON.stringify(updatedApps));
        }

        setSuccessMsg(`Successfully imported and deduplicated ${count} application(s).`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err) {
        console.error('Error importing apps:', err);
        setErrorMsg('Failed to parse and import applications file.');
      } finally {
        setIsSaving(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };
  const openAssignModal = async (app: AppDocument) => {
    setAppToAssign(app);
    setDepartmentFilter('All');
    setIsAssignModalOpen(true);
    setLoadingUsers(true);
    setErrorMsg(null);
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.USERS)));
      const userList: UserDocument[] = [];
      const selected = new Set<string>();
      snap.forEach(docSnap => {
        const u = { ...(docSnap.data() as UserDocument), id: docSnap.id };
        userList.push(u);
        if (u.accessibleApps && u.accessibleApps.includes(app.appId)) {
          selected.add(u.id as string);
        }
      });
      setUsers(userList);
      setSelectedUserIds(selected);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load users for assignment.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const closeAssignModal = () => {
    setIsAssignModalOpen(false);
    setAppToAssign(null);
    setUsers([]);
    setSelectedUserIds(new Set());
  };

  const openAccessModal = async (app: AppDocument) => {
    setSelectedAccessApp(app);
    setAccessDepartmentFilter('All');
    setIsAccessModalOpen(true);
    setLoadingAccessEmployees(true);

    // 1. Read app's allowedEmployees array, checking localStorage cache first
    let initialAllowed: string[] = Array.isArray(app.allowedEmployees) ? [...app.allowedEmployees] : [];
    if (typeof window !== 'undefined') {
      try {
        const specific = localStorage.getItem(`app_${app.appId}`) || localStorage.getItem(`app_access_${app.appId}`);
        if (specific) {
          const parsed = JSON.parse(specific);
          if (Array.isArray(parsed)) {
            initialAllowed = parsed;
          } else if (parsed && Array.isArray(parsed.allowedEmployees)) {
            initialAllowed = parsed.allowedEmployees;
          }
        } else {
          const storedApps = localStorage.getItem('registered_apps') || localStorage.getItem('apps');
          if (storedApps) {
            const parsedApps = JSON.parse(storedApps);
            if (Array.isArray(parsedApps)) {
              const matched = parsedApps.find((a: any) => a.appId === app.appId || a.id === app.id);
              if (matched && Array.isArray(matched.allowedEmployees)) {
                initialAllowed = matched.allowedEmployees;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error reading app from localStorage', e);
      }
    }
    setTempAllowedEmployees(initialAllowed);

    // 2. Instantly populate employees from localStorage if available
    let loadedFromLocal = false;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('employees') || localStorage.getItem('users');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAccessEmployees(parsed);
            loadedFromLocal = true;
          }
        }
      } catch (e) {
        console.warn('Could not parse localStorage employees', e);
      }
    }

    // 3. Fetch fresh directory from Firestore
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.USERS)));
      const list: UserDocument[] = [];
      snap.forEach(docSnap => {
        list.push({ ...(docSnap.data() as UserDocument), id: docSnap.id });
      });
      list.sort((a, b) => {
        if (a.employeeId && b.employeeId) return a.employeeId.localeCompare(b.employeeId);
        return (a.name || '').localeCompare(b.name || '');
      });
      if (list.length > 0) {
        setAccessEmployees(list);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('employees', JSON.stringify(list));
          } catch (e) {
            console.warn('Could not save employees to localStorage', e);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching employees for access modal:', err);
      if (!loadedFromLocal) {
        setErrorMsg('Failed to load employee list from directory.');
      }
    } finally {
      setLoadingAccessEmployees(false);
    }
  };

  const getEmployeeIdentifier = (emp: UserDocument): string => {
    return emp.employeeId || emp.id || emp.email;
  };

  const isEmployeeAllowed = (emp: UserDocument): boolean => {
    const id = getEmployeeIdentifier(emp);
    return tempAllowedEmployees.includes(id);
  };

  const toggleEmployeeAccess = (emp: UserDocument) => {
    const id = getEmployeeIdentifier(emp);
    setTempAllowedEmployees(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSaveAppAccess = async () => {
    if (!selectedAccessApp) return;
    setIsSavingAccess(true);

    const targetAppId = selectedAccessApp.appId || selectedAccessApp.id || '';

    const updatedApp: AppDocument = {
      ...selectedAccessApp,
      allowedEmployees: tempAllowedEmployees,
    };

    // Update specific application's record in localStorage
    if (typeof window !== 'undefined') {
      try {
        // A. Specific record key
        localStorage.setItem(`app_${targetAppId}`, JSON.stringify(updatedApp));
        localStorage.setItem(`app_access_${targetAppId}`, JSON.stringify(tempAllowedEmployees));

        // B. Update in registered_apps array
        const storedRegistered = localStorage.getItem('registered_apps');
        let registeredList: AppDocument[] = storedRegistered ? JSON.parse(storedRegistered) : [...apps];
        let foundInRegistered = false;
        registeredList = registeredList.map(a => {
          if (a.appId === targetAppId || a.id === selectedAccessApp.id) {
            foundInRegistered = true;
            return { ...a, allowedEmployees: tempAllowedEmployees };
          }
          return a;
        });
        if (!foundInRegistered) {
          registeredList.push(updatedApp);
        }
        localStorage.setItem('registered_apps', JSON.stringify(registeredList));

        // C. Also sync to 'apps' key for global consistency
        localStorage.setItem('apps', JSON.stringify(registeredList));
      } catch (err) {
        console.warn('Error saving application to localStorage:', err);
      }
    }

    // Update local React state so main table immediately reflects changes
    setApps(prevApps =>
      prevApps.map(a =>
        (a.appId === targetAppId || a.id === selectedAccessApp.id)
          ? { ...a, allowedEmployees: tempAllowedEmployees }
          : a
      )
    );

    // Also persist to Firestore if available
    if (selectedAccessApp.id) {
      try {
        const appRef = doc(db, COLLECTIONS.APPS, selectedAccessApp.id);
        await setDoc(appRef, { allowedEmployees: tempAllowedEmployees }, { merge: true });
      } catch (err) {
        console.warn('Could not sync app access to Firestore:', err);
      }
    }

    setIsSavingAccess(false);
    setSuccessMsg(`Access permissions saved for ${selectedAccessApp.appName}.`);
    closeAccessModal();
  };

  const closeAccessModal = () => {
    setIsAccessModalOpen(false);
    setSelectedAccessApp(null);
    setAccessDepartmentFilter('All');
    setTempAllowedEmployees([]);
    setIsSavingAccess(false);
  };

  // Extract unique department names from state and localStorage
  const uniqueAccessDepartments = useMemo(() => {
    const deptSet = new Set<string>();

    // 1. From component state
    accessEmployees.forEach(emp => {
      if (emp.department && typeof emp.department === 'string' && emp.department.trim()) {
        deptSet.add(emp.department.trim());
      }
    });

    // 2. From localStorage in case more are stored
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('employees') || localStorage.getItem('users');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((emp: any) => {
              if (emp?.department && typeof emp.department === 'string' && emp.department.trim()) {
                deptSet.add(emp.department.trim());
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error reading departments from localStorage', e);
      }
    }

    return Array.from(deptSet).sort();
  }, [accessEmployees]);

  // Dynamically filter employee list based on selected department
  const filteredAccessEmployees = accessDepartmentFilter === 'All'
    ? accessEmployees
    : accessEmployees.filter(emp => (emp.department || '').trim().toLowerCase() === accessDepartmentFilter.trim().toLowerCase());

  const toggleUserSelection = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setSelectedUserIds(next);
  };

  const filteredUsers = users.filter(u => departmentFilter === 'All' || u.department === departmentFilter);
  const isAllSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.has(u.id as string));

  const toggleSelectAll = () => {
    const next = new Set(selectedUserIds);
    if (isAllSelected) {
      filteredUsers.forEach(u => next.delete(u.id as string));
    } else {
      filteredUsers.forEach(u => next.add(u.id as string));
    }
    setSelectedUserIds(next);
  };

  const handleSaveAssignments = async () => {
    if (!appToAssign) return;
    setIsSavingAssignments(true);
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;
      users.forEach(u => {
        const hasAccessNow = selectedUserIds.has(u.id as string);
        const hadAccessBefore = u.accessibleApps && u.accessibleApps.includes(appToAssign.appId);
        if (hasAccessNow !== !!hadAccessBefore) {
          const userRef = doc(db, COLLECTIONS.USERS, u.id as string);
          if (hasAccessNow) {
            batch.update(userRef, { accessibleApps: arrayUnion(appToAssign.appId) });
          } else {
            batch.update(userRef, { accessibleApps: arrayRemove(appToAssign.appId) });
          }
          updatedCount++;
        }
      });
      if (updatedCount > 0) {
        await batch.commit();
      }
      setSuccessMsg(`Access updated for ${updatedCount} employees.`);
      closeAssignModal();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save assignments.');
    } finally {
      setIsSavingAssignments(false);
    }
  };


  const filteredApps = apps.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      (a.appName || '').toLowerCase().includes(q) ||
      (a.appId || '').toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q)
    );
  });

  if (!canManageRegistry) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">App Registry</span> is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
          </p>
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
            <AppWindow className="w-4 h-4 text-[#D4AF37]" /> Dynamic App Launcher
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            App <span className="text-[#D4AF37]">Registry</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Register and manage applications available across the platform ecosystem.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <input
            type="file"
            id="app-registry-import-input"
            className="hidden"
            accept=".csv,.json"
            onChange={handleImportApps}
          />

          <button
            onClick={fetchApps}
            disabled={loading}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#D4AF37]' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleWipeAppData}
            disabled={isDeleting}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Type WIPE to delete all application records"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Wipe App Registry Test Data
          </button>

          <button
            onClick={() => document.getElementById('app-registry-import-input')?.click()}
            disabled={isSaving}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV / JSON
          </button>

          <button
            onClick={openAddModal}
            className="px-3.5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-[#D4AF37]/20"
          >
            <Plus className="w-4 h-4" />
            Add Application
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

      {/* Search Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps by name, ID, or description..."
            className="w-full pl-10 pr-4 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Main Table Content */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading application registry...</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-2">
            <Blocks className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <p>No applications found in the registry.</p>
            <p className="text-xs">Click &quot;Add Application&quot; to register a new tool.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-base">
              <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                <tr>
                  <th className="p-4 pl-6 w-1/4">Application</th>
                  
                  <th className="p-4 w-1/3">Description</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {filteredApps.map((app) => (
                  <tr key={app.id || app.appId} className="hover:bg-[#2A2A2A] transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-white flex items-center gap-2">
                          <AppWindow className="w-4 h-4 text-[#D4AF37]" />
                          {app.appName}
                        </span>
                        <a 
                          href={app.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-blue-400 hover:text-blue-400 mt-1 flex items-center gap-1 w-max"
                        >
                          {app.url}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </td>
                    
                    <td className="p-4 text-gray-400 leading-relaxed max-w-xs truncate" title={app.description}>
                      {app.description || <span className="italic opacity-50">No description</span>}
                    </td>
                    <td className="p-4">
                      {app.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/10" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 font-semibold text-xs uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-500" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openAccessModal(app)}
                          className="p-1.5 text-gray-400 hover:text-[#D4AF37] bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] hover:border-[#D4AF37]/40 rounded-lg transition-colors cursor-pointer"
                          title="Manage App Access"
                          id={`manage-access-btn-${app.id || app.appId}`}
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openAssignModal(app)}
                          className="p-1.5 text-blue-400 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/10 border border-blue-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Assign Access"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(app)}
                          className="p-1.5 text-gray-400 hover:text-white bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg transition-colors cursor-pointer"
                          title="Edit App"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(app.id || app.appId, 'apps', app.appName)}
                          disabled={isDeleting}
                          className="p-1.5 text-rose-400 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/10 border border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Delete App"
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

      {/* Add / Edit App Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-5">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Blocks className="w-5 h-5 text-[#D4AF37]" />
                {editingApp ? 'Edit Application' : 'Register New Application'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveApp} className="space-y-4">
              <div className="w-full grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                    App Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="e.g. Sales Tool"
                    className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-colors"
                  />
                </div>
                
                
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                  URL / Route <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="e.g. /sales-tool or https://sales.solarithm.com"
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm font-mono text-gray-200 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of the application's purpose..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-gray-200 focus:outline-none transition-colors resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                  Status
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="radio" 
                      name="status" 
                      value="active"
                      checked={status === 'active'}
                      onChange={() => setStatus('active')}
                      className="hidden"
                    />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-gray-500 group-hover:border-gray-400'}`}>
                      {status === 'active' && <div className="w-2 h-2 rounded-full bg-emerald-500/10" />}
                    </div>
                    <span className={`text-sm ${status === 'active' ? 'text-white' : 'text-gray-400'}`}>Active</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="radio" 
                      name="status" 
                      value="inactive"
                      checked={status === 'inactive'}
                      onChange={() => setStatus('inactive')}
                      className="hidden"
                    />
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${status === 'inactive' ? 'border-gray-400 bg-gray-500/20' : 'border-gray-500 group-hover:border-gray-400'}`}>
                      {status === 'inactive' && <div className="w-2 h-2 rounded-full bg-gray-400" />}
                    </div>
                    <span className={`text-sm ${status === 'inactive' ? 'text-white' : 'text-gray-400'}`}>Inactive</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between gap-3 border-t border-[#2A2A2A] mt-6">
                {editingApp ? (
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      const idToDelete = editingApp.id;
                      const label = editingApp.appName;
                      closeModal();
                      if (idToDelete) handleDelete(idToDelete, 'apps', label);
                    }}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-400 text-rose-400 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
                    title="Permanently Delete App"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete App
                  </button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all"
                  >
                    {isSaving ? 'Saving...' : editingApp ? 'Save Changes' : 'Register App'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    {isAssignModalOpen && appToAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] mb-4 shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#D4AF37]" />
                Assign Access for: {appToAssign.appName}
              </h3>
              <button
                onClick={closeAssignModal}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
                  Department Filter
                </label>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="All">All Departments</option>
                  {Array.from(new Set(users.map(u => u.department).filter(Boolean))).sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-500/30 text-[#D4AF37] focus:ring-[#D4AF37] bg-[#2A2A2A]"
                />
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">Select All Visible</span>
              </label>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[300px] border border-[#2A2A2A] rounded-xl bg-[#2A2A2A] mb-4 relative">
              {loadingUsers ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-[#D4AF37] animate-spin" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                  No employees found for this department.
                </div>
              ) : (
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3 pl-4 w-12"></th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-[#2A2A2A] transition-colors cursor-pointer" onClick={() => toggleUserSelection(u.id as string)}>
                        <td className="p-3 pl-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id as string)}
                            onChange={() => toggleUserSelection(u.id as string)}
                            className="w-4 h-4 rounded border-gray-500/30 text-[#D4AF37] focus:ring-[#D4AF37] bg-[#2A2A2A] cursor-pointer"
                          />
                        </td>
                        <td className="p-3 font-semibold text-white">{u.name}</td>
                        <td className="p-3 text-gray-400">{u.email}</td>
                        <td className="p-3 text-gray-400">{u.department || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#2A2A2A] shrink-0">
              <button
                type="button"
                onClick={closeAssignModal}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm font-semibold text-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={isSavingAssignments}
                className="px-5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all"
              >
                {isSavingAssignments ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage App Access Modal */}
      {isAccessModalOpen && selectedAccessApp && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
          id="manage-app-access-modal"
        >
          <div className="w-full max-w-2xl bg-[#1E1E1E] border border-[#333333] rounded-xl p-5 md:p-6 shadow-2xl relative flex flex-col max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#2A2A2A] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2A2A2A] border border-[#333333] flex items-center justify-center text-[#D4AF37] shadow-sm shrink-0">
                  <Settings className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
                    Manage App Access
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Target Application: <span className="text-[#D4AF37] font-semibold">{selectedAccessApp.appName}</span>{' '}
                    <span className="text-gray-500 font-mono text-[11px]">({selectedAccessApp.appId})</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeAccessModal}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#2A2A2A] cursor-pointer transition-colors"
                id="close-access-modal-x-btn"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target App Quick Summary Bar */}
            <div className="mt-4 p-3 bg-[#262626]/80 border border-[#333333] rounded-xl text-xs text-gray-300 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">{selectedAccessApp.appName}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                  selectedAccessApp.status === 'active' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                }`}>
                  {selectedAccessApp.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Department Filter Section */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#242424] p-3 rounded-xl border border-[#333333] shrink-0">
              <div className="flex items-center gap-2.5 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 uppercase tracking-wider shrink-0">
                  <Building2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>Department:</span>
                </div>
                <select
                  id="modal-department-filter"
                  value={accessDepartmentFilter}
                  onChange={(e) => setAccessDepartmentFilter(e.target.value)}
                  className="w-full sm:w-auto min-w-[200px] px-3 py-1.5 bg-[#1E1E1E] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-lg text-xs text-white focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="All">All Departments ({accessEmployees.length})</option>
                  {uniqueAccessDepartments.map((dept) => {
                    const count = accessEmployees.filter(
                      (e) => (e.department || '').trim().toLowerCase() === dept.toLowerCase()
                    ).length;
                    return (
                      <option key={dept} value={dept}>
                        {dept} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex items-center gap-1 text-xs text-gray-400 font-medium shrink-0">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  Showing <strong className="text-white font-semibold">{filteredAccessEmployees.length}</strong> of {accessEmployees.length}
                </span>
              </div>
            </div>

            {/* Clean Employee List Rendering with Access Checkboxes */}
            <div className="mt-4 flex-1 overflow-y-auto min-h-[260px] max-h-[380px] border border-[#2E2E2E] rounded-xl bg-[#161616] divide-y divide-[#262626] relative">
              {loadingAccessEmployees && accessEmployees.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-gray-400 gap-2">
                  <RefreshCw className="w-7 h-7 text-[#D4AF37] animate-spin" />
                  <p className="text-sm font-medium text-gray-300">Loading directory employees...</p>
                  <p className="text-xs text-gray-400">Fetching global employee directory</p>
                </div>
              ) : filteredAccessEmployees.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-gray-400">
                  <Users className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm font-semibold text-gray-300">No employees found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {accessDepartmentFilter === 'All'
                      ? 'No employees exist in the global directory.'
                      : `No employees assigned to "${accessDepartmentFilter}".`}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#262626]">
                  {filteredAccessEmployees.map((emp) => {
                    const isAllowed = isEmployeeAllowed(emp);
                    const empIdentifier = getEmployeeIdentifier(emp);

                    const initials = (emp.name || 'U')
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <div
                        key={emp.id || emp.email}
                        onClick={() => toggleEmployeeAccess(emp)}
                        className={`p-3 sm:p-3.5 hover:bg-[#202020] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                          isAllowed ? 'bg-[#D4AF37]/5' : ''
                        }`}
                        id={`access-emp-row-${empIdentifier}`}
                      >
                        {/* Employee Identity & Checkbox */}
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            id={`access-emp-checkbox-${empIdentifier}`}
                            checked={isAllowed}
                            onChange={() => toggleEmployeeAccess(emp)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-600 text-[#D4AF37] focus:ring-[#D4AF37] bg-[#2A2A2A] cursor-pointer shrink-0"
                            aria-label={`Toggle access for ${emp.name}`}
                          />
                          <div className="w-9 h-9 rounded-full bg-[#2A2A2A] border border-[#3A3A3A] flex items-center justify-center font-bold text-xs text-[#D4AF37] shrink-0 shadow-inner">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-white truncate">
                                {emp.name}
                              </span>
                              {emp.employeeId && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#262626] text-gray-400 border border-[#333333]">
                                  {emp.employeeId}
                                </span>
                              )}
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {emp.role}
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 truncate mt-0.5">
                              {emp.email}
                            </div>
                          </div>
                        </div>

                        {/* Department & Access Status */}
                        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                          <div className="text-right hidden sm:block">
                            <span className="inline-block text-xs text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-2 py-0.5 rounded-md font-medium">
                              {emp.department || 'Unassigned'}
                            </span>
                            {emp.designation && (
                              <div className="text-[11px] text-gray-400 truncate max-w-[150px] mt-0.5">
                                {emp.designation}
                              </div>
                            )}
                          </div>

                          <div className="sm:hidden">
                            <span className="text-xs text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 px-2 py-0.5 rounded-md font-medium">
                              {emp.department || 'Unassigned'}
                            </span>
                          </div>

                          {/* Access Authorization Badge */}
                          {isAllowed ? (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              title="Employee is authorized for this application"
                            >
                              <Check className="w-3 h-3" />
                              Authorized
                            </span>
                          ) : (
                            <span 
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-400 border border-gray-500/20"
                              title="No access granted for this application"
                            >
                              No Access
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="mt-4 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#2A2A2A] shrink-0">
              <div className="text-xs text-gray-400">
                <span>Authorized: </span>
                <strong className="text-[#D4AF37] font-semibold">{tempAllowedEmployees.length}</strong>
                <span> of {accessEmployees.length} employee{accessEmployees.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={closeAccessModal}
                  className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] text-gray-200 hover:text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                  id="close-access-modal-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAppAccess}
                  disabled={isSavingAccess}
                  className="px-5 py-2 bg-[#D4AF37] hover:bg-[#B3932F] text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/20 transition-all"
                  id="save-app-access-btn"
                >
                  {isSavingAccess ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
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
        title="Delete Registered App"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete application "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this application record? This action cannot be undone.'
        }
        confirmText="Delete App"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Custom Wipe All Module Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isWipeModalOpen}
        onClose={() => setIsWipeModalOpen(false)}
        onConfirm={executeWipeAppData}
        title="Wipe All App Records"
        message="This will permanently delete ALL registered application records in this module from Firestore. This action cannot be undone."
        confirmText="Wipe All Records"
        variant="danger"
        requireConfirmationText="WIPE"
        inputPlaceholder='Type "WIPE" to confirm'
        isLoading={isDeleting}
      />
    </div>
  );
}
