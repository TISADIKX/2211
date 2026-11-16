import React from 'react';
import { Mail, MapPin, ShieldCheck, X } from 'lucide-react';

interface LocationPermissionModalProps {
  isOpen: boolean;
  recipientEmail: string;
  circleName: string;
  onConfirmWithEmail: () => void;
  onConfirmMapOnly: () => void;
  onClose: () => void;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  isOpen,
  recipientEmail,
  circleName,
  onConfirmWithEmail,
  onConfirmMapOnly,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-consent-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2
              id="location-consent-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Share Live Location & Mail Alert
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            Granting live location permission will broadcast your real-time GPS coordinates and
            movement trail to friends inside{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{circleName}</span>.
          </p>

          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Email alert to {recipientEmail}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Sends your live Google Maps location link via configured mail server or prepares a
                  one-click message in your email app.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-700">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You can pause or stop sharing your live location at any time with one click.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row-reverse gap-2.5">
          <button
            type="button"
            onClick={onConfirmWithEmail}
            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Allow & Send Mail Alert
          </button>
          <button
            type="button"
            onClick={onConfirmMapOnly}
            className="px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Map Only
          </button>
        </div>
      </div>
    </div>
  );
};
