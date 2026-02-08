/**
 * Storage models and interfaces for the Loom Clone application
 */

/**
 * Data structure for storing folder information in IndexedDB
 */
export interface StoredFolderData {
  handle: FileSystemDirectoryHandle;
  lastAccessed: Date;
  folderName: string;
}

/**
 * Represents the current state of folder selection
 */
export interface FolderSelectionState {
  hasStoredFolder: boolean;
  needsPermission: boolean;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Permission states for file system access
 */
export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * Custom error types for folder access operations
 */
export enum FolderAccessErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  INVALID_HANDLE = 'INVALID_HANDLE',
  BROWSER_NOT_SUPPORTED = 'BROWSER_NOT_SUPPORTED',
}

export class FolderAccessError extends Error {
  constructor(
    public code: FolderAccessErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'FolderAccessError';
  }
}
