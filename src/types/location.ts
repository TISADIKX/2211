export interface TrailPoint {
  lat: number;
  lng: number;
  t: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoUrl: string;
  activeCircleId: string;
  joinedCircleIds: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FriendCircle {
  id: string;
  name: string;
  ownerId: string;
  memberUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CircleMemberLocation {
  uid: string;
  circleId: string;
  displayName: string;
  avatarColor: string;
  lat: number;
  lng: number;
  accuracy: number;
  heading: number;
  speed: number;
  isSharing: boolean;
  mapsUrl: string;
  trail: TrailPoint[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DeliveryMethod = 'emailjs' | 'resend' | 'smtp' | 'mailto_fallback' | 'gmail_api';

export interface LocationAlert {
  id?: string;
  userId: string;
  recipientEmail: string;
  lat: number;
  lng: number;
  mapsUrl: string;
  deliveryMethod: DeliveryMethod;
  status: 'sent' | 'failed' | 'pending';
  createdAt?: unknown;
}

export type GpsPermissionState = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export type ActiveTab = 'map' | 'friends' | 'alerts' | 'circle';
