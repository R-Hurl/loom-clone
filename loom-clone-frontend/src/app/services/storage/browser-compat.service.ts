import { Injectable, computed, signal } from '@angular/core';

/**
 * Service to detect browser compatibility for File System Access API
 * Identifies unsupported browsers (Firefox, Safari) and feature availability
 */
@Injectable({
  providedIn: 'root',
})
export class BrowserCompatService {
  private readonly _isSupported = signal<boolean>(this.checkSupport());
  private readonly _browserName = signal<string>(this.detectBrowser());

  /**
   * Signal indicating if the File System Access API is supported
   */
  readonly isSupported = this._isSupported.asReadonly();

  /**
   * Signal indicating the detected browser name
   */
  readonly browserName = this._browserName.asReadonly();

  /**
   * Computed signal for a user-friendly support message
   */
  readonly supportMessage = computed(() => {
    if (this.isSupported()) {
      return `${this.browserName()} supports all features`;
    }
    return `${this.browserName()} does not support the File System Access API. Please use Chrome, Edge, or Opera.`;
  });

  /**
   * Check if the File System Access API is supported in the current browser
   */
  private checkSupport(): boolean {
    return 'showDirectoryPicker' in window;
  }

  /**
   * Detect the browser based on user agent
   */
  private detectBrowser(): string {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes('edg/')) {
      return 'Microsoft Edge';
    } else if (userAgent.includes('opr/') || userAgent.includes('opera')) {
      return 'Opera';
    } else if (userAgent.includes('chrome')) {
      return 'Google Chrome';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      return 'Safari';
    } else if (userAgent.includes('firefox')) {
      return 'Firefox';
    }

    return 'Unknown Browser';
  }
}
