import React, { useState } from 'react';
import { Check, Copy, LogOut, Shield, Users } from 'lucide-react';
import { CircleMemberLocation, FriendCircle } from '../types/location';

interface CircleInfoPanelProps {
  activeCircle: FriendCircle | null;
  members: CircleMemberLocation[];
  currentUserId: string | null;
  onLeaveCircle: (circleId: string) => Promise<void>;
}

export const CircleInfoPanel: React.FC<CircleInfoPanelProps> = ({
  activeCircle,
  members,
  currentUserId,
  onLeaveCircle,
}) => {
  const [copied, setCopied] = useState(false);

  if (!activeCircle) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-8 text-center">
        <div className="max-w-sm">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No circle selected
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create or join a friend circle from the map sidebar to invite friends and view circle
            details.
          </p>
        </div>
      </div>
    );
  }

  const inviteUrl = `${window.location.origin}/?circle=${encodeURIComponent(activeCircle.id)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {activeCircle.name}
              </h1>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                Circle Code: {activeCircle.id} · {activeCircle.memberUids.length} member(s)
              </p>
            </div>
            {currentUserId && activeCircle.ownerId !== currentUserId && (
              <button
                type="button"
                onClick={() => onLeaveCircle(activeCircle.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Circle</span>
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
              Shareable Invite Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Location Privacy & Maps Terms
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Live GPS coordinates and movement trails are shared strictly with members who possess
            this circle invite code. Location sharing requires explicit browser permission and can be
            stopped at any time. Interactive mapping features are powered by Google Maps Platform and
            subject to the{' '}
            <a
              href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Google Maps End User Additional Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 underline"
            >
              Google Privacy Policy
            </a>
            .
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Active Location Broadcasters ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No members have shared their coordinates in this circle yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {members.map((m) => (
                <li key={m.uid} className="py-2.5 flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {m.displayName}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {m.isSharing ? 'Live GPS active' : 'Paused'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
