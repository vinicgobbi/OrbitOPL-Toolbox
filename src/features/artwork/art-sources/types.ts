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
