'use client';

import React from 'react';
import { 
  Users, 
  FileText, 
  Calculator, 
  Briefcase, 
  CheckSquare, 
  Lock, 
  LayoutDashboard, 
  Layers,
  ChevronRight,
  Blocks,
  Building2,
  X
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  isMobileNavOpen?: boolean;
  onCloseMobileNav?: () => void;
}

export default function Sidebar({ 
  activeTab, 
  onSelectTab,
  isMobileNavOpen = false,
  onCloseMobileNav
}: SidebarProps) {
  const activeTabs = [
    { id: 'overview', label: 'Console Overview', icon: LayoutDashboard },
    { id: 'user-management', label: 'Employees', icon: Users },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'clients', label: 'Clients', icon: Briefcase },
    { id: 'app-registry', label: 'App Registry', icon: Blocks },
    { id: 'scope-of-work', label: 'Scope of Work', icon: FileText },
    { id: 'price-engine', label: 'Price Engine', icon: Calculator },
    { id: 'proposal-management', label: 'Proposal Mgmt', icon: Layers },
    { id: 'approvals', label: 'Approvals', icon: CheckSquare },
  ];

  const handleTabClick = (tabId: string) => {
    onSelectTab(tabId);
    if (onCloseMobileNav) {
      onCloseMobileNav();
    }
  };

  return (
    <>
      {/* 1. Mobile Backdrop Overlay */}
      {isMobileNavOpen && (
        <div 
          onClick={onCloseMobileNav}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* 2. Mobile Slide-out Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#1E1E1E] border-r border-[#2A2A2A] flex flex-col justify-between h-full overflow-y-auto shadow-2xl transition-transform duration-300 ease-in-out md:hidden ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Mobile Navigation Drawer"
      >
        <div className="p-4 space-y-4">
          {/* Mobile Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#2A2A2A]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#D4AF37]" /> Core Workspace
              </span>
            </div>
            <button
              onClick={onCloseMobileNav}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav Items List */}
          <div className="space-y-1">
            {activeTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`w-full px-3 py-3 text-base font-semibold flex items-center justify-between transition-all cursor-pointer rounded-lg border ${
                    isActive
                      ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20'
                      : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2A2A2A]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                    <span>{tab.label}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 ${isActive ? 'text-[#D4AF37]' : 'text-gray-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-[#2A2A2A] text-xs text-gray-500 font-mono">
          Solarithm Enterprise v2.4 • Mobile Nav
        </div>
      </aside>

      {/* 3. Persistent Desktop Sidebar */}
      <aside className="w-64 bg-[#1E1E1E] border-r border-[#2A2A2A] flex flex-col justify-between h-full overflow-y-auto shrink-0 hidden md:flex">
        <div className="p-4 space-y-6">
          {/* Navigation Group Header */}
          <div>
            <div className="px-3 mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#D4AF37]" /> Core Workspace
              </span>
            </div>
   
            {/* Active Tabs */}
            <div className="space-y-1">
              {activeTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={`w-full px-3 py-2.5 text-base font-semibold flex items-center transition-all cursor-pointer rounded-lg border ${
                      isActive
                        ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20'
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2A2A2A]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#D4AF37]' : 'text-gray-500'}`} />
                      <span>{tab.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
