'use client';

import React, { useState } from 'react';
import { 
  X, 
  Check, 
  Briefcase, 
  Zap, 
  Building2, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles,
  Compass
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COLLECTIONS, PROJECT_STATUS } from '@/src/config/schema';
import DesignerSelect from './DesignerSelect';
import { 
  DesignerProfile, 
  CANONICAL_DESIGNERS, 
  bindProjectDesignerMetadata 
} from '@/lib/designerService';

export interface ProjectEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currentEmail?: string;
}

export default function ProjectEntryModal({
  isOpen,
  onClose,
  onSuccess,
  currentEmail = ''
}: ProjectEntryModalProps) {
  const [projectName, setProjectName] = useState('');
  const [projectNumber, setProjectNumber] = useState('PRJ-2026-001');
  const [clientName, setClientName] = useState('');
  const [plantCapacity, setPlantCapacity] = useState('50');
  const [capacityUnit, setCapacityUnit] = useState('kW');
  const [scopeOfWork, setScopeOfWork] = useState('Detailed Engineering & Solar PV Layout');
  const [selectedDesigner, setSelectedDesigner] = useState<DesignerProfile>(CANONICAL_DESIGNERS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !clientName.trim()) {
      setErrorMsg('Please enter both Project Name and Client Name.');
      return;
    }

    if (!selectedDesigner) {
      setErrorMsg('Please select an assigned designer or partner.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // DIRECTIVE 1 #3: Bind official work email and canonical Employee ID
      const binding = bindProjectDesignerMetadata(selectedDesigner);

      const payload = {
        projectName: projectName.trim(),
        projectNumber: projectNumber.trim(),
        srNumber: projectNumber.trim(),
        clientName: clientName.trim(),
        plantCapacity: Number(plantCapacity) || plantCapacity,
        capacityUnit,
        scopeOfWork: scopeOfWork.trim(),
        assignedDesigner: binding.assignedDesigner,
        designerEmail: binding.designerEmail,
        designerId: binding.designerId,
        designerName: binding.designerName,
        designer: binding.designerEmail,
        isPartnerDesigner: binding.isPartnerDesigner,
        status: PROJECT_STATUS.IN_VERIFICATION,
        createdBy: currentEmail || 'Nexus Admin Console',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, COLLECTIONS.PROJECTS), payload);

      onSuccess(
        `Project "${projectName}" created successfully! Assigned to ${binding.designerName} (${binding.designerId}).`
      );
      onClose();
    } catch (err: any) {
      console.error('Error creating project:', err);
      setErrorMsg(err?.message || 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#1E1E1E] border border-[#333333] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#2A2A2A] bg-[#222222] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl text-[#D4AF37]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-wide">
                Project Entry &amp; Designer Assignment
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Assign projects to dedicated engineers or active company partners
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Project Number / ID *
              </label>
              <input
                type="text"
                required
                value={projectNumber}
                onChange={(e) => setProjectNumber(e.target.value)}
                placeholder="e.g. PRJ-2026-001"
                className="w-full bg-[#181818] border border-gray-700 focus:border-[#D4AF37] rounded-lg px-3.5 py-2 text-sm text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Project Name *
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Reliance Jamnagar Solar Farm"
                className="w-full bg-[#181818] border border-gray-700 focus:border-[#D4AF37] rounded-lg px-3.5 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Client / Organization Name *
            </label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Reliance Industries Limited"
              className="w-full bg-[#181818] border border-gray-700 focus:border-[#D4AF37] rounded-lg px-3.5 py-2 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Plant Capacity
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  value={plantCapacity}
                  onChange={(e) => setPlantCapacity(e.target.value)}
                  placeholder="50"
                  className="w-full bg-[#181818] border border-gray-700 focus:border-[#D4AF37] rounded-lg px-3.5 py-2 text-sm text-white font-mono"
                />
                <select
                  value={capacityUnit}
                  onChange={(e) => setCapacityUnit(e.target.value)}
                  className="bg-[#181818] border border-gray-700 rounded-lg px-2 text-sm text-amber-400 font-bold"
                >
                  <option value="kW">kW</option>
                  <option value="MW">MW</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                Scope of Work
              </label>
              <input
                type="text"
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                placeholder="e.g. Detailed Layout"
                className="w-full bg-[#181818] border border-gray-700 focus:border-[#D4AF37] rounded-lg px-3.5 py-2 text-sm text-white"
              />
            </div>
          </div>

          {/* DIRECTIVE 1: Widened Designer Dropdown */}
          <div className="pt-2 border-t border-[#2A2A2A]">
            <label className="block text-xs font-bold text-[#D4AF37] uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Assigned Solar Designer (Partners &amp; Dedicated Staff) *
            </label>
            <DesignerSelect
              value={selectedDesigner?.employeeId}
              onChange={(d) => setSelectedDesigner(d)}
              placeholder="Pick designer or company partner..."
              showBadges={true}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#2A2A2A]">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] text-gray-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-bold text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Creating Project...' : 'Create & Assign Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
