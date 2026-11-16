import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  CircleMemberLocation,
  FriendCircle,
  GpsPermissionState,
} from '../types/location';
import {
  formatDistance,
  formatRelativeTime,
  formatSpeed,
  getInitials,
  haversineMeters,
} from '../lib/geo';

interface FriendSidebarProps {
  isSignedIn: boolean;
  currentUserId: string | null;
  circles: FriendCircle[];
  activeCircle: FriendCircle | null;
  members: CircleMemberLocation[];
  selectedMemberId: string | null;
  gpsState: GpsPermissionState;
  gpsError: string | null;
  myCoords: { lat: number; lng: number; accuracy: number; mapsUrl: string } | null;
  nowMs: number;
  recipientEmail: string;
  onSelectCircle: (circleId: string) => void;
  onCreateCircle: (name: string) => Promise<void>;
  onJoinCircle: (code: string) => Promise<void>;
  onSelectMember: (uid: string) => void;
  onRequestLocationShare: () => void;
  onStopSharing: () => void;
}

export const FriendSidebar: React.FC<FriendSidebarProps> = ({
  isSignedIn,
  currentUserId,
  circles,
  activeCircle,
  members,
  selectedMemberId,
  gpsState,
  gpsError,
  myCoords,
  nowMs,
  recipientEmail,
  onSelectCircle,
  onCreateCircle,
  onJoinCircle,
  onSelectMember,
  onRequestLocationShare,
  onStopSharing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCircleForm, setShowCircleForm] = useState<'none' | 'create' | 'join'>('none');
  const [circleNameInput, setCircleNameInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedMapsLink, setCopiedMapsLink] = useState(false);

  const filteredMembers = members.filter((m) =>
    m.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const handleCopyInvite = async () => {
    if (!activeCircle) return;
    const url = `${window.location.origin}/?circle=${encodeURIComponent(activeCircle.id)}`;
    await navigator.clipboard.writeText(url);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleCopyMyLink = async () => {
    if (!myCoords) return;
    await navigator.clipboard.writeText(myCoords.mapsUrl);
    setCopiedMapsLink(true);
    setTimeout(() => setCopiedMapsLink(false), 2000);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!circleNameInput.trim()) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await onCreateCircle(circleNameInput.trim());
      setCircleNameInput('');
      setShowCircleForm('none');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create circle.');
    } finally {
      setFormBusy(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await onJoinCircle(joinCodeInput.trim().toUpperCase());
      setJoinCodeInput('');
      setShowCircleForm('none');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Circle code not found.');
    } finally {
      setFormBusy(false);
    }
  };

  return (
    <aside className="w-full lg:w-[360px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
      {/* Circle Switcher & Invite Actions */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Friend Circle
          </span>
          {isSignedIn && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setShowCircleForm((prev) => (prev === 'join' ? 'none' : 'join'));
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Join</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setShowCircleForm((prev) => (prev === 'create' ? 'none' : 'create'));
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          )}
        </div>

        {isSignedIn && circles.length > 0 ? (
          <div className="flex items-center gap-2">
            <select
              value={activeCircle?.id || ''}
              onChange={(e) => onSelectCircle(e.target.value)}
              aria-label="Select active friend circle"
              className="flex-1 min-w-0 px-3 py-2 text-sm font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCopyInvite}
              title="Copy circle invite link"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedInvite ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Invite</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isSignedIn
              ? 'Create a circle or join with a friend code to start tracking together.'
              : 'Sign in with Google to create or join a live location circle.'}
          </p>
        )}

        {showCircleForm === 'create' && (
          <form onSubmit={handleCreateSubmit} className="space-y-2 pt-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={circleNameInput}
                onChange={(e) => setCircleNameInput(e.target.value)}
                placeholder="Circle name (e.g. Weekend Trip)"
                maxLength={60}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={formBusy}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Create
              </button>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </form>
        )}

        {showCircleForm === 'join' && (
          <form onSubmit={handleJoinSubmit} className="space-y-2 pt-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="Enter code (e.g. WF-8A2K9Q)"
                maxLength={64}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm font-mono uppercase bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={formBusy}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Join
              </button>
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
          </form>
        )}
      </div>

      {/* Live GPS & Email Alert Status Panel */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Your Live Broadcast
            </span>
          </div>
          {gpsState === 'active' ? (
            <button
              type="button"
              onClick={onStopSharing}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stop Sharing
            </button>
          ) : (
            <button
              type="button"
              onClick={onRequestLocationShare}
              disabled={!isSignedIn || gpsState === 'requesting'}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {gpsState === 'requesting' ? 'Locating...' : 'Allow Location'}
            </button>
          )}
        </div>

        {gpsError && (
          <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{gpsError}</p>
        )}

        {myCoords ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>Coordinates</span>
              <span className="font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                {myCoords.lat.toFixed(5)}, {myCoords.lng.toFixed(5)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={myCoords.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors whitespace-nowrap"
              >
                <span>Open Maps Link</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={handleCopyMyLink}
                className="py-1.5 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedMapsLink ? 'Copied' : 'Copy Link'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Allow GPS access to broadcast your live position and send your Google Maps link to{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{recipientEmail}</span>.
          </p>
        )}
      </div>

      {/* Friends List */}
      <div className="p-4 pb-2 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <Users className="w-3.5 h-3.5" />
            <span>Friends in Circle</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {members.length}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter friends..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 divide-y divide-slate-100 dark:divide-slate-800/80">
        {filteredMembers.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No active friends yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Share your circle invite link or allow your live location to appear on the map.
            </p>
          </div>
        ) : (
          filteredMembers.map((member) => {
            const isSelf = member.uid === currentUserId;
            const isSelected = member.uid === selectedMemberId;
            const distText =
              myCoords && !isSelf
                ? formatDistance(haversineMeters(myCoords, { lat: member.lat, lng: member.lng }))
                : null;

            return (
              <button
                key={member.uid}
                type="button"
                onClick={() => onSelectMember(member.uid)}
                className={`w-full text-left px-3 py-3 rounded-lg transition-colors flex items-start gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0 relative"
                  style={{ backgroundColor: member.avatarColor }}
                >
                  <span>{getInitials(member.displayName)}</span>
                  {member.isSharing && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {isSelf ? `${member.displayName} (You)` : member.displayName}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {member.isSharing ? formatRelativeTime(member.updatedAt, nowMs) : 'Paused'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                    <span className="font-mono tabular-nums">{formatSpeed(member.speed)}</span>
                    {distText && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{distText} away</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
