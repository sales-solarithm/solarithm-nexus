'use client';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";
import { ConfirmModal } from './ConfirmModal';
import ApproveClientModal from './ApproveClientModal';
import { provisionUserRecord, syncUserDocumentOnLogin, ensureOwnerDocumentExists } from '@/lib/userService';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  XCircle,
  Eye,
  Layers,
  DollarSign,
  AlertTriangle,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { 
  db, 
  auth,
  SUPER_ADMIN_EMAILS, 
  UserRole, 
  ClientDocument, 
  DesignDocument, 
  ProposalDocument, 
  PricingCategory, 
  PasswordResetRequestDocument,
  DEFAULT_PRICING_CATEGORIES, 
  handleFirestoreError, 
  OperationType,
  isOwnerEmail
} from '@/lib/firebase';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc, 
  deleteDoc,
  setDoc, 
  updateDoc, 
  addDoc,
  writeBatch,
  query, 
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import ProjectInspectionModal from './ProjectInspectionModal';
import RejectChangeRequestModal from './RejectChangeRequestModal';
import DesignerSelect from './DesignerSelect';
import ProjectEntryModal from './ProjectEntryModal';
import { 
  DesignerProfile, 
  assignDesignerToProject, 
  formatDesignerLabel,
  bindProjectDesignerMetadata 
} from '@/lib/designerService';

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
  status: 'pending' | 'approved' | 'rejected' | 'APPROVED' | 'REJECTED' | 'PENDING' | string;
  createdAt?: any;
  updatedAt?: any;
  resolvedAt?: any;
  rejectionReason?: string;
  rejectedBy?: string;
  approvedBy?: string;
  approverUid?: string;
  pricingRecalculationTriggered?: boolean;

  // Enriched live project metadata
  projectName?: string;
  clientName?: string;
  clientId?: string;
  clientContact?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientCity?: string;
  plantCapacity?: string;
  capacityUnit?: string;
  projectDate?: string;
  designerEmail?: string;
  designerName?: string;
  scopeOfWork?: string;
  subService?: string;
  pricingCategory?: string;
  contractValue?: number | string;
  designerFee?: number | string;
  salesCommission?: number | string;
  projectStatus?: string;
  rawProject?: any;
}

function generateSecureTempPassword(): string {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return 'Sol@' + array[0].toString(36).substring(0, 5).toUpperCase() + '!';
  }
  return 'Sol@' + Date.now().toString(36).slice(-5).toUpperCase() + '!';
}

// Helper to parse Firestore Timestamp / seconds / string / Date to milliseconds for sorting
function parseTimestampToMs(val: any): number {
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
}

// Format timestamp helper: handles Firestore Timestamp, seconds, ISO string, and Date
function formatTimestamp(val: any): string {
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
}

// Pure helper to enrich ChangeRequestDocuments synchronously with cached project metadata and staff directory
function enrichChangeRequestList(
  requests: ChangeRequestDocument[],
  cache: Map<string, any>,
  empDir: Record<string, { name?: string; department?: string; employeeId?: string; role?: string }>
): ChangeRequestDocument[] {
  if (!Array.isArray(requests)) return [];
  const safeEmpDir = empDir || {};
  return requests.map((req) => {
    if (!req) return {} as ChangeRequestDocument;
    let projectData: any = null;
    if (req.projectId && cache.has(req.projectId)) {
      const c = cache.get(req.projectId);
      if (c && !c._isFetching && !c._isNotFound) projectData = c;
    } else if (req.projectNumber && cache.has(`num:${req.projectNumber}`)) {
      const c = cache.get(`num:${req.projectNumber}`);
      if (c && !c._isFetching && !c._isNotFound) projectData = c;
    }

    const projectName =
      projectData?.projectName ||
      projectData?.name ||
      projectData?.title ||
      req.projectName ||
      (projectData?.clientName ? `${projectData.clientName} Solar Plant` : (req.projectNumber ? `Project ${req.projectNumber}` : 'Unnamed Project'));

    const clientName =
      projectData?.clientName ||
      projectData?.companyName ||
      projectData?.client ||
      req.clientName ||
      'Unspecified Client';

    const plantCapacity = projectData?.plantCapacity
      ? `${projectData.plantCapacity}${projectData.capacityUnit ? ' ' + projectData.capacityUnit : ' kWp'}`
      : projectData?.capacity
      ? `${projectData.capacity} kWp`
      : req.plantCapacity || 'N/A';

    const rawDate =
      projectData?.projectDate ||
      projectData?.createdAt ||
      projectData?.date ||
      projectData?.startDate;
    const projectDate = formatTimestamp(rawDate);

    const designerEmail = projectData?.designerEmail || projectData?.designer || '';
    let designerName = projectData?.designerName || '';
    if (!designerName && designerEmail) {
      const emp = safeEmpDir[designerEmail.toLowerCase()];
      designerName = emp?.name || designerEmail;
    }

    const contractValue =
      projectData?.contractValue ??
      projectData?.totalAmount ??
      projectData?.pricing ??
      projectData?.totalCost ??
      null;
    const designerFee =
      projectData?.designerFee ??
      projectData?.designerCommission ??
      null;
    const salesCommission =
      projectData?.salesCommission ??
      projectData?.salesFee ??
      null;

    return {
      ...req,
      projectId: projectData?.id || req.projectId,
      projectName,
      clientName,
      clientId: projectData?.clientId,
      clientContact: projectData?.contactPerson,
      clientEmail: projectData?.clientEmail || projectData?.email,
      clientPhone: projectData?.clientPhone || projectData?.phone,
      clientCity: projectData?.city || projectData?.location,
      plantCapacity,
      capacityUnit: projectData?.capacityUnit || 'kWp',
      projectDate,
      designerEmail,
      designerName: designerName || 'Unassigned',
      scopeOfWork: projectData?.scopeOfWork || projectData?.scope || 'N/A',
      subService: projectData?.subService || 'N/A',
      pricingCategory: projectData?.pricingCategory || 'N/A',
      contractValue,
      designerFee,
      salesCommission,
      projectStatus: projectData?.status || 'N/A',
      rawProject: projectData || null
    };
  });
}

export default function ApprovalsTab({ currentEmail, currentRole }: ApprovalsTabProps) {
  const normEmail = (currentEmail || '').trim().toLowerCase();
  const normRole = (currentRole || '').trim().toLowerCase();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(normEmail) || isOwnerEmail(normEmail) || normEmail === 'jayjalpa2002@gmail.com' || normEmail === 'jay.solarithm@gmail.com';
  const canManageApprovals = isSuperAdmin || normRole === 'owner' || normRole === 'admin';

  // Sub-tab selection: COLLECTIONS.CLIENTS | 'designs' | 'passwords'
  const [subTab, setSubTab] = useState<typeof COLLECTIONS.CLIENTS | 'designs' | 'passwords'>(COLLECTIONS.CLIENTS);

  // Client approvals state
  const [pendingClients, setPendingClients] = useState<ClientDocument[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  // Design approvals state
  const [pendingDesigns, setPendingDesigns] = useState<DesignDocument[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(true);

  // DIRECTIVE 1: Projects Directory Designer Filter & Project Assignment
  const [selectedDesignerFilter, setSelectedDesignerFilter] = useState<string>('ALL');
  const [isProjectEntryModalOpen, setIsProjectEntryModalOpen] = useState(false);
  const [reassigningDesign, setReassigningDesign] = useState<DesignDocument | null>(null);
  const [reassignDesignerTarget, setReassignDesignerTarget] = useState<DesignerProfile | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  // Change requests state
  const [pendingChangeRequests, setPendingChangeRequests] = useState<ChangeRequestDocument[]>([]);
  const [loadingChangeRequests, setLoadingChangeRequests] = useState(true);

  // Proposals lookup for auto-capturing pricing category
  const [proposalsMap, setProposalsMap] = useState<Record<string, PricingCategory>>({});

  // Applications lookup state
  const [appsMap, setAppsMap] = useState<Record<string, { name?: string; id?: string }>>({});
  const [, setLoadingApps] = useState(false);

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
  const [actioningChangeId, setActioningChangeId] = useState<string | null>(null);

  // Inspection and Rejection modals for Pending Field Change Requests
  const [inspectingRequest, setInspectingRequest] = useState<ChangeRequestDocument | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<ChangeRequestDocument | null>(null);

  // Stable refs to eliminate re-render loops and cache metadata across renders
  const projectMetadataCacheRef = useRef<Map<string, any>>(new Map());
  const employeeDirectoryRef = useRef<Record<string, { name?: string; department?: string; employeeId?: string; role?: string }>>({});
  const rawChangeRequestsRef = useRef<ChangeRequestDocument[]>([]);
  const isFetchingProjectsRef = useRef<boolean>(false);

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
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          list.push({
            ...(data as ClientDocument),
            id: docSnap.id,
            companyName: data.companyName || data.name || 'Unnamed Client',
            contactPerson: data.contactPerson || 'N/A',
            city: data.city || 'N/A',
            gstin: data.gstin || 'N/A',
            submittedBy: data.submittedBy || 'N/A'
          });
        });
      }
      setPendingClients(list);
    } catch (err) {
      console.warn('Graceful fallback: error loading pending clients:', err);
      setPendingClients([]);
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
      const list: DesignDocument[] = [];
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const capUnit = data.capacityUnit || 'KW';
          const plantCapacity = data.plantCapacity !== undefined && data.plantCapacity !== null
            ? `${data.plantCapacity} ${capUnit}`
            : (data.capacity !== undefined && data.capacity !== null ? `${data.capacity} ${capUnit}` : 'N/A');

          list.push({ 
            ...(data as DesignDocument), 
            id: docSnap.id,
            projectName: data.projectName || data.srNumber || data.clientName || 'Unknown Project',
            projectId: data.srNumber || data.projectNumber || docSnap.id,
            clientName: data.clientName || data.companyName || 'Unspecified Client',
            scopeOfWork: data.scopeOfWork || data.scope || 'N/A',
            plantCapacity,
            designerEmail: data.designerEmail || data.designer || 'Unassigned'
          });
        });
      }
      setPendingDesigns(list);
    } catch (err) {
      console.warn('Graceful fallback: error loading pending designs:', err);
      setPendingDesigns([]);
    } finally {
      setLoadingDesigns(false);
    }
  }, []);

  // Load proposals lookup to auto capture category
  const loadProposalsMap = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.PROPOSALS));
      const map: Record<string, PricingCategory> = {};
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          if (!docSnap) return;
          const data = (docSnap.data() || {}) as ProposalDocument;
          const propNum = data?.proposalNumber || (data as any)?.id || docSnap.id;
          const propCat = data?.pricingCategory || (data as any)?.category;
          if (propNum && propCat) {
            map[String(propNum).trim().toUpperCase()] = propCat as PricingCategory;
          }
        });
      }
      setProposalsMap(map);
    } catch (err) {
      console.warn('Graceful fallback: error loading proposals map:', err);
      setProposalsMap({});
    }
  }, []);

  // Load apps lookup to display canonical app names
  const loadAppsMap = useCallback(async () => {
    setLoadingApps(true);
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.APPS || 'apps'));
      const map: Record<string, { name?: string; id?: string }> = {};
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          if (!docSnap) return;
          const data = docSnap.data() || {};
          const id = docSnap.id;
          if (!id) return;
          const name = data.name || data.title || data.appName || id;
          map[id] = { name, id };
          if (data.appId) map[String(data.appId)] = { name, id };
        });
      }
      setAppsMap(map);
    } catch (err) {
      console.warn('Graceful fallback: error loading apps collection:', err);
      setAppsMap({});
    } finally {
      setLoadingApps(false);
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
        if (empSnap && !empSnap.empty) {
          empSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            if (data.email) {
              const norm = String(data.email).trim().toLowerCase();
              emailSet.add(norm);
              dirMap[norm] = {
                name: data.name || '',
                department: data.department || '',
                employeeId: data.employeeId || docSnap.id,
                role: data.role || ''
              };
            }
          });
        }
      } catch (err) {
        console.warn('Warning querying employees collection:', err);
      }

      // Secondary: 'users' collection to ensure comprehensive directory coverage
      try {
        const userSnap = await getDocs(collection(db, COLLECTIONS.USERS || 'users'));
        if (userSnap && !userSnap.empty) {
          userSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            if (data.email) {
              const norm = String(data.email).trim().toLowerCase();
              emailSet.add(norm);
              if (!dirMap[norm]) {
                dirMap[norm] = {
                  name: data.name || '',
                  department: data.department || '',
                  employeeId: data.employeeId || docSnap.id,
                  role: data.assignedRole || data.role || ''
                };
              }
            }
          });
        }
      } catch (err) {
        console.warn('Warning querying users collection for employees:', err);
      }

      employeeDirectoryRef.current = dirMap;
      setEmployeeEmails(emailSet);
      setEmployeeDirectory(dirMap);

      // Re-enrich raw change requests with newly loaded staff directory if already present
      if (rawChangeRequestsRef.current && rawChangeRequestsRef.current.length > 0) {
        setPendingChangeRequests(
          enrichChangeRequestList(
            rawChangeRequestsRef.current,
            projectMetadataCacheRef.current,
            dirMap
          )
        );
      }
    } catch (err) {
      console.warn('Graceful fallback: error loading employee directory:', err);
      setEmployeeEmails(new Set());
      setEmployeeDirectory({});
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Resolve employee full name and email for change requests
  const getRequesterDetails = useCallback((requestedBy: string) => {
    if (!requestedBy) return { name: 'Unknown Requester', email: '' };
    const emailNorm = requestedBy.trim().toLowerCase();
    const emp = employeeDirectory[emailNorm];
    if (emp?.name && emp.name.trim()) {
      return { name: emp.name.trim(), email: requestedBy };
    }
    if (requestedBy.includes('@')) {
      const username = requestedBy.split('@')[0].replace(/[._-]/g, ' ');
      const formatted = username
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return { name: formatted, email: requestedBy };
    }
    return { name: requestedBy, email: '' };
  }, [employeeDirectory]);

  // DIRECTIVE 2: Decoupled background fetch for un-cached project documents
  const fetchMissingProjects = useCallback(async (requests: ChangeRequestDocument[]) => {
    if (isFetchingProjectsRef.current) return;
    const cache = projectMetadataCacheRef.current;

    const toFetch: { projectId?: string; projectNumber?: string }[] = [];
    const seen = new Set<string>();

    for (const req of requests) {
      const idKey = req.projectId;
      const numKey = req.projectNumber ? `num:${req.projectNumber}` : null;
      const hasId = idKey && cache.has(idKey);
      const hasNum = numKey && cache.has(numKey);

      if (!hasId && !hasNum) {
        const key = idKey || numKey;
        if (key && !seen.has(key)) {
          seen.add(key);
          // Pre-mark as fetching immediately so no duplicate fetch occurs
          if (idKey) cache.set(idKey, { _isFetching: true });
          if (numKey) cache.set(numKey, { _isFetching: true });
          toFetch.push({ projectId: req.projectId, projectNumber: req.projectNumber });
        }
      }
    }

    if (toFetch.length === 0) return;

    isFetchingProjectsRef.current = true;
    let hasNewData = false;

    try {
      await Promise.allSettled(
        toFetch.map(async (item) => {
          try {
            let pData: any = null;
            if (item.projectId) {
              const pDoc = await getDoc(doc(db, COLLECTIONS.PROJECTS, item.projectId));
              if (pDoc.exists()) {
                pData = { id: pDoc.id, ...pDoc.data() };
              }
            }

            if (!pData && item.projectNumber) {
              const qNum = query(
                collection(db, COLLECTIONS.PROJECTS),
                where('projectNumber', '==', item.projectNumber)
              );
              const qSnap = await getDocs(qNum);
              if (!qSnap.empty) {
                const d = qSnap.docs[0];
                pData = { id: d.id, ...d.data() };
              } else {
                const qSr = query(
                  collection(db, COLLECTIONS.PROJECTS),
                  where('srNumber', '==', item.projectNumber)
                );
                const qSrSnap = await getDocs(qSr);
                if (!qSrSnap.empty) {
                  const d = qSrSnap.docs[0];
                  pData = { id: d.id, ...d.data() };
                }
              }
            }

            if (pData) {
              if (item.projectId) cache.set(item.projectId, pData);
              if (item.projectNumber) cache.set(`num:${item.projectNumber}`, pData);
              if (pData.id) cache.set(pData.id, pData);
              if (pData.projectNumber) cache.set(`num:${pData.projectNumber}`, pData);
              hasNewData = true;
            } else {
              // Cache notFound sentinel so we NEVER repeatedly query Firestore for non-existent records
              const notFound = { _isNotFound: true };
              if (item.projectId) cache.set(item.projectId, notFound);
              if (item.projectNumber) cache.set(`num:${item.projectNumber}`, notFound);
            }
          } catch (err) {
            console.warn('Background project fetch error:', item, err);
          }
        })
      );

      if (hasNewData) {
        // Silently re-enrich state in background with zero flicker and NO loading state toggle
        setPendingChangeRequests(() => {
          return enrichChangeRequestList(
            rawChangeRequestsRef.current,
            cache,
            employeeDirectoryRef.current
          );
        });
      }
    } finally {
      isFetchingProjectsRef.current = false;
    }
  }, []);

  // DIRECTIVE 1 & 4: Dedicated real-time listener for Change Requests active ONLY on 'designs' sub-tab
  useEffect(() => {
    if (!canManageApprovals || subTab !== 'designs') return;

    const crColl = collection(db, COLLECTIONS.CHANGE_REQUESTS);
    const unsubChangeRequests = onSnapshot(
      crColl,
      (snap) => {
        const rawList: ChangeRequestDocument[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const rawStatus = String(data.status || 'pending').trim().toLowerCase();
          if (rawStatus === 'pending') {
            rawList.push({
              ...(data as ChangeRequestDocument),
              id: docSnap.id,
              status: 'pending'
            });
          }
        });

        rawList.sort((a, b) => {
          const timeA = parseTimestampToMs(a.createdAt);
          const timeB = parseTimestampToMs(b.createdAt);
          return timeB - timeA;
        });

        rawChangeRequestsRef.current = rawList;

        // Synchronously enrich from cache so table renders immediately with 0 flicker
        const enriched = enrichChangeRequestList(
          rawList,
          projectMetadataCacheRef.current,
          employeeDirectoryRef.current
        );
        setPendingChangeRequests(enriched);
        setLoadingChangeRequests(false);

        // Fetch any un-cached projects in background without blocking UI
        fetchMissingProjects(rawList);
      },
      (error: any) => {
        console.warn('Change requests snapshot error:', error);
        setLoadingChangeRequests(false);
        const code = error?.code || '';
        if (code === 'resource-exhausted' || code.includes('resource-exhausted')) {
          setErrorMsg('Firestore quota exceeded. System is operating in cached read-only mode.');
        } else if (code === 'permission-denied' || code.includes('permission-denied')) {
          setErrorMsg('Permission denied accessing change requests. Please verify administrator credentials.');
        } else {
          setErrorMsg(error?.message || 'Failed to sync change requests.');
        }
      }
    );

    return () => {
      unsubChangeRequests();
    };
  }, [canManageApprovals, subTab, fetchMissingProjects, loadPendingDesigns]);

  // Fallback / manual refresh for Change Requests
  const loadPendingChangeRequests = useCallback(async () => {
    setLoadingChangeRequests(true);
    try {
      const crColl = collection(db, COLLECTIONS.CHANGE_REQUESTS);
      const snap = await getDocs(crColl);
      const rawList: ChangeRequestDocument[] = [];
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const rawStatus = String(data.status || 'pending').trim().toLowerCase();
          if (rawStatus === 'pending') {
            rawList.push({
              ...(data as ChangeRequestDocument),
              id: docSnap.id,
              status: 'pending'
            });
          }
        });
      }

      rawList.sort((a, b) => {
        const timeA = parseTimestampToMs(a?.createdAt);
        const timeB = parseTimestampToMs(b?.createdAt);
        return timeB - timeA;
      });

      rawChangeRequestsRef.current = rawList;

      setPendingChangeRequests(
        enrichChangeRequestList(
          rawList,
          projectMetadataCacheRef.current,
          employeeDirectoryRef.current
        )
      );
      fetchMissingProjects(rawList);
    } catch (err) {
      console.warn('Graceful fallback: error loading pending change requests:', err);
      setPendingChangeRequests([]);
    } finally {
      setLoadingChangeRequests(false);
    }
  }, [fetchMissingProjects]);

  // Helper to map an approvals Firestore document specifically for PASSWORD_RESET_REQUEST
  const mapPasswordResetDoc = (docSnap: any): PasswordResetRequestDocument => {
    const data = docSnap.data() || {};
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

  // DIRECTIVE 1 & 4: Dedicated real-time listener for Password Requests active ONLY on 'passwords' sub-tab
  useEffect(() => {
    if (!canManageApprovals || subTab !== 'passwords') {
      return;
    }

    const approvalsQuery = query(
      collection(db, 'approvals'),
      where('type', '==', 'PASSWORD_RESET_REQUEST')
    );

    const unsubPasswordRequests = onSnapshot(
      approvalsQuery,
      (snap) => {
        const list: PasswordResetRequestDocument[] = [];
        if (snap && !snap.empty) {
          snap.forEach((docSnap) => {
            list.push(mapPasswordResetDoc(docSnap));
          });
        }

        // Sort newest first by timestamp
        list.sort((a, b) => {
          const timeA = parseTimestampToMs(a?.timestamp || a?.createdAt);
          const timeB = parseTimestampToMs(b?.timestamp || b?.createdAt);
          return timeB - timeA;
        });

        setPasswordRequests(list);
        setLoadingPasswordRequests(false);
      },
      (error) => {
        console.warn('Snapshot listener caught:', error);
        setLoadingPasswordRequests(false);
      }
    );

    return () => {
      unsubPasswordRequests();
    };
  }, [canManageApprovals, subTab]);

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
      if (snap && !snap.empty) {
        snap.forEach((docSnap) => {
          list.push(mapPasswordResetDoc(docSnap));
        });
      }

      list.sort((a, b) => {
        const timeA = parseTimestampToMs(a?.timestamp || a?.createdAt);
        const timeB = parseTimestampToMs(b?.timestamp || b?.createdAt);
        return timeB - timeA;
      });

      setPasswordRequests(list);
    } catch (err) {
      console.warn('Graceful fallback: error loading password reset requests:', err);
      setPasswordRequests([]);
    } finally {
      setLoadingPasswordRequests(false);
    }
  }, []);

  // DIRECTIVE 1: Master initial fetch hook runs strictly once per authorization status on mount to populate all badge counts
  useEffect(() => {
    if (!canManageApprovals) return;
    let isMounted = true;

    const initializeApprovals = async () => {
      try {
        // Pre-verify owner document for jayjalpa2002@gmail.com (UID: oIZpuLeftqaj3j5KS9ZIvurklEE2)
        await ensureOwnerDocumentExists().catch((e) => console.warn('Owner pre-verification caught:', e));

        if (auth.currentUser) {
          const isOwner = isOwnerEmail(auth.currentUser.email || '') || auth.currentUser.uid === 'oIZpuLeftqaj3j5KS9ZIvurklEE2';
          syncUserDocumentOnLogin({
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            displayName: auth.currentUser.displayName,
            role: isOwner ? 'owner' : (normRole || undefined)
          }).catch((err) => console.warn('syncUserDocumentOnLogin notice:', err));
        } else if (normEmail && (normEmail === 'jayjalpa2002@gmail.com' || normEmail === 'jay.solarithm@gmail.com')) {
          syncUserDocumentOnLogin({
            uid: 'oIZpuLeftqaj3j5KS9ZIvurklEE2',
            email: normEmail,
            role: 'owner'
          }).catch((err) => console.warn('syncUserDocumentOnLogin notice:', err));
        }

        await Promise.allSettled([
          loadEmployeeDirectory(),
          loadAppsMap(),
          loadProposalsMap(),
          loadPendingClients(),
          loadPendingDesigns(),
          loadPendingPasswordRequests(),
          loadPendingChangeRequests()
        ]);
      } catch (err) {
        console.warn('Initial approvals fetch error caught:', err);
      }
    };

    initializeApprovals();
    return () => {
      isMounted = false;
    };
  }, [
    canManageApprovals,
    normEmail,
    normRole,
    loadEmployeeDirectory,
    loadAppsMap,
    loadPendingClients,
    loadPendingDesigns,
    loadProposalsMap,
    loadPendingPasswordRequests,
    loadPendingChangeRequests
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

          // IF the email DOES NOT exist: Automatically create a new canonical document in users and employees
          if (!employeeExists) {
            await provisionUserRecord({
              email: targetEmail,
              name: '',
              department: '',
              phone: '',
              role: 'employee',
              employeeId: '',
              designation: '',
              status: 'ACTIVE'
            });
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

  // DIRECTIVE 4: Rejection Handler (Prompt for optional rejection reason, mark request REJECTED without modifying project)
  const handleConfirmRejectChange = async (requestId: string, reason: string) => {
    if (!requestId) return;
    setActioningChangeId(requestId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const requestRef = doc(db, COLLECTIONS.CHANGE_REQUESTS, requestId);
      await updateDoc(requestRef, {
        status: 'REJECTED',
        rejectionReason: reason.trim() || 'Rejected by Administrator',
        rejectedBy: currentEmail,
        rejectedByUid: auth.currentUser?.uid || null,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setPendingChangeRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRejectingRequest(null);
      if (inspectingRequest?.id === requestId) {
        setInspectingRequest(null);
      }
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

  // DIRECTIVE 4: Safe Atomic Approval Execution
  const handleApproveChange = async (request: ChangeRequestDocument) => {
    if (!request.id) return;
    setActioningChangeId(request.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // 1. Verify the target project document exists in Firestore
      let projectDocId = request.projectId;
      let projectRef: any = null;

      if (projectDocId) {
        const testRef = doc(db, COLLECTIONS.PROJECTS, projectDocId);
        const testSnap = await getDoc(testRef);
        if (testSnap.exists()) {
          projectRef = testRef;
        }
      }

      // Robust fallback: if not found by ID, query by projectNumber or srNumber
      if (!projectRef && request.projectNumber) {
        const qNum = query(
          collection(db, COLLECTIONS.PROJECTS),
          where('projectNumber', '==', request.projectNumber)
        );
        const snap = await getDocs(qNum);
        if (!snap.empty) {
          projectDocId = snap.docs[0].id;
          projectRef = doc(db, COLLECTIONS.PROJECTS, projectDocId);
        } else {
          const qSr = query(
            collection(db, COLLECTIONS.PROJECTS),
            where('srNumber', '==', request.projectNumber)
          );
          const snapSr = await getDocs(qSr);
          if (!snapSr.empty) {
            projectDocId = snapSr.docs[0].id;
            projectRef = doc(db, COLLECTIONS.PROJECTS, projectDocId);
          }
        }
      }

      if (!projectRef || !projectDocId) {
        throw new Error(
          `Target project document matching "${request.projectNumber}" was not found in Firestore. Cannot safely apply changes.`
        );
      }

      // 2. Determine if field affects pricing (Scope of Work, Plant Capacity, Sub-Service, Pricing Category)
      const fieldNormalized = (request.fieldToChange || '').toLowerCase().replace(/[^a-z]/g, '');
      const affectsPricing = [
        'scopeofwork',
        'scope',
        'plantcapacity',
        'capacity',
        'capacityunit',
        'subservice',
        'pricingcategory',
        'tier'
      ].includes(fieldNormalized);

      // 3. Atomically apply the requested field value directly to project and update request status
      const batch = writeBatch(db);

      const projectUpdates: Record<string, any> = {
        [request.fieldToChange]: request.requestedValue,
        updatedAt: serverTimestamp(),
        lastModifiedBy: currentEmail || auth.currentUser?.email || 'admin'
      };

      if (affectsPricing) {
        projectUpdates.pricingRecalculationNeeded = true;
        projectUpdates.recalculateBillingAndCommissions = true;
        projectUpdates.pricingStatus = 'NEEDS_RECALCULATION';
        projectUpdates.lastPricingTriggerReason = `Field change approved: ${request.fieldToChange} updated from "${request.currentValue || ''}" to "${request.requestedValue}"`;
        projectUpdates.lastPricingTriggerAt = serverTimestamp();
      }

      batch.update(projectRef, projectUpdates);

      const requestRef = doc(db, COLLECTIONS.CHANGE_REQUESTS, request.id);
      batch.update(requestRef, {
        status: 'APPROVED',
        approvedBy: currentEmail || auth.currentUser?.email || 'admin',
        approverUid: auth.currentUser?.uid || null,
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pricingRecalculationTriggered: affectsPricing
      });

      await batch.commit();

      setSuccessMsg(
        `Change request approved. Project field "${request.fieldToChange}" updated successfully.${
          affectsPricing ? ' Recalculation for billing and commissions has been flagged.' : ''
        }`
      );

      // Filter local state array to remove the request from the screen upon success
      setPendingChangeRequests((prev) => prev.filter((r) => r.id !== request.id));
      if (inspectingRequest?.id === request.id) {
        setInspectingRequest(null);
      }
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Error approving change request:', err);
      const errInfo = handleFirestoreError(err, OperationType.UPDATE, `changeRequests/${request.id}`);
      const code = err?.code || '';
      if (code === 'resource-exhausted' || code.includes('resource-exhausted')) {
        setErrorMsg('Firestore write quota exceeded. Please wait a moment before approving change requests.');
      } else if (code === 'permission-denied' || code.includes('permission-denied')) {
        setErrorMsg('Permission denied. You do not have authorization to approve change requests on this project.');
      } else {
        setErrorMsg(errInfo?.error || err?.message || 'Failed to approve change request.');
      }
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

  const handleReassignDesigner = async () => {
    if (!reassigningDesign || !reassignDesignerTarget || !reassigningDesign.id) return;
    setIsReassigning(true);
    try {
      const binding = await assignDesignerToProject(reassigningDesign.id, reassignDesignerTarget);
      setSuccessMsg(
        `Project successfully assigned to ${binding.designerName} (${binding.designerId}). Work email: ${binding.designerEmail}`
      );
      setReassigningDesign(null);
      setReassignDesignerTarget(null);
      await loadPendingDesigns();
    } catch (err: any) {
      console.error('Failed to reassign designer:', err);
      setErrorMsg(err.message || 'Failed to assign project designer.');
    } finally {
      setIsReassigning(false);
    }
  };

  const filteredDesigns = pendingDesigns.filter((d) => {
    if (!d) return false;
    const q = searchQuery.toLowerCase();
    const dEmail = (d.designerEmail || d.designer || '').toLowerCase();
    const dId = (d.designerId || '').toUpperCase();
    const dName = (d.designerName || '').toLowerCase();

    const matchesQuery =
      (d.projectName || '').toLowerCase().includes(q) ||
      (d.clientName || '').toLowerCase().includes(q) ||
      dEmail.includes(q) ||
      dName.includes(q) ||
      dId.includes(q.toUpperCase()) ||
      (d.plantCapacity || '').toLowerCase().includes(q) ||
      (d.projectId || '').toLowerCase().includes(q);

    if (!matchesQuery) return false;

    if (selectedDesignerFilter && selectedDesignerFilter !== 'ALL') {
      const filterKey = selectedDesignerFilter.toLowerCase();
      const filterKeyUpper = selectedDesignerFilter.toUpperCase();

      const matchesFilter =
        dEmail === filterKey ||
        dId === filterKeyUpper ||
        dEmail.includes(filterKey) ||
        dName.includes(filterKey) ||
        (filterKey.includes('js-001') && (dId.includes('JS-001') || dName.includes('jay shah'))) ||
        (filterKey.includes('dd-002') && (dId.includes('DD-002') || dName.includes('deep davara')));

      if (!matchesFilter) return false;
    }

    return true;
  });

  const filteredChangeRequests = pendingChangeRequests.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      (r.projectNumber || '').toLowerCase().includes(q) ||
      (r.projectName || '').toLowerCase().includes(q) ||
      (r.clientName || '').toLowerCase().includes(q) ||
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
                  {filteredClients.map((client, idx) => {
                    if (!client) return null;
                    return (
                    <tr key={client.id || client.companyName || `client-${idx}`} className="hover:bg-[#2A2A2A] transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <span className="font-mono text-base tracking-wide text-amber-400">
                            {client.companyName || 'Unnamed Client'}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5 text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-500" />
                          <span>{client.contactPerson || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-500" />
                          <span>{client.city || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-gray-400 text-sm">
                        {client.gstin || 'N/A'}
                      </td>
                      <td className="p-3.5 font-mono text-gray-400 text-sm">
                        {client.submittedBy || 'N/A'}
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
                            onClick={() => handleDelete(client.id, 'clients', client.companyName || 'Client')}
                            className="p-1.5 bg-[#2A2A2A] hover:bg-rose-500/10 border border-[#333333] hover:border-rose-500/30 text-gray-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                            title="Delete Client"
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
      )}

      {/* SUB-TAB B: DESIGN APPROVALS */}
      {subTab === 'designs' && (
        <div className="space-y-8">
          {/* Section 1: Engineering Design Submissions & Projects Directory */}
          <div className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-[#2A2A2A] bg-[#2A2A2A] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#D4AF37]" />
                  Projects Directory &amp; Design Submissions ({pendingDesigns.length})
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Solar engineering projects, partner/designer task assignments, and verification
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* DIRECTIVE 1: Projects Directory Designer Filter */}
                <div className="w-56">
                  <DesignerSelect
                    value={selectedDesignerFilter}
                    filterMode={true}
                    showBadges={false}
                    onChange={(d) => setSelectedDesignerFilter(d.employeeId || d.email || d.id || 'ALL')}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsProjectEntryModalOpen(true)}
                  className="px-3.5 py-2.5 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-bold text-xs rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center gap-1.5 shadow-md shadow-[#D4AF37]/10 cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-black" />
                  <span>+ New Project Entry</span>
                </button>
              </div>
            </div>

            {loadingDesigns ? (
              <div className="p-12 text-center text-sm text-gray-400 space-y-3">
                <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="font-mono">Loading pending design submissions...</p>
              </div>
            ) : filteredDesigns.length === 0 ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p>No design submissions matching filter criteria.</p>
                {selectedDesignerFilter !== 'ALL' && (
                  <button
                    onClick={() => setSelectedDesignerFilter('ALL')}
                    className="text-[#D4AF37] underline text-xs cursor-pointer hover:text-white"
                  >
                    Clear designer filter
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-[#2A2A2A] border-b border-[#333333] text-gray-400 text-sm uppercase font-semibold tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-6">Project ID</th>
                      <th className="p-3.5">Client Name</th>
                      <th className="p-3.5">Plant Capacity</th>
                      <th className="p-3.5">Scope of Work</th>
                      <th className="p-3.5 min-w-[220px]">Assigned Designer &amp; Role</th>
                      <th className="p-3.5 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredDesigns.map((design, idx) => {
                      if (!design) return null;
                      const rawName = design.designerName || (design.designerEmail ? design.designerEmail.split('@')[0] : 'Unassigned');
                      const isPartner =
                        design.isPartnerDesigner ||
                        rawName.toLowerCase().includes('jay shah') ||
                        rawName.toLowerCase().includes('deep davara') ||
                        (design.designerEmail && isOwnerEmail(design.designerEmail));
                      const formattedLabel = isPartner
                        ? `${rawName} (Partner / Designer)`
                        : `${rawName} (Designer)`;

                      return (
                      <tr key={design.id || design.projectName || `design-${idx}`} className="hover:bg-[#2A2A2A] transition-colors">
                        <td className="p-3.5 pl-6 font-bold text-white">
                          <div className="flex items-center gap-2">
                            <Compass className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            <span className="font-mono text-base tracking-wide text-amber-400">
                              {design.projectId || design.projectName || 'Unnamed Project'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3.5 text-gray-200">{design.clientName || 'N/A'}</td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-sm font-bold">
                            <Zap className="w-3 h-3 text-[#D4AF37]" />
                            {design.plantCapacity || 'N/A'}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-gray-200 text-sm">{design.scopeOfWork || 'N/A'}</td>
                        <td className="p-3.5">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                              <span>{formattedLabel}</span>
                              {isPartner && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                  PARTNER
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 font-mono mt-0.5">
                              {design.designerEmail || 'Unassigned'}
                            </span>
                            {design.designerId && (
                              <span className="text-[11px] text-[#D4AF37] font-mono font-bold mt-0.5">
                                ID: {design.designerId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setReassigningDesign(design);
                                setReassignDesignerTarget(null);
                              }}
                              className="px-2.5 py-1.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] hover:border-[#D4AF37]/50 text-gray-200 hover:text-[#D4AF37] font-semibold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1"
                              title="Reassign Project Designer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Reassign</span>
                            </button>
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
                      );
                    })}
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
                      <th className="p-3.5 pl-6 min-w-[240px]">Project &amp; Client</th>
                      <th className="p-3.5 min-w-[180px]">Requested By</th>
                      <th className="p-3.5">Field to Change</th>
                      <th className="p-3.5">Current Value</th>
                      <th className="p-3.5">Requested Value</th>
                      <th className="p-3.5 min-w-[200px]">Reason</th>
                      <th className="p-3.5 pr-6 text-right min-w-[220px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {filteredChangeRequests.map((req, idx) => {
                      if (!req) return null;
                      const requester = getRequesterDetails(req?.requestedBy);
                      return (
                        <tr key={req.id || `cr-${req.projectNumber || idx}`} className="hover:bg-[#252525] transition-colors group">
                          {/* Column 1: Project & Client */}
                          <td className="p-3.5 pl-6">
                            <button
                              onClick={() => setInspectingRequest(req)}
                              className="text-left group/btn cursor-pointer block"
                              title="Click to view full project snapshot and details"
                            >
                              <span className="font-bold text-white group-hover/btn:text-[#D4AF37] transition-colors flex items-center gap-1.5 text-sm">
                                <span>{req.projectName || (req.projectNumber ? `Project ${req.projectNumber}` : 'Unknown Project')}</span>
                                <Eye className="w-3.5 h-3.5 text-gray-500 group-hover/btn:text-[#D4AF37] transition-colors" />
                              </span>
                              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                                <span className="font-mono bg-[#2A2A2A] px-1.5 py-0.5 rounded text-amber-400/90 border border-[#3A3A3A] font-semibold text-[11px]">
                                  {req.projectNumber || 'N/A'}
                                </span>
                                <span>•</span>
                                <span className="text-gray-300 font-medium truncate max-w-[170px]" title={req.clientName}>
                                  {req.clientName || 'N/A'}
                                </span>
                              </div>
                            </button>
                          </td>

                          {/* Column 2: Requested By */}
                          <td className="p-3.5">
                            <div>
                              <span className="font-semibold text-white text-sm block">
                                {requester.name || 'Unknown Requester'}
                              </span>
                              {requester.email && (
                                <span className="text-xs text-gray-400 font-mono block mt-0.5 truncate max-w-[180px]" title={requester.email}>
                                  {requester.email}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Column 3: Field to Change */}
                          <td className="p-3.5 text-amber-400">
                            <span className="bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded text-xs font-mono font-semibold">
                              {req.fieldToChange || 'N/A'}
                            </span>
                          </td>

                          {/* Column 4: Current Value */}
                          <td className="p-3.5 text-gray-400 line-through truncate max-w-[140px] font-mono text-sm" title={String(req.currentValue ?? '')}>
                            {req.currentValue !== undefined && req.currentValue !== null ? String(req.currentValue) : 'N/A'}
                          </td>

                          {/* Column 5: Requested Value */}
                          <td className="p-3.5 text-emerald-400 font-bold truncate max-w-[140px] font-mono text-sm" title={String(req.requestedValue ?? '')}>
                            {req.requestedValue !== undefined && req.requestedValue !== null ? String(req.requestedValue) : 'N/A'}
                          </td>

                          {/* Column 6: Reason */}
                          <td className="p-3.5 text-gray-300 text-xs leading-relaxed max-w-[220px]">
                            <p className="line-clamp-2" title={req.reason || ''}>
                              {req.reason || 'No justification provided'}
                            </p>
                          </td>

                          {/* Column 7: Actions */}
                          <td className="p-3.5 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* View Details Button */}
                              <button
                                onClick={() => setInspectingRequest(req)}
                                className="px-2.5 py-1.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] hover:border-[#D4AF37]/50 text-gray-200 hover:text-[#D4AF37] font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                title="View full project details snapshot"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Details</span>
                              </button>

                              {/* Approve Button */}
                              <button
                                onClick={() => handleApproveChange(req)}
                                disabled={!!actioningChangeId}
                                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve this change request and apply it directly to the project document"
                              >
                                {actioningChangeId === req.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                Approve
                              </button>

                              {/* Reject Button */}
                              <button
                                onClick={() => setRejectingRequest(req)}
                                disabled={!!actioningChangeId}
                                className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-semibold text-xs rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject this change request"
                              >
                                <X className="w-3.5 h-3.5" />
                                Reject
                              </button>

                              {/* Delete Button */}
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
                      );
                    })}
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
                    {filteredPasswordRequests.map((req, idx) => {
                      if (!req) return null;
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
                        <tr key={req.id || `pwd-${req.requestedEmail || idx}`} className="hover:bg-[#2A2A2A] transition-colors">
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
                              <span>{req.appName || appsMap[req.appId || '']?.name || req.appId || 'Solarithm App Launcher'}</span>
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
      <ApproveClientModal
        isOpen={!!clientToApprove}
        client={clientToApprove}
        onClose={() => setClientToApprove(null)}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          loadPendingClients();
          setTimeout(() => setSuccessMsg(null), 4000);
        }}
        currentEmail={currentEmail}
      />
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

      {/* DIRECTIVE 3: View Project Inspection Modal */}
      <ProjectInspectionModal
        isOpen={!!inspectingRequest}
        request={inspectingRequest}
        onClose={() => setInspectingRequest(null)}
        onApprove={handleApproveChange}
        onOpenReject={(req) => {
          setRejectingRequest(req);
        }}
        isActioning={!!actioningChangeId}
        requesterName={inspectingRequest ? getRequesterDetails(inspectingRequest.requestedBy).name : ''}
        requesterEmail={inspectingRequest ? getRequesterDetails(inspectingRequest.requestedBy).email : ''}
      />

      {/* DIRECTIVE 4: Rejection Reason Prompt Modal */}
      <RejectChangeRequestModal
        isOpen={!!rejectingRequest}
        request={rejectingRequest}
        onClose={() => setRejectingRequest(null)}
        onConfirmReject={handleConfirmRejectChange}
        isActioning={!!actioningChangeId}
      />

      {/* DIRECTIVE 1: Project Entry Modal with Designer & Partner Selection */}
      <ProjectEntryModal
        isOpen={isProjectEntryModalOpen}
        onClose={() => setIsProjectEntryModalOpen(false)}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          loadPendingDesigns();
        }}
        currentEmail={currentEmail}
      />

      {/* DIRECTIVE 1: Reassign Project Designer Picker Modal */}
      {reassigningDesign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-lg bg-[#1E1E1E] border border-[#333333] rounded-2xl shadow-2xl p-6 relative">
            <button
              onClick={() => {
                setReassigningDesign(null);
                setReassignDesignerTarget(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37]">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reassign Project Designer</h3>
                <p className="text-xs text-gray-400">
                  {reassigningDesign.projectId || reassigningDesign.projectName || 'Project'} • {reassigningDesign.clientName || 'Client'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Select Engineer or Active Partner
                </label>
                <DesignerSelect
                  value={reassignDesignerTarget?.employeeId || reassigningDesign.designerId || reassigningDesign.designerEmail}
                  onChange={(d) => setReassignDesignerTarget(d)}
                  placeholder="Choose designer or partner..."
                />
              </div>

              <div className="p-3 bg-[#242424] border border-[#333333] rounded-xl text-xs text-gray-400 space-y-1">
                <span className="font-semibold text-gray-300">Assignment Metadata Binding:</span>
                <p>
                  Saves official work email (@solarithmdesign.com) and canonical Employee ID (e.g. SDM-JS-001, SDM-DD-002) into the project document.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2A2A2A]">
                <button
                  type="button"
                  disabled={isReassigning}
                  onClick={() => {
                    setReassigningDesign(null);
                    setReassignDesignerTarget(null);
                  }}
                  className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-gray-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isReassigning || !reassignDesignerTarget}
                  onClick={handleReassignDesigner}
                  className="px-4 py-2 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black text-xs font-bold rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isReassigning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Saving Assignment...</span>
                    </>
                  ) : (
                    <span>Confirm Assignment</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
