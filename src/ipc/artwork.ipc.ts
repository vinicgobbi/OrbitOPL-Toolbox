import { ipcMain } from "electron";
import { checkArtFilesExist } from "../services/artwork.service";
import { downloadArt, listArt } from "../services/artwork-router.service";
import { ArtSourceOptions } from "../services/art-sources/types";
import { searchFuzzy, ensureThumbIndex, LibretroSystem } from "../services/libretro-index.service";

export function registerArtworkIpc(): void {
  ipcMain.handle(
    "download-art-by-gameid",
    async (
      _event,
      dirPath: string,
      gameId: string,
      system?: "PS1" | "PS2",
      saveAsName?: string,
      artTypes?: string[],
      opts?: ArtSourceOptions
    ) => {
      return downloadArt(dirPath, gameId, system || "PS2", saveAsName, artTypes, opts);
    }
  );

  ipcMain.handle("check-art-files-exist", async (_event, artDir: string, filenames: string[]) => {
    return checkArtFilesExist(artDir, filenames);
  });

  ipcMain.handle(
    "list-available-art",
    async (_event, gameId: string, system?: "PS1" | "PS2", opts?: ArtSourceOptions) => {
      return listArt(gameId, system || "PS2", opts);
    }
  );

  ipcMain.handle(
    "search-libretro-art",
    async (_event, system: LibretroSystem, query: string) => {
      return searchFuzzy(system, query);
    }
  );

  ipcMain.handle(
    "refresh-libretro-index",
    async (_event, system: LibretroSystem) => {
      await ensureThumbIndex(system, true);
      return { success: true };
    }
  );
}
