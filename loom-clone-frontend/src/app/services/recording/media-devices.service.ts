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

  // ============ Private State Signals ============

  private readonly _availableCameras = signal<MediaInputDevice[]>([]);
  private readonly _availableMicrophones = signal<MediaInputDevice[]>([]);
  private readonly _selectedCameraId = signal<string | null>(null);
  private readonly _selectedMicrophoneId = signal<string | null>(null);
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
  readonly selectedCameraId = this._selectedCameraId.asReadonly();
  readonly selectedMicrophoneId = this._selectedMicrophoneId.asReadonly();
  readonly isEnumerating = this._isEnumerating.asReadonly();
  readonly permissionState = this._permissionState.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly microphoneEnabled = this._microphoneEnabled.asReadonly();
  readonly cameraEnabled = this._cameraEnabled.asReadonly();

  // ============ Computed Signals ============

  readonly selectedCamera = computed(() => {
    const cameraId = this._selectedCameraId();
    return (
      this._availableCameras().find((cam) => cam.deviceId === cameraId) || null
    );
  });

  readonly selectedMicrophone = computed(() => {
    const micId = this._selectedMicrophoneId();
    return (
      this._availableMicrophones().find((mic) => mic.deviceId === micId) || null
    );
  });

  readonly hasDevicePermission = computed(
    () => this._permissionState() === 'granted',
  );

  readonly hasAnySelectedDevice = computed(
    () =>
      this._selectedCameraId() !== null || this._selectedMicrophoneId() !== null,
  );

  readonly needsDevicePermission = computed(
    () =>
      this.hasAnySelectedDevice() && this._permissionState() !== 'granted',
  );

  readonly canToggleMicrophoneLive = computed(
    () => this._activeMicrophoneTrack() !== null,
  );

  readonly canToggleCameraLive = computed(() => this._activeCameraTrack() !== null);

  readonly activeTracks = computed<ActiveRecordingTracks>(() => ({
    microphoneTrack: this._activeMicrophoneTrack(),
    cameraTrack: this._activeCameraTrack(),
  }));

  readonly hasEnabledInput = computed(
    () =>
      (this._microphoneEnabled() && this._selectedMicrophoneId() !== null) ||
      (this._cameraEnabled() && this._selectedCameraId() !== null),
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
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.substring(0, 5)}`,
          kind: 'videoinput' as const,
          groupId: device.groupId,
        }));

      const microphones = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label:
            device.label || `Microphone ${device.deviceId.substring(0, 5)}`,
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
  selectCamera(deviceId: string): void {
    if (!this.isDeviceAvailable(deviceId, 'videoinput')) {
      this._errorMessage.set('Selected camera is no longer available');
      return;
    }
    this._selectedCameraId.set(deviceId);
    this._errorMessage.set(null);
    this.ensurePermissionPromptState();
  }

  /**
   * Select a microphone device by deviceId
   */
  selectMicrophone(deviceId: string): void {
    if (!this.isDeviceAvailable(deviceId, 'audioinput')) {
      this._errorMessage.set('Selected microphone is no longer available');
      return;
    }
    this._selectedMicrophoneId.set(deviceId);
    this._errorMessage.set(null);
    this.ensurePermissionPromptState();
  }

  /**
   * Toggle microphone enablement before and during recording
   */
  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (enabled && this._selectedMicrophoneId() === null) {
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
    if (enabled && this._selectedCameraId() === null) {
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

    if (this._cameraEnabled() && this._selectedCameraId() === null) {
      this._errorMessage.set('Select a camera or disable camera');
      return;
    }

    if (this._microphoneEnabled() && this._selectedMicrophoneId() === null) {
      this._errorMessage.set('Select a microphone or disable microphone');
      return;
    }

    try {
      this._errorMessage.set(null);

      const constraints: MediaStreamConstraints = {
        video:
          this._cameraEnabled() && this._selectedCameraId() !== null
            ? { deviceId: { exact: this._selectedCameraId()! } }
            : false,
        audio:
          this._microphoneEnabled() && this._selectedMicrophoneId() !== null
            ? { deviceId: { exact: this._selectedMicrophoneId()! } }
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
        cameraDeviceId: this._selectedCameraId(),
        microphoneDeviceId: this._selectedMicrophoneId(),
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
        this._selectedCameraId.set(selection.cameraDeviceId);
        this._selectedMicrophoneId.set(selection.microphoneDeviceId);
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
  private isDeviceAvailable(deviceId: string, kind: MediaDeviceKind): boolean {
    const devices =
      kind === 'videoinput'
        ? this._availableCameras()
        : this._availableMicrophones();
    return devices.some((device) => device.deviceId === deviceId);
  }

  /**
   * Validate that selected devices still exist
   * Clear selection if device was disconnected/deleted
   */
  private validateSelectedDevices(): void {
    const cameraId = this._selectedCameraId();
    const micId = this._selectedMicrophoneId();

    if (cameraId && !this.isDeviceAvailable(cameraId, 'videoinput')) {
      this._selectedCameraId.set(null);
      this._cameraEnabled.set(false);
    }

    if (micId && !this.isDeviceAvailable(micId, 'audioinput')) {
      this._selectedMicrophoneId.set(null);
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

  /**
   * Clear all selections and errors (for testing or reset)
   */
  clear(): void {
    this._selectedCameraId.set(null);
    this._selectedMicrophoneId.set(null);
    this._microphoneEnabled.set(true);
    this._cameraEnabled.set(false);
    this.clearActiveTracks();
    this._permissionState.set('unknown');
    this._errorMessage.set(null);
  }
}
