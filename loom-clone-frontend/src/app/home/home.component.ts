import {
  Component,
  OnInit,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { BrowserCompatService } from '../services/storage/browser-compat.service';
import { FolderStorageService } from '../services/storage/folder-storage.service';

/**
 * Home component for the Loom Clone application
 * Main page for folder selection and setup
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

  // Expose service signals to template
  readonly isSupported = this.browserCompat.isSupported;
  readonly supportMessage = this.browserCompat.supportMessage;
  readonly folderName = this.folderStorage.folderName;
  readonly permissionState = this.folderStorage.permissionState;
  readonly isLoading = this.folderStorage.isLoading;
  readonly errorMessage = this.folderStorage.errorMessage;

  // Computed signals for UI state
  readonly hasFolder = computed(() => this.folderName() !== null);
  readonly needsPermission = computed(
    () => this.hasFolder() && this.permissionState() === 'prompt',
  );
  readonly isReady = computed(
    () => this.hasFolder() && this.permissionState() === 'granted',
  );

  async ngOnInit(): Promise<void> {
    // Auto-check for stored folder on component init
    await this.folderStorage.initializeFolder();
  }

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
   * Handle grant permission button click
   */
  async onGrantPermission(): Promise<void> {
    await this.folderStorage.requestPermission();
  }
}
