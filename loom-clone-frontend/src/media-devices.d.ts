/**
 * Type definitions for the Media Devices API
 * navigator.mediaDevices.enumerateDevices() and getUserMedia()
 *
 * These interfaces extend the global namespace and may not be fully
 * in TypeScript's DOM library yet, so we define them here for complete coverage.
 */

interface MediaDeviceInfo {
  readonly deviceId: string;
  readonly groupId: string;
  readonly kind: 'videoinput' | 'audioinput' | 'audiooutput';
  readonly label: string;
  toJSON(): Record<string, unknown>;
}

interface MediaDevices extends EventTarget {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia(options: DisplayMediaStreamOptions): Promise<MediaStream>;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface MediaStreamConstraints {
  video?: boolean | MediaTrackConstraints;
  audio?: boolean | MediaAudioTrackConstraints;
}

interface MediaTrackConstraints {
  deviceId?: ConstrainDOMString;
  aspectRatio?: ConstrainDouble;
  frameRate?: ConstrainDouble;
  height?: ConstrainULong;
  width?: ConstrainULong;
  facingMode?: ConstrainDOMString;
}

interface MediaAudioTrackConstraints {
  deviceId?: ConstrainDOMString;
  echoCancellation?: ConstrainBoolean;
  noiseSuppression?: ConstrainBoolean;
  autoGainControl?: ConstrainBoolean;
}

interface ConstrainDOMString {
  exact?: string | string[];
  ideal?: string | string[];
}

interface ConstrainDouble {
  exact?: number;
  ideal?: number;
  max?: number;
  min?: number;
}

interface ConstrainULong {
  exact?: number;
  ideal?: number;
  max?: number;
  min?: number;
}

interface ConstrainBoolean {
  exact?: boolean;
  ideal?: boolean;
}

interface DisplayMediaStreamOptions {
  video?: boolean | DisplayMediaVideoOptions;
  audio?: boolean | DisplayMediaAudioOptions;
}

interface DisplayMediaVideoOptions {
  cursor?: 'auto' | 'always' | 'never';
}

interface DisplayMediaAudioOptions {
  mandatory?: Record<string, unknown>;
}

/**
 * Extend Navigator interface to ensure mediaDevices is recognized
 */
declare global {
  interface Navigator {
    readonly mediaDevices: MediaDevices;
  }
}

export {};
