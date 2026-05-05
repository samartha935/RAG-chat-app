const TEN_MIB = 10 * 1024 * 1024;
const FIFTY_MIB = 50 * 1024 * 1024;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max bytes for a single uploaded PDF (RAM-friendly parsing). */
export function getMaxUploadBytes(): number {
  return parsePositiveInt(process.env.MAX_UPLOAD_BYTES, TEN_MIB);
}

/** Max total PDF bytes stored per user across all conversations. */
export function getMaxStorageBytesPerUser(): number {
  return parsePositiveInt(
    process.env.MAX_STORAGE_BYTES_PER_USER,
    FIFTY_MIB,
  );
}

export function getUploadDir(): string {
  const raw = process.env.UPLOAD_DIR?.trim();
  return raw && raw.length > 0 ? raw : "./uploads";
}
