import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversation, document, documentChunk } from "@/db/schema";

export type RagSource = {
  chunkId: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  distance: number;
};

function vectorLiteral(embedding: number[]): ReturnType<typeof sql.raw> {
  const nums = embedding.map((n) => (Number.isFinite(n) ? n : 0));
  return sql.raw(`'[${nums.join(",")}]'::vector`);
}

const DEFAULT_TOP_K = 8;

/**
 * Cosine distance (`<=>`) against stored MiniLM 384-dim vectors, scoped to one conversation and owner.
 */
export async function searchSimilarChunks(
  conversationId: string,
  userId: string,
  embedding: number[],
  limit = DEFAULT_TOP_K,
): Promise<RagSource[]> {
  if (embedding.length !== 384) {
    return [];
  }
  const vec = vectorLiteral(embedding);

  const rows = await db
    .select({
      chunkId: documentChunk.id,
      documentId: document.id,
      filename: document.filename,
      chunkIndex: documentChunk.chunkIndex,
      content: documentChunk.content,
      distance: sql<number>`(${documentChunk.embedding} <=> ${vec})::float8`.as("distance"),
    })
    .from(documentChunk)
    .innerJoin(document, eq(documentChunk.documentId, document.id))
    .innerJoin(conversation, eq(document.conversationId, conversation.id))
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.userId, userId),
        sql`${documentChunk.embedding} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${documentChunk.embedding} <=> ${vec}`)
    .limit(limit);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    filename: r.filename,
    chunkIndex: r.chunkIndex,
    content: r.content,
    distance: Number(r.distance),
  }));
}
