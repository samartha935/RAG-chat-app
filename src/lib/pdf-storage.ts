import fs from "fs/promises";
import path from "path";

export async function ensureUploadDir(uploadDir: string): Promise<void> {
  await fs.mkdir(uploadDir, { recursive: true });
}

/** Remove a file stored under `uploadDir`; `storagePath` must be a basename only (e.g. uuid.pdf). */
export async function removeStoredPdf(
  uploadDir: string,
  storagePath: string,
): Promise<void> {
  const safeName = path.basename(storagePath);
  const fullPath = path.join(uploadDir, safeName);
  await fs.unlink(fullPath).catch(() => {});
}
