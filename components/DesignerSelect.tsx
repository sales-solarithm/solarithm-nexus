'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Sparkles, Compass } from 'lucide-react';
import {
  DesignerProfile,
  fetchEligibleDesigners,
  CANONICAL_DESIGNERS
} from '@/lib/designerService';

export interface DesignerSelectProps {
  value?: string; // Can be designer email, employeeId, or name
  onChange: (designer: DesignerProfile) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  filterMode?: boolean; // When true, renders an "All Designers" option for filter bars
  showBadges?: boolean;
}

export default function DesignerSelect({
  value = '',
  onChange,
  placeholder = 'Select Assigned Designer...',
  disabled = false,
  className = '',
  id,
  name,
  filterMode = false,
  showBadges = true,
}: DesignerSelectProps) {
  const [designers, setDesigners] = useState<DesignerProfile[]>(CANONICAL_DESIGNERS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadDesigners = async () => {
      setLoading(true);
      try {
        const list = await fetchEligibleDesigners();
        if (isMounted && list.length > 0) {
          setDesigners(list);
        }
      } catch (err) {
        console.warn('Could not load live designers list, using canonical fallbacks:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDesigners();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    if (!selectedKey || selectedKey === 'ALL') {
      if (filterMode) {
        onChange({
          id: 'ALL',
          name: 'All Designers',
          role: 'ALL',
          email: '',
          employeeId: '',
          isPartner: false,
          formattedLabel: 'All Designers'
        });
      }
      return;
    }

    const matched = designers.find(
      (d) =>
        d.employeeId === selectedKey ||
        d.email.toLowerCase() === selectedKey.toLowerCase() ||
        d.name.toLowerCase() === selectedKey.toLowerCase() ||
        d.id === selectedKey
    );

    if (matched) {
      onChange(matched);
    }
  };

  const selectedDesigner = designers.find(
    (d) =>
      d.employeeId === value ||
      d.email.toLowerCase() === value.toLowerCase() ||
      d.name.toLowerCase() === value.toLowerCase() ||
      d.id === value
  );

  return (
    <div className={`relative flex flex-col gap-1 ${className}`}>
      <div className="relative">
        <select
          id={id}
          name={name}
          disabled={disabled || loading}
          value={selectedDesigner ? selectedDesigner.employeeId : (filterMode && !value ? 'ALL' : value)}
          onChange={handleChange}
          className="w-full bg-[#1E1E1E] border border-gray-700 hover:border-[#D4AF37] focus:border-[#D4AF37] rounded-lg px-3.5 py-2.5 text-sm font-medium text-white shadow-sm focus:outline-none transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-10"
        >
          {filterMode ? (
            <option value="ALL">All Designers &amp; Partners</option>
          ) : (
            <option value="" disabled>
              {loading ? 'Loading designers...' : placeholder}
            </option>
          )}

          {/* Group 1: Company Partners (Executive Owners who design) */}
          <optgroup label="Company Partners (Executive & Technical Leads)">
            {designers
              .filter((d) => d.isPartner)
              .map((d) => (
                <option key={d.employeeId || d.email} value={d.employeeId}>
                  ★ {d.formattedLabel} • {d.employeeId}
                </option>
              ))}
          </optgroup>

          {/* Group 2: Dedicated Solar Designers */}
          <optgroup label="Solar PV Design Engineers">
            {designers
              .filter((d) => !d.isPartner)
              .map((d) => (
                <option key={d.employeeId || d.email} value={d.employeeId}>
                  {d.formattedLabel} • {d.employeeId}
                </option>
              ))}
          </optgroup>
        </select>

        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
          <Compass className="w-4 h-4 text-[#D4AF37]" />
        </div>
      </div>

      {showBadges && selectedDesigner && !filterMode && (
        <div className="flex items-center gap-2 mt-1 px-1">
          {selectedDesigner.isPartner ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-3 h-3 text-[#D4AF37]" />
              Company Partner / Active Designer
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <UserCheck className="w-3 h-3 text-blue-400" />
              Dedicated Solar Designer
            </span>
          )}
          <span className="text-[11px] font-mono text-gray-400 truncate">
            ID: <strong className="text-gray-200">{selectedDesigner.employeeId}</strong> • {selectedDesigner.email}
          </span>
        </div>
      )}
    </div>
  );
}
