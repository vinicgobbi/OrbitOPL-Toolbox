export const PS1_GAME_ID_PREFIXES = [
  "SCUS",
  "SLUS",
  "SCES",
  "SLES",
  "SCPS",
  "SLPS",
  "SLPM",
  "SIPS",
  "SCAJ",
  "PAPX",
  "PCPX",
  "SCED",
  "SLED",
];

export const PS1_GAME_ID_REGEX = new RegExp(
  `(?:${PS1_GAME_ID_PREFIXES.join("|")})[_-][0-9]{3}\\.[0-9]{2}`,
  "g"
);

export const PS2_GAME_ID_PREFIXES = [
  "SLUS",
  "SCUS",
  "SLES",
  "SCES",
  "SLPM",
  "SLPS",
  "SCPS",
  "SCPM",
  "SLAJ",
  "SCAJ",
  "SLKA",
  "SCKA",
  "SCED",
  "SCCS",
];

export const PS2_GAME_ID_REGEX = new RegExp(
  `(?:${PS2_GAME_ID_PREFIXES.join("|")})_[0-9]{3}\\.[0-9]{2}(?:;1)?`,
  "g"
);

export const FILE_SCAN_CHUNK_BYTES = 1024 * 1024; // 1 MB chunks keep memory usage predictable.
export const FILE_SCAN_OVERLAP_BYTES = 64; // Overlap to catch IDs spanning chunk boundaries.
export const VCD_HEADER_SIZE = 1048576; // 1 MB — VCD header before disc data
export const CD_MAX_BYTES = 737_280_000; // 360,000 sectors × 2048 B — max 80-min CD-ROM (Mode 1/2048) capacity

export function normaliseGameIdForLookup(rawId: string) {
  return rawId.replace("_", "-").replace(/\./g, "").toUpperCase();
}
