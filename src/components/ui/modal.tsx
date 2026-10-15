import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  showCloseButton?: boolean;
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[96vw]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidth = '2xl',
  children,
  footer,
  className = '',
  bodyClassName = '',
  showCloseButton = true,
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open to prevent background jank
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-2xl';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      {/* Clickable Backdrop overlay */}
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        className={`relative w-full ${maxWidthClass} max-h-[94dvh] sm:max-h-[92vh] flex flex-col rounded-t-2xl rounded-b-none sm:rounded-2xl bg-white border border-slate-200 shadow-2xl text-slate-900 overflow-hidden sm:my-auto animate-in zoom-in-95 duration-150 ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Optional Structured Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 shrink-0 shadow-2xs">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 className="text-base font-bold text-slate-900 font-display sm:truncate">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-[13px] text-slate-500 font-medium sm:truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-2"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable Body Container */}
        <div className={`flex-1 overflow-y-auto overscroll-contain p-5 ${bodyClassName}`}>
          {children}
        </div>

        {/* Optional Structured Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 shrink-0 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
