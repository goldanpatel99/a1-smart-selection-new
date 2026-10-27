# Architecture Refactoring & Real-Time Firestore Synchronization Blueprint

Complete system refactoring to eliminate dual-backend conflicts, enforce Firestore `onSnapshot` as the single real-time source of truth across all devices, protect against the Firestore 1MB document limit for up to 5,000 photos per event, and purge redundant ghost cleanup/tombstone hacks.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed in Phase 1 and govern this entire refactor:

- **Confirmed Decision 1 (Real-Time Cross-Device Synchronization)**:
  Dedicated lightweight Firestore document at `events/{eventId}/live_state/selection` with real-time `onSnapshot` listeners. When a client hearts a photo on mobile, all desktop and tablet gallery instances mirror the heart toggle and counter within <200ms without page reload.
- **Confirmed Decision 2 (Permanent Deletion Architecture)**:
  Complete recursive purge across Cloud Firestore (`events/{eventId}`, `events/{eventId}/photos/{photoId}`, `events/{eventId}/live_state/{stateId}`) and local IndexedDB stores. Eliminates hacky tombstone flags (`event_id_deleted: true`, `isDeleted`) and ghost cleaner modals.
- **Confirmed Decision 3 (Unified Backend & Server Role)**:
  Pure Cloud Firestore source of truth with high-speed IndexedDB device caching. All local disk `.sync_data/` JSON writes, in-memory sync maps, and server SSE streams are completely removed from `server.ts`. `server.ts` is kept strictly lean for Razorpay payments, health monitoring, and static asset serving.

---

## 1. Overview & Core Concept

- **What It Does**:
  Provides professional wedding photographers and their clients with a high-speed, instant-sync photo selection experience. Clients can open their wedding gallery simultaneously on multiple phones or computers; selecting or hearting photos immediately mirrors across every screen in real-time. Photographers can upload up to 5,000 photos across structured folders without hitting Firestore document size limits or browser thread freezes.
- **Target Audience / Persona**:
  - **Wedding Photographers & Studios**: Upload 2,500–5,000 photos per event, track client selection progress in real-time, and download final selection lists (.bat, CSV, folder export).
  - **Wedding Couples & Families**: Seamlessly browse high-resolution watermarked previews on mobile or desktop, select photos together with live counter updates, and finish selections securely.
- **Key Value**:
  - 100% reliable real-time sync across devices via native Firestore WebSocket listeners (`onSnapshot`).
  - Zero document size crash risk (strict subcollection architecture).
  - Instant optimistic UI (<0ms tap response) backed by reliable background persistence.
  - Clean, unbloated codebase without phantom tombstone records or temporary sync directories.

---

## 2. User Experience & Visual Design

Following the **Portfolio & Photography Design Constitution** (`references/7_portfolio_photography.md`), the user experience adheres to media-first minimalism, rich typographic hierarchy, and responsive layout standards:

- **Aesthetic Direction**:
  - Media-first dark luxury canvas (`#050505` to `#0a0a0a`) allowing wedding imagery to provide primary emotion and color.
  - Warm amber (`#f59e0b` / `#d97706`) and rose accents (`#f43f5e`) for selections and milestone completions.
  - Clean typographic pairing: Bold architectural headlines (`Plus Jakarta Sans` / `Outfit`) with refined numeric mono tokens for counts and timers.
- **Key User Flows**:
  1. **Photographer Upload & Organization**:
     - Drag-and-drop folders into dropzone -> Immediate parallel ingestion into IndexedDB and streaming worker to Firestore subcollection (`events/{eventId}/photos/{photoId}`).
     - Guaranteed 100% folder matching (`folderId` and `folderName`), completely eradicating `fld-auto-...` duplicate folders.
  2. **Couple Multi-Device Selection**:
     - Partner A opens gallery on iPhone, Partner B opens gallery on MacBook.
     - Partner A taps heart on photo #42:
       - Instantly turns rose red on iPhone (0ms optimistic UI).
       - Background updates `events/{eventId}/live_state/selection`.
       - Partner B's laptop gallery receives snapshot update and highlights photo #42 within ~150ms without reloading.
     - Live album sheet estimator and countdown update synchronously across both devices.
  3. **Event Deletion & Studio Cleanup**:
     - Photographer confirms permanent deletion in modal -> System executes recursive batch delete removing all subcollections and parent doc in Firestore, while clearing IndexedDB records.
     - Zero residual ghost records or tombstone checks required in UI.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dedicated `live_state/selection` Document vs. Updating Parent Event Doc**
  - *Chosen Approach*: Maintain a dedicated sub-document at `events/{eventId}/live_state/selection` storing `{ selectedPhotoIds: string[], clientNotes: string, status: string, updatedAt: timestamp }`.
  - *Why*: Firestore document update limits allow ~1 write per second per document. By decoupling frequent heart clicks from the heavy parent event document (which contains studio info, deadlines, folder structures, and settings), clients can toggle selections rapidly without contention or write-rate throttling.
  - *Alternatives Considered*: Updating `events/{eventId}` directly would cause write collisions when multiple users tap hearts rapidly.
- **Decision 2: Subcollection Photos (`events/{eventId}/photos/{photoId}`) vs. Array Embedding**
  - *Chosen Approach*: Strictly store individual photos in Firestore subcollection `events/{eventId}/photos/{photoId}` with lightweight metadata on parent doc.
  - *Why*: Firestore has a hard limit of 1MB (1,048,576 bytes) per document. A single event with 2,500–5,000 photos stored in an array easily exceeds 3MB–8MB, causing fatal Firestore write rejections. Subcollection storage scales to unlimited photos safely.
- **Decision 3: Eliminating Server SSE & `.sync_data` vs. Hybrid WebSockets**
  - *Chosen Approach*: Remove all `.sync_data/` file writes and in-memory SSE maps from `server.ts`. Use Firebase SDK native real-time connection.
  - *Why*: Cloud Run and serverless containers are stateless and ephemeral; file writes to container disk are lost on scale-down/redeploy, and SSE connections drop across multiple container instances. Firestore native `onSnapshot` works out of the box across any number of serverless instances and client devices.
- **Decision 4: Clean Deletion Cascade vs. Frontend Tombstones**
  - *Chosen Approach*: Execute standard recursive batch delete of event and photos in Firestore and purge IndexedDB cache.
  - *Why*: Frontend tombstone flags (`event_id_deleted: true`, `isDeleted`) cluttered every single selector and hook with defensive filters, while leaving ghost documents taking up Firestore storage. Real deletion keeps the database pristine.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT DEVICES & BROWSERS                       │
│                                                                        │
│   ┌──────────────────────────┐          ┌──────────────────────────┐   │
│   │   Mobile Safari/Chrome   │          │   Desktop Chrome/Edge    │   │
│   │  (ClientGallery - Couple)│          │  (Dashboard / Gallery)   │   │
│   └─────────────┬────────────┘          └────────────┬─────────────┘   │
└─────────────────┼────────────────────────────────────┼─────────────────┘
                  │                                    │
                  │ Real-Time WebSocket (onSnapshot)   │
                  ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CLOUD FIRESTORE (BACKEND)                       │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ /events/{eventId} (Parent Document - Metadata only)            │   │
│   │ - title, coupleName, clientPhone, status, deadlineDate         │   │
│   │ - folders: [{ id, name, visible, order }]                      │   │
│   │ - photosCount: number, selectedCount: number                   │   │
│   └──────────────────────┬─────────────────────────────────────────┘   │
│                          │                                             │
│       ┌──────────────────┴──────────────────┐                          │
│       ▼                                     ▼                          │
│   ┌───────────────────────────┐    ┌───────────────────────────────┐   │
│   │ /photos/{photoId}         │    │ /live_state/selection         │   │
│   │ Subcollection (up to 5k)  │    │ Dedicated Real-Time Doc       │   │
│   │ - id, filename, folderId  │    │ - selectedPhotoIds: string[]  │   │
│   │ - url, thumbnailUrl       │    │ - clientNotes: string         │   │
│   │ - isSelected, selectedAt  │    │ - status: 'active'|'completed'│   │
│   └───────────────────────────┘    │ - updatedAt: timestamp        │   │
│                                    └───────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
                  ▲
                  │ Local Cache & Offline Backup
┌─────────────────┴──────────────────────────────────────────────────────┐
│                  DEVICE PERSISTENCE (IndexedDB)                        │
│   - Store 'event_photos': offline photos & fast hydration              │
│   - Store 'client_selections': 30-sec safety failsafe backup           │
└────────────────────────────────────────────────────────────────────────┘
                  ▲
                  │ Razorpay & Static Assets Only
┌─────────────────┴──────────────────────────────────────────────────────┐
│                    NODE / EXPRESS SERVER (server.ts)                   │
│   - /api/razorpay/create-order & /api/razorpay/verify-payment          │
│   - /api/health                                                        │
│   - Static production assets & client SPA fallback                     │
│   - (NO .sync_data, NO SSE streams, NO in-memory maps)                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Schema & Document Model

1. **Parent Event Document**: `events/{eventId}`
   ```typescript
   interface WeddingEventMetadata {
     id: string;
     title: string;
     coupleName: string;
     clientPhone: string;
     clientEmail?: string;
     photographerId: string;
     photographerEmail: string;
     studioName: string;
     status: 'active' | 'completed';
     eventDate: string;
     deadlineDate: string;
     maxSelectionLimit?: number;
     photosPerSheet: number;
     folders: Array<{
       id: string;
       name: string;
       visible: boolean;
       order: number;
     }>;
     photosCount: number;
     selectedCount: number;
     coverPhotoUrl?: string;
     pointTier?: 'standard' | 'premium';
     maxPhotoCapacity: 5000;
     createdAt: string;
     submittedAt?: string;
   }
   ```

2. **Live Selection State Document**: `events/{eventId}/live_state/selection`
   ```typescript
   interface LiveSelectionDocument {
     selectedPhotoIds: string[];
     selectedCount: number;
     clientNotes?: string;
     status: 'active' | 'completed';
     updatedAt: string;
   }
   ```

3. **Photo Document**: `events/{eventId}/photos/{photoId}`
   ```typescript
   interface PhotoDocument {
     id: string;
     filename: string;
     originalName: string;
     folderId: string;
     folderName: string;
     url: string;
     thumbnailUrl: string;
     sizeBytes: number;
     isSelected: boolean;
     selectedAt?: string;
     uploadedAt: string;
   }
   ```

---

## 5. Implementation Steps & File Modifications

### Step 1: Clean Up `server.ts`
- Remove `.sync_data` directory creation and file system operations.
- Remove `memorySyncMap`, `eventBackupMap`, and `sseConnections`.
- Remove `/api/events/:eventId/selection`, `/api/events/:eventId/stream`, and backup endpoints.
- Keep Razorpay endpoints, health check, and Vite/Express static middleware.

### Step 2: Delete Redundant Files
- Delete `src/components/SyncRepairGhostCleanupModal.tsx`.
- Delete `src/services/liveSyncService.ts`.
- Delete `src/services/syncRepairService.ts`.

### Step 3: Refactor `firebaseService.ts`
- Implement `subscribeLiveSelection(eventId, onUpdate)` listening to `doc(db, 'events', eventId, 'live_state', 'selection')`.
- Implement `updateLiveSelection(eventId, selectedIds, count, clientNotes, status)` writing to `events/{eventId}/live_state/selection`.
- Implement `deleteEventCascade(eventId)`: Recursively fetches and batch-deletes all documents in `/photos` and `/live_state`, then deletes `/events/{eventId}`.
- Remove all obsolete tombstone references.

### Step 4: Refactor `AppContext.tsx`
- Attach `subscribeLiveSelection` when `activeEventId` is set, syncing selection across devices in real-time.
- Update `deleteEvent` to execute `deleteEventCascade` and purge `idbStorage`.
- Remove `runSyncRepair`, `ghostCleaners`, and tombstone checking state/functions.
- Simplify `togglePhotoSelection` to write directly to `updateLiveSelection` with optimistic local state.

### Step 5: Update `ClientGallery.tsx`
- Bind to the live Firestore selection snapshot so heart clicks made on any open device reflect immediately.
- Clean up `effectiveFolders` fallback to use strictly the validated event `folders`.
- Remove dead tombstone checks.

### Step 6: Clean Up `Dashboard.tsx` and `PhotoUploadPage.tsx`
- Remove all buttons, state, and imports for `SyncRepairGhostCleanupModal`.
- Remove tombstone guards and use standard event existence.

### Step 7: Compilation, Linting & Dev Server Restart
- Run `compile_applet` and `lint_applet` to verify zero TypeScript errors or missing imports.
- Restart dev server to confirm clean boot.
