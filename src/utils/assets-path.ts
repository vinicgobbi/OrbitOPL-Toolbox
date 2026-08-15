import { app } from "electron";
import path from "path";

// app.getAppPath() resolves to the directory containing package.json:
// the repo root in dev, or the app.asar root when packaged. "assets" is
// always a sibling of that package.json (see electron-builder's "files").
export function resolveAssetPath(...segments: string[]): string {
  return path.join(app.getAppPath(), "assets", ...segments);
}
