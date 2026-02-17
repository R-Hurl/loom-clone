import { Injectable, computed, inject, signal } from '@angular/core';
import { RecordingStatus } from '../../models/media.models';
import { FolderStorageService } from '../storage/folder-storage.service';
import { MediaDevicesService } from './media-devices.service';

@Injectable({
  providedIn: 'root',
})
export class RecordingSessionService {
  private readonly folderStorage = inject(FolderStorageService);
  private readonly mediaDevices = inject(MediaDevicesService);

  private readonly _recordingStatus = signal<RecordingStatus>('idle');
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _statusMessage = signal<string | null>(null);

  readonly recordingStatus = this._recordingStatus.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();
  readonly statusMessage = this._statusMessage.asReadonly();

  readonly isRecording = computed(() => this._recordingStatus() === 'recording');

  private screenStream: MediaStream | null = null;
  private deviceStream: MediaStream | null = null;
  private recordingStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async startRecording(): Promise<void> {
    if (this._recordingStatus() !== 'idle') {
      return;
    }

    this._recordingStatus.set('starting');
    this._errorMessage.set(null);
    this._statusMessage.set(null);

    try {
      const screenSharingEnabled = this.mediaDevices.screenSharingEnabled();
      const cameraEnabled = this.mediaDevices.cameraEnabled();
      const microphoneEnabled = this.mediaDevices.microphoneEnabled();
      const selectedCamera = this.mediaDevices.selectedCamera();
      const selectedMicrophone = this.mediaDevices.selectedMicrophone();

      const captureScreen = screenSharingEnabled;
      const captureCamera = !screenSharingEnabled && cameraEnabled && selectedCamera !== null;
      const captureMicrophone = microphoneEnabled && selectedMicrophone !== null;

      if (!captureScreen && !captureCamera && !captureMicrophone) {
        throw new Error('Enable screen sharing, camera, or microphone first');
      }

      if (captureScreen) {
        try {
          this.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
        } catch (error) {
          if (this.isScreenSelectionCanceled(error)) {
            this._recordingStatus.set('idle');
            this._statusMessage.set('Screen sharing selection was canceled');
            return;
          }

          throw error;
        }
      }

      this.recordingStream = new MediaStream();
      const screenVideoTrack = this.screenStream?.getVideoTracks()[0] ?? null;

      if (screenVideoTrack) {
        this.recordingStream.addTrack(screenVideoTrack);
        screenVideoTrack.onended = () => {
          if (this._recordingStatus() === 'recording') {
            void this.stopRecording();
          }
        };
      }

      const mediaConstraints = this.buildDeviceConstraints({
        includeCamera: captureCamera,
        includeMicrophone: captureMicrophone,
      });
      if (mediaConstraints.video !== false || mediaConstraints.audio !== false) {
        this.deviceStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      }

      const microphoneTrack = this.deviceStream?.getAudioTracks()[0] ?? null;
      const cameraTrack = this.deviceStream?.getVideoTracks()[0] ?? null;

      if (!screenVideoTrack && cameraTrack) {
        this.recordingStream.addTrack(cameraTrack);
      }

      if (!screenVideoTrack && !cameraTrack && (captureScreen || captureCamera)) {
        throw new Error('Video track is unavailable for recording');
      }

      if (microphoneTrack) {
        this.recordingStream.addTrack(microphoneTrack);
      }

      this.mediaDevices.attachActiveTracks({
        microphoneTrack,
        cameraTrack,
      });

      const mimeType = this.resolveSupportedMimeType();
      this.chunks = [];
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.recordingStream, { mimeType })
        : new MediaRecorder(this.recordingStream);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = () => {
        this._recordingStatus.set('error');
        this._errorMessage.set('Recording failed unexpectedly');
      };

      this.mediaRecorder.start(1000);
      this._recordingStatus.set('recording');
    } catch (error) {
      this.cleanupSession();
      this._recordingStatus.set('error');
      this._errorMessage.set(error instanceof Error ? error.message : 'Unable to start recording');
    }
  }

  async stopRecording(): Promise<void> {
    if (this._recordingStatus() !== 'recording' || !this.mediaRecorder) {
      return;
    }

    this._recordingStatus.set('stopping');

    try {
      const finalBlob = await this.stopRecorderAndCollectBlob();

      if (finalBlob.size > 0) {
        const filename = this.createFilename();
        await this.folderStorage.saveRecording(finalBlob, filename);
        await this.folderStorage.refreshRecordings();
      }

      this._recordingStatus.set('idle');
      this._errorMessage.set(null);
    } catch (error) {
      this._recordingStatus.set('error');
      this._errorMessage.set(error instanceof Error ? error.message : 'Unable to stop recording');
    } finally {
      this.cleanupSession();
    }
  }

  clearError(): void {
    if (this._recordingStatus() === 'error') {
      this._recordingStatus.set('idle');
    }
    this._errorMessage.set(null);
    this._statusMessage.set(null);
  }

  private buildDeviceConstraints(options: {
    includeCamera: boolean;
    includeMicrophone: boolean;
  }): MediaStreamConstraints {
    const selectedCamera = this.mediaDevices.selectedCamera();
    const selectedMicrophone = this.mediaDevices.selectedMicrophone();
    const selectedCameraId = selectedCamera?.deviceId.trim() || null;
    const selectedMicrophoneId = selectedMicrophone?.deviceId.trim() || null;

    let videoConstraints: MediaTrackConstraints | boolean = false;
    if (options.includeCamera && selectedCamera !== null) {
      if (selectedCameraId) {
        videoConstraints = { deviceId: { exact: selectedCameraId } };
      } else {
        videoConstraints = true;
      }
    }

    let audioConstraints: MediaTrackConstraints | boolean = false;
    if (options.includeMicrophone && selectedMicrophone !== null) {
      if (selectedMicrophoneId) {
        audioConstraints = { deviceId: { exact: selectedMicrophoneId } };
      } else {
        audioConstraints = true;
      }
    }

    return {
      video: videoConstraints,
      audio: audioConstraints,
    };
  }

  private resolveSupportedMimeType(): string | null {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private stopRecorderAndCollectBlob(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recorder found'));
        return;
      }

      const recorder = this.mediaRecorder;

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm';
        resolve(new Blob(this.chunks, { type: mimeType }));
      };

      recorder.onerror = () => {
        reject(new Error('Recorder failed while stopping'));
      };

      recorder.stop();
    });
  }

  private createFilename(): string {
    const now = new Date();
    const iso = now.toISOString().replace(/[:.]/g, '-');
    return `recording-${iso}.webm`;
  }

  private isScreenSelectionCanceled(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError')
    );
  }

  private cleanupSession(): void {
    this.mediaRecorder = null;
    this.chunks = [];

    this.recordingStream?.getTracks().forEach((track) => track.stop());
    this.recordingStream = null;

    this.deviceStream?.getTracks().forEach((track) => track.stop());
    this.deviceStream = null;

    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.screenStream = null;

    this.mediaDevices.clearActiveTracks();
  }
}
