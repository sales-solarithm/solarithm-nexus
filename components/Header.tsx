'use client';

import React from 'react';
import { Sun, LogOut, User, X, Menu } from 'lucide-react';
import { SUPER_ADMIN_EMAILS, UserRole } from '@/lib/firebase';

interface HeaderProps {
  email: string;
  role: UserRole;
  name: string;
  onLogout: () => void;
  dbConnected: boolean;
  isMobileNavOpen?: boolean;
  onToggleMobileNav?: () => void;
}

export default function Header({ 
  email, 
  role, 
  name, 
  onLogout, 
  dbConnected,
  isMobileNavOpen,
  onToggleMobileNav
}: HeaderProps) {
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());

  return (
    <header className="h-16 bg-[#1E1E1E] border-b border-[#2A2A2A] px-3 sm:px-6 md:px-8 flex items-center justify-between sticky top-0 z-30 w-full min-w-0">
      {/* Left Side: Mobile Hamburger + Standard Hardcoded Brand Logo & App Name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Hamburger Button */}
        {onToggleMobileNav && (
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="p-2 text-gray-400 hover:text-white bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] rounded-lg transition-colors cursor-pointer md:hidden shrink-0"
            aria-label="Toggle navigation menu"
            id="mobile-hamburger-btn"
          >
            {isMobileNavOpen ? <X className="w-5 h-5 text-[#D4AF37]" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        {/* Standard Hardcoded Solarithm App Icon */}
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#2A2A2A] border border-[#333333] flex items-center justify-center text-[#D4AF37] shadow-lg shrink-0 overflow-hidden">
          <Sun className="w-5 h-5 fill-[#D4AF37]/10 stroke-[#D4AF37]" />
        </div>
        <div className="flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="text-base sm:text-lg font-bold text-white tracking-wide">
              Solarithm
            </span>
            <span className="text-base sm:text-lg font-bold text-[#D4AF37] tracking-wide">
              Nexus
            </span>
          </div>
          <span className="text-xs text-gray-400 leading-tight hidden lg:block truncate max-w-[450px]">
            Central control hub for pricing logic, roles, and system configurations.
          </span>
        </div>
      </div>

      {/* Right Side: DB Status + User Info + Logout */}
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0">
        {/* Firestore Connection Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#2A2A2A] rounded-xl text-sm">
          <div className={`w-1.5 h-1.5 rounded-full ${dbConnected ? 'bg-emerald-500/10 animate-pulse' : 'bg-amber-500/10'}`} />
          <span className="text-xs font-mono text-gray-400">
            Firestore: <span className={dbConnected ? 'text-emerald-400' : 'text-amber-400'}>{dbConnected ? 'Active' : 'Connecting'}</span>
          </span>
        </div>

        {/* User Card - Horizontally Aligned */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[#D4AF37] font-semibold text-sm sm:text-base shrink-0">
            {name ? name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>

          <div className="text-left leading-tight hidden md:block">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white tracking-wide">{name || 'User'}</span>
              {isSuperAdmin && (
                <span className="text-[9px] font-bold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider" title="Super Admin Bypass Active">
                  Super Admin
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider">
                {role}
              </span>
              <span className="text-xs text-gray-500 font-mono truncate max-w-[140px]">{email}</span>
            </div>
          </div>
        </div>

        <div className="h-5 w-px bg-[#333333] hidden sm:block" />

        {/* Logout Button */}
        <button
          onClick={onLogout}
          title="Logout & Lock Console"
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-[#2A2A2A] hover:bg-[#333333] text-xs sm:text-sm font-semibold text-gray-200 hover:text-[#D4AF37] rounded-lg transition-all cursor-pointer shadow-sm border border-[#333333]"
          id="header-logout-btn"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
