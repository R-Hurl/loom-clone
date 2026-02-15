import {
  Component,
  OnInit,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { BrowserCompatService } from '../services/storage/browser-compat.service';
import { FolderStorageService } from '../services/storage/folder-storage.service';
import { MediaDevicesService } from '../services/recording/media-devices.service';
import { RecordingSessionService } from '../services/recording/recording-session.service';

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
export class HomeComponent implements OnInit {
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
  readonly isReady = computed(
    () => this.hasFolder() && this.permissionState() === 'granted',
  );

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

  readonly recordingStatus = this.recordingSession.recordingStatus;
  readonly recordingError = this.recordingSession.errorMessage;
  readonly isRecording = this.recordingSession.isRecording;

  // Computed signals for media device UI state
  readonly hasDeviceSelection = computed(
    () =>
      this.selectedCameraKey() !== null || this.selectedMicrophoneKey() !== null,
  );
  readonly needsMediaPermission = computed(
    () =>
      this.hasDeviceSelection() &&
      this.mediaDevicePermissionState() !== 'granted',
  );
  readonly mediaDeviceReady = computed(
    () =>
      this.hasDeviceSelection() &&
      this.mediaDevicePermissionState() === 'granted',
  );

  readonly hasEnabledInput = this.mediaDevices.hasEnabledInput;

  readonly canStartRecording = computed(
    () =>
      this.isReady() &&
      this.mediaDeviceReady() &&
      this.hasEnabledInput() &&
      this.recordingStatus() === 'idle',
  );

  async ngOnInit(): Promise<void> {
    // Auto-check for stored folder on component init
    await this.folderStorage.initializeFolder();
  }

  // ============ Folder Selection Handlers ============

  /**
   * Handle select folder button click
   */
  async onSelectFolder(): Promise<void> {
    await this.folderStorage.selectNewFolder();
  }

  /**
   * Handle change folder button click
   */
  async onChangeFolder(): Promise<void> {
    await this.folderStorage.changeFolderLocation();
  }

  /**
   * Handle grant permission button click for folder access
   */
  async onGrantPermission(): Promise<void> {
    await this.folderStorage.requestPermission();
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

  async onStartRecording(): Promise<void> {
    this.recordingSession.clearError();
    await this.recordingSession.startRecording();
  }

  async onStopRecording(): Promise<void> {
    await this.recordingSession.stopRecording();
  }
}
