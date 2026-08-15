import { Component, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { artTypeLabel } from '@shared/constants/artwork-presets';

export interface ArtworkBulkConfirmEvent {
  skipExisting: boolean;
}

@Component({
  selector: 'app-artwork-bulk-dialog',
  imports: [LucideAngularModule],
  templateUrl: './artwork-bulk-dialog.component.html',
  styleUrl: './artwork-bulk-dialog.component.scss',
})
export class ArtworkBulkDialogComponent {
  readonly gameCount = input.required<number>();
  /** Read-only — the default art types configured in Settings. */
  readonly defaultArtTypes = input<string[]>([]);
  readonly confirm = output<ArtworkBulkConfirmEvent>();
  readonly closed = output<void>();

  readonly artTypeLabel = artTypeLabel;

  readonly skipExisting = signal(false);

  submit(): void {
    this.confirm.emit({ skipExisting: this.skipExisting() });
  }

  close(): void {
    this.closed.emit();
  }
}
