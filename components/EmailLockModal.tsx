'use client';

import React, { useState } from 'react';
import { Lock, ShieldCheck, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { verifyUserCredentials, SUPER_ADMIN_EMAILS, UserRole } from '@/lib/firebase';
import { COLLECTIONS, CLIENT_STATUS, PROJECT_STATUS, CLIENT_FIELDS, PROJECT_FIELDS } from "@/src/config/schema";

interface EmailLockModalProps {
  onUnlock: (email: string, role: UserRole, name: string) => void;
}

export default function EmailLockModal({ onUnlock }: EmailLockModalProps) {
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUnlock = async (targetEmail?: string) => {
    const emailToUse = targetEmail || emailInput;
    if (!emailToUse || !emailToUse.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await verifyUserCredentials(emailToUse);

      if (result.success && result.user) {
        const { email, role, name } = result.user;
        
        // Save to localStorage as requested
        localStorage.setItem('lockedEmail', email);
        localStorage.setItem('lockedRole', role);
        localStorage.setItem('lockedName', name);

        onUnlock(email, role, name);
      } else {
        setErrorMsg(result.message || 'Email verification failed.');
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setErrorMsg('An unexpected error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative Gold Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B38728] via-[#FBF5B7] to-[#D4AF37]" />

        {/* Header Icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#2A2A2A] border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide">
              SOLARITHM <span className="text-[#D4AF37]">CONSOLE</span>
            </h2>
            <p className="text-sm text-gray-400">Email Lock & Role Verification</p>
          </div>
        </div>

        <p className="text-base text-gray-200 mb-5 leading-relaxed">
          Console access requires an authorized email address. Enter your credentials or use Super Admin access below.
        </p>

        {/* Email Input Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleUnlock(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-1.5 uppercase tracking-wider">
              Authorized Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="e.g. jayjalpa2002@gmail.com"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-[#2A2A2A] border border-[#2A2A2A] focus:border-[#D4AF37] rounded-lg text-base text-white placeholder-gray-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#B38728] via-[#D4AF37] to-[#AA771C] text-black font-semibold text-base rounded-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#D4AF37]/10 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Verifying Credentials...
              </span>
            ) : (
              <>
                Unlock Console Access
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Test / Super Admin Bypass Presets */}
        <div className="mt-6 pt-5 border-t border-[#2A2A2A] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" /> Super Admin Bypass
            </span>
            <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              Full Bypass
            </span>
          </div>

          <div className="w-full grid grid-cols-1 gap-1.5">
            {SUPER_ADMIN_EMAILS.map((adminEmail) => (
              <button
                key={adminEmail}
                type="button"
                onClick={() => {
                  setEmailInput(adminEmail);
                  handleUnlock(adminEmail);
                }}
                className="w-full text-left px-3 py-2 bg-[#2A2A2A] hover:bg-[#2A2A2A] border border-[#2A2A2A] hover:border-[#D4AF37]/50 rounded-lg text-sm text-gray-200 transition-all flex items-center justify-between group cursor-pointer"
              >
                <span className="truncate">{adminEmail}</span>
                <span className="text-xs text-[#D4AF37] group-hover:underline">Bypass & Unlock</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
