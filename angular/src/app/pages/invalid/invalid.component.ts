import { Component, OnInit } from '@angular/core';

import { LibraryService } from '../../shared/services/library.service';
import {
  JobsService,
  NewImportJob,
} from '../../shared/services/jobs.service';
import { SettingsService } from '../../shared/services/settings.service';
import { AsyncPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-invalid',
  imports: [AsyncPipe, CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './invalid.component.html',
  styleUrl: './invalid.component.scss',
})
export class InvalidComponent implements OnInit {
  renamedFilePath: string = '';
  renameGameId: string = '';
  renameGameName: string = '';
  fetchArtwork: boolean = false;

  bulkRunning: boolean = false;
  bulkResult: { corrected: number; skipped: number } | null = null;

  constructor(
    public readonly _libraryService: LibraryService,
    private readonly _jobs: JobsService,
    private readonly _settings: SettingsService
  ) {}

  ngOnInit() {
    this._settings.load();
  }

  openRenameTool(filepath: string) {
    const dialog = document.getElementById('rename_tool') as HTMLDialogElement;
    dialog?.showModal();
    // Auto-discover the game ID straight from the disc image — handles ISO
    // (raw scan) and ZSO (decompression) alike.
    this._libraryService.resolveIsoGameId(filepath).then((result) => {
      if (result.success && result.gameId) {
        this.renamedFilePath = filepath;
        this.renameGameId = result.gameId;
        this.renameGameName = result.gameName || '';
      }
    });
  }

  openBulkAutoCorrection() {
    this.bulkResult = null;
    const dialog = document.getElementById(
      'bulk_auto_tool'
    ) as HTMLDialogElement;
    dialog?.showModal();
  }

  closeBulkAutoCorrection() {
    if (this.bulkRunning) return;
    (document.getElementById('bulk_auto_tool') as HTMLDialogElement)?.close();
  }

  startBulkAutoCorrection() {
    if (this.bulkRunning) return;
    this.bulkRunning = true;
    this.bulkResult = null;
    // Resolve game IDs first, then queue a rename (and optional artwork) job
    // per file so the whole batch is tracked in the jobs queue.
    this._libraryService
      .planBulkAutoCorrection()
      .then(({ resolved, skipped }) => {
        const jobs: NewImportJob[] = [];
        const keepOriginalName =
          this._settings.current.namingConvention === 'new';
        for (const item of resolved) {
          jobs.push({
            type: 'rename',
            label: item.gameName || item.gameId,
            filePath: item.path,
            gameId: item.gameId,
            gameName: item.gameName,
            downloadArtwork: false,
            keepOriginalName,
          });
          if (this.fetchArtwork) {
            jobs.push({
              type: 'artwork',
              label: item.gameName || item.gameId,
              filePath: item.path,
              gameId: item.gameId,
              gameName: item.gameName,
              downloadArtwork: false,
              system: 'PS2',
              artTypes: this._settings.current.defaultArtTypes,
            });
          }
        }
        if (jobs.length > 0) this._jobs.enqueue(jobs);
        this.bulkResult = { corrected: resolved.length, skipped };
      })
      .finally(() => {
        this.bulkRunning = false;
      });
  }

  sendRenaming() {
    const jobs: NewImportJob[] = [
      {
        type: 'rename',
        label: this.renameGameName || this.renameGameId,
        filePath: this.renamedFilePath,
        gameId: this.renameGameId,
        gameName: this.renameGameName,
        downloadArtwork: false,
        keepOriginalName: this._settings.current.namingConvention === 'new',
      },
    ];
    if (this.fetchArtwork) {
      jobs.push({
        type: 'artwork',
        label: this.renameGameName || this.renameGameId,
        filePath: this.renamedFilePath,
        gameId: this.renameGameId,
        gameName: this.renameGameName,
        downloadArtwork: false,
        system: 'PS2',
        artTypes: this._settings.current.defaultArtTypes,
      });
    }
    this._jobs.enqueue(jobs);
    (document.getElementById('rename_tool') as HTMLDialogElement).close();
  }

  closeRenameTool() {
    (document.getElementById('rename_tool') as HTMLDialogElement).close();
  }
}
