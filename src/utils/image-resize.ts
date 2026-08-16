import { nativeImage } from "electron";

/**
 * OPL expects fixed-size art per type (the curated GitHub database ships
 * images pre-sized to these exact dimensions). libretro-thumbnails serves
 * original box-scan/screenshot resolutions instead, so anything pulled from
 * that source needs resizing before it lands in ART/ or OPL will render it
 * distorted/cropped by its own scaler. Verified against real files from the
 * curated database: COV 140x200, SCR 250x188.
 */
const TARGET_SIZE: Record<string, { width: number; height: number }> = {
  COV: { width: 140, height: 200 },
  SCR: { width: 250, height: 188 },
  SCR2: { width: 250, height: 188 },
};

/** Resizes a PNG buffer to OPL's expected dimensions for `type`. Returns the input unchanged for types with no known target size. */
export function resizeArtForOpl(buffer: Buffer, type: string): Buffer {
  const target = TARGET_SIZE[type];
  if (!target) return buffer;

  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return buffer;

  // Passing both width and height stretches to that exact size (no aspect
  // preservation) — matches how the curated database's own images are cut.
  const resized = image.resize({ width: target.width, height: target.height, quality: "best" });
  return resized.toPNG();
}
