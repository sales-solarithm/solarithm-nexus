'use client';

import React, { useEffect, useState } from 'react';
import { Clock, X, AlertTriangle } from 'lucide-react';

interface InactivityToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

export default function InactivityToast({
  message,
  onClose,
  duration = 10000,
}: InactivityToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleManualClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] max-w-md w-[calc(100%-2rem)] transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
      }`}
    >
      <div className="bg-[#1C1C1C] border border-[#D4AF37]/50 shadow-2xl shadow-black/80 rounded-xl p-4 flex items-start gap-3.5 backdrop-blur-md">
        <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 mt-0.5">
          <Clock className="w-5 h-5 text-[#D4AF37]" />
        </div>
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 text-sm font-bold text-white tracking-wide">
            <span>Session Timeout</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
              10 Min Inactive
            </span>
          </div>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            {message}
          </p>
        </div>
        <button
          onClick={handleManualClose}
          className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-[#2A2A2A] transition-colors cursor-pointer shrink-0 -mr-1 -mt-1"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
