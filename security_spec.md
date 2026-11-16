# Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: User email addresses exist exclusively in `/users/{userId}` and `/users/{userId}/alerts/{alertId}` and are readable/writable only by `request.auth.uid == userId` with `email_verified == true`. Public or circle-shared location records in `/circles/{circleId}/members/{memberId}` contain zero PII (`email`, `phone`, `address` forbidden).
2. **Circle Master Gate**: Reading or writing `/circles/{circleId}/members/{memberId}` requires active membership (`request.auth.uid in circle.memberUids`).
3. **Self-Only Location Broadcast**: A user can only create or update their own member location document (`memberId == request.auth.uid` and `incoming().uid == request.auth.uid`).
4. **Immutable Ownership & Temporal Integrity**: `uid`, `ownerId`, `circleId`, and `createdAt` cannot be modified after creation; `createdAt` and `updatedAt` must equal `request.time`.
5. **Bounded Arrays & Strings**: `memberUids.size() <= 25`, `joinedCircleIds.size() <= 20`, `trail.size() <= 30`, and every string has an explicit `.size()` upper bound.
6. **Zero Blanket Listing**: `users` and `circles` forbid `allow list`; `members` restricts `allow list` to `resource.data.uid == request.auth.uid`; `alerts` restricts `allow list` to `isOwner(userId) && resource.data.userId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on User Profile**: `{ "uid": "u1", "displayName": "Alice", "email": "a@example.com", "photoUrl": "", "activeCircleId": "", "joinedCircleIds": [], "isAdmin": true, "createdAt": "<ts>", "updatedAt": "<ts>" }` -> DENIED (`hasOnly` rejects `isAdmin`).
2. **Unverified Email Token Write**: Authenticated user with `email_verified: false` attempting `create` on `/users/u1` -> DENIED (`isVerified()` check fails).
3. **Cross-User PII Read**: User `u2` attempting `get` on `/users/u1` -> DENIED (`isOwner(userId)` fails).
4. **Circle Enumeration Scrape**: Any user attempting `list` on `/circles` -> DENIED (`allow list: if false;`).
5. **Spoofed Member Location Create**: User `u2` attempting `create` at `/circles/c1/members/u1` with `uid: "u1"` -> DENIED (`memberId == request.auth.uid` fails).
6. **Non-Member Location Read**: User `u3` (not in `circles/c1.memberUids`) attempting `get` on `/circles/c1/members/u1` -> DENIED (`isCircleMember(circleId)` fails).
7. **ID Poisoning Attack**: Attempting `create` at `/circles/AAAA...1500chars` -> DENIED (`isValidId` size & regex fail).
8. **Coordinate Bounds Overflow**: Member location update with `lat: 999, lng: -400` -> DENIED (`lat >= -90 && lat <= 90` fails).
9. **Malicious Maps URL Injection**: Member location update with `mapsUrl: "https://evil.example.com/phish"` -> DENIED (`mapsUrl.matches('^https://www\\.google\\.com/maps\\?q=.*$')` fails).
10. **Client-Forged Timestamp**: Creating a document with `createdAt: Timestamp.fromMillis(0)` instead of `serverTimestamp()` -> DENIED (`createdAt == request.time` fails).
11. **Circle Ownership Hijack**: Non-owner member `u2` updating `ownerId` or `name` on `/circles/c1` -> DENIED (update action gate restricts `u2` to adding/removing only `u2` in `memberUids`).
12. **Unbounded Trail DoS**: Member location update with `trail` array containing 31+ items or non-map element -> DENIED (`trail.size() <= 30` fails).
