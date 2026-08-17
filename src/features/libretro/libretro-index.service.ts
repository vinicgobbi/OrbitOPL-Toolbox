import * as fs from "fs/promises";
import path from "path";
import { app } from "electron";
import { createLogger } from "../../logger";
import { httpGetJson, httpGetText } from "../../utils/http-get";
import { normaliseGameIdForLookup } from "../../utils/game-id-patterns";
import { GameRegion } from "../../utils/region";

const log = createLogger("libretro-index");

/**
 * Local index over the `libretro-thumbnails` GitHub org (boxart / snap /
 * title-screen filenames, no auth needed) and the `libretro-database` repo's
 * Redump DAT (GAMEID serial → canonical No-Intro/Redump name). Both are
 * fetched once and cached to disk — the thumbnails folders alone hold
 * thousands of files, so per-download HEAD/GET probing would be unreliable
 * (region tags are compound, e.g. "USA, Canada", with no universal fallback
 * tag) and repeated directory listing would be slow.
 */

export type LibretroSystem = "PS1" | "PS2";
export type LibretroArtType = "COV" | "SCR" | "SCR2";

const THUMB_REPO: Record<LibretroSystem, string> = {
  PS1: "libretro-thumbnails/Sony_-_PlayStation",
  PS2: "libretro-thumbnails/Sony_-_PlayStation_2",
};

const THUMB_FOLDER: Record<LibretroArtType, string> = {
  COV: "Named_Boxarts",
  SCR: "Named_Snaps",
  SCR2: "Named_Titles",
};

const REDUMP_DAT_URL: Record<LibretroSystem, string> = {
  PS1: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation.dat",
  PS2: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation%202.dat",
};

const REGION_KEYWORD: Record<GameRegion, string | null> = {
  "NTSC-U": "USA",
  PAL: "Europe",
  "NTSC-J": "Japan",
  UNKNOWN: null,
};

const INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface ThumbEntry {
  type: LibretroArtType;
  fileName: string;
}

interface ThumbCacheFile {
  fetchedAt: number;
  entries: ThumbEntry[];
}

interface RedumpCacheFile {
  fetchedAt: number;
  /** serial (normalised, e.g. "SLUS-20265") → canonical name */
  bySerial: Record<string, string>;
}

interface ThumbIndex {
  /** All entries, for fuzzy substring search. */
  all: ThumbEntry[];
  /** normalised base title → entries sharing that title (any type/region/disc). */
  byBaseTitle: Map<string, ThumbEntry[]>;
}

function indexDir(): string {
  return path.join(app.getPath("userData"), "libretro-index");
}

function thumbCachePath(system: LibretroSystem): string {
  return path.join(indexDir(), `${system}-thumbs.json`);
}

function redumpCachePath(system: LibretroSystem): string {
  return path.join(indexDir(), `${system}-redump.json`);
}

const thumbIndexCache = new Map<LibretroSystem, ThumbIndex>();
const redumpIndexCache = new Map<LibretroSystem, Map<string, string>>();

/** Strips a trailing "(...)" run of parenthesised groups (region/lang/disc tags). */
function baseTitleOf(fileNameNoExt: string): string {
  const idx = fileNameNoExt.indexOf(" (");
  return (idx === -1 ? fileNameNoExt : fileNameNoExt.slice(0, idx)).trim();
}

function normaliseTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .toLowerCase();
}

/** Parenthesised groups after the base title, e.g. ["USA, Canada", "En,Fr,De"]. */
function tagsOf(fileNameNoExt: string): string[] {
  const matches = Array.from(fileNameNoExt.matchAll(/\(([^)]*)\)/g));
  return matches.map((m) => m[1]);
}

function buildThumbIndex(entries: ThumbEntry[]): ThumbIndex {
  const byBaseTitle = new Map<string, ThumbEntry[]>();
  for (const entry of entries) {
    const noExt = entry.fileName.replace(/\.png$/i, "");
    const key = normaliseTitle(baseTitleOf(noExt));
    const bucket = byBaseTitle.get(key);
    if (bucket) bucket.push(entry);
    else byBaseTitle.set(key, [entry]);
  }
  return { all: entries, byBaseTitle };
}

async function fetchThumbEntriesForType(
  system: LibretroSystem,
  type: LibretroArtType
): Promise<ThumbEntry[]> {
  const repo = THUMB_REPO[system];
  const folder = THUMB_FOLDER[type];

  // Root tree (non-recursive) → SHA of the folder, then the folder's own
  // tree (also non-recursive — these folders are flat). A single recursive
  // fetch from the repo root was tried first and returned HTTP 500 for the
  // PS1 repo (too large), so per-folder is the reliable path.
  const { json: rootTree } = await httpGetJson<{ tree: { path: string; sha: string }[] }>(
    `https://api.github.com/repos/${repo}/git/trees/master`
  );
  const folderSha = rootTree?.tree?.find((t) => t.path === folder)?.sha;
  if (!folderSha) {
    log.warn(`libretro-thumbnails: folder "${folder}" not found in ${repo}`);
    return [];
  }

  const { json: folderTree } = await httpGetJson<{ tree: { path: string; type: string }[] }>(
    `https://api.github.com/repos/${repo}/git/trees/${folderSha}`
  );
  const entries = (folderTree?.tree ?? [])
    .filter((t) => t.type === "blob" && t.path.toLowerCase().endsWith(".png"))
    .map((t) => ({ type, fileName: t.path }));

  log.verbose(`libretro-thumbnails: ${repo}/${folder} → ${entries.length} file(s)`);
  return entries;
}

async function fetchThumbIndex(system: LibretroSystem): Promise<ThumbEntry[]> {
  const all: ThumbEntry[] = [];
  for (const type of Object.keys(THUMB_FOLDER) as LibretroArtType[]) {
    all.push(...(await fetchThumbEntriesForType(system, type)));
  }
  return all;
}

export async function ensureThumbIndex(
  system: LibretroSystem,
  forceRefresh = false
): Promise<ThumbIndex> {
  if (!forceRefresh) {
    const cached = thumbIndexCache.get(system);
    if (cached) return cached;
  }

  const cachePath = thumbCachePath(system);
  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(cachePath, "utf-8");
      const parsed = JSON.parse(raw) as ThumbCacheFile;
      if (Date.now() - parsed.fetchedAt < INDEX_TTL_MS) {
        const index = buildThumbIndex(parsed.entries);
        thumbIndexCache.set(system, index);
        log.verbose(`Loaded cached thumbnail index for ${system} (${parsed.entries.length} entries)`);
        return index;
      }
    } catch {
      // No cache yet, or it's stale/corrupt — fetch fresh below.
    }
  }

  log.info(`Fetching libretro-thumbnails index for ${system}…`);
  const entries = await fetchThumbIndex(system);
  const index = buildThumbIndex(entries);
  thumbIndexCache.set(system, index);

  try {
    await fs.mkdir(indexDir(), { recursive: true });
    const payload: ThumbCacheFile = { fetchedAt: Date.now(), entries };
    await fs.writeFile(cachePath, JSON.stringify(payload), "utf-8");
  } catch (err: any) {
    log.warn(`Failed to persist thumbnail index cache for ${system}:`, err?.message || err);
  }

  return index;
}

/** Parses the Redump DAT text format into serial → canonical name. */
function parseRedumpDat(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const blocks = text.split(/\ngame\s*\(/).slice(1);
  for (const block of blocks) {
    const nameMatch = block.match(/\bname\s*"([^"]*)"/);
    const serialMatch = block.match(/\bserial\s*"([^"]*)"/);
    if (nameMatch && serialMatch) {
      map.set(serialMatch[1].toUpperCase(), nameMatch[1]);
    }
  }
  return map;
}

export async function ensureRedumpIndex(
  system: LibretroSystem,
  forceRefresh = false
): Promise<Map<string, string>> {
  if (!forceRefresh) {
    const cached = redumpIndexCache.get(system);
    if (cached) return cached;
  }

  const cachePath = redumpCachePath(system);
  if (!forceRefresh) {
    try {
      const raw = await fs.readFile(cachePath, "utf-8");
      const parsed = JSON.parse(raw) as RedumpCacheFile;
      if (Date.now() - parsed.fetchedAt < INDEX_TTL_MS) {
        const map = new Map(Object.entries(parsed.bySerial));
        redumpIndexCache.set(system, map);
        log.verbose(`Loaded cached redump index for ${system} (${map.size} entries)`);
        return map;
      }
    } catch {
      // Fetch fresh below.
    }
  }

  log.info(`Fetching libretro-database Redump DAT for ${system}…`);
  const { status, text } = await httpGetText(REDUMP_DAT_URL[system]);
  const map = status === 200 ? parseRedumpDat(text) : new Map<string, string>();
  redumpIndexCache.set(system, map);

  try {
    await fs.mkdir(indexDir(), { recursive: true });
    const payload: RedumpCacheFile = { fetchedAt: Date.now(), bySerial: Object.fromEntries(map) };
    await fs.writeFile(cachePath, JSON.stringify(payload), "utf-8");
  } catch (err: any) {
    log.warn(`Failed to persist redump index cache for ${system}:`, err?.message || err);
  }

  return map;
}

/** GAMEID → canonical libretro-thumbnails-style name, via the Redump DAT serial join. */
export async function resolveCanonicalName(
  system: LibretroSystem,
  gameId: string
): Promise<string | undefined> {
  const serial = normaliseGameIdForLookup(gameId);
  const redump = await ensureRedumpIndex(system);
  return redump.get(serial);
}

export function thumbnailUrl(system: LibretroSystem, type: LibretroArtType, fileName: string): string {
  const repo = THUMB_REPO[system];
  const folder = THUMB_FOLDER[type];
  return `https://raw.githubusercontent.com/${repo}/master/${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
}

export interface ThumbMatch {
  type: LibretroArtType;
  fileName: string;
}

/**
 * Exact match against the normalised base title, ranked by region: entries
 * whose tags contain the game's region keyword come first, then entries
 * with no disc-number tag, then "(Disc 1)" as a last-resort representative
 * cover for untracked multi-disc titles (this app doesn't track disc index).
 */
export async function searchByTitle(
  system: LibretroSystem,
  title: string,
  region: GameRegion | undefined
): Promise<ThumbMatch[]> {
  const index = await ensureThumbIndex(system);
  // `title` may already carry a region suffix (the Redump DAT's canonical
  // `name` field always does, e.g. "Burnout 3 - Takedown (USA)") — strip it
  // the same way the index keys were built, or every lookup silently misses.
  const key = normaliseTitle(baseTitleOf(title));
  const candidates = index.byBaseTitle.get(key);
  if (!candidates || candidates.length === 0) return [];

  const regionKeyword = region ? REGION_KEYWORD[region] : null;
  const score = (entry: ThumbEntry): number => {
    const tags = tagsOf(entry.fileName.replace(/\.png$/i, ""));
    const hasRegion = regionKeyword ? tags.some((t) => t.includes(regionKeyword)) : false;
    const hasDisc = tags.some((t) => /^Disc \d+$/i.test(t));
    const isDiscOne = tags.some((t) => /^Disc 1$/i.test(t));
    if (hasRegion && !hasDisc) return 0;
    if (hasRegion && isDiscOne) return 1;
    if (!hasDisc) return 2;
    if (isDiscOne) return 3;
    return 4;
  };

  return [...candidates].sort((a, b) => score(a) - score(b)).map((e) => ({ type: e.type, fileName: e.fileName }));
}

/** Case-insensitive substring search across all filenames, for manual picking. */
export async function searchFuzzy(
  system: LibretroSystem,
  query: string,
  limit = 50
): Promise<ThumbMatch[]> {
  const index = await ensureThumbIndex(system);
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results: ThumbMatch[] = [];
  for (const entry of index.all) {
    if (entry.fileName.toLowerCase().includes(needle)) {
      results.push({ type: entry.type, fileName: entry.fileName });
      if (results.length >= limit) break;
    }
  }
  return results;
}
