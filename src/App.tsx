import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { LogOut, MapPin, Menu, Radio, X } from 'lucide-react';
import emailjs from '@emailjs/browser';
import {
  db,
  handleFirestoreError,
  initAuthObserver,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './lib/firebase';
import {
  buildGoogleMapsUrl,
  generateCircleCode,
  getAvatarColor,
  haversineMeters,
  toMillis,
} from './lib/geo';
import {
  ActiveTab,
  CircleMemberLocation,
  DeliveryMethod,
  FriendCircle,
  GpsPermissionState,
  LocationAlert,
  TrailPoint,
  UserProfile,
} from './types/location';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { LiveMapCanvas } from './components/LiveMapCanvas';
import { FriendSidebar } from './components/FriendSidebar';
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { MailAlertsPanel } from './components/MailAlertsPanel';
import { CircleInfoPanel } from './components/CircleInfoPanel';

const RECIPIENT_EMAIL = 'bdbishal72@gmail.com';
const MAX_TRAIL_POINTS = 30;

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [circles, setCircles] = useState<FriendCircle[]>([]);
  const [activeCircle, setActiveCircle] = useState<FriendCircle | null>(null);
  const [membersMap, setMembersMap] = useState<Record<string, CircleMemberLocation>>({});
  const [alerts, setAlerts] = useState<LocationAlert[]>([]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);

  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const [gpsState, setGpsState] = useState<GpsPermissionState>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [myCoords, setMyCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    mapsUrl: string;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const watchIdRef = useRef<number | null>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const lastWriteMsRef = useRef<number>(0);
  const shouldSendEmailOnFixRef = useRef<boolean>(false);
  const memberCreatedRef = useRef<Record<string, boolean>>({});

  // Listen for Google Maps Demo Key Quota Exceeded events
  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  // Periodic clock for relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss transient feedback toast
  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Auth observer
  useEffect(() => {
    const unsubscribe = initAuthObserver((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setCircles([]);
        setActiveCircle(null);
        setMembersMap({});
        setAlerts([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // Join circle helper
  const joinCircleByCode = useCallback(
    async (rawCode: string, currentUser: User) => {
      const code = rawCode.trim().toUpperCase();
      if (!/^[a-zA-Z0-9_-]{4,64}$/.test(code)) {
        throw new Error('Circle code must be 4–64 letters, numbers, or hyphens.');
      }

      const circlePath = `circles/${code}`;
      let circleSnap;
      try {
        circleSnap = await getDoc(doc(db, 'circles', code));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, circlePath);
      }

      if (!circleSnap.exists()) {
        throw new Error(`No friend circle found for code "${code}".`);
      }

      const data = circleSnap.data() as FriendCircle;
      if (!data.memberUids.includes(currentUser.uid)) {
        if (data.memberUids.length >= 25) {
          throw new Error('This circle has reached its 25-member capacity.');
        }
        try {
          await updateDoc(doc(db, 'circles', code), {
            memberUids: arrayUnion(currentUser.uid),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, circlePath);
        }
      }

      const userPath = `users/${currentUser.uid}`;
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          activeCircleId: code,
          joinedCircleIds: arrayUnion(code),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    },
    []
  );

  // Create circle helper
  const createCircle = useCallback(async (name: string, currentUser: User) => {
    const cleanName = name.trim().slice(0, 60);
    if (!cleanName) throw new Error('Circle name is required.');
    const code = generateCircleCode();
    const circlePath = `circles/${code}`;

    try {
      await setDoc(doc(db, 'circles', code), {
        id: code,
        name: cleanName,
        ownerId: currentUser.uid,
        memberUids: [currentUser.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, circlePath);
    }

    const userPath = `users/${currentUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        activeCircleId: code,
        joinedCircleIds: arrayUnion(code),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    }
  }, []);

  // Ensure user profile & initial circle on auth
  useEffect(() => {
    if (!authReady || !user) return;

    const userDocRef = doc(db, 'users', user.uid);
    let cancelled = false;

    const initProfileAndCircle = async () => {
      try {
        const snap = await getDoc(userDocRef);
        if (cancelled) return;

        const inviteParam = new URLSearchParams(window.location.search).get('circle');

        if (!snap.exists()) {
          const initialCode = generateCircleCode();
          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: (user.displayName || 'Wayfinder User').slice(0, 80),
            email: (user.email || '').slice(0, 160),
            photoUrl: (user.photoURL || '').slice(0, 500),
            activeCircleId: initialCode,
            joinedCircleIds: [initialCode],
          };

          await setDoc(userDocRef, {
            ...newProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          await setDoc(doc(db, 'circles', initialCode), {
            id: initialCode,
            name: `${newProfile.displayName.split(' ')[0]}'s Circle`,
            ownerId: user.uid,
            memberUids: [user.uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (inviteParam) {
            try {
              await joinCircleByCode(inviteParam, user);
            } catch {
              // Ignore invalid invite param on initial load
            }
          }
        } else if (inviteParam) {
          try {
            await joinCircleByCode(inviteParam, user);
          } catch {
            // Ignore invalid invite param
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    };

    initProfileAndCircle();

    const unsubProfile = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    return () => {
      cancelled = true;
      unsubProfile();
    };
  }, [authReady, user, joinCircleByCode]);

  // Load joined circles metadata
  useEffect(() => {
    if (!authReady || !user || !profile) return;
    const ids = profile.joinedCircleIds.slice(0, 20);
    if (ids.length === 0) {
      setCircles([]);
      setActiveCircle(null);
      return;
    }

    let cancelled = false;
    const loadCircles = async () => {
      const loaded: FriendCircle[] = [];
      for (const cid of ids) {
        try {
          const snap = await getDoc(doc(db, 'circles', cid));
          if (snap.exists()) {
            loaded.push(snap.data() as FriendCircle);
          }
        } catch {
          // Skip inaccessible or deleted circles
        }
      }
      if (!cancelled) {
        setCircles(loaded);
      }
    };
    loadCircles();

    const activeId = profile.activeCircleId || ids[0];
    if (!activeId) return;

    const unsubActiveCircle = onSnapshot(
      doc(db, 'circles', activeId),
      (snap) => {
        if (snap.exists()) {
          const cData = snap.data() as FriendCircle;
          setActiveCircle(cData);
          setCircles((prev) => {
            const exists = prev.some((c) => c.id === cData.id);
            if (!exists) return [...prev, cData];
            return prev.map((c) => (c.id === cData.id ? cData : c));
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `circles/${activeId}`)
    );

    return () => {
      cancelled = true;
      unsubActiveCircle();
    };
  }, [authReady, user, profile]);

  // Subscribe to real-time member locations inside the active circle
  useEffect(() => {
    if (!authReady || !user || !activeCircle) {
      setMembersMap({});
      return;
    }

    const circleId = activeCircle.id;
    const unsubs: (() => void)[] = [];
    setMembersMap({});

    for (const memberUid of activeCircle.memberUids) {
      const memberDocPath = `circles/${circleId}/members/${memberUid}`;
      const unsub = onSnapshot(
        doc(db, 'circles', circleId, 'members', memberUid),
        (snap) => {
          setMembersMap((prev) => {
            if (!snap.exists()) {
              if (!prev[memberUid]) return prev;
              const next = { ...prev };
              delete next[memberUid];
              return next;
            }
            const mData = snap.data() as CircleMemberLocation;
            if (memberUid === user.uid) {
              memberCreatedRef.current[`${circleId}:${memberUid}`] = true;
            }
            return { ...prev, [memberUid]: mData };
          });
        },
        (err) => handleFirestoreError(err, OperationType.GET, memberDocPath)
      );
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, user, activeCircle]);

  // Subscribe to user's location mail alerts history
  useEffect(() => {
    if (!authReady || !user) return;
    const alertsPath = `users/${user.uid}/alerts`;
    const alertsQuery = query(
      collection(db, 'users', user.uid, 'alerts'),
      where('userId', '==', user.uid)
    );

    const unsub = onSnapshot(
      alertsQuery,
      (snap) => {
        const items: LocationAlert[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LocationAlert, 'id'>),
        }));
        items.sort((a, b) => (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0));
        setAlerts(items);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, alertsPath)
    );

    return () => unsub();
  }, [authReady, user]);

  // Dispatch location alert email to bdbishal72@gmail.com and record in Firestore
  const sendLocationEmailAlert = useCallback(
    async (coords: { lat: number; lng: number; accuracy: number; mapsUrl: string }) => {
      if (!user) return;
      const circleName = activeCircle?.name || 'Direct Share';
      const circleId = activeCircle?.id || 'DIRECT';

      let deliveryMethod: DeliveryMethod = 'mailto_fallback';
      let status: 'sent' | 'failed' | 'pending' = 'pending';

      try {
        let data: {
          sent?: boolean;
          useBrowserEmailJs?: boolean;
          emailjsBrowserConfig?: {
            serviceId: string;
            templateId: string;
            publicKey: string;
          } | null;
          deliveryMethod?: DeliveryMethod;
        } = {};

        try {
          const res = await fetch('/api/notify-location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              displayName: user.displayName || 'Wayfinder User',
              senderEmail: user.email || '',
              lat: coords.lat,
              lng: coords.lng,
              accuracy: coords.accuracy,
              circleName,
              circleId,
              mapsUrl: coords.mapsUrl,
            }),
          });

          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            data = (await res.json()) as typeof data;
          }
        } catch {
          // Static hosting (e.g., InfinityFree) has no Node backend; fall back to browser EmailJS
        }

        if (data.sent && data.deliveryMethod) {
          deliveryMethod = data.deliveryMethod;
          status = 'sent';
        } else {
          const browserServiceId =
            data.emailjsBrowserConfig?.serviceId || import.meta.env.VITE_EMAILJS_SERVICE_ID;
          const browserTemplateId =
            data.emailjsBrowserConfig?.templateId || import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
          const browserPublicKey =
            data.emailjsBrowserConfig?.publicKey || import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

          if (browserServiceId && browserTemplateId && browserPublicKey) {
            try {
              const displayName = user.displayName || 'Wayfinder User';
              const senderEmail = user.email || 'user@wayfinder.app';
              const timestampIso = new Date().toISOString();
              const textBody = [
                `${displayName} (${senderEmail}) granted live location permission on Wayfinder.`,
                '',
                `Google Maps Link: ${coords.mapsUrl}`,
                `Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
                `GPS Accuracy: ±${Math.round(coords.accuracy)} m`,
                `Friend Circle: ${circleName} (${circleId})`,
                `Timestamp (UTC): ${timestampIso}`,
              ].join('\n');

              await emailjs.send(
                browserServiceId,
                browserTemplateId,
                {
                  email: RECIPIENT_EMAIL,
                  to: RECIPIENT_EMAIL,
                  to_mail: RECIPIENT_EMAIL,
                  to_email: RECIPIENT_EMAIL,
                  recipient: RECIPIENT_EMAIL,
                  recipient_email: RECIPIENT_EMAIL,
                  to_name: 'Bishal',
                  from_name: displayName,
                  from_email: senderEmail,
                  reply_to: senderEmail,
                  user_name: displayName,
                  user_email: senderEmail,
                  subject: `Wayfinder Live Location Alert — ${displayName}`,
                  maps_url: coords.mapsUrl,
                  location_link: coords.mapsUrl,
                  google_maps_link: coords.mapsUrl,
                  latitude: coords.lat.toFixed(6),
                  longitude: coords.lng.toFixed(6),
                  accuracy: `±${Math.round(coords.accuracy)} m`,
                  circle_name: circleName,
                  circle_id: circleId,
                  timestamp: timestampIso,
                  message: textBody,
                },
                { publicKey: browserPublicKey }
              );
              deliveryMethod = 'emailjs';
              status = 'sent';
            } catch (ejsErr: unknown) {
              const errStatus =
                typeof ejsErr === 'object' && ejsErr !== null && 'status' in ejsErr
                  ? (ejsErr as { status?: number }).status
                  : undefined;
              deliveryMethod = 'mailto_fallback';
              status = 'pending';
              if (errStatus === 422) {
                setToastMsg(
                  `Set "To Email" to ${RECIPIENT_EMAIL} (or {{to_email}}) in your EmailJS template.`
                );
              }
            }
          } else {
            deliveryMethod = 'mailto_fallback';
            status = 'pending';
          }
        }
      } catch (err) {
        console.error('Failed to trigger location email:', err);
        deliveryMethod = 'mailto_fallback';
        status = 'failed';
      }

      // Persist alert record in Firestore
      const alertId = `alert_${Date.now()}`;
      const alertPath = `users/${user.uid}/alerts/${alertId}`;
      try {
        await setDoc(doc(db, 'users', user.uid, 'alerts', alertId), {
          userId: user.uid,
          recipientEmail: RECIPIENT_EMAIL,
          lat: coords.lat,
          lng: coords.lng,
          mapsUrl: coords.mapsUrl,
          deliveryMethod,
          status,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, alertPath);
      }
    },
    [user, activeCircle]
  );

  // Persist live GPS coordinates to active circle member doc
  const publishPosition = useCallback(
    async (position: GeolocationPosition) => {
      if (!user || !activeCircle) return;

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.max(0, position.coords.accuracy ?? 0);
      const heading =
        typeof position.coords.heading === 'number' && Number.isFinite(position.coords.heading)
          ? position.coords.heading
          : -1;
      const speed =
        typeof position.coords.speed === 'number' && Number.isFinite(position.coords.speed)
          ? Math.max(0, position.coords.speed)
          : 0;
      const mapsUrl = buildGoogleMapsUrl(lat, lng);

      const nextCoords = { lat, lng, accuracy, mapsUrl };
      setMyCoords(nextCoords);

      // Trigger one-time email alert immediately when permission & first fix arrive
      if (shouldSendEmailOnFixRef.current) {
        shouldSendEmailOnFixRef.current = false;
        sendLocationEmailAlert(nextCoords);
      }

      // Throttle Firestore writes to ~2.5s intervals
      const now = Date.now();
      const prevTrail = trailRef.current;
      const lastPoint = prevTrail[prevTrail.length - 1];
      const movedMeters = lastPoint ? haversineMeters(lastPoint, { lat, lng }) : 999;

      if (now - lastWriteMsRef.current < 2500 && movedMeters < 8) {
        return;
      }
      lastWriteMsRef.current = now;

      if (!lastPoint || movedMeters >= 8) {
        const nextTrail = [...prevTrail, { lat, lng, t: now }].slice(-MAX_TRAIL_POINTS);
        trailRef.current = nextTrail;
      }

      const circleId = activeCircle.id;
      const key = `${circleId}:${user.uid}`;
      const memberRef = doc(db, 'circles', circleId, 'members', user.uid);
      const memberPath = `circles/${circleId}/members/${user.uid}`;

      const payload = {
        uid: user.uid,
        circleId,
        displayName: (user.displayName || 'Wayfinder User').slice(0, 80),
        avatarColor: getAvatarColor(user.uid),
        lat,
        lng,
        accuracy,
        heading,
        speed,
        isSharing: true,
        mapsUrl,
        trail: trailRef.current,
        updatedAt: serverTimestamp(),
      };

      try {
        let alreadyExists = memberCreatedRef.current[key] || Boolean(membersMap[user.uid]);
        if (!alreadyExists) {
          const existingSnap = await getDoc(memberRef);
          alreadyExists = existingSnap.exists();
        }
        if (alreadyExists) {
          memberCreatedRef.current[key] = true;
          await updateDoc(memberRef, {
            displayName: payload.displayName,
            avatarColor: payload.avatarColor,
            lat: payload.lat,
            lng: payload.lng,
            accuracy: payload.accuracy,
            heading: payload.heading,
            speed: payload.speed,
            isSharing: true,
            mapsUrl: payload.mapsUrl,
            trail: payload.trail,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(memberRef, {
            ...payload,
            createdAt: serverTimestamp(),
          });
          memberCreatedRef.current[key] = true;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, memberPath);
      }
    },
    [user, activeCircle, membersMap, sendLocationEmailAlert]
  );

  // Stop sharing live location
  const handleStopSharing = useCallback(async () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsState('idle');
    shouldSendEmailOnFixRef.current = false;

    if (user && activeCircle && membersMap[user.uid]) {
      const memberPath = `circles/${activeCircle.id}/members/${user.uid}`;
      try {
        await updateDoc(doc(db, 'circles', activeCircle.id, 'members', user.uid), {
          isSharing: false,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, memberPath);
      }
    }
  }, [user, activeCircle, membersMap]);

  // Cleanup geolocation watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Start GPS watch after explicit consent
  const startLocationTracking = useCallback(
    (withEmailAlert: boolean) => {
      setConsentModalOpen(false);
      if (!('geolocation' in navigator)) {
        setGpsState('error');
        setGpsError('Geolocation is not supported by your browser.');
        return;
      }

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      setGpsError(null);
      setGpsState('requesting');
      shouldSendEmailOnFixRef.current = withEmailAlert;
      lastWriteMsRef.current = 0;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsState('active');
          publishPosition(pos);
          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPos) => {
              setGpsState('active');
              publishPosition(nextPos);
            },
            (watchErr) => {
              if (watchErr.code === watchErr.PERMISSION_DENIED) {
                setGpsState('denied');
                setGpsError('Location permission denied. Enable location access in browser settings.');
              }
            },
            {
              enableHighAccuracy: true,
              maximumAge: 4000,
              timeout: 15000,
            }
          );
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsState('denied');
            setGpsError('Location permission was denied. Allow browser location access to share.');
          } else {
            setGpsState('error');
            setGpsError(err.message || 'Unable to acquire GPS fix.');
          }
          shouldSendEmailOnFixRef.current = false;
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 15000,
        }
      );
    },
    [publishPosition]
  );

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const signedInUser = await signInWithGoogle();
      setUser(signedInUser);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSelectCircle = async (circleId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        activeCircleId: circleId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleLeaveCircle = async (circleId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'circles', circleId), {
        memberUids: arrayRemove(user.uid),
        updatedAt: serverTimestamp(),
      });
      const remaining = (profile?.joinedCircleIds || []).filter((id) => id !== circleId);
      await updateDoc(doc(db, 'users', user.uid), {
        joinedCircleIds: arrayRemove(circleId),
        activeCircleId: remaining[0] || '',
        updatedAt: serverTimestamp(),
      });
      setActiveTab('map');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `circles/${circleId}`);
    }
  };

  const membersList = useMemo(() => {
    return Object.values(membersMap).sort((a, b) => {
      if (a.uid === user?.uid) return -1;
      if (b.uid === user?.uid) return 1;
      if (a.isSharing !== b.isSharing) return a.isSharing ? -1 : 1;
      return (toMillis(b.updatedAt) ?? 0) - (toMillis(a.updatedAt) ?? 0);
    });
  }, [membersMap, user]);

  const handleSelectFriend = (uid: string) => {
    setSelectedMemberId(uid);
    setFocusTrigger((prev) => prev + 1);
    setActiveTab('map');
    setMobileDrawerOpen(false);
  };

  const handleShareButtonClick = () => {
    if (!user) {
      handleGoogleLogin();
      return;
    }
    if (gpsState === 'active') {
      handleStopSharing();
    } else {
      setConsentModalOpen(true);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Demo-Key Quota Exceeded Banner (Case A) */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="h-14 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-8 z-30">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen((prev) => !prev)}
            aria-label="Toggle friends drawer"
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {mobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <a
            href="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            Wayfinder
          </a>
        </div>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {(
            [
              { id: 'map', label: 'Live Map' },
              { id: 'friends', label: 'Friends' },
              { id: 'alerts', label: 'Mail Alerts' },
              { id: 'circle', label: 'Circle Info' },
            ] as { id: ActiveTab; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'friends') {
                  setActiveTab('map');
                  setMobileDrawerOpen(true);
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id || (item.id === 'friends' && mobileDrawerOpen)
                  ? 'border-blue-600 text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {!user ? (
            <GoogleSignInButton onClick={handleGoogleLogin} disabled={authLoading} />
          ) : (
            <button
              type="button"
              onClick={handleShareButtonClick}
              disabled={gpsState === 'requesting'}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gpsState === 'active'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {gpsState === 'active' ? (
                <>
                  <Radio className="w-3.5 h-3.5" />
                  <span>Stop Sharing</span>
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{gpsState === 'requesting' ? 'Locating...' : 'Share Live Location'}</span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {activeTab === 'map' && (
          <>
            {/* Desktop Sidebar */}
            <div className="hidden lg:flex h-full">
              <FriendSidebar
                isSignedIn={Boolean(user)}
                currentUserId={user?.uid ?? null}
                circles={circles}
                activeCircle={activeCircle}
                members={membersList}
                selectedMemberId={selectedMemberId}
                gpsState={gpsState}
                gpsError={gpsError}
                myCoords={myCoords}
                nowMs={nowMs}
                recipientEmail={RECIPIENT_EMAIL}
                onSelectCircle={handleSelectCircle}
                onCreateCircle={(name) =>
                  user ? createCircle(name, user) : Promise.reject(new Error('Sign in required'))
                }
                onJoinCircle={(code) =>
                  user ? joinCircleByCode(code, user) : Promise.reject(new Error('Sign in required'))
                }
                onSelectMember={handleSelectFriend}
                onRequestLocationShare={() => setConsentModalOpen(true)}
                onStopSharing={handleStopSharing}
              />
            </div>

            {/* Mobile Slide-Over Drawer */}
            {mobileDrawerOpen && (
              <div className="lg:hidden fixed inset-0 top-14 z-40 flex">
                <div className="w-80 max-w-[88vw] h-full shadow-2xl">
                  <FriendSidebar
                    isSignedIn={Boolean(user)}
                    currentUserId={user?.uid ?? null}
                    circles={circles}
                    activeCircle={activeCircle}
                    members={membersList}
                    selectedMemberId={selectedMemberId}
                    gpsState={gpsState}
                    gpsError={gpsError}
                    myCoords={myCoords}
                    nowMs={nowMs}
                    recipientEmail={RECIPIENT_EMAIL}
                    onSelectCircle={handleSelectCircle}
                    onCreateCircle={(name) =>
                      user ? createCircle(name, user) : Promise.reject(new Error('Sign in required'))
                    }
                    onJoinCircle={(code) =>
                      user
                        ? joinCircleByCode(code, user)
                        : Promise.reject(new Error('Sign in required'))
                    }
                    onSelectMember={handleSelectFriend}
                    onRequestLocationShare={() => {
                      setMobileDrawerOpen(false);
                      setConsentModalOpen(true);
                    }}
                    onStopSharing={handleStopSharing}
                  />
                </div>
                <div
                  className="flex-1 bg-slate-950/40"
                  onClick={() => setMobileDrawerOpen(false)}
                />
              </div>
            )}

            {/* Primary Focal Anchor: Interactive Real-Time Google Map */}
            <main className="flex-1 h-full relative min-w-0">
              <LiveMapCanvas
                members={membersList}
                currentUserId={user?.uid ?? null}
                selectedMemberId={selectedMemberId}
                onSelectMember={setSelectedMemberId}
                focusTrigger={focusTrigger}
                nowMs={nowMs}
              />

              {/* Compact Sign-In Prompt Card only if user is signed out */}
              {authReady && !user && (
                <div className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-sm z-20 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border border-slate-200 dark:border-slate-700 shadow-lg p-5 space-y-3">
                  <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Track friends in real time
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Sign in with Google to allow live GPS sharing, follow friends&apos; movement
                    trails on the map, and send your Google Maps location link to{' '}
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {RECIPIENT_EMAIL}
                    </span>
                    .
                  </p>
                  {authError && <p className="text-xs text-red-600">{authError}</p>}
                  <GoogleSignInButton onClick={handleGoogleLogin} disabled={authLoading} />
                </div>
              )}
            </main>
          </>
        )}

        {activeTab === 'alerts' && (
          <MailAlertsPanel
            alerts={alerts}
            recipientEmail={RECIPIENT_EMAIL}
            nowMs={nowMs}
            hasCoords={Boolean(myCoords)}
            onSendManualAlert={() => {
              if (myCoords) sendLocationEmailAlert(myCoords);
            }}
          />
        )}

        {activeTab === 'circle' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CircleInfoPanel
              activeCircle={activeCircle}
              members={membersList}
              currentUserId={user?.uid ?? null}
              onLeaveCircle={handleLeaveCircle}
            />
            {user && (
              <div className="px-6 py-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>
                  Signed in as{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {user.displayName}
                  </strong>{' '}
                  ({user.email})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    handleStopSharing();
                    signOutUser();
                  }}
                  className="inline-flex items-center gap-1.5 text-red-600 hover:underline font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden h-12 shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('map');
            setMobileDrawerOpen(false);
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            activeTab === 'map' && !mobileDrawerOpen
              ? 'text-blue-600 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Live Map
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('map');
            setMobileDrawerOpen(true);
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            mobileDrawerOpen ? 'text-blue-600 font-semibold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Friends
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileDrawerOpen(false);
            setActiveTab('alerts');
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            activeTab === 'alerts'
              ? 'text-blue-600 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Mail Alerts
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileDrawerOpen(false);
            setActiveTab('circle');
          }}
          className={`text-xs font-medium px-3 py-1.5 rounded-md ${
            activeTab === 'circle'
              ? 'text-blue-600 font-semibold'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Circle
        </button>
      </div>

      {/* Explicit Location & Mail Confirmation Modal */}
      <LocationPermissionModal
        isOpen={consentModalOpen}
        recipientEmail={RECIPIENT_EMAIL}
        circleName={activeCircle?.name || 'your friend circle'}
        onConfirmWithEmail={() => startLocationTracking(true)}
        onConfirmMapOnly={() => startLocationTracking(false)}
        onClose={() => setConsentModalOpen(false)}
      />

      {/* Transient Feedback Toast */}
      {toastMsg && (
        <div className="fixed bottom-16 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
