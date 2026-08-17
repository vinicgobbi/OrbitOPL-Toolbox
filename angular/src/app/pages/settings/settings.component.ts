import { Component, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Observable } from 'rxjs';
import { SettingsService } from '@shared/services/settings.service';
import { LogsService } from '@shared/services/logs.service';
import { UpdateService } from '@shared/services/update.service';
import {
  KNOWN_ART_TYPES,
  SOURCE_SUPPORTED_TYPES,
  ArtSourceId,
  artTypeLabel,
} from '@shared/constants/artwork-presets';

@Component({
  selector: 'app-settings',
  imports: [LucideAngularModule, AsyncPipe],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  public settings$: Observable<AppSettings>;
  public verboseMode = false;
  public refreshingIndex = false;

  readonly knownArtTypes = KNOWN_ART_TYPES;
  readonly artTypeLabel = artTypeLabel;

  constructor(
    private readonly _settings: SettingsService,
    private readonly _logger: LogsService,
    public readonly _update: UpdateService
  ) {
    this.settings$ = this._settings.settings$;
  }

  checkForUpdates(): void {
    this._update.check();
  }

  openRelease(): void {
    this._update.openRelease();
  }

  ngOnInit(): void {
    this._settings.load();
    this.verboseMode = this._logger.isVerboseMode;
  }

  onAutoReconnectChange(enabled: boolean): void {
    this._settings.set('autoReconnect', enabled);
  }

  onVerboseChange(): void {
    this._logger.toggleVerboseMode();
    this.verboseMode = this._logger.isVerboseMode;
  }

  onNamingConventionChange(value: 'old' | 'new'): void {
    this._settings.set('namingConvention', value);
  }

  onArtSourceChange(value: ArtSourceId): void {
    this._settings.set('artSource', value);
  }

  async refreshArtIndex(): Promise<void> {
    this.refreshingIndex = true;
    try {
      await Promise.all([
        window.libraryAPI.refreshLibretroIndex('PS1'),
        window.libraryAPI.refreshLibretroIndex('PS2'),
      ]);
    } finally {
      this.refreshingIndex = false;
    }
  }

  isArtTypeSelected(type: string): boolean {
    return this._settings.current.defaultArtTypes.includes(type);
  }

  isArtTypeSupported(type: string): boolean {
    const source = this._settings.current.artSource ?? 'github';
    return SOURCE_SUPPORTED_TYPES[source].includes(type);
  }

  toggleDefaultArtType(type: string): void {
    const current = this._settings.current.defaultArtTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    this._settings.set('defaultArtTypes', next);
  }
}
