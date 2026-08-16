import { Component, OnInit } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { LibraryService } from '../../shared/services/library.service';
import { JobsService } from '../../shared/services/jobs.service';
import { SettingsService } from '../../shared/services/settings.service';
import { AsyncPipe } from '@angular/common';

type DiscMode = 'ps2' | 'ps1' | 'apps';

interface StagedFile {
  path: string;
  fileName: string;
  gameId: string;
  gameName: string;
  detected: boolean;
  invalid: boolean;
  message?: string;
  /** PS2 only: which import pipeline this file resolved to. */
  resolvedType?: 'ps2-cd' | 'ps2-dvd';
  /** PS2 only, resolvedType === 'ps2-dvd': destination folder, by size. */
  discFolder?: 'CD' | 'DVD';
}

@Component({
  selector: 'app-import',
  imports: [LucideAngularModule, AsyncPipe],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
})
export class ImportComponent implements OnInit {
  constructor(
    public _libraryService: LibraryService,
    private _jobs: JobsService,
    private _settings: SettingsService
  ) {}

  importMode: DiscMode = 'ps2';
  downloadArtwork = true;
  elfPrefix = 'XX.';

  staged: StagedFile[] = [];
  scanning = false;

  get isPs2(): boolean {
    return this.importMode === 'ps2';
  }
  get isGamePsx(): boolean {
    return this.importMode === 'ps1';
  }
  get isApp(): boolean {
    return this.importMode === 'apps';
  }

  /**
   * A staged entry is importable once it has a name; disc games additionally
   * need a game id (apps don't have one).
   */
  get readyCount(): number {
    return this.staged.filter(
      (f) => f.gameName && (this.isApp || f.gameId)
    ).length;
  }

  ngOnInit() {
    this._settings.load();
  }

  setMode(mode: DiscMode) {
    this.importMode = mode;
    this.staged = [];
  }

  async addFiles() {
    const result = this.isApp
      ? await window.libraryAPI.openAskElfFiles()
      : await window.libraryAPI.openAskGameFiles(
          this.isPs2 || this.isGamePsx,
          this.isPs2
        );
    if (result?.canceled || !result?.filePaths?.length) {
      return;
    }

    this.scanning = true;
    try {
      for (const path of result.filePaths as string[]) {
        if (this.staged.some((f) => f.path === path)) {
          continue;
        }
        const staged = this.isApp
          ? this.stageApp(path)
          : await this.detectFile(path);
        this.staged = [...this.staged, staged];
      }
    } finally {
      this.scanning = false;
    }
  }

  private stageApp(path: string): StagedFile {
    const fileName = path.split(/[\\/]/).pop() || path;
    const title = fileName.replace(/\.elf$/i, '');
    return { path, fileName, gameId: '', gameName: title, detected: false, invalid: false };
  }

  /** PS2 only: resolves which pipeline a staged file uses and, for an
   *  already-cooked .iso/.zso, which folder it lands in based on size. */
  private async resolveDiscRouting(
    path: string
  ): Promise<Pick<StagedFile, 'resolvedType' | 'discFolder'>> {
    if (!this.isPs2) return {};
    if (/\.cue$/i.test(path)) {
      return { resolvedType: 'ps2-cd', discFolder: 'CD' };
    }
    const res = await window.libraryAPI.resolveDiscFolder(path);
    return { resolvedType: 'ps2-dvd', discFolder: res?.folder || 'DVD' };
  }

  private async detectFile(path: string): Promise<StagedFile> {
    const fileName = path.split(/[\\/]/).pop() || path;
    const detect = this.isGamePsx
      ? this._libraryService.tryDeterminePs1GameIdFromHex(path)
      : this._libraryService.tryDetermineGameIdFromHex(path);

    const [res, routing] = await Promise.all([
      detect.catch((err: any) => ({ success: false, message: err?.message })),
      this.resolveDiscRouting(path),
    ]);

    if ((res as any)?.success) {
      return {
        path,
        fileName,
        gameId: (res as any).gameId || '',
        gameName: (res as any).gameName || '',
        detected: true,
        invalid: false,
        ...routing,
      };
    }
    return {
      path,
      fileName,
      gameId: '',
      gameName: '',
      detected: false,
      invalid: true,
      message: (res as any)?.message,
      ...routing,
    };
  }

  removeStaged(path: string) {
    this.staged = this.staged.filter((f) => f.path !== path);
  }

  clearStaged() {
    this.staged = [];
  }

  importAll() {
    const ready = this.staged.filter(
      (f) => f.gameName && (this.isApp || f.gameId)
    );
    if (!ready.length) {
      return;
    }
    this._jobs.enqueue(
      ready.map((f) => ({
        type: this.isApp
          ? 'apps'
          : this.isGamePsx
          ? 'ps1'
          : f.resolvedType ?? 'ps2-dvd',
        label: f.gameName || f.gameId || f.fileName,
        filePath: f.path,
        gameId: f.gameId,
        gameName: f.gameName,
        downloadArtwork: this.downloadArtwork,
        elfPrefix: this.isGamePsx ? this.elfPrefix : undefined,
        discFolder: f.resolvedType === 'ps2-dvd' ? f.discFolder : undefined,
        keepOriginalName:
          f.resolvedType === 'ps2-dvd'
            ? this._settings.current.namingConvention === 'new'
            : undefined,
      }))
    );
    this.staged = [];
  }
}
