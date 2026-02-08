import { Injectable } from '@angular/core';

/**
 * Generic IndexedDB service for storing and retrieving data
 * Provides a simple wrapper around IndexedDB operations
 */
@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private readonly DB_NAME = 'loom-clone-storage';
  private readonly DB_VERSION = 1;
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize and open the IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB database'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles');
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences');
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Get a value from the specified object store
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    try {
      const db = await this.openDatabase();

      return new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          resolve(request.result as T | undefined);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get value from ${storeName}`));
        };
      });
    } catch (error) {
      console.error('IndexedDB get error:', error);
      return undefined;
    }
  }

  /**
   * Set a value in the specified object store
   */
  async set<T>(storeName: string, key: string, value: T): Promise<void> {
    const db = await this.openDatabase();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to set value in ${storeName}`));
      };
    });
  }

  /**
   * Delete a value from the specified object store
   */
  async delete(storeName: string, key: string): Promise<void> {
    const db = await this.openDatabase();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete value from ${storeName}`));
      };
    });
  }

  /**
   * Clear all values from the specified object store
   */
  async clear(storeName: string): Promise<void> {
    const db = await this.openDatabase();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to clear ${storeName}`));
      };
    });
  }
}
