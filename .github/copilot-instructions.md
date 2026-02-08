# Loom Clone - AI Coding Agent Instructions

## Project Overview

A demo Angular app for learning screen recording. Currently implements folder selection using the **File System Access API** (Chromium-only) with IndexedDB persistence. This is a **learning/demo project**, not production code—simplicity over robustness.

## Architecture Patterns

### Service Layer Structure

- **`services/storage/`** - Three-tier storage architecture:
  - `indexeddb.service.ts` - Generic IndexedDB wrapper (reusable)
  - `folder-storage.service.ts` - Business logic for File System Access API
  - `browser-compat.service.ts` - Feature detection & browser identification
- Services use `inject()` function, never constructor injection
- All services: `providedIn: 'root'` for singleton pattern

### State Management Strategy

- **Signals everywhere**: Use `signal()`, `computed()`, `.asReadonly()` for reactive state
- **Private/public pattern**: Private writable signals (`_folderHandle`), public readonly exposures
- Components consume signals directly; services expose readonly signals
- Example: `FolderStorageService` exposes 5 readonly signals for UI binding

### File System Access API Pattern

```typescript
// Key workflow in folder-storage.service.ts:
1. Call window.showDirectoryPicker() - MUST be user gesture
2. Store FileSystemDirectoryHandle directly in IndexedDB (it's structured-cloneable)
3. On app load: retrieve → verify validity → check permissions
4. If invalid/deleted: clear from IndexedDB immediately (no retry logic)
```

### Type Definitions

- Custom browser API types in `src/file-system-access.d.ts` (File System Access API not in TS lib yet)
- Domain models in `src/app/models/storage.models.ts` - interfaces + error classes
- Use enums for error codes, custom error classes that extend `Error`

## Critical Conventions

### Angular-Specific (from `.github/angular-best-practices.md`)

- **Standalone components** - Default in Angular 19+, never set `standalone: true` explicitly
- **Native control flow** - Use `@if`, `@for`, `@switch` not `*ngIf/*ngFor/*ngSwitch`
- **OnPush change detection** - Set in every component decorator
- **No decorators for I/O** - Use `input()` and `output()` functions, not `@Input/@Output`
- **No `ngClass`/`ngStyle`** - Use property/style bindings instead
- **inject() not constructor** - Always use functional DI

### Browser Compatibility

- **Chromium-only**: Chrome 86+, Edge 86+, Opera 72+
- **Blocked browsers**: Firefox, Safari, others
- Detection: Check `'showDirectoryPicker' in window`
- User agent parsing with `switch(true)` pattern for browser names

### User Interaction Constraints

- **Permission requests** require user gesture (button click) - cannot auto-request on page load
- **Folder changes** use native `confirm()` dialog (not custom modals) for simplicity
- **Auto-initialization** on component load checks stored folder but doesn't prompt

## Key Files & Patterns

### Component Pattern (`home.component.ts`)

```typescript
// Inject multiple services, expose their signals
private readonly browserCompat = inject(BrowserCompatService);
private readonly folderStorage = inject(FolderStorageService);
readonly isSupported = this.browserCompat.isSupported; // Direct signal exposure

// Computed signals for derived UI state
readonly hasFolder = computed(() => this.folderName() !== null);

// Async handlers for user actions
async onSelectFolder() { await this.folderStorage.selectNewFolder(); }
```

### IndexedDB Pattern

- **Object stores**: `handles` (FileSystemDirectoryHandle), `preferences` (future use)
- **Wrapped in Promises**: IndexedDB is callback-based; wrap in Promises for async/await
- Error handling: Try-catch returns `undefined` on failure, logs but doesn't throw

### Template Patterns

- Use ARIA attributes: `role="alert"`, `aria-live="polite/assertive"`, `aria-label`
- Conditional rendering with `@if (signal()) { }` syntax
- Button handlers: `(click)="onMethodName()"` with descriptive `aria-label`

## Development Workflow

### Commands

```bash
npm start          # Start dev server (alias for ng serve)
ng serve           # Direct Angular CLI
ng build           # Production build
```

### File Structure Logic

```
src/app/
├── home/                    # Feature component (folder selection UI)
├── services/storage/        # Storage-related services grouped
├── models/                  # Shared types/interfaces
├── app.routes.ts            # Root routes (home at '')
└── app.component.ts         # Shell component (just <router-outlet />)
```

### Adding Features

1. **New service**: Create in `services/<domain>/`, use `inject()`, expose readonly signals
2. **New component**: Create in feature folder, inject services, use OnPush + signals
3. **New types**: Add to `models/<domain>.models.ts`
4. **Browser APIs**: Add types to `src/<api-name>.d.ts`

## Code Formatting

- **Prettier** is used for code formatting
- Follow existing formatting patterns in the codebase
- All code should be formatted before committing

## Testing Strategy

- **No unit tests** - This is a learning/demo project focused on implementation
- **Playwright E2E tests** may be added for critical user flows
- Manual testing in **Chromium browsers** (Chrome/Edge/Opera) required
- Localhost or HTTPS required (secure context for File System Access API)
- IndexedDB can be inspected via DevTools → Application → IndexedDB → `loom-clone-storage`

## Future Recording Architecture

The folder selection infrastructure prepares for upcoming recording features:

### Planned Components

- **`recording/recording.component.ts`** - Main recording interface with start/stop controls
- **`recording/preview.component.ts`** - Live preview during recording
- **`playback/playback.component.ts`** - Recorded video playback

### Planned Services

- **`services/recording/screen-capture.service.ts`** - Screen recording via `navigator.mediaDevices.getDisplayMedia()`
- **`services/recording/camera.service.ts`** - Camera access via `getUserMedia()`
- **`services/recording/audio.service.ts`** - Microphone audio capture
- **`services/recording/media-recorder.service.ts`** - MediaRecorder API wrapper for video encoding
- **`services/recording/recording-manager.service.ts`** - Orchestrates all media sources

### Recording Flow

1. User configures sources (screen + camera + mic, or any combination)
2. Services request permissions and initialize media streams
3. `MediaRecorder` combines streams and encodes to WebM
4. Blob chunks collected during recording
5. On stop: Final blob saved to selected folder via `FolderStorageService.saveRecording()`
6. Generate thumbnail, metadata stored in IndexedDB for playback list

### Integration Points

- `FolderStorageService.saveRecording(blob, filename)` - Already implemented
- Permission checks extend to camera/mic (follow same user-gesture pattern)
- Recording metadata stored in new IndexedDB object store `recordings`
