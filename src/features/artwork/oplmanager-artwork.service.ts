import * as fs from "fs/promises";
import path from "path";
import { createLogger, formatBytes } from "../../logger";
import { httpGetBuffer, httpPostText } from "../../utils/http-get";
import { getSettings, setSetting } from "../app-shell/settings.service";
import { ArtDownloadResultItem, ArtServiceResult, ArtProbeResult } from "./art-sources/types";

const log = createLogger("oplmanager-artwork");

/**
 * The real OPL Manager (Windows) desktop client's own art database, reached
 * via its SOAP web service. Endpoint and SOAP contract recovered by
 * inspecting OPL Manager v24's binary (`OplManagerServiceSoapClient`,
 * embedded WCF string constants) and confirmed live — the base path moved
 * from `/API/V5/OPLManagerService.asmx` (documented in an older third-party
 * binding, barncastle/OPLManagerService) to `/API/V6/OplManagerService.asmx`
 * at some point after that binding was captured.
 */
const ENDPOINT = "https://oplmanager.com/API/V6/OplManagerService.asmx";
const NAMESPACE = "http://oplmanager.no-ip.info/";

const GAME_TYPE: Record<"PS1" | "PS2", string> = { PS1: "POPS", PS2: "PS2" };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function soapCall(action: string, bodyXml: string): Promise<string> {
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>${bodyXml}</soap:Body></soap:Envelope>`;

  const { status, text } = await httpPostText(ENDPOINT, envelope, {
    "Content-Type": "text/xml; charset=utf-8",
    SOAPAction: `"${NAMESPACE}${action}"`,
  });

  if (status !== 200) {
    throw new Error(`OPL Manager API returned HTTP ${status} for ${action}`);
  }
  return text;
}

/** Inner content of `<tag>...</tag>`, or undefined if absent/self-closed (e.g. `<tag />`). */
function extractTag(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1];
}

/** Inner content of a container element, or undefined if absent/self-closed. */
function extractBlock(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1];
}

/** `<string>...</string>` entries inside a container tag (OPL Manager's `ArrayOfString` fields). */
function extractArray(xml: string, tag: string): string[] {
  const block = extractBlock(xml, tag);
  if (!block) return [];
  return Array.from(block.matchAll(/<string>([^<]*)<\/string>/g)).map((m) => m[1]);
}

/**
 * `ArtSearchSingle`/`ArtSearchBatch` silently return an empty result for any
 * unregistered `userID` — the client is expected to self-register once via
 * `ServiceStatus`, which allocates and returns a fresh anonymous ID. Cached
 * in settings so this only happens once per install.
 */
async function getOrRegisterUserId(): Promise<string> {
  const existing = getSettings().oplManagerUserId;
  if (existing) return existing;

  log.info("Registering a new anonymous OPL Manager session…");
  const body = `<ServiceStatus xmlns="${NAMESPACE}"><userID></userID><versionid>24</versionid></ServiceStatus>`;
  const text = await soapCall("ServiceStatus", body);
  const userId = extractTag(text, "userID");
  if (!userId) {
    throw new Error("OPL Manager did not return a session ID.");
  }

  setSetting("oplManagerUserId", userId);
  log.info(`Registered OPL Manager session ${userId}`);
  return userId;
}

/** Maps a `GameART` SOAP response onto this app's `COV`/`ICO`/... type codes → absolute image URLs. */
async function fetchGameArt(gameId: string, system: "PS1" | "PS2"): Promise<Record<string, string>> {
  const userId = await getOrRegisterUserId();
  const body =
    `<ArtSearchSingle xmlns="${NAMESPACE}">` +
    `<type>${GAME_TYPE[system]}</type>` +
    `<userID>${escapeXml(userId)}</userID>` +
    `<gameId>${escapeXml(gameId)}</gameId>` +
    `</ArtSearchSingle>`;
  const text = await soapCall("ArtSearchSingle", body);

  const result = extractBlock(text, "ArtSearchSingleResult");
  if (!result) return {};

  const art: Record<string, string> = {};
  for (const type of ["COV", "COV2", "ICO", "LGO", "LAB"]) {
    const url = extractTag(result, type);
    if (url) art[type] = url;
  }

  const screenshots = extractArray(result, "SCR");
  if (screenshots[0]) art.SCR = screenshots[0];
  if (screenshots[1]) art.SCR2 = screenshots[1];

  const backgrounds = extractArray(result, "BG");
  if (backgrounds[0]) art.BG = backgrounds[0];

  // The API serves images over plain HTTP — upgrade to HTTPS (confirmed to work) to
  // match this app's HTTPS-only download helper.
  for (const type of Object.keys(art)) {
    art[type] = art[type].replace(/^http:/, "https:");
  }

  return art;
}

export async function listAvailableArt(
  gameId: string,
  system: "PS1" | "PS2" = "PS2"
): Promise<ArtProbeResult> {
  try {
    const art = await fetchGameArt(gameId, system);
    const data = Object.entries(art).map(([type, url]) => ({
      type,
      fileName: url.split("/").pop() || `${gameId}_${type}.png`,
      downloadUrl: url,
    }));

    if (data.length === 0) {
      return { success: true, data: [], message: `No artwork available for ${gameId} yet.` };
    }
    log.info(`Found ${data.length} artwork file(s) for ${gameId} in the OPL Manager database`);
    return { success: true, data };
  } catch (err: any) {
    log.warn(`Failed to list artwork for ${gameId}: ${err.message}`);
    return { success: false, data: [], message: err.message };
  }
}

export async function downloadArtByGameId(
  dirPath: string,
  gameId: string,
  system: "PS1" | "PS2" = "PS2",
  saveAsName?: string,
  artTypes?: string[]
): Promise<ArtServiceResult> {
  const localName = saveAsName || gameId;
  log.info(`Downloading ${system} artwork (OPL Manager) for ${gameId} into ${dirPath}`);

  let art: Record<string, string>;
  try {
    art = await fetchGameArt(gameId, system);
  } catch (err: any) {
    const msg = `Failed to reach OPL Manager: ${err.message}`;
    log.warn(msg);
    return { success: false, data: [], message: msg };
  }

  const types = artTypes?.length ? artTypes : Object.keys(art);
  const results: ArtDownloadResultItem[] = [];

  for (const type of types) {
    const url = art[type];
    if (!url) {
      results.push({ name: localName, type, url: "", error: "Not available from OPL Manager" });
      continue;
    }

    log.verbose(`GET ${url}`);
    try {
      const { status, buffer } = await httpGetBuffer(url);
      if (status !== 200) {
        throw new Error(`Failed to download ${type}: ${status}`);
      }
      const savePath = path.join(dirPath, `${localName}_${type}.png`);
      await fs.writeFile(savePath, buffer);
      log.verbose(`Saved ${type} artwork (${formatBytes(buffer.length)}) → ${savePath}`);
      results.push({ name: localName, type, url, savedPath: savePath });
    } catch (err: any) {
      log.verbose(`${type} artwork unavailable for ${gameId}: ${err.message}`);
      results.push({ name: localName, type, url, error: err.message });
    }
  }

  const saved = results.filter((r) => r.savedPath).length;
  log.info(`Artwork for ${gameId}: ${saved}/${types.length} file(s) downloaded`);
  if (saved === 0) {
    const msg = `No artwork found for ${gameId} in the OPL Manager database.`;
    log.warn(msg);
    return { success: false, data: results, message: msg };
  }
  return { success: true, data: results };
}
