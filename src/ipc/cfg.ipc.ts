import { ipcMain } from "electron";
import { readGameCfg, writeGameCfg, GameCfg } from "../services/cfg.service";
import {
  readAppTitleCfg,
  updatePs1TitleCfg,
  updateTitleCfgMetadata,
} from "../services/apps.service";
import {
  lookupMetadata,
  applyMetadataToGameCfg,
  GameMetadata,
} from "../services/libretro-metadata.service";
import { LibretroSystem } from "../services/libretro-index.service";

export function registerCfgIpc(): void {
  ipcMain.handle(
    "read-app-title-cfg",
    async (_event, oplRoot: string, folder: string) => {
      return readAppTitleCfg(oplRoot, folder);
    }
  );

  ipcMain.handle(
    "read-game-cfg",
    async (_event, oplRoot: string, gameId: string) => {
      return readGameCfg(oplRoot, gameId);
    }
  );

  ipcMain.handle(
    "write-game-cfg",
    async (_event, oplRoot: string, gameId: string, entries: GameCfg) => {
      return writeGameCfg(oplRoot, gameId, entries);
    }
  );

  ipcMain.handle(
    "update-ps1-title-cfg",
    async (_event, launcherPath: string, newTitle: string, gameId?: string) => {
      return updatePs1TitleCfg(launcherPath, newTitle, gameId);
    }
  );

  ipcMain.handle(
    "fetch-libretro-metadata",
    async (_event, gameId: string, system: LibretroSystem) => {
      return lookupMetadata(system, gameId);
    }
  );

  ipcMain.handle(
    "apply-metadata-to-game-cfg",
    async (_event, oplRoot: string, gameId: string, meta: GameMetadata) => {
      return applyMetadataToGameCfg(oplRoot, gameId, meta);
    }
  );

  ipcMain.handle(
    "update-title-cfg-metadata",
    async (_event, launcherPath: string, meta: GameMetadata) => {
      return updateTitleCfgMetadata(launcherPath, meta);
    }
  );
}
