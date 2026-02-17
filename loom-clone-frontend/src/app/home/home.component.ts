import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { BrowserCompatService } from '../services/storage/browser-compat.service';
import { FolderStorageService } from '../services/storage/folder-storage.service';
import { MediaDevicesService } from '../services/recording/media-devices.service';
import { RecordingSessionService } from '../services/recording/recording-session.service';
import { RecordingFileSummary } from '../models/media.models';

/**
 * Home component for the Loom Clone application
 * Main page for folder selection, device setup, and initial configuration
 */
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  // Inject services
  private readonly browserCompat = inject(BrowserCompatService);
  private readonly folderStorage = inject(FolderStorageService);
  private readonly mediaDevices = inject(MediaDevicesService);
  private readonly recordingSession = inject(RecordingSessionService);

  // ============ Folder Selection Signals ============
  readonly isSupported = this.browserCompat.isSupported;
  readonly supportMessage = this.browserCompat.supportMessage;
  readonly folderName = this.folderStorage.folderName;
  readonly permissionState = this.folderStorage.permissionState;
  readonly isLoading = this.folderStorage.isLoading;
  readonly errorMessage = this.folderStorage.errorMessage;

  // Computed signals for folder UI state
  readonly hasFolder = computed(() => this.folderName() !== null);
  readonly needsPermission = computed(
    () => this.hasFolder() && this.permissionState() === 'prompt',
  );
  readonly isReady = computed(() => this.hasFolder() && this.permissionState() === 'granted');

  // ============ Media Device Selection Signals ============
  readonly availableCameras = this.mediaDevices.availableCameras;
  readonly availableMicrophones = this.mediaDevices.availableMicrophones;
  readonly selectedCameraKey = this.mediaDevices.selectedCameraKey;
  readonly selectedMicrophoneKey = this.mediaDevices.selectedMicrophoneKey;
  readonly mediaDevicesEnumerating = this.mediaDevices.isEnumerating;
  readonly mediaDeviceError = this.mediaDevices.errorMessage;
  readonly mediaDevicePermissionState = this.mediaDevices.permissionState;
  readonly microphoneEnabled = this.mediaDevices.microphoneEnabled;
  readonly cameraEnabled = this.mediaDevices.cameraEnabled;
  readonly screenSharingEnabled = this.mediaDevices.screenSharingEnabled;

  readonly recordingStatus = this.recordingSession.recordingStatus;
  readonly recordingError = this.recordingSession.errorMessage;
  readonly recordingStatusMessage = this.recordingSession.statusMessage;
  readonly isRecording = this.recordingSession.isRecording;
  readonly hasEnabledInput = this.mediaDevices.hasEnabledInput;

  readonly recordings = this.folderStorage.recordings;
  readonly recordingsLoading = this.folderStorage.recordingsLoading;
  readonly recordingsError = this.folderStorage.recordingsError;

  private readonly _selectedRecording = signal<RecordingFileSummary | null>(null);
  private readonly _playbackUrl = signal<string | null>(null);
  private readonly _playbackError = signal<string | null>(null);
  private readonly _playbackLoading = signal<boolean>(false);

  readonly selectedRecording = this._selectedRecording.asReadonly();
  readonly playbackUrl = this._playbackUrl.asReadonly();
  readonly playbackError = this._playbackError.asReadonly();
  readonly playbackLoading = this._playbackLoading.asReadonly();

  // Computed signals for media device UI state
  readonly hasDeviceSelection = computed(
    () => this.selectedCameraKey() !== null || this.selectedMicrophoneKey() !== null,
  );
  readonly needsMediaPermission = computed(
    () => this.hasEnabledInput() && this.mediaDevicePermissionState() !== 'granted',
  );
  readonly mediaDeviceReady = computed(
    () => !this.hasEnabledInput() || this.mediaDevicePermissionState() === 'granted',
  );

  readonly hasRecordingSource = computed(
    () => this.screenSharingEnabled() || this.hasEnabledInput(),
  );

  readonly canStartRecording = computed(
    () =>
      this.isReady() &&
      this.hasRecordingSource() &&
      this.mediaDeviceReady() &&
      this.recordingStatus() === 'idle',
  );

  readonly hasRecordings = computed(() => this.recordings().length > 0);
  readonly isAudioPlayback = computed(() => {
    const recording = this._selectedRecording();
    if (!recording) {
      return false;
    }

    if (recording.mimeType.startsWith('audio/')) {
      return true;
    }

    const extension = recording.name.split('.').pop()?.toLowerCase() ?? '';
    return ['mp3', 'wav', 'm4a', 'ogg', 'opus'].includes(extension);
  });

  private activePlaybackObjectUrl: string | null = null;

  async ngOnInit(): Promise<void> {
    // Auto-check for stored folder on component init
    await this.folderStorage.initializeFolder();

    if (this.isReady()) {
      await this.folderStorage.refreshRecordings();
    }
  }

  ngOnDestroy(): void {
    this.clearPlayback();
  }

  // ============ Folder Selection Handlers ============

  /**
   * Handle select folder button click
   */
  async onSelectFolder(): Promise<void> {
    await this.folderStorage.selectNewFolder();

    if (this.isReady()) {
      await this.folderStorage.refreshRecordings();
      this.clearPlayback();
    }
  }

  /**
   * Handle change folder button click
   */
  async onChangeFolder(): Promise<void> {
    this.clearPlayback();
    await this.folderStorage.changeFolderLocation();

    if (this.isReady()) {
      await this.folderStorage.refreshRecordings();
    }
  }

  /**
   * Handle grant permission button click for folder access
   */
  async onGrantPermission(): Promise<void> {
    const granted = await this.folderStorage.requestPermission();
    if (granted) {
      await this.folderStorage.refreshRecordings();
    }
  }

  // ============ Media Device Selection Handlers ============

  /**
   * Handle camera selection change
   */
  async onSelectCamera(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    if (target.value === '') {
      return;
    }

    this.mediaDevices.selectCamera(target.value);
    await this.mediaDevices.saveDeviceSelection();
  }

  /**
   * Handle microphone selection change
   */
  async onSelectMicrophone(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    if (target.value === '') {
      return;
    }

    this.mediaDevices.selectMicrophone(target.value);
    await this.mediaDevices.saveDeviceSelection();
  }

  /**
   * Handle grant permission button click for camera/microphone
   */
  async onGrantMediaPermission(): Promise<void> {
    await this.mediaDevices.requestPermission();
  }

  async onToggleMicrophone(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    await this.mediaDevices.setMicrophoneEnabled(target.checked);
  }

  async onToggleCamera(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    await this.mediaDevices.setCameraEnabled(target.checked);
  }

  async onToggleScreenSharing(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    await this.mediaDevices.setScreenSharingEnabled(target.checked);
  }

  async onStartRecording(): Promise<void> {
    this.recordingSession.clearError();
    await this.recordingSession.startRecording();
  }

  async onStopRecording(): Promise<void> {
    await this.recordingSession.stopRecording();
  }

  async onPlayRecording(recording: RecordingFileSummary): Promise<void> {
    this._playbackLoading.set(true);
    this._playbackError.set(null);

    this.clearPlaybackUrlOnly();

    try {
      const file = await this.folderStorage.readRecordingFile(recording.name);
      const playbackUrl = URL.createObjectURL(file);

      this.activePlaybackObjectUrl = playbackUrl;
      this._playbackUrl.set(playbackUrl);
      this._selectedRecording.set({
        ...recording,
        mimeType: file.type || recording.mimeType,
        size: file.size,
        lastModified: file.lastModified,
      });
    } catch (error) {
      this._selectedRecording.set(null);
      this._playbackError.set(error instanceof Error ? error.message : 'Unable to play recording');
      await this.folderStorage.refreshRecordings();
    } finally {
      this._playbackLoading.set(false);
    }
  }

  formatFileSize(sizeInBytes: number): string {
    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    }

    const sizeInKilobytes = sizeInBytes / 1024;
    if (sizeInKilobytes < 1024) {
      return `${sizeInKilobytes.toFixed(1)} KB`;
    }

    const sizeInMegabytes = sizeInKilobytes / 1024;
    return `${sizeInMegabytes.toFixed(1)} MB`;
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  private clearPlayback(): void {
    this.clearPlaybackUrlOnly();
    this._selectedRecording.set(null);
    this._playbackError.set(null);
    this._playbackLoading.set(false);
  }

  private clearPlaybackUrlOnly(): void {
    if (this.activePlaybackObjectUrl) {
      URL.revokeObjectURL(this.activePlaybackObjectUrl);
      this.activePlaybackObjectUrl = null;
    }

    this._playbackUrl.set(null);
  }
}
