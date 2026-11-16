import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerProps,
  APIProvider,
  CollisionBehavior,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import { Crosshair, ExternalLink, Layers, Navigation, Route, Users } from 'lucide-react';
import { CircleMemberLocation } from '../types/location';
import { formatRelativeTime, formatSpeed, getInitials } from '../lib/geo';

interface LiveMapCanvasProps {
  members: CircleMemberLocation[];
  currentUserId: string | null;
  selectedMemberId: string | null;
  onSelectMember: (uid: string | null) => void;
  focusTrigger: number;
  nowMs: number;
}

type MapTypeOption = 'roadmap' | 'satellite' | 'terrain';

interface AdvancedMarkerWithRefProps extends AdvancedMarkerProps {
  onMarkerClick: (marker: google.maps.marker.AdvancedMarkerElement) => void;
}

const AdvancedMarkerWithRef: React.FC<AdvancedMarkerWithRefProps> = ({
  children,
  onMarkerClick,
  ...rest
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <AdvancedMarker
      ref={markerRef}
      onClick={() => {
        if (marker) {
          onMarkerClick(marker);
        }
      }}
      {...rest}
    >
      {children}
    </AdvancedMarker>
  );
};

interface FriendOverlaysProps {
  members: CircleMemberLocation[];
  showTrails: boolean;
  selectedMemberId: string | null;
  focusTrigger: number;
  currentUserId: string | null;
}

const FriendOverlays: React.FC<FriendOverlaysProps> = ({
  members,
  showTrails,
  selectedMemberId,
  focusTrigger,
  currentUserId,
}) => {
  const map = useMap();
  const polylinesRef = useRef<Record<string, google.maps.Polyline>>({});
  const circlesRef = useRef<Record<string, google.maps.Circle>>({});
  const hasAutoFittedRef = useRef(false);

  // Sync Polyline movement trails & GPS accuracy circles
  useEffect(() => {
    if (!map) return;

    const activeIds: Record<string, boolean> = {};

    for (const member of members) {
      activeIds[member.uid] = true;

      // Accuracy Circle
      const existingCircle = circlesRef.current[member.uid];
      const circleCenter = { lat: member.lat, lng: member.lng };
      const circleRadius = Math.min(Math.max(member.accuracy || 15, 10), 2500);

      if (existingCircle) {
        existingCircle.setCenter(circleCenter);
        existingCircle.setRadius(circleRadius);
        existingCircle.setOptions({
          strokeColor: member.avatarColor,
          fillColor: member.avatarColor,
          visible: member.isSharing,
        });
      } else {
        circlesRef.current[member.uid] = new google.maps.Circle({
          map,
          center: circleCenter,
          radius: circleRadius,
          strokeColor: member.avatarColor,
          strokeOpacity: 0.35,
          strokeWeight: 1,
          fillColor: member.avatarColor,
          fillOpacity: 0.1,
          clickable: false,
          visible: member.isSharing,
        });
      }

      // Movement Trail Polyline
      const trailPath = member.trail.map((pt) => ({ lat: pt.lat, lng: pt.lng }));
      const existingPoly = polylinesRef.current[member.uid];

      if (existingPoly) {
        existingPoly.setPath(trailPath);
        existingPoly.setOptions({
          strokeColor: member.avatarColor,
          visible: showTrails && trailPath.length >= 2,
          strokeWeight: selectedMemberId === member.uid ? 4 : 3,
          strokeOpacity: selectedMemberId === member.uid ? 0.95 : 0.7,
        });
      } else {
        polylinesRef.current[member.uid] = new google.maps.Polyline({
          map,
          path: trailPath,
          geodesic: true,
          strokeColor: member.avatarColor,
          strokeOpacity: 0.75,
          strokeWeight: 3,
          clickable: false,
          visible: showTrails && trailPath.length >= 2,
        });
      }
    }

    // Remove overlays for members who left
    for (const uid of Object.keys(polylinesRef.current)) {
      if (!activeIds[uid]) {
        polylinesRef.current[uid].setMap(null);
        delete polylinesRef.current[uid];
      }
    }
    for (const uid of Object.keys(circlesRef.current)) {
      if (!activeIds[uid]) {
        circlesRef.current[uid].setMap(null);
        delete circlesRef.current[uid];
      }
    }
  }, [map, members, showTrails, selectedMemberId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const poly of Object.values(polylinesRef.current)) {
        poly.setMap(null);
      }
      for (const circle of Object.values(circlesRef.current)) {
        circle.setMap(null);
      }
      polylinesRef.current = {};
      circlesRef.current = {};
    };
  }, []);

  // Auto-fit once when initial members arrive
  useEffect(() => {
    if (!map || hasAutoFittedRef.current || members.length === 0) return;
    hasAutoFittedRef.current = true;
    if (members.length === 1) {
      map.panTo({ lat: members[0].lat, lng: members[0].lng });
      map.setZoom(15);
    } else {
      const bounds = new google.maps.LatLngBounds();
      members.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      map.fitBounds(bounds, 72);
    }
  }, [map, members]);

  // Pan to selected friend when focusTrigger increments
  useEffect(() => {
    if (!map || focusTrigger === 0) return;
    const target = members.find((m) => m.uid === (selectedMemberId || currentUserId));
    if (target) {
      map.panTo({ lat: target.lat, lng: target.lng });
      const currentZoom = map.getZoom() ?? 12;
      if (currentZoom < 15) {
        map.setZoom(15);
      }
    }
  }, [map, focusTrigger, selectedMemberId, currentUserId, members]);

  return null;
};

interface MapToolbarProps {
  members: CircleMemberLocation[];
  currentUserId: string | null;
  showTrails: boolean;
  onToggleTrails: () => void;
  mapType: MapTypeOption;
  onChangeMapType: (type: MapTypeOption) => void;
  onSelectMember: (uid: string | null) => void;
}

const MapToolbar: React.FC<MapToolbarProps> = ({
  members,
  currentUserId,
  showTrails,
  onToggleTrails,
  mapType,
  onChangeMapType,
  onSelectMember,
}) => {
  const map = useMap();

  const handleFitAll = useCallback(() => {
    if (!map || members.length === 0) return;
    if (members.length === 1) {
      map.panTo({ lat: members[0].lat, lng: members[0].lng });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    members.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
    map.fitBounds(bounds, 72);
  }, [map, members]);

  const handleCenterMe = useCallback(() => {
    if (!map || !currentUserId) return;
    const me = members.find((m) => m.uid === currentUserId);
    if (me) {
      onSelectMember(me.uid);
      map.panTo({ lat: me.lat, lng: me.lng });
      map.setZoom(16);
    }
  }, [map, currentUserId, members, onSelectMember]);

  return (
    <div className="absolute bottom-5 right-4 z-10 flex flex-wrap items-center gap-2">
      <div className="flex items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-1">
        {(['roadmap', 'satellite', 'terrain'] as MapTypeOption[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChangeMapType(type)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mapType === type
                ? 'bg-slate-900 text-white dark:bg-blue-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleTrails}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          showTrails
            ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-600 dark:border-blue-600'
            : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
        }`}
      >
        <Route className="w-3.5 h-3.5" />
        <span>Trails</span>
      </button>

      <button
        type="button"
        onClick={handleFitAll}
        disabled={members.length === 0}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Users className="w-3.5 h-3.5" />
        <span>Fit Friends</span>
      </button>

      {currentUserId && members.some((m) => m.uid === currentUserId) && (
        <button
          type="button"
          onClick={handleCenterMe}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>My Pin</span>
        </button>
      )}
    </div>
  );
};

export const LiveMapCanvas: React.FC<LiveMapCanvasProps> = ({
  members,
  currentUserId,
  selectedMemberId,
  onSelectMember,
  focusTrigger,
  nowMs,
}) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [showTrails, setShowTrails] = useState(true);
  const [mapType, setMapType] = useState<MapTypeOption>('roadmap');

  // Sort members descending by latitude so southern markers render cleanly above northern ones
  const sortedMembers = useMemo(() => {
    return [...members]
      .sort((a, b) => b.lat - a.lat)
      .map((member, index) => ({
        member,
        baseZIndex: index + 1,
      }));
  }, [members]);

  const activeMember = useMemo(
    () => members.find((m) => m.uid === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const handleMarkerClick = useCallback(
    (uid: string, marker: google.maps.marker.AdvancedMarkerElement) => {
      onSelectMember(uid);
      setSelectedMarker(marker);
    },
    [onSelectMember]
  );

  if (!apiKey) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 p-8 text-center">
        <Layers className="w-10 h-10 text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Google Maps API key required
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mt-1">
          Configure <code className="font-mono text-xs">VITE_GOOGLE_MAPS_API_KEY</code> in your
          environment to render the real-time friend tracking map.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="US">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: 37.7749, lng: -122.4194 }}
          defaultZoom={12}
          gestureHandling="greedy"
          mapTypeId={mapType}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <FriendOverlays
            members={members}
            showTrails={showTrails}
            selectedMemberId={selectedMemberId}
            focusTrigger={focusTrigger}
            currentUserId={currentUserId}
          />

          {sortedMembers.map(({ member, baseZIndex }) => {
            const isSelected = selectedMemberId === member.uid;
            const isHovered = hoveredId === member.uid;
            const isSelf = currentUserId === member.uid;
            let zIndex = baseZIndex;
            if (isHovered) zIndex = 999;
            if (isSelected) zIndex = 1000;

            return (
              <AdvancedMarkerWithRef
                key={member.uid}
                position={{ lat: member.lat, lng: member.lng }}
                zIndex={zIndex}
                collisionBehavior={CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY}
                title={member.displayName}
                onMouseEnter={() => setHoveredId(member.uid)}
                onMouseLeave={() => setHoveredId(null)}
                onMarkerClick={(marker) => handleMarkerClick(member.uid, marker)}
              >
                <div className="flex flex-col items-center cursor-pointer select-none group">
                  <div
                    className={`relative flex items-center justify-center w-10 h-10 rounded-full text-white font-semibold text-xs shadow-md border-2 transition-transform duration-150 ${
                      isSelected ? 'scale-110 ring-4 ring-blue-500/25' : 'group-hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: member.avatarColor,
                      borderColor: '#ffffff',
                    }}
                  >
                    <span>{getInitials(member.displayName)}</span>
                    {member.heading >= 0 && member.speed > 0.4 && (
                      <span
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-slate-900 drop-shadow-xs"
                        style={{
                          transform: `rotate(${member.heading}deg)`,
                        }}
                      >
                        <Navigation className="w-3.5 h-3.5 fill-white stroke-slate-900" />
                      </span>
                    )}
                    {member.isSharing && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                        title="Live GPS active"
                      />
                    )}
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-slate-900/90 text-white text-[11px] font-medium shadow-xs whitespace-nowrap max-w-[130px] truncate">
                    {isSelf ? `${member.displayName} (You)` : member.displayName}
                  </div>
                </div>
              </AdvancedMarkerWithRef>
            );
          })}

          {activeMember && selectedMarker && (
            <InfoWindow
              anchor={selectedMarker}
              pixelOffset={[0, -48]}
              onCloseClick={() => {
                onSelectMember(null);
                setSelectedMarker(null);
              }}
            >
              <div className="p-1 min-w-[220px] max-w-[260px] text-slate-900">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200">
                  <span className="font-semibold text-sm truncate">{activeMember.displayName}</span>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    {activeMember.isSharing
                      ? formatRelativeTime(activeMember.updatedAt, nowMs)
                      : 'Paused'}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-3">
                    <span>Coords</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {activeMember.lat.toFixed(5)}, {activeMember.lng.toFixed(5)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Movement</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatSpeed(activeMember.speed)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Accuracy</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      ±{Math.round(activeMember.accuracy)} m
                    </span>
                  </div>
                </div>

                <a
                  href={activeMember.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </InfoWindow>
          )}

          <MapToolbar
            members={members}
            currentUserId={currentUserId}
            showTrails={showTrails}
            onToggleTrails={() => setShowTrails((prev) => !prev)}
            mapType={mapType}
            onChangeMapType={setMapType}
            onSelectMember={onSelectMember}
          />
        </GoogleMap>
      </APIProvider>
    </div>
  );
};
