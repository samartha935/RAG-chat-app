import { db } from "@/db";
import { conversation, document } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/** Sum of stored PDF sizes for this user (all conversations). */
export async function getTotalPdfBytesForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${document.sizeBytes}), 0)`,
    })
    .from(document)
    .innerJoin(conversation, eq(document.conversationId, conversation.id))
    .where(eq(conversation.userId, userId));

  const n = row?.total;
  return typeof n === "number" ? n : Number(n ?? 0);
}
