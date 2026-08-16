import { createLogger } from "../logger";
import { getSettings } from "./settings.service";
import * as githubSource from "./artwork.service";
import * as libretroSource from "./libretro-artwork.service";
import { ArtServiceResult, ArtSourceOptions, ArtProbeResult } from "./art-sources/types";
import { LibretroSystem } from "./libretro-index.service";

const log = createLogger("artwork-router");

function resolveSource(opts?: ArtSourceOptions) {
  return opts?.source ?? getSettings().artSource;
}

export async function listArt(
  gameId: string,
  system: "PS1" | "PS2",
  opts?: ArtSourceOptions
): Promise<ArtProbeResult> {
  const source = resolveSource(opts);
  if (source === "libretro") {
    return libretroSource.listAvailableArt(gameId, system as LibretroSystem, opts);
  }
  const result = await githubSource.listAvailableArt(gameId, system);
  return result;
}

export async function downloadArt(
  dirPath: string,
  gameId: string,
  system: "PS1" | "PS2",
  saveAsName?: string,
  artTypes?: string[],
  opts?: ArtSourceOptions
): Promise<ArtServiceResult> {
  const source = resolveSource(opts);
  log.verbose(`Routing artwork download for ${gameId} to source "${source}"`);
  if (source === "libretro") {
    return libretroSource.downloadArtByGameId(
      dirPath,
      gameId,
      system as LibretroSystem,
      saveAsName,
      artTypes,
      opts
    );
  }
  return githubSource.downloadArtByGameId(dirPath, gameId, system, saveAsName, artTypes);
}
