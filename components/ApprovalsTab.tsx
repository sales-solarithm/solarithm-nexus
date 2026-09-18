'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckSquare, 
  Check, 
  X, 
  Building2, 
  Compass, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert, 
  Shield, 
  Tag, 
  Search, 
  MapPin, 
  User, 
  FileText,
  Zap,
  Briefcase,
  Trash2,
  KeyRound,
  TriangleAlert,
  AppWindow,
  Copy,
  ExternalLink,
  Filter,
  Clock,
  XCircle
} from 'lucide-react';
import { 
  db, 
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ClientDocument, 
  DesignDocument, 
  ProposalDocument, 
  PricingCategory, 
  PasswordResetRequestDocument,
  DEFAULT_PRICING_CATEGORIES, 
  handleFirestoreError, 
  OperationType 
} from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc,
  setDoc, 
  updateDoc, 
  addDoc,
  query, 
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

interface ApprovalsTabProps {
  currentEmail: string;
  currentRole: UserRole;
}

export interface ChangeRequestDocument {
  id?: string;
  projectId?: string;
  projectNumber: string;
  requestedBy: string;
  fieldToChange: string;
  currentValue: string;
  requestedValue: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: string;
}

function generateSecureTempPassword(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return 'Sol@' + array[0].toString(36).substring(0, 5).toUpperCase() + '!';
  }
  return 'Sol@' + Date.now().toString(36).slice(-5).toUpperCase() + '!';
}

export default function ApprovalsTab({ currentEmail, currentRole }: ApprovalsTabProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(currentEmail.toLowerCase());
  const canManageApprovals = isSuperAdmin || currentRole === 'owner' || currentRole === 'admin';

  // Sub-tab selection: COLLECTIONS.CLIENTS | 'designs' | 'passwords'
  const [subTab, setSubTab] = useState<typeof COLLECTIONS.CLIENTS | 'designs' | 'passwords'>(COLLECTIONS.CLIENTS);

  // Client approvals state
  const [pendingClients, setPendingClients] = useState<ClientDocument[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  // Design approvals state
  const [pendingDesigns, setPendingDesigns] = useState<DesignDocument[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);

  // Change requests state
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequestDocument[]>([]);
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(true);

  // Proposals lookup for auto-capturing pricing category
  const [proposalsMap, setProposalsMap] = useState<Record<string, PricingCategory>>({});

  // Employee Directory state (fetched from 'employees' collection for cross-referencing)
  const [employeeEmails, setEmployeeEmails] = useState<Set<string>>(new Set());
  const [employeeDirectory, setEmployeeDirectory] = useState<Record<string, { name?: string; department?: string; employeeId?: string }>>({});
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Password reset requests state
  const [passwordRequests, setPasswordRequests] = useState<PasswordResetRequestDocument[]>([]);
  const [loadingPasswordRequests, setLoadingPasswordRequests] = useState(true);
  const [actioningPasswordId, setActioningPasswordId] = useState<string | null>(null);
  const [passwordStatusFilter, setPasswordStatusFilter] = useState<'all' | 'pending' | 'resolved' | 'unregistered'>('all');

  // Resolved password credential modal
  const [resolvedPasswordModal, setResolvedPasswordModal] = useState<{
    isOpen: boolean;
    email: string;
    tempPassword?: string;
    copied?: boolean;
  }>({
    isOpen: false,
    email: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Approve Client Modal
  const [clientToApprove, setClientToApprove] = useState<ClientDocument | null>(null);
  const [assignedCategory, setAssignedCategory] = useState<PricingCategory>('T1');
  const [approvingClient, setApprovingClient] = useState(false);
  const [actioningChangeId, setActioningChangeId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    collectionName: string;
    label?: string;
  }>({
    isOpen: false,
    id: '',
    collectionName: ''
  });

  // Load pending clients
  const loadPendingClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.CLIENTS),
        where(CLIENT_FIELDS.STATUS, '==', CLIENT_STATUS.PENDING)
      );
      const snap = await getDocs(q);
      const list: ClientDocument[] = [];
      snap.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as ClientDocument), id: docSnap.id });
      });

      setPendingClients(list);
    } catch (err) {
      console.error('Error loading pending clients:', err);
      handleFirestoreError(err, OperationType.LIST, COLLECTIONS.CLIENTS);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  // Load pending designs
    const loadPendingDesigns = useCallback(async () => {
    setLoadingDesigns(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.PROJECTS),
        where(PROJECT_FIELDS.STATUS, '==', PROJECT_STATUS.IN_VERIFICATION)
      );
      const snap = await getDocs(q);
      console.log("Found pending designs:", snap.size);
      
      const list: DesignDocument[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({ 
          ...(data as DesignDocument), 
          id: docSnap.id,
          projectName: data.projectName || data.srNumber || data.clientName || 'Unknown Project',
          projectId: data.srNumber || data.id,
          scopeOfWork: data.scopeOfWork || 'N/A',
          plantCapacity: data.plantCapacity + (data.capacityUnit ? ' ' + data.capacityUnit : ' KW')
        });
      });
      setPendingDesigns(list);
    } catch (err) {
      console.error('Error loading pending designs:', err);
      handleFirestoreError(err, OperationType.LIST, COLLECTIONS.PROJECTS);
    } finally {
      setLoadingDesigns(false);
    }
  }, []);

  // Load proposals lookup to auto capture category
  const loadProposalsMap = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PROPOSALS));
      const map: Record<string, PricingCategory> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() as ProposalDocument;
        if (data.proposalNumber && data.pricingCategory) {
          map[data.proposalNumber.toUpperCase()] = data.pricingCategory;
        }
      });
      setProposalsMap(map);
    } catch (err) {
      console.error('Error loading proposals map:', err);
    }
  }, []);

  // Load pending change requests where status == 'pending'
  const loadPendingChangeRequests = useCallback(async () => {
    setLoadingChangeRequests(true);
    try {
      const q = query(
        collection(db, COLLECTIONS.CHANGE_REQUESTS),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      const list: ChangeRequestDocument[] = [];
      snap.forEach((docSnap) => {
        list.push({ ...(docSnap.data() as ChangeRequestDocument), id: docSnap.id });
      });
      setPendingChangeRequests(list);
    } catch (err) {
      console.error('Error loading pending change requests:', err);
      handleFirestoreError(err, OperationType.LIST, COLLECTIONS.CHANGE_REQUESTS);
    } finally {
      setLoadingChangeRequests(false);
    }
  }, []);

  // 1. Load registered employees from 'employees' collection for cross-reference verification
  const loadEmployeeDirectory = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const emailSet = new Set<string>();
      const dirMap: Record<string, { name?: string; department?: string; employeeId?: string; role?: string }> = {};

      // Primary: 'employees' collection
      try {
        const empSnap = await getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees'));
        empSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email) {
            const norm = String(data.email).trim().toLowerCase();
            emailSet.add(norm);
            dirMap[norm] = {
              name: data.name,
              department: data.department,
              employeeId: data.employeeId || docSnap.id,
              role: data.role
            };
          }
        });
      } catch (err) {
        console.warn('Warning querying employees collection:', err);
      }

      // Secondary: 'users' collection to ensure comprehensive directory coverage
      try {
        const userSnap = await getDocs(collection(db, COLLECTIONS.USERS || 'users'));
        userSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.email) {
            const norm = String(data.email).trim().toLowerCase();
            emailSet.add(norm);
            if (!dirMap[norm]) {
              dirMap[norm] = {
                name: data.name,
                department: data.department,
                employeeId: data.employeeId || docSnap.id,
                role: data.assignedRole || data.role
              };
            }
          }
        });
      } catch (err) {
        console.warn('Warning querying users collection for employees:', err);
      }

      setEmployeeEmails(emailSet);
      setEmployeeDirectory(dirMap);
    } catch (err) {
      console.error('Error loading employee directory:', err);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Helper to parse Firestore Timestamp / seconds / string / Date to milliseconds for sorting
  const parseTimestampToMs = (val: any): number => {
    if (!val) return 0;
    try {
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (typeof val === 'object' && typeof val.seconds === 'number') {
        return val.seconds * 1000 + (val.nanoseconds || 0) / 1e6;
      }
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    } catch {
      return 0;
    }
  };

  // Helper to map an approvals Firestore document specifically for PASSWORD_RESET_REQUEST
  const mapPasswordResetDoc = (docSnap: any): PasswordResetRequestDocument => {
    const data = docSnap.data();
    const reqEmail = String(data.requestedEmail || data.email || '').trim();
    const rawStatus = String(data.status || 'pending').trim().toLowerCase();
    const status = (rawStatus === 'approved' ? 'approved' : rawStatus === 'rejected' ? 'rejected' : 'pending') as any;

    return {
      id: docSnap.id,
      type: 'PASSWORD_RESET_REQUEST',
      requestedEmail: reqEmail,
      email: reqEmail,
      status,
      timestamp: data.timestamp,
      createdAt: data.timestamp || data.createdAt,
      appName: data.appName || data.appId || 'Solarithm App Launcher',
      employeeName: data.employeeName || data.name || '',
      reason: data.reason || 'Password reset request from App Launcher',
      tempPassword: data.tempPassword,
      resolvedAt: data.resolvedAt,
      resolvedBy: data.resolvedBy,
      collectionName: 'approvals'
    };
  };

  // 2. Real-time sync: Fetch from collection(db, 'approvals') using ONLY where('type', '==', 'PASSWORD_RESET_REQUEST')
  // Do NOT filter by status in the database query to prevent case-sensitivity bugs.
  useEffect(() => {
    if (!canManageApprovals) {
      return;
    }

    const approvalsQuery = query(
      collection(db, 'approvals'),
      where('type', '==', 'PASSWORD_RESET_REQUEST')
    );

    const unsub = onSnapshot(
      approvalsQuery,
      (snap) => {
        const list: PasswordResetRequestDocument[] = [];
        snap.forEach((docSnap) => {
          list.push(mapPasswordResetDoc(docSnap));
        });

        // Sort newest first by timestamp
        list.sort((a, b) => {
          const timeA = parseTimestampToMs(a.timestamp || a.createdAt);
          const timeB = parseTimestampToMs(b.timestamp || b.createdAt);
          return timeB - timeA;
        });

        setPasswordRequests(list);
        setLoadingPasswordRequests(false);
      },
      (err) => {
        console.error('Error listening to approvals collection for password reset requests:', err);
        handleFirestoreError(err, OperationType.LIST, 'approvals');
        setLoadingPasswordRequests(false);
      }
    );

    return () => {
      unsub();
    };
  }, [canManageApprovals]);

  // Fallback / manual refresh: Load explicitly using where('type', '==', 'PASSWORD_RESET_REQUEST')
  const loadPendingPasswordRequests = useCallback(async () => {
    setLoadingPasswordRequests(true);
    try {
      const approvalsQuery = query(
        collection(db, 'approvals'),
        where('type', '==', 'PASSWORD_RESET_REQUEST')
      );
      const snap = await getDocs(approvalsQuery);
      const list: PasswordResetRequestDocument[] = [];
      snap.forEach((docSnap) => {
        list.push(mapPasswordResetDoc(docSnap));
      });

      list.sort((a, b) => {
        const timeA = parseTimestampToMs(a.timestamp || a.createdAt);
        const timeB = parseTimestampToMs(b.timestamp || b.createdAt);
        return timeB - timeA;
      });

      setPasswordRequests(list);
    } catch (err) {
      console.error('Error loading approvals collection for password reset requests:', err);
      handleFirestoreError(err, OperationType.LIST, 'approvals');
    } finally {
      setLoadingPasswordRequests(false);
    }
  }, []);

  // Format timestamp helper: handles Firestore Timestamp, seconds, ISO string, and Date
  const formatTimestamp = (val: any): string => {
    if (!val) return 'Just now';
    try {
      if (val && typeof val.toDate === 'function') {
        return val.toDate().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      if (typeof val === 'object' && typeof val.seconds === 'number') {
        return new Date(val.seconds * 1000).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch {
      // fallback
    }
    return String(val);
  };

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      if (canManageApprovals) {
        await Promise.all([
          loadPendingClients(),
          loadPendingDesigns(),
          loadProposalsMap(),
          loadPendingChangeRequests(),
          loadEmployeeDirectory(),
          loadPendingPasswordRequests()
        ]);
      }
    };
    fetchAll();
    return () => {
      isMounted = false;
    };
  }, [
    canManageApprovals, 
    loadPendingClients, 
    loadPendingDesigns, 
    loadProposalsMap, 
    loadPendingChangeRequests,
    loadEmployeeDirectory,
    loadPendingPasswordRequests
  ]);

  // Approve password reset request: updates status to APPROVED and auto-provisions employee record if not already present
  const handleApprovePasswordReset = async (req: PasswordResetRequestDocument) => {
    if (!req.id) return;
    setActioningPasswordId(req.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const coll = 'approvals';
      const tempPassword = generateSecureTempPassword();
      const ref = doc(db, coll, req.id);
      
      // 1. Update status to APPROVED in approvals collection
      await updateDoc(ref, {
        status: 'APPROVED',
        tempPassword,
        resolvedAt: new Date().toISOString(),
        resolvedBy: currentEmail
      });

      // 2. Employee Auto-Creation: Query employees collection for requestedEmail
      const targetEmail = (req.requestedEmail || req.email || '').trim();
      const normalizedEmail = targetEmail.toLowerCase();

      if (normalizedEmail) {
        try {
          const employeesRef = collection(db, 'employees');
          const empQuery = query(employeesRef, where('email', '==', normalizedEmail));
          const empSnap = await getDocs(empQuery);

          let employeeExists = !empSnap.empty;

          // Also check with raw email casing in case existing documents used exact casing
          if (!employeeExists && targetEmail !== normalizedEmail) {
            const rawEmpQuery = query(employeesRef, where('email', '==', targetEmail));
            const rawEmpSnap = await getDocs(rawEmpQuery);
            employeeExists = !rawEmpSnap.empty;
          }

          // IF the email DOES NOT exist: Automatically create a new document in the employees collection using that email.
          // Leave all other KYC and metadata fields (name, department, phone, etc.) as blank strings so the Owner can fill them in manually later.
          // IF the email ALREADY exists: Skip the creation step entirely to prevent duplicate entries.
          if (!employeeExists) {
            const newEmpRef = doc(collection(db, 'employees'));
            const employeePayload = {
              email: targetEmail,
              name: '',
              department: '',
              phone: '',
              role: '',
              employeeId: '',
              designation: '',
              dateOfJoining: '',
              dateOfBirth: '',
              bankName: '',
              accountNumber: '',
              ifscCode: '',
              panCardNumber: '',
              aadhaarCardNumber: '',
              houseAddress: '',
              personalEmailAddress: '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            await setDoc(newEmpRef, employeePayload);

            // Also mirror to users collection so User Management tab and AuthGuard recognize it seamlessly
            try {
              const usersRef = collection(db, 'users');
              const userQ = query(usersRef, where('email', '==', normalizedEmail));
              const userSnap = await getDocs(userQ);
              if (userSnap.empty) {
                await setDoc(doc(db, 'users', newEmpRef.id), employeePayload, { merge: true });
              }
            } catch (mirrorErr) {
              console.warn('Note: mirroring newly provisioned employee to users collection warning:', mirrorErr);
            }
          }

          // Refresh employee directory so UI badges immediately recognize the applicant as registered
          await loadEmployeeDirectory();
        } catch (empErr) {
          console.error('Error verifying/creating employee record:', empErr);
        }
      }

      // 3. Update local state
      setPasswordRequests(prev => prev.map(item => item.id === req.id ? { ...item, status: 'APPROVED', tempPassword } : item));

      // 4. UX Feedback: Show exact success toast
      setSuccessMsg("Request approved and employee directory updated.");
      setResolvedPasswordModal({
        isOpen: true,
        email: targetEmail || req.requestedEmail,
        tempPassword
      });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      console.error('Error approving password reset:', err);
      handleFirestoreError(err, OperationType.UPDATE, `approvals/${req.id}`);
      setErrorMsg('Failed to approve password reset request.');
    } finally {
      setActioningPasswordId(null);
    }
  };

  // Reject password reset request
  const handleRejectPasswordReset = async (req: PasswordResetRequestDocument) => {
    if (!req.id) return;
    setActioningPasswordId(req.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const coll = 'approvals';
      const ref = doc(db, coll, req.id);
      await updateDoc(ref, {
        status: 'rejected',
        resolvedAt: new Date().toISOString(),
        resolvedBy: currentEmail
      });

      setPasswordRequests(prev => prev.map(item => item.id === req.id ? { ...item, status: 'rejected' } : item));
      setSuccessMsg(`Password reset request for ${req.requestedEmail} rejected.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error rejecting password reset:', err);
      handleFirestoreError(err, OperationType.UPDATE, `approvals/${req.id}`);
      setErrorMsg('Failed to reject password reset request.');
    } finally {
      setActioningPasswordId(null);
    }
  };

  // Open Client Approve Modal
  const openApproveClientModal = (client: ClientDocument) => {
    setClientToApprove(client);
    // Auto capture category from proposal number if available
    let categoryToUse: PricingCategory = 'T1';
    if (client.proposalNumber) {
      const matched = proposalsMap[client.proposalNumber.toUpperCase()];
      if (matched) {
        categoryToUse = matched;
      }
    }
    setAssignedCategory(categoryToUse);
  };

  // Confirm Client Approval
  const handleConfirmApproveClient = async () => {
    if (!clientToApprove || !clientToApprove.id) return;
    setApprovingClient(true);
    try {
      console.log("Approving client:", clientToApprove.id);
      console.log("Setting status to: approved");
      console.log("Saving to collection: clients");
      
      const clientRef = doc(db, COLLECTIONS.CLIENTS, clientToApprove.id);
      await updateDoc(clientRef, {
        [CLIENT_FIELDS.STATUS]: CLIENT_STATUS.APPROVED,
        [CLIENT_FIELDS.PRICING_CATEGORY]: assignedCategory,
        approvedAt: new Date(),
        approvedBy: currentEmail
      });
      console.log("Client approved successfully");

      setSuccessMsg(`Client "${clientToApprove.companyName}" approved with Pricing Category ${assignedCategory}.`);
      setClientToApprove(null);
      await loadPendingClients();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error approving client:', err);
      handleFirestoreError(err, OperationType.UPDATE, `clients/${clientToApprove.id}`);
      setErrorMsg('Failed to approve client.');
    } finally {
      setApprovingClient(false);
    }
  };

  // Delete record permanently
  const handleDelete = (id?: string, collectionName?: string, label?: string) => {
    if (!id || !collectionName) {
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
    if (!id || !collectionName) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, collectionName, id));
      if (collectionName === COLLECTIONS.CLIENTS || collectionName === 'clients') {
        setPendingClients(prev => prev.filter(c => c.id !== id));
      } else if (collectionName === COLLECTIONS.PROJECTS || collectionName === 'projects') {
        setPendingDesigns(prev => prev.filter(d => d.id !== id));
      } else if (collectionName === 'change_requests' || collectionName === COLLECTIONS.CHANGE_REQUESTS) {
        setPendingChangeRequests(prev => prev.filter(r => r.id !== id));
      } else if (
        collectionName === 'passwordResetRequests' || 
        collectionName === 'password_reset_requests' || 
        collectionName === 'approvals'
      ) {
        setPasswordRequests(prev => prev.filter(r => r.id !== id));
      }
      setSuccessMsg('Record permanently deleted.');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Error deleting record from Firestore:', err);
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${id}`);
      setErrorMsg("Failed to delete record. Check your Firebase Security Rules.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Reject Client
  const handleRejectClient = async (client: ClientDocument) => {
    if (!client.id) return;
    try {
      const clientRef = doc(db, COLLECTIONS.CLIENTS, client.id);
      await updateDoc(clientRef, { [CLIENT_FIELDS.STATUS]: CLIENT_STATUS.REJECTED });
      setSuccessMsg(`Client "${client.companyName}" rejected.`);
      await loadPendingClients();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error rejecting client:', err);
      handleFirestoreError(err, OperationType.UPDATE, `clients/${client.id}`);
      setErrorMsg('Failed to reject client.');
    }
  };

  // Approve Design
  const handleApproveDesign = async (design: DesignDocument) => {
    if (!design.id) return;
    try {
      const designRef = doc(db, COLLECTIONS.PROJECTS, design.id);
      await updateDoc(designRef, { [PROJECT_FIELDS.STATUS]: PROJECT_STATUS.COMPLETED });
      setSuccessMsg(`Design "${design.projectName}" approved.`);
      await loadPendingDesigns();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error approving design:', err);
      handleFirestoreError(err, OperationType.UPDATE, `projects/${design.id}`);
      setErrorMsg('Failed to approve design.');
    }
  };

  // Reject Design
  const handleRejectDesign = async (design: DesignDocument) => {
    if (!design.id) return;
    try {
      const designRef = doc(db, COLLECTIONS.PROJECTS, design.id);
      await updateDoc(designRef, { [PROJECT_FIELDS.STATUS]: PROJECT_STATUS.IN_REVISION });
      setSuccessMsg(`Design "${design.projectName}" rejected.`);
      await loadPendingDesigns();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error rejecting design:', err);
      handleFirestoreError(err, OperationType.UPDATE, `projects/${design.id}`);
      setErrorMsg('Failed to reject design.');
    }
  };

  // Reject Change Request
  const handleRejectChange = async (requestId: string) => {
    if (!requestId) return;
    setActioningChangeId(requestId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const requestRef = doc(db, COLLECTIONS.CHANGE_REQUESTS, requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        updatedAt: serverTimestamp()
      });
      setPendingChangeRequests((prev) => prev.filter((r) => r.id !== requestId));
      setSuccessMsg("Change request rejected.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error rejecting change request:', err);
      handleFirestoreError(err, OperationType.UPDATE, `changeRequests/${requestId}`);
      setErrorMsg('Failed to reject change request.');
    } finally {
      setActioningChangeId(null);
    }
  };

  // Approve Change Request
  const handleApproveChange = async (request: ChangeRequestDocument) => {
    if (!request.id) return;
    setActioningChangeId(request.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // 1. Update the change request document status to 'approved'
      const requestRef = doc(db, COLLECTIONS.CHANGE_REQUESTS, request.id);
      await updateDoc(requestRef, {
        status: 'approved',
        updatedAt: serverTimestamp()
      });

      // 2. Update the actual project document
      let projectDocId = request.projectId;

      // Robust fallback: if projectId is not provided on the request, find the project by projectNumber
      if (!projectDocId && request.projectNumber) {
        const q = query(
          collection(db, COLLECTIONS.PROJECTS),
          where('projectNumber', '==', request.projectNumber)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          projectDocId = snap.docs[0].id;
        }
      }

      if (projectDocId) {
        const projectRef = doc(db, COLLECTIONS.PROJECTS, projectDocId);
        await updateDoc(projectRef, {
          [request.fieldToChange]: request.requestedValue,
          updatedAt: serverTimestamp()
        });
        setSuccessMsg(`Change request approved. Project field "${request.fieldToChange}" updated successfully.`);
      } else {
        setSuccessMsg(`Change request approved, but project document matching "${request.projectNumber}" was not found to update.`);
      }

      // Filter local state array to remove the request from the screen upon success
      setPendingChangeRequests((prev) => prev.filter((r) => r.id !== request.id));
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error('Error approving change request:', err);
      handleFirestoreError(err, OperationType.UPDATE, `changeRequests/${request.id}`);
      setErrorMsg('Failed to approve change request.');
    } finally {
      setActioningChangeId(null);
    }
  };

  const filteredClients = pendingClients.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.contactPerson || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.submittedBy || '').toLowerCase().includes(q)
    );
  });

  const filteredDesigns = pendingDesigns.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      (d.projectName || '').toLowerCase().includes(q) ||
      (d.clientName || '').toLowerCase().includes(q) ||
      (d.designerEmail || '').toLowerCase().includes(q) ||
      (d.plantCapacity || '').toLowerCase().includes(q)
    );
  });

  const filteredChangeRequests = pendingChangeRequests.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.projectNumber || '').toLowerCase().includes(q) ||
      (r.requestedBy || '').toLowerCase().includes(q) ||
      (r.fieldToChange || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q)
    );
  });

  const pendingPasswordRequestsCount = passwordRequests.filter(
    r => String(r.status || 'pending').trim().toLowerCase() === 'pending'
  ).length;

  const resolvedPasswordRequestsCount = passwordRequests.filter(
    r => String(r.status || 'pending').trim().toLowerCase() !== 'pending'
  ).length;

  const unregisteredPendingCount = passwordRequests.filter(r => {
    const isPending = String(r.status || 'pending').trim().toLowerCase() === 'pending';
    const email = (r.requestedEmail || r.email || '').trim().toLowerCase();
    return isPending && !employeeEmails.has(email);
  }).length;

  const filteredPasswordRequests = passwordRequests.filter((r) => {
    const q = searchQuery.toLowerCase();
    const reqEmail = (r.requestedEmail || r.email || '').toLowerCase();
    const app = (r.appName || '').toLowerCase();
    const reason = (r.reason || '').toLowerCase();
    const status = String(r.status || 'pending').trim().toLowerCase();
    const empName = (r.employeeName || '').toLowerCase();
    const isRegistered = employeeEmails.has(reqEmail.trim());

    if (passwordStatusFilter === 'pending' && status !== 'pending') return false;
    if (passwordStatusFilter === 'resolved' && status === 'pending') return false;
    if (passwordStatusFilter === 'unregistered' && (!isRegistered || status !== 'pending')) return false;

    return (
      reqEmail.includes(q) ||
      app.includes(q) ||
      reason.includes(q) ||
      status.includes(q) ||
      empName.includes(q)
    );
  });

  if (!canManageApprovals) {
    return (
      <div className="p-6 md:p-12 max-w-4xl mx-auto">
        <div className="w-full bg-[#1E1E1E] border border-[#333333] rounded-xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4AF37]">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Access Restricted</h2>
          <p className="text-base text-gray-400 max-w-md mx-auto leading-relaxed">
            The <span className="text-[#D4AF37] font-semibold">Approvals Workspace</span> is restricted to system <span className="text-amber-400">Owners</span> and <span className="text-purple-300">Admins</span>.
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
            <Shield className="w-4 h-4 text-[#D4AF37]" /> Approvals Queue
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            System <span className="text-[#D4AF37]">Approvals</span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Review client registrations, design submissions, and App Launcher password reset requests with live employee verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              loadPendingClients();
              loadPendingDesigns();
              loadPendingChangeRequests();
              loadEmployeeDirectory();
              loadPendingPasswordRequests();
            }}
            className="px-3.5 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm font-medium text-gray-200 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
            Refresh Queue
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

      {/* Sub-Tabs Switcher */}
      <div className="flex border-b border-[#2A2A2A] space-x-4 sm:space-x-6 overflow-x-auto">
        <button
          onClick={() => setSubTab(COLLECTIONS.CLIENTS)}
          className={`pb-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            subTab === COLLECTIONS.CLIENTS
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          A. Client Approvals ({pendingClients.length})
        </button>

        <button
          onClick={() => setSubTab('designs')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            subTab === 'designs'
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          B. Design Approvals ({pendingDesigns.length})
        </button>

        <button
          onClick={() => setSubTab('passwords')}
          className={`pb-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer border-b-2 whitespace-nowrap ${
            subTab === 'passwords'
              ? 'border-[#D4AF37] text-[#D4AF37]'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          C. Password Requests ({pendingPasswordRequestsCount})
          {unregisteredPendingCount > 0 && (
            <span
              title={`${unregisteredPendingCount} request(s) not found in employee directory`}
              className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 flex items-center gap-1"
            >
              <TriangleAlert className="w-3 h-3 text-red-500 shrink-0" />
              {unregisteredPendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${subTab === COLLECTIONS.CLIENTS ? 'client or company...' : subTab === 'designs' ? 'design or project...' : 'email, employee, or app...'}`}
            className="w-full pl-10 pr-4 py-2 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* SUB-TAB A: CLIENT APPROVALS */}
      {subTab === COLLECTIONS.CLIENTS && (
        <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
          {loadingClients ? (
            <div className="p-12 text-center text-sm text-gray-400 space-y-3">
              <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-mono">Loading pending client requests...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
              <p>No client registration requests pending approval.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                  <tr>
                    <th className="p-3.5 pl-6">Company Name</th>
                    <th className="p-3.5">Contact Person</th>
                    <th className="p-3.5">City</th>
                    <th className="p-3.5">GSTIN</th>
                    <th className="p-3.5">Submitted By</th>
                    <th className="p-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333333]">
                  {filteredClients.map((client) => (
                    <tr key={client.id || client.companyName} className="hover:bg-[#2A2A2A] transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <span className="font-mono text-base tracking-wide text-amber-400">
                            {client.companyName}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span>{client.contactPerson}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-500" />
                          <span>{client.city}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-gray-400 text-sm">
                        {client.gstin || 'N/A'}
                      </td>
                      <td className="p-3.5 font-mono text-gray-400 text-sm">
                        {client.submittedBy}
                      </td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openApproveClientModal(client)}
                            className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectClient(client)}
                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                          <button
                            onClick={() => handleDelete(client.id, 'clients', client.companyName)}
                            className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
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
      )}

      {/* SUB-TAB B: DESIGN APPROVALS */}
      {subTab === 'designs' && (
        <div className="space-y-8">
          {/* Section 1: Engineering Design Submissions */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#2A2A2A] bg-[#2A2A2A] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-[#D4AF37]" />
                Engineering Design Submissions ({pendingDesigns.length})
              </h3>
            </div>
            {loadingDesigns ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading pending design submissions...</p>
              </div>
            ) : filteredDesigns.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p>No design submissions pending approval.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6">Project ID</th>
                      <th className="p-3.5">Client Name</th>
                      <th className="p-3.5">Plant Capacity</th>
                      <th className="p-3.5">Scope</th>
                      <th className="p-3.5">Designer Email</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredDesigns.map((design) => (
                      <tr key={design.id || design.projectName} className="hover:bg-[#2A2A2A] transition-colors">
                        <td className="p-3.5 pl-6 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <Compass className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            <span className="font-mono text-base tracking-wide text-amber-400">
                              {design.projectId || design.projectName}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 text-gray-200">{design.clientName}</td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-sm font-bold">
                            <Zap className="w-3 h-3 text-[#D4AF37]" />
                            {design.plantCapacity}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-gray-200 text-sm">{design.scopeOfWork || 'N/A'}</td>
                        <td className="p-3.5 font-mono text-gray-400 text-sm">{design.designerEmail}</td>
                        <td className="p-3.5 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveDesign(design)}
                              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve Design
                            </button>
                            <button
                              onClick={() => handleRejectDesign(design)}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold text-sm rounded-lg transition-all cursor-pointer flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                            <button
                              onClick={() => handleDelete(design.id, 'projects', design.projectName || design.id)}
                              className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                              title="Delete Project"
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

          {/* Section 2: Pending Change Requests */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#2A2A2A] bg-[#2A2A2A] flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#D4AF37]" />
                Pending Field Change Requests ({pendingChangeRequests.length})
              </h3>
            </div>
            {loadingChangeRequests ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading pending change requests...</p>
              </div>
            ) : filteredChangeRequests.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p>No change requests pending approval.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6">Project Number</th>
                      <th className="p-3.5">Requested By</th>
                      <th className="p-3.5">Field to Change</th>
                      <th className="p-3.5">Current Value</th>
                      <th className="p-3.5">Requested Value</th>
                      <th className="p-3.5">Reason</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredChangeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-[#2A2A2A] transition-colors">
                        <td className="p-3.5 pl-6 font-bold text-white font-mono text-sm">
                          {req.projectNumber}
                        </td>
                        <td className="p-3.5 text-gray-200">{req.requestedBy}</td>
                        <td className="p-3.5 text-amber-400">
                          <span className="bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-sm">
                            {req.fieldToChange}
                          </span>
                        </td>
                        <td className="p-3.5 text-gray-400 line-through truncate max-w-[150px] font-mono">{req.currentValue || 'N/A'}</td>
                        <td className="p-3.5 text-emerald-400 font-bold truncate max-w-[150px] font-mono">{req.requestedValue}</td>
                        <td className="p-3.5 text-gray-200 max-w-[200px] whitespace-normal leading-relaxed">{req.reason}</td>
                        <td className="p-3.5 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveChange(req)}
                              disabled={!!actioningChangeId}
                              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Approve this change request and apply it to the project"
                            >
                              {actioningChangeId === req.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectChange(req.id || '')}
                              disabled={!!actioningChangeId}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/10 border border-rose-500/30 text-rose-400 font-semibold text-sm rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Reject this change request"
                            >
                              {actioningChangeId === req.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <X className="w-3.5 h-3.5" />
                              )}
                              Reject
                            </button>
                            <button
                              onClick={() => handleDelete(req.id, 'change_requests', req.projectNumber)}
                              disabled={!!actioningChangeId}
                              className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete Change Request"
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
        </div>
      )}

      {/* SUB-TAB C: PASSWORD RESET REQUESTS (WITH LIVE EMPLOYEE VERIFICATION) */}
      {subTab === 'passwords' && (
        <div className="w-full space-y-6">
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
            {/* Header / Actions Bar */}
            <div className="p-5 border-b border-[#2A2A2A] bg-[#2A2A2A] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                  App Launcher Password Reset Requests ({passwordRequests.length})
                </h3>
                <p className="text-xs text-gray-400">
                  Cross-referenced in real-time against the <span className="text-[#D4AF37] font-semibold">employees</span> directory ({employeeEmails.size} registered staff members).
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Status Filter Pills */}
                <div className="flex bg-[#1E1E1E] p-1 rounded-lg border border-[#333333]">
                  <button
                    onClick={() => setPasswordStatusFilter('all')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      passwordStatusFilter === 'all'
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    All ({passwordRequests.length})
                  </button>
                  <button
                    onClick={() => setPasswordStatusFilter('pending')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      passwordStatusFilter === 'pending'
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Pending ({pendingPasswordRequestsCount})
                  </button>
                  <button
                    onClick={() => setPasswordStatusFilter('resolved')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                      passwordStatusFilter === 'resolved'
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Resolved ({resolvedPasswordRequestsCount})
                  </button>
                  <button
                    onClick={() => setPasswordStatusFilter('unregistered')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                      passwordStatusFilter === 'unregistered'
                        ? 'bg-red-500 text-white font-bold'
                        : 'text-red-400 hover:text-red-300'
                    }`}
                  >
                    <TriangleAlert size={12} className="shrink-0" />
                    Unregistered ({unregisteredPendingCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Unregistered Alert Banner */}
            {unregisteredPendingCount > 0 && (
              <div className="p-3.5 bg-red-500/10 border-b border-red-500/20 text-xs text-red-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="text-red-500 shrink-0" size={16} />
                  <span>
                    <strong>Security Verification:</strong> {unregisteredPendingCount} pending password reset request(s) originate from email addresses not registered in the employee directory.
                  </span>
                </div>
                <button
                  onClick={() => setPasswordStatusFilter('unregistered')}
                  className="text-red-400 hover:text-red-200 underline text-xs whitespace-nowrap cursor-pointer"
                >
                  View Unregistered
                </button>
              </div>
            )}

            {/* Content Table or Empty State */}
            {loadingPasswordRequests ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading password reset requests & verifying employee directory...</p>
              </div>
            ) : filteredPasswordRequests.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-3">
                <Shield className="w-10 h-10 text-emerald-400/50 mx-auto" />
                <p className="text-base text-gray-300 font-medium">No password reset requests found.</p>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  When employees or users submit a password reset request through the App Launcher, they will appear here with instant employee directory cross-referencing.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-xs uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6">Applicant & Requested Email</th>
                      <th className="p-3.5">App / Origin</th>
                      <th className="p-3.5">Reason & Details</th>
                      <th className="p-3.5">Submitted</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredPasswordRequests.map((req) => {
                      const reqEmail = (req.requestedEmail || req.email || 'N/A').trim();
                      const emailNorm = reqEmail.toLowerCase();
                      const isEmployee = employeeEmails.has(emailNorm);
                      const employeeMeta = employeeDirectory[emailNorm];
                      const isActioning = actioningPasswordId === req.id;

                      // Accurate lowercase pending status check
                      const rawStatus = String(req.status || 'pending').trim().toLowerCase();
                      const isPending = rawStatus === 'pending';
                      const isApproved = rawStatus === 'approved';
                      const isRejected = rawStatus === 'rejected';

                      // Explicit employeeName from document with fallback to employee directory
                      const explicitName = req.employeeName ? req.employeeName.trim() : '';
                      const directoryName = employeeMeta?.name ? employeeMeta.name.trim() : '';
                      const resolvedEmployeeName = explicitName || directoryName;

                      return (
                        <tr key={req.id} className="hover:bg-[#2A2A2A] transition-colors">
                          {/* Column 1: Applicant & Requested Email with Directory Verification */}
                          <td className="p-3.5 pl-6">
                            <div className="space-y-1.5">
                              {/* Explicit Employee Name */}
                              {resolvedEmployeeName && (
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                                  <span className="text-white font-semibold text-sm">
                                    {resolvedEmployeeName}
                                  </span>
                                  {employeeMeta?.department && (
                                    <span className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded bg-[#2A2A2A] border border-[#3A3A3A]">
                                      {employeeMeta.department}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Requested Email & Verification Badge */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-mono text-xs font-medium tracking-wide ${isEmployee ? 'text-gray-200' : 'text-red-300'}`}>
                                  {reqEmail}
                                </span>

                                {isEmployee ? (
                                  <span
                                    title="Verified in Employee Directory"
                                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 inline-flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    Verified
                                  </span>
                                ) : (
                                  <span
                                    title="Email not found in Employee Directory"
                                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/10 border border-red-500/30 text-red-400 inline-flex items-center gap-1"
                                  >
                                    <TriangleAlert className="w-3 h-3 text-red-400" />
                                    Unregistered
                                  </span>
                                )}
                              </div>

                              {!isEmployee && (
                                <p className="text-[11px] text-red-400/80 font-sans">
                                  Warning: Requester not found in staff roster.
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Column 2: App / Origin */}
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#252525] border border-[#3A3A3A] text-gray-200 text-xs font-medium">
                              <AppWindow className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span>{req.appName || 'Solarithm App Launcher'}</span>
                            </div>
                          </td>

                          {/* Column 3: Reason & Details */}
                          <td className="p-3.5 text-gray-300 text-xs max-w-[260px]">
                            <p className="line-clamp-2 leading-relaxed" title={req.reason || 'Password reset requested via App Launcher'}>
                              {req.reason || 'Password reset requested via App Launcher'}
                            </p>
                            {req.tempPassword && (
                              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                                <span>Temp Pass: {req.tempPassword}</span>
                              </div>
                            )}
                          </td>

                          {/* Column 4: Submitted */}
                          <td className="p-3.5 text-gray-400 text-xs font-mono whitespace-nowrap">
                            {formatTimestamp(req.timestamp || req.createdAt)}
                          </td>

                          {/* Column 5: Status Badge (Accurately renders Awaiting Approval on lowercase pending) */}
                          <td className="p-3.5 whitespace-nowrap">
                            {isPending && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5">
                                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                Awaiting Approval
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                Approved
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-500/15 border border-rose-500/30 text-rose-400">
                                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                Rejected
                              </span>
                            )}
                            {!isPending && !isApproved && !isRejected && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-gray-500/15 border border-gray-500/30 text-gray-400">
                                {req.status}
                              </span>
                            )}
                          </td>

                          {/* Column 6: Actions */}
                          <td className="p-3.5 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {isPending ? (
                                <>
                                  <button
                                    onClick={() => handleApprovePasswordReset(req)}
                                    disabled={isActioning}
                                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Approve password reset request and generate credentials"
                                  >
                                    {isActioning ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" />
                                    )}
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectPasswordReset(req)}
                                    disabled={isActioning}
                                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Reject password reset request"
                                  >
                                    {isActioning ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <X className="w-3.5 h-3.5" />
                                    )}
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 font-mono">
                                  {req.resolvedBy ? `By ${req.resolvedBy}` : 'Completed'}
                                </span>
                              )}
                              <button
                                onClick={() => handleDelete(req.id, req.collectionName || 'approvals', reqEmail)}
                                disabled={isActioning}
                                className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Delete Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* Client Approve Modal: Assign Pricing Category */}
      {clientToApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Approve Client & Assign Category
              </h3>
              <button
                onClick={() => setClientToApprove(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-[#2A2A2A] border border-[#2A2A2A] rounded-xl space-y-1 text-sm font-mono">
              <div className="text-white font-bold text-base text-amber-400">
                {clientToApprove.companyName}
              </div>
              <div className="text-gray-400">Contact: {clientToApprove.contactPerson} ({clientToApprove.city})</div>
              {clientToApprove.proposalNumber && (
                <div className="text-emerald-400 text-sm pt-1 flex items-center gap-1">
                  <Briefcase className="w-3 h-3" /> Linked Proposal: {clientToApprove.proposalNumber}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider">
                Assign Pricing Category
              </label>
              <select
                value={assignedCategory}
                onChange={(e) => setAssignedCategory(e.target.value as PricingCategory)}
                className="w-full px-3.5 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-xl text-sm text-amber-400 focus:outline-none font-mono"
              >
                {DEFAULT_PRICING_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Captured automatically from proposal mapping if proposal number is registered.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setClientToApprove(null)}
                className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-gray-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproveClient}
                disabled={approvingClient}
                className="px-5 py-2 bg-emerald-500/10 hover:bg-emerald-500/10 text-white font-semibold text-sm rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                {approvingClient ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: View Approved Temporary Password */}
      {resolvedPasswordModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Password Reset Approved
              </h3>
              <button
                onClick={() => setResolvedPasswordModal({ isOpen: false, email: '' })}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#2A2A2A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-300">
              A temporary password has been generated for <strong className="text-white">{resolvedPasswordModal.email}</strong>.
            </p>

            <div className="p-4 bg-[#2A2A2A] border border-[#333333] rounded-xl flex items-center justify-between gap-3">
              <span className="font-mono text-base font-bold text-amber-400 tracking-wider">
                {resolvedPasswordModal.tempPassword}
              </span>
              <button
                onClick={() => {
                  if (resolvedPasswordModal.tempPassword) {
                    navigator.clipboard.writeText(resolvedPasswordModal.tempPassword);
                    setResolvedPasswordModal(prev => ({ ...prev, copied: true }));
                    setTimeout(() => setResolvedPasswordModal(prev => ({ ...prev, copied: false })), 2500);
                  }
                }}
                className="px-3 py-1.5 bg-[#1E1E1E] hover:bg-[#333333] border border-[#444444] rounded-lg text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {resolvedPasswordModal.copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Provide this temporary password to the user. They will be prompted to update their password upon sign-in.
            </p>

            <div className="pt-2 flex justify-end border-t border-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setResolvedPasswordModal({ isOpen: false, email: '' })}
                className="px-5 py-2 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-bold text-sm rounded-lg cursor-pointer transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        onClose={() => setDeleteModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={executeDelete}
        title="Delete Record"
        message={
          deleteModalState.label
            ? `Are you sure you want to permanently delete "${deleteModalState.label}"? This action cannot be undone.`
            : 'Are you sure you want to permanently delete this record? This action cannot be undone.'
        }
        confirmText="Delete Record"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
