import { GameRegion } from "../../../utils/region";

export type ArtSourceId = "github" | "libretro";

export interface ArtDownloadResultItem {
  name: string;
  type: string;
  url: string;
  savedPath?: string;
  error?: string;
}

export interface ArtServiceResult {
  success: boolean;
  data: ArtDownloadResultItem[];
  message?: string;
}

export interface ArtProbeEntry {
  type: string;
  fileName: string;
  downloadUrl: string;
}

export interface ArtProbeResult {
  success: boolean;
  data: ArtProbeEntry[];
  message?: string;
}

/** Extra context a source may use to resolve the right art (name-based sources). */
export interface ArtSourceOptions {
  source?: ArtSourceId;
  /** Known display title (e.g. from the bundled GAMEID→title list). */
  title?: string;
  region?: GameRegion;
  /**
   * Per-type exact filename overrides (keyed by type code, e.g. "COV"),
   * chosen via manual search — skips title/region matching entirely for
   * that type.
   */
  manualFileNames?: Record<string, string>;
}
