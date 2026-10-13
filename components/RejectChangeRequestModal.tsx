'use client';

import React, { useState } from 'react';
import { X, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { ChangeRequestDocument } from './ApprovalsTab';

export interface RejectChangeRequestModalProps {
  isOpen: boolean;
  request: ChangeRequestDocument | null;
  onClose: () => void;
  onConfirmReject: (requestId: string, reason: string) => Promise<void>;
  isActioning: boolean;
}

export default function RejectChangeRequestModal({
  isOpen,
  request,
  onClose,
  onConfirmReject,
  isActioning,
}: RejectChangeRequestModalProps) {
  const [reason, setReason] = useState('');

  if (!isOpen || !request) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request.id) return;
    await onConfirmReject(request.id, reason.trim());
    setReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#1E1E1E] border border-[#333333] rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#2A2A2A] bg-[#222222] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Reject Field Change Request</h3>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{request.projectNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isActioning}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 bg-[#252525] border border-[#333333] rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Project:</span>
              <span className="font-bold text-white truncate max-w-[240px]">
                {request.projectName || request.projectNumber}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Field to Change:</span>
              <span className="font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                {request.fieldToChange}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Requested Value:</span>
              <span className="font-mono text-emerald-400 font-semibold">{request.requestedValue}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Rejection Reason (Optional)</span>
              <span className="text-[11px] text-gray-500 normal-case">Logged for requester</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide context or explanation for rejecting this request (e.g. Scope alteration requires revision with client)..."
              rows={3}
              disabled={isActioning}
              className="w-full bg-[#141414] border border-[#333333] focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 rounded-xl p-3 text-sm text-gray-200 placeholder-gray-500 outline-none transition-all resize-none"
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span>
              The project document will remain unchanged. The change request will be recorded as REJECTED in the audit trail.
            </span>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-[#2A2A2A] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isActioning}
              className="px-4 py-2 bg-[#252525] hover:bg-[#2F2F2F] border border-[#3A3A3A] text-gray-300 font-semibold text-sm rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isActioning}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-900/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isActioning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  Confirm Rejection
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
