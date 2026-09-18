'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserCheck,
  Users,
  CheckSquare,
  Building2,
  Blocks,
  ArrowRight,
  Clock,
  RefreshCw
} from 'lucide-react';
import { 
  db,
  SUPER_ADMIN_EMAILS, 
  UserRole 
} from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  getDocs
} from 'firebase/firestore';
import { 
  COLLECTIONS, 
  CLIENT_STATUS, 
  PROJECT_STATUS, 
  CLIENT_FIELDS, 
  PROJECT_FIELDS 
} from '@/src/config/schema';

interface ConsoleDashboardProps {
  email: string;
  role: UserRole;
  name: string;
  onNavigateTab?: (tab: string) => void;
}

interface OverviewMetrics {
  totalEmployees: number;
  pendingApprovals: number;
  totalClients: number;
  registeredApps: number;
}

function getInitialMetrics(): OverviewMetrics {
  if (typeof window !== 'undefined') {
    try {
      const cachedEmployees = JSON.parse(localStorage.getItem('employees') || '[]');
      const cachedClients = JSON.parse(localStorage.getItem('clients') || '[]');
      const cachedApps = JSON.parse(localStorage.getItem('registered_apps') || localStorage.getItem('apps') || '[]');
      const cachedApprovals = JSON.parse(localStorage.getItem('pending_approvals') || '[]');

      return {
        totalEmployees: Array.isArray(cachedEmployees) ? cachedEmployees.length : 0,
        totalClients: Array.isArray(cachedClients) 
          ? cachedClients.filter((c: any) => c.status !== 'rejected').length 
          : 0,
        registeredApps: Array.isArray(cachedApps)
          ? cachedApps.filter((a: any) => (a.status || 'active') === 'active').length
          : 0,
        pendingApprovals: Array.isArray(cachedApprovals) ? cachedApprovals.length : 0
      };
    } catch (err) {
      console.warn('Error reading cached metrics from localStorage:', err);
    }
  }
  return {
    totalEmployees: 0,
    pendingApprovals: 0,
    totalClients: 0,
    registeredApps: 0,
  };
}

export default function ConsoleDashboard({ email, role, name, onNavigateTab }: ConsoleDashboardProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());

  const [metrics, setMetrics] = useState<OverviewMetrics>(getInitialMetrics);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamic data listener binding Firestore collections with fallback to localStorage
  useEffect(() => {
    let unsubUsers: (() => void) | null = null;
    let unsubEmployees: (() => void) | null = null;
    let unsubClients: (() => void) | null = null;
    let unsubProjects: (() => void) | null = null;
    let unsubChangeRequests: (() => void) | null = null;
    let unsubApps: (() => void) | null = null;
    let unsubApprovals: (() => void) | null = null;

    let pendingClientsCount = 0;
    let pendingProjectsCount = 0;
    let pendingChangeRequestsCount = 0;
    let pendingPasswordsCount = 0;

    const updatePendingApprovals = () => {
      const totalPending = pendingClientsCount + pendingProjectsCount + pendingChangeRequestsCount + pendingPasswordsCount;
      setMetrics(prev => ({ ...prev, pendingApprovals: totalPending }));
    };

    try {
      // 1. Total Employees: Count unique personnel across USERS and EMPLOYEES collections
      const userDocMap = new Map<string, string>();
      const empDocMap = new Map<string, string>();

      const syncEmployeeMetrics = () => {
        const uniqueKeys = new Set<string>();
        userDocMap.forEach((email, id) => uniqueKeys.add(email || id));
        empDocMap.forEach((email, id) => uniqueKeys.add(email || id));
        setMetrics(prev => ({ ...prev, totalEmployees: uniqueKeys.size }));
      };

      const usersQuery = query(collection(db, COLLECTIONS.USERS));
      unsubUsers = onSnapshot(usersQuery, (snap) => {
        userDocMap.clear();
        snap.forEach(d => {
          const email = (d.data().email || '').trim().toLowerCase();
          userDocMap.set(d.id, email);
        });
        syncEmployeeMetrics();
      }, (err) => {
        console.warn('Users onSnapshot error, attempting fallback getDocs:', err);
      });

      const empQuery = query(collection(db, COLLECTIONS.EMPLOYEES || 'employees'));
      unsubEmployees = onSnapshot(empQuery, (snap) => {
        empDocMap.clear();
        snap.forEach(d => {
          const email = (d.data().email || '').trim().toLowerCase();
          empDocMap.set(d.id, email);
        });
        syncEmployeeMetrics();
      }, (err) => {
        console.warn('Employees onSnapshot error:', err);
      });

      // 2. Total Clients: Count active records in CLIENTS collection (status !== 'rejected')
      const clientsQuery = query(collection(db, COLLECTIONS.CLIENTS));
      unsubClients = onSnapshot(clientsQuery, (snap) => {
        let activeClients = 0;
        let pending = 0;
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const status = data.status || CLIENT_STATUS.PENDING;
          if (status !== CLIENT_STATUS.REJECTED) {
            activeClients++;
          }
          if (status === CLIENT_STATUS.PENDING) {
            pending++;
          }
        });
        pendingClientsCount = pending;
        setMetrics(prev => ({ ...prev, totalClients: activeClients }));
        updatePendingApprovals();
      }, (err) => {
        console.warn('Clients onSnapshot error:', err);
      });

      // 3. Pending Approvals from Projects (status === IN_VERIFICATION)
      const projectsQuery = query(
        collection(db, COLLECTIONS.PROJECTS),
        where(PROJECT_FIELDS.STATUS, '==', PROJECT_STATUS.IN_VERIFICATION)
      );
      unsubProjects = onSnapshot(projectsQuery, (snap) => {
        pendingProjectsCount = snap.size;
        updatePendingApprovals();
      }, (err) => {
        console.warn('Projects onSnapshot error:', err);
      });

      // 4. Pending Approvals from Change Requests (status === 'pending')
      const changeRequestsQuery = query(
        collection(db, COLLECTIONS.CHANGE_REQUESTS),
        where('status', '==', 'pending')
      );
      unsubChangeRequests = onSnapshot(changeRequestsQuery, (snap) => {
        pendingChangeRequestsCount = snap.size;
        updatePendingApprovals();
      }, (err) => {
        console.warn('ChangeRequests onSnapshot error:', err);
      });

      // 5. Registered Apps: Count active applications in APPS collection
      const appsQuery = query(collection(db, COLLECTIONS.APPS));
      unsubApps = onSnapshot(appsQuery, (snap) => {
        let activeApps = 0;
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if ((data.status || 'active') === 'active') {
            activeApps++;
          }
        });
        setMetrics(prev => ({ ...prev, registeredApps: activeApps }));
      }, (err) => {
        console.warn('Apps onSnapshot error:', err);
      });

      // 6. Pending Password Reset Approvals from 'approvals' where type === 'PASSWORD_RESET_REQUEST'
      unsubApprovals = onSnapshot(query(collection(db, 'approvals'), where('type', '==', 'PASSWORD_RESET_REQUEST')), (snap) => {
        let count = 0;
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const normSt = String(data.status || 'pending').trim().toLowerCase();
          if (normSt === 'pending') {
            count++;
          }
        });
        pendingPasswordsCount = count;
        updatePendingApprovals();
      }, (err) => {
        console.warn('Approvals onSnapshot error:', err);
      });

    } catch (err) {
      console.error('Failed to bind overview metrics listeners:', err);
    }

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubEmployees) unsubEmployees();
      if (unsubClients) unsubClients();
      if (unsubProjects) unsubProjects();
      if (unsubChangeRequests) unsubChangeRequests();
      if (unsubApps) unsubApps();
      if (unsubApprovals) unsubApprovals();
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [usersSnap, empSnap, clientsSnap, appsSnap, projectsSnap, changesSnap, approvalsSnap] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.USERS)).catch(() => null),
        getDocs(collection(db, COLLECTIONS.EMPLOYEES || 'employees')).catch(() => null),
        getDocs(collection(db, COLLECTIONS.CLIENTS)).catch(() => null),
        getDocs(collection(db, COLLECTIONS.APPS)).catch(() => null),
        getDocs(query(collection(db, COLLECTIONS.PROJECTS), where(PROJECT_FIELDS.STATUS, '==', PROJECT_STATUS.IN_VERIFICATION))).catch(() => null),
        getDocs(query(collection(db, COLLECTIONS.CHANGE_REQUESTS), where('status', '==', 'pending'))).catch(() => null),
        getDocs(query(collection(db, 'approvals'), where('type', '==', 'PASSWORD_RESET_REQUEST'))).catch(() => null)
      ]);

      const uniqueEmployees = new Set<string>();
      if (usersSnap) {
        usersSnap.forEach(d => {
          const email = (d.data().email || '').trim().toLowerCase();
          uniqueEmployees.add(email || d.id);
        });
      }
      if (empSnap) {
        empSnap.forEach(d => {
          const email = (d.data().email || '').trim().toLowerCase();
          uniqueEmployees.add(email || d.id);
        });
      }
      const totalEmployees = uniqueEmployees.size;
      
      let activeClients = 0;
      let pendingClients = 0;
      if (clientsSnap) {
        clientsSnap.forEach(docSnap => {
          const status = docSnap.data().status || CLIENT_STATUS.PENDING;
          if (status !== CLIENT_STATUS.REJECTED) activeClients++;
          if (status === CLIENT_STATUS.PENDING) pendingClients++;
        });
      }

      let activeApps = 0;
      if (appsSnap) {
        appsSnap.forEach(docSnap => {
          if ((docSnap.data().status || 'active') === 'active') activeApps++;
        });
      }

      const pendingProjects = projectsSnap ? projectsSnap.size : 0;
      const pendingChanges = changesSnap ? changesSnap.size : 0;
      let pendingPasswords = 0;
      if (approvalsSnap) {
        approvalsSnap.forEach(docSnap => {
          const data = docSnap.data();
          const normSt = String(data.status || 'pending').trim().toLowerCase();
          if (normSt === 'pending') {
            pendingPasswords++;
          }
        });
      }

      setMetrics({
        totalEmployees,
        totalClients: activeClients,
        registeredApps: activeApps,
        pendingApprovals: pendingClients + pendingProjects + pendingChanges + pendingPasswords
      });
    } catch (err) {
      console.error('Manual refresh error:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const metricCards = [
    {
      id: 'metric-card-total-employees',
      title: 'Total Employees',
      count: metrics.totalEmployees,
      description: 'Records in global directory',
      icon: Users,
      accentColor: 'text-[#D4AF37]',
      borderColor: 'border-[#D4AF37]/30',
      bgColor: 'bg-[#D4AF37]/10',
      tabKey: 'user-management'
    },
    {
      id: 'metric-card-pending-approvals',
      title: 'Pending Approvals / Requests',
      count: metrics.pendingApprovals,
      description: 'Awaiting owner sign-off',
      icon: CheckSquare,
      accentColor: 'text-amber-400',
      borderColor: 'border-amber-500/30',
      bgColor: 'bg-amber-500/10',
      tabKey: 'approvals',
      highlight: metrics.pendingApprovals > 0
    },
    {
      id: 'metric-card-total-clients',
      title: 'Total Clients',
      count: metrics.totalClients,
      description: 'Active database accounts',
      icon: Building2,
      accentColor: 'text-emerald-400',
      borderColor: 'border-emerald-500/30',
      bgColor: 'bg-emerald-500/10',
      tabKey: 'clients'
    },
    {
      id: 'metric-card-registered-apps',
      title: 'Registered Apps',
      count: metrics.registeredApps,
      description: 'Active in app registry',
      icon: Blocks,
      accentColor: 'text-sky-400',
      borderColor: 'border-sky-500/30',
      bgColor: 'bg-sky-500/10',
      tabKey: 'app-registry'
    }
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 w-full max-w-full">
      {/* Primary Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl tracking-wide text-white font-normal">
            Console Overview
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Operational dashboard and system telemetry
          </p>
        </div>

        <button
          id="refresh-overview-metrics-btn"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-lg bg-[#1E1E1E] hover:bg-[#282828] border border-[#2E2E2E] hover:border-[#D4AF37]/40 text-xs font-medium text-gray-300 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          title="Refresh metrics from database"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync Metrics</span>
        </button>
      </div>

      {/* Hero Welcome Banner */}
      <div className="w-full relative overflow-hidden rounded-xl bg-[#1E1E1E] border border-[#2A2A2A] p-6 md:p-8 shadow-xl">
        <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl text-white tracking-wide font-normal">
              Solarithm Admin Console <span className="text-[#D4AF37]">Foundation</span>
            </h2>
            <p className="text-base text-gray-200 max-w-2xl leading-relaxed">
              Firebase Authentication & Firestore persistency established. User role verification and Super Admin bypass active.
            </p>
          </div>

          {/* Quick Active Credential Status Pill */}
          <div className="bg-[#2A2A2A]/60 p-4 rounded-xl flex items-center gap-4 shrink-0 shadow-inner border border-[#333333]">
            <div className="w-10 h-10 rounded-lg bg-[#2A2A2A] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm text-gray-400 uppercase font-mono">Active Local Session</div>
              <div className="text-base font-bold text-white flex items-center gap-2">
                {name || 'User'}
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded uppercase font-mono font-bold">
                  {role}
                </span>
                {isSuperAdmin && (
                  <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 px-1.5 py-0.5 rounded uppercase font-mono font-bold">
                    Super Admin
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400 font-mono">{email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Responsive CSS Grid for Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              id={card.id}
              onClick={() => onNavigateTab && onNavigateTab(card.tabKey)}
              className={`relative overflow-hidden rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] p-5 sm:p-6 shadow-lg transition-all duration-200 flex flex-col justify-between group ${
                onNavigateTab ? 'cursor-pointer hover:border-[#D4AF37]/50 hover:bg-[#232323]' : ''
              } ${card.highlight ? 'ring-1 ring-amber-500/30' : ''}`}
            >
              {/* Top Row: Icon + Optional Tab Navigation Arrow */}
              <div className="flex items-center justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl ${card.bgColor} border ${card.borderColor} flex items-center justify-center ${card.accentColor} transition-transform group-hover:scale-105`}>
                  <Icon className="w-5 h-5" />
                </div>
                {onNavigateTab && (
                  <div className="text-gray-500 group-hover:text-[#D4AF37] transition-colors p-1">
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                )}
              </div>

              {/* Middle Section: Prominent Count & Title */}
              <div>
                <div className="text-xs sm:text-sm font-medium text-gray-400 tracking-wide">
                  {card.title}
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white tracking-tight mt-1 font-mono">
                  {card.count.toLocaleString()}
                </div>
              </div>

              {/* Bottom Section: Contextual Subtitle Description */}
              <div className="mt-4 pt-3 border-t border-[#2A2A2A] flex items-center justify-between text-xs text-gray-400">
                <span>{card.description}</span>
                {card.highlight && (
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <Clock className="w-3 h-3" /> Action Required
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

