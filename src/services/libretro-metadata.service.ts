import * as fs from "fs/promises";
import path from "path";
import { app } from "electron";
import { createLogger } from "../logger";
import { httpGetText } from "../utils/http-get";
import { normaliseGameIdForLookup } from "../utils/game-id-patterns";
import { LibretroSystem } from "./libretro-index.service";
import { readGameCfg, writeGameCfg } from "./cfg.service";

const log = createLogger("libretro-metadata");

/**
 * Descriptive game metadata (developer, genre, description, release date,
 * max players, ESRB rating) from `libretro-database`'s PSXDataCenter-sourced
 * DAT files, joined by GAMEID serial (no fuzzy matching, no auth needed).
 * PS2 has no ESRB source in this repo — `esrbRating` stays undefined there.
 */

export interface GameMetadata {
  name?: string;
  description?: string;
  developer?: string;
  publisher?: string;
  releaseYear?: string;
  releaseMonth?: string;
  releaseDay?: string;
  maxPlayers?: string;
  genre?: string;
  esrbRating?: string;
}

const DEVELOPER_DAT_URL: Record<LibretroSystem, string> = {
  PS1: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/developer/Sony%20-%20PlayStation.dat",
  PS2: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/developer/Sony%20-%20PlayStation%202.dat",
};

// No PS2 equivalent exists in libretro-database at the time of writing.
const ESRB_DAT_URL: Partial<Record<LibretroSystem, string>> = {
  PS1: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/esrb/Sony%20-%20PlayStation.dat",
};

const INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface MetaCacheFile {
  fetchedAt: number;
  bySerial: Record<string, GameMetadata>;
}

function indexDir(): string {
  return path.join(app.getPath("userData"), "libretro-index");
}

function metaCachePath(system: LibretroSystem): string {
  return path.join(indexDir(), `${system}-meta.json`);
}

const metaIndexCache = new Map<LibretroSystem, Map<string, GameMetadata>>();

function quoted(field: string): RegExp {
  return new RegExp(`\\b${field}\\s*"([^"]*)"`);
}

/** Parses `metadat/developer/*.dat` — one `game ( name "..." serial "..." ... )` block per title. */
function parseDeveloperDat(text: string): Map<string, GameMetadata> {
  const map = new Map<string, GameMetadata>();
  const blocks = text.split(/\ngame\s*\(/).slice(1);

  for (const block of blocks) {
    const serial = block.match(quoted("serial"))?.[1];
    if (!serial) continue;

    const meta: GameMetadata = {
      name: block.match(quoted("name"))?.[1],
      description: block.match(quoted("description"))?.[1],
      developer: block.match(quoted("developer"))?.[1],
      publisher: block.match(quoted("publisher"))?.[1],
      releaseYear: block.match(quoted("releaseyear"))?.[1],
      releaseMonth: block.match(quoted("releasemonth"))?.[1],
      releaseDay: block.match(quoted("releaseday"))?.[1],
      maxPlayers: block.match(quoted("users"))?.[1],
      genre: block.match(quoted("genre"))?.[1],
    };
    map.set(serial.toUpperCase(), meta);
  }

  return map;
}

/** Parses `metadat/esrb/*.dat` — one `game ( ... esrb_rating "..." rom ( serial "..." ) ... )` block, possibly multiple serials. */
function parseEsrbDat(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = text.split(/\ngame\s*\(/).slice(1);

  for (const block of blocks) {
    const rating = block.match(quoted("esrb_rating"))?.[1];
    if (!rating) continue;
    for (const m of Array.from(block.matchAll(/\bserial\s*"([^"]*)"/g))) {
      map.set(m[1].toUpperCase(), rating);
    }
  }

  return map;
}

async function fetchMetaIndex(system: LibretroSystem): Promise<Map<string, GameMetadata>> {
  const { status, text } = await httpGetText(DEVELOPER_DAT_URL[system]);
  const map = status === 200 ? parseDeveloperDat(text) : new Map<string, GameMetadata>();

  const esrbUrl = ESRB_DAT_URL[system];
  if (esrbUrl) {
    const esrbResult = await httpGetText(esrbUrl);
    if (esrbResult.status === 200) {
      const ratings = parseEsrbDat(esrbResult.text);
      for (const [serial, rating] of Array.from(ratings)) {
        const existing = map.get(serial) ?? {};
        map.set(serial, { ...existing, esrbRating: rating });
      }
    }
  }

  log.verbose(`libretro-database metadata for ${system}: ${map.size} entr(ies)`);
  return map;
}

export async function ensureMetadataIndex(
  system: LibretroSystem,
  forceRefresh = false
): Promise<Map<string, GameMetadata>> {
  if (!forceRefresh) {
    const cached = metaIndexCache.get(system);
    if (cached) return cached;
  }

  const cachePath = metaCachePath(system);
  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(cachePath, "utf-8");
      const parsed = JSON.parse(raw) as MetaCacheFile;
      if (Date.now() - parsed.fetchedAt < INDEX_TTL_MS) {
        const map = new Map(Object.entries(parsed.bySerial));
        metaIndexCache.set(system, map);
        log.verbose(`Loaded cached metadata index for ${system} (${map.size} entries)`);
        return map;
      }
    } catch {
      // Fetch fresh below.
    }
  }

  log.info(`Fetching libretro-database metadata for ${system}…`);
  const map = await fetchMetaIndex(system);
  metaIndexCache.set(system, map);

  try {
    await fs.mkdir(indexDir(), { recursive: true });
    const payload: MetaCacheFile = { fetchedAt: Date.now(), bySerial: Object.fromEntries(map) };
    await fs.writeFile(cachePath, JSON.stringify(payload), "utf-8");
  } catch (err: any) {
    log.warn(`Failed to persist metadata index cache for ${system}:`, err?.message || err);
  }

  return map;
}

export async function lookupMetadata(
  system: LibretroSystem,
  gameId: string
): Promise<{ success: boolean; data?: GameMetadata; message?: string }> {
  const serial = normaliseGameIdForLookup(gameId);
  const index = await ensureMetadataIndex(system);
  const data = index.get(serial);

  if (!data) {
    return { success: true, data: undefined, message: `No metadata found for ${gameId}.` };
  }

  return { success: true, data };
}

export const ESRB_AGE: Record<string, number> = {
  EC: 3,
  E: 6,
  "E10+": 10,
  T: 13,
  M: 17,
  AO: 18,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "January 30, 2002" — matches the format seen in real OPL CFG files. */
export function formatReleaseDate(meta: GameMetadata): string | undefined {
  if (!meta.releaseYear) return undefined;
  const monthIdx = meta.releaseMonth ? Number(meta.releaseMonth) - 1 : undefined;
  const monthName = monthIdx !== undefined && MONTH_NAMES[monthIdx] ? MONTH_NAMES[monthIdx] : undefined;
  if (monthName && meta.releaseDay) return `${monthName} ${meta.releaseDay}, ${meta.releaseYear}`;
  if (monthName) return `${monthName} ${meta.releaseYear}`;
  return meta.releaseYear;
}

/**
 * Builds the plain-key metadata fields for OPL's `CFG/<GAMEID>.cfg` (the
 * community-distributed convention alongside this app's own sigil-prefixed
 * compat-mode keys, e.g. `lichtmetzger/ps2-opl-cfg`). Only sets keys we have
 * data for — never overwrites unrelated keys already in the file.
 */
export function metadataToGameCfgEntries(meta: GameMetadata): Record<string, string> {
  const entries: Record<string, string> = {};
  if (meta.description) entries.Description = meta.description;
  if (meta.genre) entries.Genre = meta.genre;
  if (meta.developer) entries.Developer = meta.developer;
  const release = formatReleaseDate(meta);
  if (release) entries.Release = release;
  if (meta.maxPlayers) entries.Players = `players/${meta.maxPlayers}`;
  if (meta.esrbRating && ESRB_AGE[meta.esrbRating] !== undefined) {
    entries.Parental = `esrb/${ESRB_AGE[meta.esrbRating]}`;
  }
  return entries;
}

/** Merges resolved metadata into `CFG/<GAMEID>.cfg`, preserving every other key already there. */
export async function applyMetadataToGameCfg(
  oplRoot: string,
  gameId: string,
  meta: GameMetadata
): Promise<{ success: boolean; message?: string }> {
  const newEntries = metadataToGameCfgEntries(meta);
  if (Object.keys(newEntries).length === 0) {
    return { success: true, message: "No metadata fields to write." };
  }

  const current = await readGameCfg(oplRoot, gameId);
  if (!current.success) {
    return { success: false, message: current.message };
  }

  return writeGameCfg(oplRoot, gameId, { ...current.entries, ...newEntries });
}
