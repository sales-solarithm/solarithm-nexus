'use client';

import React, { useState } from 'react';
import AuthGuard, { useAuth } from '@/components/AuthGuard';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ConsoleDashboard from '@/components/ConsoleDashboard';
import UserManagementTab from '@/components/UserManagementTab';
import DepartmentsTab from '@/components/DepartmentsTab';
import ClientsTab from '@/components/ClientsTab';
import AppRegistryTab from '@/components/AppRegistryTab';
import ScopeOfWorkTab from '@/components/ScopeOfWorkTab';
import PriceEngineTab from '@/components/PriceEngineTab';
import ProposalManagementTab from '@/components/ProposalManagementTab';
import ApprovalsTab from '@/components/ApprovalsTab';

function AdminConsole() {
  const { session, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (!session) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <ConsoleDashboard 
            email={session.email} 
            role={session.role} 
            name={session.name} 
            onNavigateTab={setActiveTab} 
          />
        );
      case 'user-management':
        return <UserManagementTab currentEmail={session.email} currentRole={session.role} />;
      case 'departments':
        return <DepartmentsTab currentEmail={session.email} currentRole={session.role} />;
      case 'clients':
        return <ClientsTab currentEmail={session.email} currentRole={session.role} />;
      case 'app-registry':
        return <AppRegistryTab currentEmail={session.email} currentRole={session.role} />;
      case 'scope-of-work':
        return <ScopeOfWorkTab currentEmail={session.email} currentRole={session.role} />;
      case 'price-engine':
        return <PriceEngineTab currentEmail={session.email} currentRole={session.role} />;
      case 'proposal-management':
        return <ProposalManagementTab currentEmail={session.email} currentRole={session.role} />;
      case 'approvals':
        return <ApprovalsTab currentEmail={session.email} currentRole={session.role} />;
      default:
        return <ConsoleDashboard email={session.email} role={session.role} name={session.name} />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#121212] text-gray-200">
      <Header 
        email={session.email}
        role={session.role}
        name={session.name}
        onLogout={logout}
        dbConnected={true}
        isMobileNavOpen={isMobileNavOpen}
        onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)}
      />
      <div className="flex-1 flex min-h-0 relative">
        <Sidebar 
          activeTab={activeTab} 
          onSelectTab={setActiveTab}
          isMobileNavOpen={isMobileNavOpen}
          onCloseMobileNav={() => setIsMobileNavOpen(false)}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#121212] relative w-full min-w-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <AdminConsole />
    </AuthGuard>
  );
}

