import React from 'react';
import { ExternalLink, Mail, Send } from 'lucide-react';
import { LocationAlert } from '../types/location';
import { formatRelativeTime } from '../lib/geo';

interface MailAlertsPanelProps {
  alerts: LocationAlert[];
  recipientEmail: string;
  nowMs: number;
  hasCoords: boolean;
  onSendManualAlert: () => void;
}

export const MailAlertsPanel: React.FC<MailAlertsPanelProps> = ({
  alerts,
  recipientEmail,
  nowMs,
  hasCoords,
  onSendManualAlert,
}) => {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Location Mail Alerts
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Every time live location permission is granted, a Google Maps location link is
              dispatched to <span className="font-medium text-slate-900 dark:text-slate-100">{recipientEmail}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onSendManualAlert}
            disabled={!hasCoords}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Send Current Location</span>
          </button>
        </div>

        {alerts.length === 0 ? (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center">
            <Mail className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No email alerts recorded yet
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              Allow live location permission to send your first Google Maps link alert to{' '}
              {recipientEmail}.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Coordinates</th>
                    <th className="py-3 px-4">Delivery</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4 text-right">Google Map</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {alerts.map((alert) => (
                    <tr
                      key={alert.id || `${alert.lat}-${alert.lng}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {alert.recipientEmail}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                        {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {alert.deliveryMethod === 'emailjs'
                          ? 'EmailJS'
                          : alert.deliveryMethod === 'resend'
                          ? 'Resend API'
                          : alert.deliveryMethod === 'smtp'
                          ? 'Server SMTP'
                          : alert.deliveryMethod === 'gmail_api'
                          ? 'Gmail API'
                          : 'Email App'}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span
                          className={
                            alert.status === 'sent'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {alert.status === 'sent' ? 'Sent' : 'Prepared'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(alert.createdAt, nowMs)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={alert.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                          <span>Open Map</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
