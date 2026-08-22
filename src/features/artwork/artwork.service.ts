import * as fs from "fs/promises";
import path from "path";

export async function checkArtFilesExist(artDir: string, filenames: string[]) {
  const existing: string[] = [];
  for (const name of filenames) {
    try {
      await fs.access(path.join(artDir, name));
      existing.push(name);
    } catch {
      // File does not exist — skip.
    }
  }
  return existing;
}
