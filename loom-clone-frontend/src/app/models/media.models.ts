/**
 * Media device models for camera and microphone selection
 * Follows the same pattern as storage.models.ts
 */

/**
 * Available media input device types
 */
export type MediaDeviceKind = 'videoinput' | 'audioinput';

/**
 * Represents a camera or microphone device available on the system
 */
export interface MediaInputDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
  groupId: string;
}

/**
 * User's selected camera and microphone devices
 * Persisted to IndexedDB
 */
export interface SelectedMediaDevices {
  id: 'current';
  cameraDeviceId: string | null;
  microphoneDeviceId: string | null;
  lastSelected: number;
}

/**
 * User toggle preferences for microphone and camera
 * Persisted to IndexedDB preferences store
 */
export interface MediaTogglePreferences {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  lastUpdated: number;
}

/**
 * Permission state for camera/microphone access
 * Mirrors the pattern from FolderStorageService
 */
export type MediaPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * High-level recording runtime status
 */
export type RecordingStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'error';

/**
 * Active media tracks used during recording session
 */
export interface ActiveRecordingTracks {
  microphoneTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
}

/**
 * Error codes for media device operations
 */
export enum MediaDeviceErrorCode {
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ENUMERATION_FAILED = 'ENUMERATION_FAILED',
  BROWSER_NOT_SUPPORTED = 'BROWSER_NOT_SUPPORTED',
  INVALID_DEVICE = 'INVALID_DEVICE',
}

/**
 * Custom error for media device operations
 * Extends Error to maintain type safety and stack traces
 */
export class MediaDeviceError extends Error {
  constructor(
    public code: MediaDeviceErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'MediaDeviceError';
  }
}
