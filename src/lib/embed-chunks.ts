import { generateEmbeddings } from "@/lib/embedder";

const DEFAULT_BATCH = 64;

/** Embed many chunks via the Docker embedder, in batches to bound memory and stdin size. */
export async function embedChunksBatched(
  chunks: string[],
  batchSize: number = DEFAULT_BATCH,
): Promise<number[][]> {
  if (chunks.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const embeddings = await generateEmbeddings(batch);
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embedding batch length mismatch: expected ${batch.length}, got ${embeddings.length}`,
      );
    }
    out.push(...embeddings);
  }
  return out;
}
