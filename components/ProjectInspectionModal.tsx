'use client';

import React from 'react';
import { 
  X, 
  Check, 
  XCircle, 
  Building2, 
  Zap, 
  Calendar, 
  User, 
  Briefcase, 
  IndianRupee, 
  ArrowRight, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  Clock,
  Sparkles,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import { ChangeRequestDocument } from './ApprovalsTab';

export interface ProjectInspectionModalProps {
  isOpen: boolean;
  request: ChangeRequestDocument | null;
  onClose: () => void;
  onApprove: (request: ChangeRequestDocument) => void;
  onOpenReject: (request: ChangeRequestDocument) => void;
  isActioning: boolean;
  requesterName?: string;
  requesterEmail?: string;
}

export default function ProjectInspectionModal({
  isOpen,
  request,
  onClose,
  onApprove,
  onOpenReject,
  isActioning,
  requesterName,
  requesterEmail,
}: ProjectInspectionModalProps) {
  if (!isOpen || !request) return null;

  const raw = request.rawProject || {};
  const isScopeChange = (request.fieldToChange || '').toLowerCase().includes('scope');
  const isCapacityChange = (request.fieldToChange || '').toLowerCase().includes('capacity');

  // Format currency helper
  const formatCurrency = (val: any) => {
    if (val === null || val === undefined || val === '') return 'Not Set';
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return `₹${num.toLocaleString('en-IN')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-[#1E1E1E] border border-[#333333] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-[#2A2A2A] bg-[#222222] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl text-[#D4AF37]">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-wide">
                  {request.projectName || `Project ${request.projectNumber}`}
                </h3>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[#2A2A2A] text-amber-400 border border-[#3A3A3A]">
                  {request.projectNumber}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                <span>Client: <strong className="text-gray-200">{request.clientName || 'N/A'}</strong></span>
                <span>•</span>
                <span className="capitalize">Status: <strong className="text-emerald-400">{request.projectStatus || 'In Progress'}</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isActioning}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer disabled:opacity-50"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Section 1: Proposed Field Modification (Diff Banner) */}
          <div className="p-4 bg-gradient-to-br from-[#252525] to-[#1C1C1C] border border-[#3A3A3A] rounded-xl space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Requested Field Modification
              </span>
              <span className="text-xs text-gray-400 font-mono">
                Requested by: <span className="text-white font-medium">{requesterName || request.requestedBy}</span>
              </span>
            </div>

            {/* Field Diff Visualizer */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#171717] p-3.5 rounded-xl border border-[#2E2E2E]">
              <div className="md:col-span-3">
                <span className="text-xs text-gray-400 block font-medium">Target Field</span>
                <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/30 inline-block mt-0.5">
                  {request.fieldToChange}
                </span>
              </div>

              <div className="md:col-span-4 bg-[#1F1F1F] p-2.5 rounded-lg border border-[#333333]">
                <span className="text-[11px] uppercase tracking-wider text-gray-400 block font-semibold">Current Value</span>
                <span className="font-mono text-sm text-gray-400 line-through block mt-0.5 truncate" title={request.currentValue}>
                  {request.currentValue || '(empty / N/A)'}
                </span>
              </div>

              <div className="hidden md:flex md:col-span-1 justify-center text-gray-500">
                <ArrowRight className="w-5 h-5 text-[#D4AF37]" />
              </div>

              <div className="md:col-span-4 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30">
                <span className="text-[11px] uppercase tracking-wider text-emerald-400 block font-semibold">Requested Value</span>
                <span className="font-mono text-sm text-emerald-400 font-bold block mt-0.5 truncate" title={request.requestedValue}>
                  {request.requestedValue}
                </span>
              </div>
            </div>

            {/* Reason Box */}
            <div className="text-xs bg-[#1F1F1F] p-3 rounded-lg border border-[#2C2C2C] space-y-1">
              <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[11px]">
                Reason for Change:
              </span>
              <p className="text-gray-200 leading-relaxed font-sans text-sm">
                {request.reason || 'No specific reason provided.'}
              </p>
            </div>

            {(isScopeChange || isCapacityChange) && (
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Pricing Impact:</strong> Approving this field will automatically trigger and flag a recalculation for billing and commissions.
                </span>
              </div>
            )}
          </div>

          {/* Section 2: Core Project Metadata & Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card A: Client Information */}
            <div className="bg-[#242424] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 pb-2 border-b border-[#333333]">
                <Building2 className="w-4 h-4 text-[#D4AF37]" />
                Client Information
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Client / Company:</span>
                  <span className="font-bold text-white text-right truncate max-w-[200px]">
                    {request.clientName || 'N/A'}
                  </span>
                </div>
                {request.clientId && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Client ID:</span>
                    <span className="font-mono text-gray-300">{request.clientId}</span>
                  </div>
                )}
                {request.clientContact && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Contact Person:</span>
                    <span className="text-gray-200">{request.clientContact}</span>
                  </div>
                )}
                {request.clientEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Email:</span>
                    <span className="text-gray-300 font-mono truncate max-w-[180px]">{request.clientEmail}</span>
                  </div>
                )}
                {request.clientPhone && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Phone:</span>
                    <span className="text-gray-300 font-mono">{request.clientPhone}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Location:</span>
                  <span className="text-gray-300">{request.clientCity || raw.location || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Card B: Plant & Installation Overview */}
            <div className="bg-[#242424] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 pb-2 border-b border-[#333333]">
                <Zap className="w-4 h-4 text-[#D4AF37]" />
                Plant & Installation
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Plant Capacity:</span>
                  <span className="font-bold text-[#D4AF37] font-mono text-sm">
                    {request.plantCapacity || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Project Date / Created:</span>
                  <span className="text-gray-300 font-mono">{request.projectDate || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Assigned Designer:</span>
                  <div className="text-right">
                    {(() => {
                      const rawName = request.designerName || (request.designerEmail ? request.designerEmail.split('@')[0] : 'Unassigned');
                      const isPartner =
                        raw.isPartnerDesigner ||
                        rawName.toLowerCase().includes('jay shah') ||
                        rawName.toLowerCase().includes('deep davara') ||
                        (request.designerEmail && (request.designerEmail.includes('jayshah') || request.designerEmail.includes('deepdavara')));
                      const label = isPartner ? `${rawName} (Partner / Designer)` : `${rawName} (Designer)`;
                      const empId = raw.designerId || (rawName.toLowerCase().includes('jay shah') ? 'SDM-JS-001' : (rawName.toLowerCase().includes('deep davara') ? 'SDM-DD-002' : ''));

                      return (
                        <div>
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-semibold text-white">{label}</span>
                            {isPartner && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                PARTNER
                              </span>
                            )}
                          </div>
                          {request.designerEmail && (
                            <span className="text-[11px] text-gray-400 font-mono block">{request.designerEmail}</span>
                          )}
                          {empId && (
                            <span className="text-[10px] text-[#D4AF37] font-mono font-bold block">ID: {empId}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Pricing Category / Tier:</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#1C1C1C] text-amber-400 border border-[#333333]">
                    {request.pricingCategory || raw.pricingCategory || 'Standard'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Section 3: Scope of Work Comparison */}
          <div className="bg-[#242424] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 pb-2 border-b border-[#333333]">
              <Layers className="w-4 h-4 text-[#D4AF37]" />
              Scope of Work Snapshot
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#1C1C1C] rounded-lg border border-[#333333] space-y-1">
                <span className="text-gray-400 font-semibold block uppercase tracking-wider text-[11px]">
                  Current Scope of Work
                </span>
                <span className={`font-mono text-sm font-semibold block ${isScopeChange ? 'line-through text-gray-400' : 'text-white'}`}>
                  {request.scopeOfWork || raw.scopeOfWork || 'N/A'}
                </span>
                {request.subService && (
                  <span className="text-[11px] text-gray-400 block">
                    Sub-Service: <span className="text-gray-300">{request.subService}</span>
                  </span>
                )}
              </div>

              <div className={`p-3 rounded-lg border space-y-1 ${
                isScopeChange 
                  ? 'bg-emerald-500/10 border-emerald-500/30' 
                  : 'bg-[#1C1C1C] border-[#333333]'
              }`}>
                <span className="font-semibold block uppercase tracking-wider text-[11px] text-gray-400">
                  {isScopeChange ? 'Requested Scope of Work (New)' : 'Target Scope of Work'}
                </span>
                <span className={`font-mono text-sm font-bold block ${
                  isScopeChange ? 'text-emerald-400' : 'text-gray-300'
                }`}>
                  {isScopeChange ? request.requestedValue : (request.scopeOfWork || 'Same as current')}
                </span>
                <span className="text-[11px] text-gray-400 block">
                  {isScopeChange ? 'Will replace current project scope upon approval' : 'No changes requested for Scope'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Current Financial Values */}
          <div className="bg-[#242424] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 pb-2 border-b border-[#333333]">
              <IndianRupee className="w-4 h-4 text-[#D4AF37]" />
              Current Financial Values
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-[#1C1C1C] rounded-lg border border-[#333333]">
                <span className="text-gray-400 text-xs block">Contract Value</span>
                <span className="text-base font-bold text-white font-mono mt-1 block">
                  {formatCurrency(request.contractValue ?? raw.contractValue ?? raw.totalAmount)}
                </span>
              </div>
              <div className="p-3 bg-[#1C1C1C] rounded-lg border border-[#333333]">
                <span className="text-gray-400 text-xs block">Designer Fee</span>
                <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
                  {formatCurrency(request.designerFee ?? raw.designerFee)}
                </span>
              </div>
              <div className="p-3 bg-[#1C1C1C] rounded-lg border border-[#333333]">
                <span className="text-gray-400 text-xs block">Sales Commission</span>
                <span className="text-base font-bold text-emerald-400 font-mono mt-1 block">
                  {formatCurrency(request.salesCommission ?? raw.salesCommission)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 italic">
              Financial figures are synchronized with the Client Pricing and Employee Commission matrices.
            </p>
          </div>

        </div>

        {/* Modal Footer with Direct Decision Actions */}
        <div className="p-5 border-t border-[#2A2A2A] bg-[#222222] flex items-center justify-between shrink-0 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isActioning}
            className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#3A3A3A] text-gray-300 font-semibold text-sm rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenReject(request)}
              disabled={isActioning}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-sm rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reject Request
            </button>

            <button
              type="button"
              onClick={() => onApprove(request)}
              disabled={isActioning}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isActioning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Applying Changes...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Approve &amp; Apply Directly
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
