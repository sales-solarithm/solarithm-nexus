/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  requireConfirmationText?: string; // e.g. "WIPE"
  inputPlaceholder?: string;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed? This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  requireConfirmationText,
  inputPlaceholder,
  isLoading = false,
}) => {
  const [typedInput, setTypedInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTypedInput('');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatched = requireConfirmationText
    ? typedInput.trim() === requireConfirmationText.trim()
    : true;

  const handleConfirm = async () => {
    if (!isMatched || submitting || isLoading) return;
    try {
      setSubmitting(true);
      await onConfirm();
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  const isBusy = isLoading || submitting;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-2xl p-6 shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isBusy}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer disabled:opacity-50"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl border shrink-0 ${
            variant === 'danger'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              : variant === 'warning'
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-[#D4AF37]/10 border-[#D4AF37]/20 text-[#D4AF37]'
          }`}>
            {variant === 'danger' ? (
              <Trash2 className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>

          <div className="flex-1 pr-4">
            <h3 className="text-base font-semibold text-white tracking-tight">
              {title}
            </h3>
            <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Verification Input for Wipe / Dangerous Actions */}
        {requireConfirmationText && (
          <div className="mt-5 space-y-2 bg-[#141414] border border-[#2A2A2A] rounded-xl p-3.5">
            <label className="block text-xs font-medium text-gray-400">
              Please type <span className="font-mono font-bold text-rose-400">{requireConfirmationText}</span> to confirm:
            </label>
            <input
              type="text"
              autoFocus
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={inputPlaceholder || `Type '${requireConfirmationText}'`}
              disabled={isBusy}
              className="w-full px-3 py-2 bg-[#1E1E1E] border border-[#3A3A3A] focus:border-rose-500 rounded-lg text-sm text-white font-mono placeholder:text-gray-600 focus:outline-hidden transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isMatched) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
            />
          </div>
        )}

        {/* Actions Footer */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] text-gray-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isMatched || isBusy}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40'
                : variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40'
                : 'bg-[#D4AF37] hover:bg-[#E5C158] text-black shadow-[#D4AF37]/20'
            }`}
          >
            {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  submitText?: string;
  cancelText?: string;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder,
  initialValue = '',
  submitText = 'Submit',
  cancelText = 'Cancel',
}) => {
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setVal(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (val.trim() === '') return;
    onSubmit(val.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div 
        className="relative w-full max-w-md bg-[#1E1E1E] border border-[#333333] rounded-2xl p-6 shadow-2xl text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#2A2A2A] transition-colors cursor-pointer"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-semibold text-white tracking-tight">
          {title}
        </h3>
        {message && (
          <p className="mt-1.5 text-sm text-gray-300 leading-relaxed">
            {message}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="text"
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3.5 py-2.5 bg-[#141414] border border-[#3A3A3A] focus:border-[#D4AF37] rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-hidden transition-colors"
          />

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#333333] border border-[#333333] text-gray-300 hover:text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="submit"
              disabled={val.trim() === ''}
              className="px-4 py-2 bg-[#D4AF37] hover:bg-[#E5C158] text-black font-semibold rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-[#D4AF37]/20"
            >
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
