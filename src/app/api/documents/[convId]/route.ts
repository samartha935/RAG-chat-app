import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, document } from "@/db/schema";
import { getSessionUser } from "@/lib/require-user";

type RouteParams = { params: Promise<{ convId: string }> };

export async function GET(_request: Request, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { convId } = await ctx.params;

  const [conv] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, convId), eq(conversation.userId, user.id)));

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      id: document.id,
      filename: document.filename,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      storagePath: document.storagePath,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(eq(document.conversationId, convId))
    .orderBy(asc(document.createdAt));

  return NextResponse.json({ documents: rows });
}
