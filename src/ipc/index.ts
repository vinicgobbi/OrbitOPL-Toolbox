import { registerWindowIpc } from "../features/app-shell/window.ipc";
import { registerLibraryIpc } from "../features/library/library.ipc";
import { registerDialogIpc } from "../features/library/dialog.ipc";
import { registerArtworkIpc } from "../features/artwork/artwork.ipc";
import { registerImportIpc } from "../features/import/import.ipc";
import { registerRenameIpc } from "../features/library/rename.ipc";
import { registerDeleteIpc } from "../features/library/delete.ipc";
import { registerCfgIpc } from "../features/library/cfg.ipc";
import { registerAppsIpc } from "../features/library/apps.ipc";
import { registerVmcIpc } from "../features/app-shell/vmc.ipc";
import { registerZsoIpc } from "../features/zso/zso.ipc";
import { registerSettingsIpc } from "../features/app-shell/settings.ipc";

export function registerAllIpc(): void {
  registerWindowIpc();
  registerLibraryIpc();
  registerDialogIpc();
  registerArtworkIpc();
  registerImportIpc();
  registerRenameIpc();
  registerDeleteIpc();
  registerCfgIpc();
  registerAppsIpc();
  registerVmcIpc();
  registerZsoIpc();
  registerSettingsIpc();
}
