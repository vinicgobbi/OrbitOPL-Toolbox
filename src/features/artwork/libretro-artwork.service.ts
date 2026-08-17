import * as fs from "fs/promises";
import path from "path";
import { createLogger, formatBytes } from "../../logger";
import { httpGetBuffer } from "../../utils/http-get";
import { resizeArtForOpl } from "../../utils/image-resize";
import {
  LibretroArtType,
  LibretroSystem,
  resolveCanonicalName,
  searchByTitle,
  thumbnailUrl,
} from "../libretro/libretro-index.service";
import { ArtServiceResult, ArtSourceOptions, ArtProbeResult } from "./art-sources/types";

const log = createLogger("libretro-artwork");

/** libretro-thumbnails has no small-icon category — this source can't supply OPL's `ICO` type. */
const SUPPORTED_TYPES: LibretroArtType[] = ["COV", "SCR", "SCR2"];

function isSupportedType(type: string): type is LibretroArtType {
  return (SUPPORTED_TYPES as string[]).includes(type);
}

/** Resolves the exact libretro-thumbnails filename for one requested type, or undefined if no match. */
async function resolveFileName(
  system: LibretroSystem,
  gameId: string,
  type: LibretroArtType,
  opts: ArtSourceOptions
): Promise<string | undefined> {
  const manual = opts.manualFileNames?.[type];
  if (manual) return manual;

  const title = (await resolveCanonicalName(system, gameId)) || opts.title;
  if (!title) return undefined;

  const matches = await searchByTitle(system, title, opts.region);
  return matches.find((m) => m.type === type)?.fileName;
}

export async function listAvailableArt(
  gameId: string,
  system: LibretroSystem,
  opts: ArtSourceOptions = {}
): Promise<ArtProbeResult> {
  const data: ArtProbeResult["data"] = [];

  for (const type of SUPPORTED_TYPES) {
    const fileName = await resolveFileName(system, gameId, type, opts);
    if (fileName) {
      data.push({ type, fileName, downloadUrl: thumbnailUrl(system, type, fileName) });
    }
  }

  if (data.length === 0) {
    return {
      success: true,
      data: [],
      message: `No libretro-thumbnails match found for ${gameId} — try a manual search.`,
    };
  }

  log.info(`Found ${data.length} libretro-thumbnails match(es) for ${gameId}`);
  return { success: true, data };
}

export async function downloadArtByGameId(
  dirPath: string,
  gameId: string,
  system: LibretroSystem = "PS2",
  saveAsName?: string,
  artTypes?: string[],
  opts: ArtSourceOptions = {}
): Promise<ArtServiceResult> {
  const types = artTypes?.length ? artTypes : ["COV", "SCR"];
  const localName = saveAsName || gameId;
  const results: ArtServiceResult["data"] = [];

  log.info(`Downloading ${system} artwork (libretro-thumbnails) for ${gameId} (${types.join(", ")}) into ${dirPath}`);

  for (const type of types) {
    if (!isSupportedType(type)) {
      results.push({ name: localName, type, url: "", error: "Not available from this source" });
      continue;
    }

    const fileName = await resolveFileName(system, gameId, type, opts);
    if (!fileName) {
      results.push({ name: localName, type, url: "", error: "No match found" });
      continue;
    }

    const url = thumbnailUrl(system, type, fileName);
    log.verbose(`GET ${url}`);

    try {
      const { status, buffer } = await httpGetBuffer(url);
      if (status !== 200) {
        throw new Error(`Failed to download ${fileName}: ${status}`);
      }
      const resized = resizeArtForOpl(buffer, type);
      const savePath = path.join(dirPath, `${localName}_${type}.png`);
      await fs.writeFile(savePath, resized);
      log.verbose(`Saved ${type} artwork (${formatBytes(resized.length)}, resized from ${formatBytes(buffer.length)}) → ${savePath}`);
      results.push({ name: localName, type, url, savedPath: savePath });
    } catch (err: any) {
      log.verbose(`${type} artwork unavailable for ${gameId}: ${err.message}`);
      results.push({ name: localName, type, url, error: err.message });
    }
  }

  const saved = results.filter((r) => r.savedPath).length;
  log.info(`Artwork for ${gameId}: ${saved}/${types.length} file(s) downloaded`);
  if (saved === 0) {
    const msg = `No artwork found for ${gameId} via libretro-thumbnails.`;
    log.warn(msg);
    return { success: false, data: results, message: msg };
  }
  return { success: true, data: results };
}
