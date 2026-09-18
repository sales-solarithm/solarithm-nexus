'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, 
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
  Users, 
  Layers,
  Sparkles,
  ArrowRight,
  Shield,
  Briefcase,
  Hash
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  DepartmentDocument, 
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
  onSnapshot 
} from 'firebase/firestore';
import { COLLECTIONS } from '@/src/config/schema';
import { ConfirmModal } from './ConfirmModal';

const DEFAULT_STANDARD_DEPARTMENTS: Array<{
  name: string;
  code: string;
  description: string;
  headOfDepartment: string;
  availableRoles: string[];
}> = [
  {
    name: 'Sales & Business Development',
    code: 'SALES',
    description: 'Client acquisition, commercial proposals, and regional solar project partnerships.',
    headOfDepartment: 'Commercial Director',
    availableRoles: ['sales', 'manager', 'admin']
  },
  {
    name: 'Solar Engineering & Design',
    code: 'ENG',
    description: 'PV array layout, single-line diagrams, shading simulation, and PVSyst analysis.',
    headOfDepartment: 'Lead Solar PV Engineer',
    availableRoles: ['designer', 'manager', 'admin']
  },
  {
    name: 'Operations & Projects',
    code: 'OPS',
    description: 'Procurement, on-site commissioning, project timeline tracking, and client handover.',
    headOfDepartment: 'Head of Operations',
    availableRoles: ['manager', 'admin']
  },
  {
    name: 'Accounts & Finance',
    code: 'FIN',
    description: 'Vendor billing, payroll disbursement, tax filings, and financial reconciliations.',
    headOfDepartment: 'Finance Controller',
    availableRoles: ['admin', 'manager']
  },
  {
    name: 'Human Resources & Admin',
    code: 'HR',
    description: 'Talent management, employee directory, office operations, and policy compliance.',
    headOfDepartment: 'HR Operations Lead',
    availableRoles: ['admin', 'manager']
  },
  {
    name: 'Executive Management',
    code: 'EXEC',
    description: 'Strategic leadership, governance, enterprise vision, and company administration.',
    headOfDepartment: 'Managing Director',
    availableRoles: ['owner', 'admin']
  },
  {
    name: 'Field Installation & Quality',
    code: 'FIELD',
    description: 'Civil structure validation, electrical cabling safety, and CEIG approvals.',
    headOfDepartment: 'Site Quality Manager',
    availableRoles: ['designer', 'manager']
  }
];

// Helper to guarantee availableRoles is always present on a department
function getDepartmentRolesWithFallback(data: Partial<DepartmentDocument>): string[] {
  if (data.availableRoles && Array.isArray(data.availableRoles) && data.availableRoles.length > 0) {
    return data.availableRoles;
  }
  const matched = DEFAULT_STANDARD_DEPARTMENTS.find(
    d => d.name.toLowerCase() === (data.name || '').toLowerCase()
  );
  if (matched && matched.availableRoles && matched.availableRoles.length > 0) {
    return matched.availableRoles;
  }
  return ['sales', 'manager', 'admin'];
}

interface DepartmentsTabProps {
  currentEmail: string;
  currentRole: UserRole;
  onSelectDepartmentForEmployeeFilter?: (deptName: string) => void;
}

export default function DepartmentsTab({ currentEmail, currentRole }: DepartmentsTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManage = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  const [departments, setDepartments] = useState<DepartmentDocument[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('solarithm_departments');
        return cached ? JSON.parse(cached) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [employees, setEmployees] = useState<UserDocument[]>([]);
  const [loading, setLoading] = useState(canManage);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    code: string;
    description: string;
    headOfDepartment: string;
    availableRoles: string[];
  }>({
    name: '',
    code: '',
    description: '',
    headOfDepartment: '',
    availableRoles: ['sales', 'manager', 'admin']
  });
  const [newRoleInput, setNewRoleInput] = useState('');

  // Delete Confirm Modal
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    deptId: string;
    deptName: string;
    assignedEmployeeCount: number;
  }>({
    isOpen: false,
    deptId: '',
    deptName: '',
    assignedEmployeeCount: 0
  });

  // Fetch Departments and Employees on demand (refresh)
  const loadData = useCallback(async () => {
    if (!canManage) return;
    setErrorMsg(null);
    try {
      const [deptSnap, userSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.DEPARTMENTS)),
        getDocs(collection(db, COLLECTIONS.USERS))
      ]);

      const deptList: DepartmentDocument[] = [];
      deptSnap.forEach((docSnap) => {
        const raw = docSnap.data() as DepartmentDocument;
        deptList.push({
          ...raw,
          id: docSnap.id,
          availableRoles: getDepartmentRolesWithFallback(raw)
        });
      });

      // Sort alphabetically by name
      deptList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const empList: UserDocument[] = [];
      userSnap.forEach((docSnap) => {
        empList.push({
          ...(docSnap.data() as UserDocument),
          id: docSnap.id
        });
      });

      setDepartments(deptList);
      setEmployees(empList);

      try {
        localStorage.setItem('solarithm_departments', JSON.stringify(deptList));
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
      const errInfo = handleFirestoreError(err, OperationType.LIST, COLLECTIONS.DEPARTMENTS);
      setErrorMsg(`Failed to load departments: ${errInfo.error}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canManage]);

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    const initFetch = async () => {
      try {
        const [deptSnap, userSnap] = await Promise.all([
          getDocs(collection(db, COLLECTIONS.DEPARTMENTS)),
          getDocs(collection(db, COLLECTIONS.USERS))
        ]);

        if (!isMounted) return;

        const deptList: DepartmentDocument[] = [];
        deptSnap.forEach((docSnap) => {
          const raw = docSnap.data() as DepartmentDocument;
          deptList.push({
            ...raw,
            id: docSnap.id,
            availableRoles: getDepartmentRolesWithFallback(raw)
          });
        });
        deptList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        const empList: UserDocument[] = [];
        userSnap.forEach((docSnap) => {
          empList.push({
            ...(docSnap.data() as UserDocument),
            id: docSnap.id
          });
        });

        setDepartments(deptList);
        setEmployees(empList);
      } catch (err) {
        console.error('Error in initial departments fetch:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (canManage) {
      initFetch();
    }

    return () => {
      isMounted = false;
    };
  }, [canManage]);

  // Real-time listener for departments
  useEffect(() => {
    if (!canManage) return;
    const unsub = onSnapshot(collection(db, COLLECTIONS.DEPARTMENTS), (snap) => {
      const list: DepartmentDocument[] = [];
      snap.forEach((d) => {
        const raw = d.data() as DepartmentDocument;
        list.push({
          ...raw,
          id: d.id,
          availableRoles: getDepartmentRolesWithFallback(raw)
        });
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setDepartments(list);
      try {
        localStorage.setItem('solarithm_departments', JSON.stringify(list));
      } catch {
        // ignore
      }
    }, (err) => {
      console.warn('Real-time departments listener warning:', err);
    });

    return () => unsub();
  }, [canManage]);

  // Employee count mapping per department
  const employeeCountByDept = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((emp) => {
      const deptName = (emp.department || '').trim();
      if (deptName) {
        counts[deptName] = (counts[deptName] || 0) + 1;
      }
    });
    return counts;
  }, [employees]);

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    if (!searchQuery.trim()) return departments;
    const q = searchQuery.toLowerCase();
    return departments.filter((d) => 
      (d.name || '').toLowerCase().includes(q) ||
      (d.code || '').toLowerCase().includes(q) ||
      (d.description || '').toLowerCase().includes(q) ||
      (d.headOfDepartment || '').toLowerCase().includes(q) ||
      (d.availableRoles || []).some(r => r.toLowerCase().includes(q))
    );
  }, [departments, searchQuery]);

  // Handle Seed Standard Departments
  const handleSeedStandardDepartments = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      let created = 0;
      for (const item of DEFAULT_STANDARD_DEPARTMENTS) {
        const id = 'dept_' + item.code.toLowerCase();
        const ref = doc(db, COLLECTIONS.DEPARTMENTS, id);
        const payload: DepartmentDocument = {
          id,
          name: item.name,
          code: item.code,
          description: item.description,
          headOfDepartment: item.headOfDepartment,
          availableRoles: item.availableRoles,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(ref, payload, { merge: true });
        created++;
      }
      setSuccessMsg(`Successfully provisioned ${created} standard departments with mapped system roles.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await loadData();
    } catch (err) {
      console.error('Error seeding departments:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.DEPARTMENTS);
      setErrorMsg(`Failed to seed standard departments: ${errInfo.error}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingDeptId(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      headOfDepartment: '',
      availableRoles: ['sales', 'manager', 'admin']
    });
    setNewRoleInput('');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (dept: DepartmentDocument) => {
    setEditingDeptId(dept.id || null);
    const roles = getDepartmentRolesWithFallback(dept);
    setFormData({
      name: dept.name || '',
      code: dept.code || '',
      description: dept.description || '',
      headOfDepartment: dept.headOfDepartment || '',
      availableRoles: [...roles]
    });
    setNewRoleInput('');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Save Department (Add or Update)
  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    if (!cleanName) {
      setModalError('Department Name is required.');
      return;
    }

    if (!formData.availableRoles || formData.availableRoles.length === 0) {
      setModalError('Please define at least one available system role for this department.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const docId = editingDeptId || ('dept_' + (formData.code ? formData.code.toLowerCase().replace(/[^a-z0-9]/g, '_') : cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_')) + '_' + Date.now().toString().slice(-4));
      const ref = doc(db, COLLECTIONS.DEPARTMENTS, docId);

      const payload: DepartmentDocument = {
        name: cleanName,
        code: formData.code.trim().toUpperCase() || cleanName.substring(0, 4).toUpperCase(),
        description: formData.description.trim(),
        headOfDepartment: formData.headOfDepartment.trim(),
        availableRoles: formData.availableRoles,
        updatedAt: new Date().toISOString(),
        ...(editingDeptId ? {} : { createdAt: new Date().toISOString() })
      };

      await setDoc(ref, payload, { merge: true });

      setSuccessMsg(editingDeptId ? `Department "${cleanName}" updated successfully.` : `Department "${cleanName}" created successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setIsModalOpen(false);
      await loadData();
    } catch (err) {
      console.error('Error saving department:', err);
      const errInfo = handleFirestoreError(err, OperationType.WRITE, COLLECTIONS.DEPARTMENTS);
      setModalError(`Failed to save department: ${errInfo.error}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = (dept: DepartmentDocument) => {
    if (!dept.id) return;
    const count = employeeCountByDept[dept.name] || 0;
    setDeleteModalState({
      isOpen: true,
      deptId: dept.id,
      deptName: dept.name,
      assignedEmployeeCount: count
    });
  };

  // Execute Delete
  const handleExecuteDelete = async () => {
    if (!deleteModalState.deptId) return;
    setSubmitting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.DEPARTMENTS, deleteModalState.deptId));
      setSuccessMsg(`Department "${deleteModalState.deptName}" has been removed.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      setDeleteModalState({ isOpen: false, deptId: '', deptName: '', assignedEmployeeCount: 0 });
      await loadData();
    } catch (err) {
      console.error('Error deleting department:', err);
      const errInfo = handleFirestoreError(err, OperationType.DELETE, COLLECTIONS.DEPARTMENTS);
      setErrorMsg(`Failed to delete department: ${errInfo.error}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Department Management</span> module is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
          </p>
          <div className="pt-2 text-sm text-gray-500 font-mono">
            Your logged in role: <span className="uppercase font-bold text-white">{currentRole}</span> ({currentEmail})
          </div>
        </div>
      </div>
    );
  }

  const totalAssignedStaff = Object.values(employeeCountByDept).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 w-full max-w-full">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#D4AF37] uppercase tracking-wider mb-1">
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Organization Administration
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            Department Management
          </h2>
          <p className="text-sm text-gray-400 mt-1 max-w-2xl">
            Configure dynamic departments in the <code className="text-[#D4AF37] font-mono text-xs">departments</code> collection to drive Employee Directory mapping and access boundaries.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => { setRefreshing(true); loadData(); }}
            disabled={loading || refreshing}
            className="px-3 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] text-gray-200 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#D4AF37]' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {departments.length === 0 && (
            <button
              type="button"
              onClick={handleSeedStandardDepartments}
              disabled={submitting}
              className="px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-semibold text-sm rounded-lg transition-all flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              Initialize Standard Departments
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-sm rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center gap-2 shadow-lg shadow-[#D4AF37]/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Department
          </button>
        </div>
      </div>

      {/* Metrics Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Total Departments</span>
            <div className="text-2xl font-bold text-white mt-0.5">{departments.length}</div>
            <span className="text-xs text-emerald-400 font-medium">Active in Firestore</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#D4AF37]">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Assigned Staff</span>
            <div className="text-2xl font-bold text-white mt-0.5">{totalAssignedStaff}</div>
            <span className="text-xs text-gray-400 font-medium">Mapped Personnel</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Avg Team Size</span>
            <div className="text-2xl font-bold text-white mt-0.5">
              {departments.length > 0 ? (totalAssignedStaff / departments.length).toFixed(1) : '0'}
            </div>
            <span className="text-xs text-purple-400 font-medium">Members per Unit</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Layers className="w-5 h-5" />
          </div>
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

      {/* Search & Actions Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, code, lead, or description..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#161B22] border border-[#30363D] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>

        <div className="text-xs text-gray-400 font-mono bg-[#161B22] px-3.5 py-2 rounded-lg border border-[#30363D] self-stretch md:self-auto text-center">
          Showing <span className="font-bold text-white">{filteredDepartments.length}</span> of {departments.length} Departments
        </div>
      </div>

      {/* Main Table */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 space-y-3">
            <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-mono">Loading departments from Firestore collection &apos;departments&apos;...</p>
          </div>
        ) : filteredDepartments.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-4">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto" />
            <p className="text-base text-gray-300 font-medium">No departments found.</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Initialize standard departments with one click or create custom departments to categorize your employees.
            </p>
            <button
              type="button"
              onClick={handleSeedStandardDepartments}
              disabled={submitting}
              className="px-4 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-xs rounded-lg hover:brightness-110 cursor-pointer"
            >
              Initialize Standard Departments
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#181818] border-b border-[#2A2A2A] text-xs font-mono text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Code</th>
                  <th className="py-3.5 px-4 font-semibold">Department Name</th>
                  <th className="py-3.5 px-4 font-semibold">Available Roles</th>
                  <th className="py-3.5 px-4 font-semibold">Description</th>
                  <th className="py-3.5 px-4 font-semibold">Head / Lead</th>
                  <th className="py-3.5 px-4 font-semibold text-center">Assigned Staff</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A2A]">
                {filteredDepartments.map((dept) => {
                  const assignedCount = employeeCountByDept[dept.name] || 0;
                  const roles = dept.availableRoles && dept.availableRoles.length > 0
                    ? dept.availableRoles
                    : getDepartmentRolesWithFallback(dept);
                  return (
                    <tr 
                      key={dept.id || dept.name} 
                      className="hover:bg-[#252525]/60 transition-colors group"
                    >
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-xs">
                        <span className="px-2 py-1 bg-[#2A2A2A] text-[#D4AF37] border border-[#3A3A3A] rounded">
                          {dept.code || 'DEPT'}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <span className="font-semibold text-sm">{dept.name}</span>
                        </div>
                      </td>

                      {/* Available Roles */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {roles.map((r) => (
                            <span
                              key={r}
                              className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[#161B22] text-[#D4AF37] border border-[#30363D]"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 text-xs text-gray-400 max-w-xs truncate">
                        {dept.description || <span className="italic text-gray-600">No description provided</span>}
                      </td>

                      {/* Head of Department */}
                      <td className="py-3.5 px-4 text-xs text-gray-300 font-mono">
                        {dept.headOfDepartment ? (
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-gray-500" />
                            <span>{dept.headOfDepartment}</span>
                          </div>
                        ) : (
                          <span className="text-gray-600 italic">Unassigned</span>
                        )}
                      </td>

                      {/* Assigned Staff Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span 
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                            assignedCount > 0 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                              : 'bg-gray-800 text-gray-500 border border-gray-700'
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          {assignedCount} {assignedCount === 1 ? 'member' : 'members'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(dept)}
                            className="p-1.5 text-gray-400 hover:text-[#D4AF37] hover:bg-[#2A2A2A] rounded-lg transition-colors cursor-pointer"
                            title="Edit Department"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(dept)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="Delete Department"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Department Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 space-y-6 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#D4AF37]" />
                {editingDeptId ? 'Edit Department' : 'Create New Department'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-4">
              {/* Department Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Solar Engineering & Design"
                  className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all"
                />
              </div>

              {/* Code */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Department Code
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. ENG, SALES, OPS"
                  maxLength={10}
                  className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm font-mono uppercase focus:outline-none transition-all"
                />
              </div>

              {/* Head of Department */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Head of Department / Lead
                </label>
                <input
                  type="text"
                  value={formData.headOfDepartment}
                  onChange={(e) => setFormData({ ...formData, headOfDepartment: e.target.value })}
                  placeholder="e.g. Lead Solar PV Designer"
                  className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Description / Operational Scope
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Summary of responsibilities, deliverables, and role within Solarithm..."
                  className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-sm focus:outline-none transition-all resize-none"
                />
              </div>

              {/* Available System Roles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Available System Roles *
                  </label>
                  <span className="text-[11px] font-mono text-gray-400">
                    {formData.availableRoles.length} role{formData.availableRoles.length === 1 ? '' : 's'} mapped
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  When creating or updating employees in this department, the &quot;Assigned System Role&quot; dropdown will dynamically filter to only allow these roles.
                </p>

                {/* Selected Roles Chips Box */}
                <div className="p-2.5 bg-[#161B22] border border-[#30363D] rounded-lg min-h-[46px] flex flex-wrap gap-1.5 items-center">
                  {formData.availableRoles.length === 0 ? (
                    <span className="text-xs text-rose-400 italic">No roles selected. Please pick or add at least one role.</span>
                  ) : (
                    formData.availableRoles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium bg-[#2A2A2A] text-[#D4AF37] border border-[#3A3A3A]"
                      >
                        <span>{role}</span>
                        <button
                          type="button"
                          onClick={() => setFormData({
                            ...formData,
                            availableRoles: formData.availableRoles.filter(r => r !== role)
                          })}
                          className="text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                          title={`Remove ${role}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] font-mono uppercase text-gray-500">Quick Presets:</span>
                  {['sales', 'manager', 'admin', 'designer', 'owner', 'engineer', 'technician'].map((preset) => {
                    const isSelected = formData.availableRoles.includes(preset);
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setFormData({
                              ...formData,
                              availableRoles: formData.availableRoles.filter(r => r !== preset)
                            });
                          } else {
                            setFormData({
                              ...formData,
                              availableRoles: [...formData.availableRoles, preset]
                            });
                          }
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/50 font-semibold'
                            : 'bg-[#161B22] text-gray-400 border-[#30363D] hover:text-white hover:border-gray-500'
                        }`}
                      >
                        {isSelected ? `✓ ${preset}` : `+ ${preset}`}
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Role */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = newRoleInput.trim();
                        if (clean && !formData.availableRoles.includes(clean)) {
                          setFormData({
                            ...formData,
                            availableRoles: [...formData.availableRoles, clean]
                          });
                          setNewRoleInput('');
                        }
                      }
                    }}
                    placeholder="Add custom role tag (e.g. auditor)..."
                    className="flex-1 px-3 py-1.5 bg-[#161B22] border border-[#30363D] text-white focus:border-[#D4AF37] rounded-lg text-xs font-mono focus:outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newRoleInput.trim();
                      if (clean && !formData.availableRoles.includes(clean)) {
                        setFormData({
                          ...formData,
                          availableRoles: [...formData.availableRoles, clean]
                        });
                        setNewRoleInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] text-xs font-semibold text-gray-200 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Add Role
                  </button>
                </div>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#2A2A2A]">
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
                      {editingDeptId ? 'Save Changes' : 'Create Department'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title={`Delete Department "${deleteModalState.deptName}"?`}
        message={
          deleteModalState.assignedEmployeeCount > 0
            ? `Notice: ${deleteModalState.assignedEmployeeCount} employee(s) currently belong to this department. Deleting it will not delete employees, but their department mapping should be updated.`
            : 'Are you sure you want to permanently delete this department record from Firestore?'
        }
        confirmText="Delete Department"
        variant="danger"
        onConfirm={handleExecuteDelete}
        onClose={() => setDeleteModalState({ isOpen: false, deptId: '', deptName: '', assignedEmployeeCount: 0 })}
      />
    </div>
  );
}
