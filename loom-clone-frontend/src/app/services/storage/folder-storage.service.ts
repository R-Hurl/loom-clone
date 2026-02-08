import { Injectable, inject, signal } from '@angular/core';
import { IndexedDbService } from './indexeddb.service';
import {
  StoredFolderData,
  FolderAccessError,
  FolderAccessErrorCode,
  PermissionState,
} from '../../models/storage.models';

/**
 * Service for managing folder selection and File System Access API operations
 * Handles folder persistence via IndexedDB and permission management
 */
@Injectable({
  providedIn: 'root',
})
export class FolderStorageService {
  private readonly indexedDb = inject(IndexedDbService);
  private readonly STORAGE_KEY = 'recordings-folder';

  // State signals
  private readonly _folderHandle = signal<FileSystemDirectoryHandle | null>(
    null,
  );
  private readonly _folderName = signal<string | null>(null);
  private readonly _permissionState = signal<PermissionState>('unknown');
  private readonly _isLoading = signal<boolean>(false);
  private readonly _errorMessage = signal<string | null>(null);

  // Public readonly signals
  readonly folderHandle = this._folderHandle.asReadonly();
  readonly folderName = this._folderName.asReadonly();
  readonly permissionState = this._permissionState.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly errorMessage = this._errorMessage.asReadonly();

  /**
   * Initialize folder from IndexedDB on app load
   * Auto-verifies handle validity and permissions
   */
  async initializeFolder(): Promise<void> {
    this._isLoading.set(true);
    this._errorMessage.set(null);

    try {
      const storedData = await this.indexedDb.get<StoredFolderData>(
        'handles',
        this.STORAGE_KEY,
      );

      if (!storedData || !storedData.handle) {
        this._isLoading.set(false);
        return;
      }

      // Verify handle is still valid
      const isValid = await this.verifyHandle(storedData.handle);
      if (!isValid) {
        // Clear invalid handle immediately
        await this.clearStoredFolder();
        this._errorMessage.set(
          'Previously selected folder is no longer accessible',
        );
        this._isLoading.set(false);
        return;
      }

      // Check permission state
      const permission = await this.checkPermission(storedData.handle);

      this._folderHandle.set(storedData.handle);
      this._folderName.set(storedData.folderName);
      this._permissionState.set(permission);

      // Update last accessed time
      await this.saveFolderData(storedData.handle);
    } catch (error) {
      console.error('Failed to initialize folder:', error);
      this._errorMessage.set('Failed to load saved folder');
      await this.clearStoredFolder();
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Prompt user to select a new folder
   * Requires user gesture
   */
  async selectNewFolder(): Promise<void> {
    this._isLoading.set(true);
    this._errorMessage.set(null);

    try {
      // Check if API is supported
      if (!('showDirectoryPicker' in window)) {
        throw new FolderAccessError(
          FolderAccessErrorCode.BROWSER_NOT_SUPPORTED,
          'File System Access API is not supported in this browser',
        );
      }

      // Show directory picker (requires user gesture)
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite',
      });

      // Save to IndexedDB
      await this.saveFolderData(handle);

      this._folderHandle.set(handle);
      this._folderName.set(handle.name);
      this._permissionState.set('granted');
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') {
        // User cancelled the picker
        this._errorMessage.set('Folder selection cancelled');
      } else {
        console.error('Failed to select folder:', error);
        this._errorMessage.set('Failed to select folder');
      }
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Request permission for the current folder
   * Requires user gesture
   */
  async requestPermission(): Promise<boolean> {
    const handle = this._folderHandle();
    if (!handle) {
      return false;
    }

    try {
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      this._permissionState.set(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Failed to request permission:', error);
      this._permissionState.set('denied');
      return false;
    }
  }

  /**
   * Change folder location with confirmation
   * Uses native confirm() dialog
   */
  async changeFolderLocation(): Promise<void> {
    const currentFolder = this._folderName();
    const message = currentFolder
      ? `Change folder from "${currentFolder}"? Existing recordings will remain in the current location.`
      : 'Select a new folder for recordings?';

    if (!confirm(message)) {
      return;
    }

    await this.selectNewFolder();
  }

  /**
   * Clear stored folder data
   */
  async clearStoredFolder(): Promise<void> {
    try {
      await this.indexedDb.delete('handles', this.STORAGE_KEY);
      this._folderHandle.set(null);
      this._folderName.set(null);
      this._permissionState.set('unknown');
      this._errorMessage.set(null);
    } catch (error) {
      console.error('Failed to clear stored folder:', error);
    }
  }

  /**
   * Save folder handle to IndexedDB
   */
  private async saveFolderData(
    handle: FileSystemDirectoryHandle,
  ): Promise<void> {
    const folderData: StoredFolderData = {
      handle,
      lastAccessed: new Date(),
      folderName: handle.name,
    };

    await this.indexedDb.set('handles', this.STORAGE_KEY, folderData);
  }

  /**
   * Verify that a folder handle is still valid
   */
  private async verifyHandle(
    handle: FileSystemDirectoryHandle,
  ): Promise<boolean> {
    try {
      // Try to iterate the directory to check if it still exists
      const entries = handle.entries();
      await entries.next();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check permission state for a folder handle
   */
  private async checkPermission(
    handle: FileSystemDirectoryHandle,
  ): Promise<PermissionState> {
    try {
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      return permission;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Save a recording blob to the selected folder
   * (For future use)
   */
  async saveRecording(blob: Blob, filename: string): Promise<void> {
    const handle = this._folderHandle();
    if (!handle) {
      throw new FolderAccessError(
        FolderAccessErrorCode.NOT_FOUND,
        'No folder selected',
      );
    }

    const permission = this._permissionState();
    if (permission !== 'granted') {
      throw new FolderAccessError(
        FolderAccessErrorCode.PERMISSION_DENIED,
        'Permission not granted',
      );
    }

    try {
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (error) {
      console.error('Failed to save recording:', error);
      throw new Error('Failed to save recording to folder');
    }
  }
}
