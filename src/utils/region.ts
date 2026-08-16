export type GameRegion = "NTSC-U" | "PAL" | "NTSC-J" | "UNKNOWN";

const NTSC_U_PREFIXES = ["SCUS", "SLUS", "LSP", "PSRM"];
const PAL_PREFIXES = ["SCES", "SCED", "SLES", "SLED"];
const NTSC_J_PREFIXES = ["SCPS", "SLPS", "SLPM", "SIPS"];

/**
 * Derives a game's region from its GAMEID prefix. Mirrors
 * `mapGameIdToRegion()` in the Angular `library.service.ts` — duplicated
 * here (not imported) since the renderer and main process are separate
 * bundles, matching this repo's existing convention for shared logic
 * (see `AppSettings` duplicated in `window.d.ts`).
 */
export function mapGameIdToRegion(gameId: string): GameRegion {
  const id = gameId.toUpperCase();
  if (PAL_PREFIXES.some((p) => id.startsWith(p))) return "PAL";
  if (NTSC_U_PREFIXES.some((p) => id.startsWith(p))) return "NTSC-U";
  if (NTSC_J_PREFIXES.some((p) => id.startsWith(p))) return "NTSC-J";
  return "UNKNOWN";
}
