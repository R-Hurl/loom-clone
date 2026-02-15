import { Injectable, inject, signal, computed } from '@angular/core';
import {
  MediaInputDevice,
  MediaPermissionState,
  SelectedMediaDevices,
  MediaDeviceKind,
  MediaTogglePreferences,
  ActiveRecordingTracks,
} from '../../models/media.models';
import { IndexedDbService } from '../storage/indexeddb.service';

/**
 * Service for managing camera and microphone device enumeration and selection
 * Handles permission requests, device enumeration, and persistence to IndexedDB
 *
 * Follows the same patterns as FolderStorageService:
 * - All state managed via signals (readonly exposures for components)
 * - IndexedDB for persistence
 * - Custom error class with enum codes
 * - User gesture required for permission requests
 */
@Injectable({
  providedIn: 'root',
})
export class MediaDevicesService {
  private readonly indexedDB = inject(IndexedDbService);
  private readonly TOGGLE_PREFERENCES_KEY = 'recording-toggle-defaults';
  private readonly EMPTY_DEVICE_ID_SENTINEL = '__EMPTY_DEVICE_ID__';

  // ============ Private State Signals ============

  private readonly _availableCameras = signal<MediaInputDevice[]>([]);
  private readonly _availableMicrophones = signal<MediaInputDevice[]>([]);
  private readonly _selectedCameraKey = signal<string | null>(null);
  private readonly _selectedMicrophoneKey = signal<string | null>(null);
  private readonly _isEnumerating = signal(false);
  private readonly _permissionState = signal<MediaPermissionState>('unknown');
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _microphoneEnabled = signal(true);
  private readonly _cameraEnabled = signal(false);
  private readonly _activeMicrophoneTrack = signal<MediaStreamTrack | null>(
    null,
  );
  private readonly _activeCameraTrack = signal<MediaStreamTrack | null>(null);

  // ============ Public Readonly Signals ============

  readonly availableCameras = this._availableCameras.asReadonly();
  readonly availableMicrophones = this._availableMicrophones.asReadonly();
  readonly selectedCameraKey = this._selectedCameraKey.asReadonly();
  readonly selectedMicrophoneKey = this._selectedMicrophoneKey.asReadonly();
  readonly isEnumerating = this._isEnumerating.asReadonly();
  readonly permissionState = this._permissionState.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly microphoneEnabled = this._microphoneEnabled.asReadonly();
  readonly cameraEnabled = this._cameraEnabled.asReadonly();

  // ============ Computed Signals ============

  readonly selectedCamera = computed(() => {
    const cameraKey = this._selectedCameraKey();
    return (
      this._availableCameras().find((cam) => cam.selectionKey === cameraKey) ||
      null
    );
  });

  readonly selectedMicrophone = computed(() => {
    const microphoneKey = this._selectedMicrophoneKey();
    return (
      this._availableMicrophones().find(
        (mic) => mic.selectionKey === microphoneKey,
      ) || null
    );
  });

  readonly hasDevicePermission = computed(
    () => this._permissionState() === 'granted',
  );

  readonly hasAnySelectedDevice = computed(
    () =>
      this._selectedCameraKey() !== null ||
      this._selectedMicrophoneKey() !== null,
  );

  readonly needsDevicePermission = computed(
    () => this.hasAnySelectedDevice() && this._permissionState() !== 'granted',
  );

  readonly canToggleMicrophoneLive = computed(
    () => this._activeMicrophoneTrack() !== null,
  );

  readonly canToggleCameraLive = computed(
    () => this._activeCameraTrack() !== null,
  );

  readonly activeTracks = computed<ActiveRecordingTracks>(() => ({
    microphoneTrack: this._activeMicrophoneTrack(),
    cameraTrack: this._activeCameraTrack(),
  }));

  readonly hasEnabledInput = computed(
    () =>
      (this._microphoneEnabled() && this._selectedMicrophoneKey() !== null) ||
      (this._cameraEnabled() && this._selectedCameraKey() !== null),
  );

  constructor() {
    this.initializeDevices();
  }

  /**
   * Initialize device enumeration and restore previous selections
   * Called on service instantiation
   */
  private async initializeDevices(): Promise<void> {
    try {
      // Check browser support
      if (!this.isSupported()) {
        this._errorMessage.set(
          'Media Devices API not supported in this browser',
        );
        this._permissionState.set('unknown');
        return;
      }

      // Enumerate devices and load saved preferences
      await Promise.all([
        this.enumerateDevices(),
        this.loadDeviceSelection(),
        this.loadTogglePreferences(),
      ]);
    } catch (error) {
      console.error('[MediaDevicesService] Initialization failed:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to initialize media devices';
      this._errorMessage.set(message);
    }
  }

  /**
   * Enumerate available cameras and microphones
   * Populates availableCameras and availableMicrophones signals
   */
  async enumerateDevices(): Promise<void> {
    if (!this.isSupported()) {
      this._errorMessage.set('Media Devices API not available');
      return;
    }

    try {
      this._isEnumerating.set(true);
      this._errorMessage.set(null);

      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          selectionKey: this.createSelectionKey(device, 'videoinput', index),
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
          kind: 'videoinput' as const,
          groupId: device.groupId,
        }));

      const microphones = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          selectionKey: this.createSelectionKey(device, 'audioinput', index),
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
          kind: 'audioinput' as const,
          groupId: device.groupId,
        }));

      this._availableCameras.set(cameras);
      this._availableMicrophones.set(microphones);

      // Verify existing selections are still valid
      this.validateSelectedDevices();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to enumerate devices';
      console.error('[MediaDevicesService] Enumeration failed:', error);
      this._errorMessage.set(message);
    } finally {
      this._isEnumerating.set(false);
    }
  }

  /**
   * Select a camera device by deviceId
   */
  selectCamera(selectionKey: string): void {
    if (!this.isSelectionAvailable(selectionKey, 'videoinput')) {
      this._errorMessage.set('Selected camera is no longer available');
      return;
    }
    this._selectedCameraKey.set(selectionKey);
    this._errorMessage.set(null);
    this.ensurePermissionPromptState();
  }

  /**
   * Select a microphone device by deviceId
   */
  selectMicrophone(selectionKey: string): void {
    if (!this.isSelectionAvailable(selectionKey, 'audioinput')) {
      this._errorMessage.set('Selected microphone is no longer available');
      return;
    }
    this._selectedMicrophoneKey.set(selectionKey);
    this._errorMessage.set(null);
    this.ensurePermissionPromptState();
  }

  /**
   * Toggle microphone enablement before and during recording
   */
  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (enabled && this._selectedMicrophoneKey() === null) {
      this._errorMessage.set('Select a microphone first, then enable it');
      return;
    }

    this._microphoneEnabled.set(enabled);
    this.applyDesiredStateToActiveTracks();
    this.ensurePermissionPromptState();
    this._errorMessage.set(null);
    await this.saveTogglePreferences();
  }

  /**
   * Toggle camera enablement before and during recording
   */
  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (enabled && this._selectedCameraKey() === null) {
      this._errorMessage.set('Select a camera first, then enable it');
      return;
    }

    this._cameraEnabled.set(enabled);
    this.applyDesiredStateToActiveTracks();
    this.ensurePermissionPromptState();
    this._errorMessage.set(null);
    await this.saveTogglePreferences();
  }

  /**
   * Attach active microphone/camera tracks for live toggle control
   */
  attachActiveTracks(tracks: ActiveRecordingTracks): void {
    this._activeMicrophoneTrack.set(tracks.microphoneTrack);
    this._activeCameraTrack.set(tracks.cameraTrack);
    this.applyDesiredStateToActiveTracks();
  }

  /**
   * Clear active tracks when recording session ends
   */
  clearActiveTracks(): void {
    this._activeMicrophoneTrack.set(null);
    this._activeCameraTrack.set(null);
  }

  /**
   * Apply desired toggle state to active tracks
   */
  applyDesiredStateToActiveTracks(): void {
    const microphoneTrack = this._activeMicrophoneTrack();
    if (microphoneTrack && microphoneTrack.readyState === 'live') {
      microphoneTrack.enabled = this._microphoneEnabled();
    }

    const cameraTrack = this._activeCameraTrack();
    if (cameraTrack && cameraTrack.readyState === 'live') {
      cameraTrack.enabled = this._cameraEnabled();
    }
  }

  /**
   * Request microphone and camera permissions
   * Must be called from a user gesture (button click)
   */
  async requestPermission(): Promise<void> {
    if (!this.isSupported()) {
      this._errorMessage.set('Media Devices API not available');
      return;
    }

    if (!this.hasEnabledInput()) {
      this._errorMessage.set('Enable a selected microphone or camera first');
      return;
    }

    if (this._cameraEnabled() && this._selectedCameraKey() === null) {
      this._errorMessage.set('Select a camera or disable camera');
      return;
    }

    if (this._microphoneEnabled() && this._selectedMicrophoneKey() === null) {
      this._errorMessage.set('Select a microphone or disable microphone');
      return;
    }

    try {
      this._errorMessage.set(null);

      const selectedCamera = this.selectedCamera();
      const selectedMicrophone = this.selectedMicrophone();
      const cameraDeviceId = selectedCamera?.deviceId.trim() || null;
      const microphoneDeviceId = selectedMicrophone?.deviceId.trim() || null;

      const constraints: MediaStreamConstraints = {
        video:
          this._cameraEnabled() && selectedCamera !== null
            ? cameraDeviceId
              ? { deviceId: { exact: cameraDeviceId } }
              : true
            : false,
        audio:
          this._microphoneEnabled() && selectedMicrophone !== null
            ? microphoneDeviceId
              ? { deviceId: { exact: microphoneDeviceId } }
              : true
            : false,
      };

      // Request media stream to prompt for permissions
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Stop all tracks to avoid "permission requested" feeling like recording started
      stream.getTracks().forEach((track) => track.stop());

      this._permissionState.set('granted');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this._permissionState.set('denied');
        this._errorMessage.set('Permission denied by user');
      } else if (
        error instanceof DOMException &&
        error.name === 'NotFoundError'
      ) {
        this._errorMessage.set('One or more devices not found');
      } else {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to request permission';
        this._errorMessage.set(message);
      }
    }
  }

  /**
   * Save microphone/camera enabled preferences to IndexedDB
   */
  private async saveTogglePreferences(): Promise<void> {
    try {
      const preferences: MediaTogglePreferences = {
        microphoneEnabled: this._microphoneEnabled(),
        cameraEnabled: this._cameraEnabled(),
        lastUpdated: Date.now(),
      };

      await this.indexedDB.set(
        'preferences',
        this.TOGGLE_PREFERENCES_KEY,
        preferences,
      );
    } catch (error) {
      console.error(
        '[MediaDevicesService] Failed to save toggle preferences:',
        error,
      );
    }
  }

  /**
   * Save selected devices to IndexedDB
   */
  async saveDeviceSelection(): Promise<void> {
    try {
      const selection: SelectedMediaDevices = {
        id: 'current',
        cameraSelectionKey: this._selectedCameraKey(),
        microphoneSelectionKey: this._selectedMicrophoneKey(),
        lastSelected: Date.now(),
      };

      // Use IndexedDB service to persist
      await this.indexedDB.set('deviceSelections', 'current', selection);
    } catch (error) {
      console.error(
        '[MediaDevicesService] Failed to save device selection:',
        error,
      );
      // Don't show error to user; this is background persistence
    }
  }

  /**
   * Load device selections from IndexedDB
   */
  private async loadDeviceSelection(): Promise<void> {
    try {
      const selection = await this.indexedDB.get<SelectedMediaDevices>(
        'deviceSelections',
        'current',
      );

      if (selection) {
        const legacySelection = selection as SelectedMediaDevices & {
          cameraDeviceId?: string | null;
          microphoneDeviceId?: string | null;
        };

        const cameraKey =
          selection.cameraSelectionKey ??
          this.resolveLegacySelectionKey(
            legacySelection.cameraDeviceId,
            'videoinput',
          );
        const microphoneKey =
          selection.microphoneSelectionKey ??
          this.resolveLegacySelectionKey(
            legacySelection.microphoneDeviceId,
            'audioinput',
          );

        this._selectedCameraKey.set(cameraKey);
        this._selectedMicrophoneKey.set(microphoneKey);
      }
    } catch (error) {
      console.error(
        '[MediaDevicesService] Failed to load device selection:',
        error,
      );
      // Silently fail; selection will be empty and user can choose again
    }
  }

  /**
   * Load microphone/camera enabled preferences from IndexedDB
   */
  private async loadTogglePreferences(): Promise<void> {
    try {
      const preferences = await this.indexedDB.get<MediaTogglePreferences>(
        'preferences',
        this.TOGGLE_PREFERENCES_KEY,
      );

      if (preferences) {
        this._microphoneEnabled.set(preferences.microphoneEnabled);
        this._cameraEnabled.set(preferences.cameraEnabled);
      }
    } catch (error) {
      console.error(
        '[MediaDevicesService] Failed to load toggle preferences:',
        error,
      );
    }
  }

  /**
   * Check if a device is still available
   */
  private isSelectionAvailable(
    selectionKey: string,
    kind: MediaDeviceKind,
  ): boolean {
    const devices =
      kind === 'videoinput'
        ? this._availableCameras()
        : this._availableMicrophones();
    return devices.some((device) => device.selectionKey === selectionKey);
  }

  /**
   * Validate that selected devices still exist
   * Clear selection if device was disconnected/deleted
   */
  private validateSelectedDevices(): void {
    const cameraKey = this._selectedCameraKey();
    const microphoneKey = this._selectedMicrophoneKey();

    if (
      cameraKey !== null &&
      !this.isSelectionAvailable(cameraKey, 'videoinput')
    ) {
      this._selectedCameraKey.set(null);
      this._cameraEnabled.set(false);
    }

    if (
      microphoneKey !== null &&
      !this.isSelectionAvailable(microphoneKey, 'audioinput')
    ) {
      this._selectedMicrophoneKey.set(null);
      this._microphoneEnabled.set(false);
    }

    this.ensurePermissionPromptState();
  }

  /**
   * Keep permission state aligned with current selections and toggles
   */
  private ensurePermissionPromptState(): void {
    if (
      this.hasEnabledInput() &&
      this._permissionState() !== 'granted' &&
      this._permissionState() !== 'denied'
    ) {
      this._permissionState.set('prompt');
    }

    if (!this.hasEnabledInput() && this._permissionState() === 'prompt') {
      this._permissionState.set('unknown');
    }
  }

  /**
   * Check if Media Devices API is supported
   */
  private isSupported(): boolean {
    return 'mediaDevices' in navigator;
  }

  private createSelectionKey(
    device: MediaDeviceInfo,
    kind: MediaDeviceKind,
    index: number,
  ): string {
    const normalizedDeviceId = device.deviceId.trim();
    if (normalizedDeviceId.length > 0) {
      return `${kind}:id:${normalizedDeviceId}`;
    }

    const normalizedGroupId = device.groupId.trim() || 'no-group';
    const normalizedLabel =
      device.label.trim().toLowerCase() || this.EMPTY_DEVICE_ID_SENTINEL;
    return `${kind}:default:${normalizedGroupId}:${normalizedLabel}:${index}`;
  }

  private resolveLegacySelectionKey(
    legacyDeviceId: string | null | undefined,
    kind: MediaDeviceKind,
  ): string | null {
    if (legacyDeviceId === null || legacyDeviceId === undefined) {
      return null;
    }

    const normalizedDeviceId = legacyDeviceId.trim();
    if (normalizedDeviceId.length > 0) {
      return `${kind}:id:${normalizedDeviceId}`;
    }

    const devices =
      kind === 'videoinput'
        ? this._availableCameras()
        : this._availableMicrophones();
    return (
      devices.find((device) => device.deviceId.trim().length === 0)
        ?.selectionKey ?? null
    );
  }

  /**
   * Clear all selections and errors (for testing or reset)
   */
  clear(): void {
    this._selectedCameraKey.set(null);
    this._selectedMicrophoneKey.set(null);
    this._microphoneEnabled.set(true);
    this._cameraEnabled.set(false);
    this.clearActiveTracks();
    this._permissionState.set('unknown');
    this._errorMessage.set(null);
  }
}
