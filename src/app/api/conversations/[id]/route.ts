import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, document } from "@/db/schema";
import { removeStoredPdf } from "@/lib/pdf-storage";
import { getSessionUser } from "@/lib/require-user";
import { getUploadDir } from "@/lib/upload-config";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const [row] = await db
    .select({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, user.id)));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation: row });
}

export async function PATCH(request: Request, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const [existing] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, user.id)));

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let title: string | null | undefined;
  try {
    const body = (await request.json()) as { title?: unknown };
    if (body.title === null) {
      title = null;
    } else if (typeof body.title === "string") {
      title = body.title.trim() || null;
    } else {
      return NextResponse.json({ error: "title must be a string or null" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (title === undefined) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  await db.update(conversation).set({ title }).where(eq(conversation.id, id));

  return NextResponse.json({ ok: true, title });
}

export async function DELETE(_request: Request, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const [conv] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, user.id)));

  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const docs = await db
    .select({ storagePath: document.storagePath })
    .from(document)
    .where(eq(document.conversationId, id));

  const uploadDir = getUploadDir();
  for (const d of docs) {
    await removeStoredPdf(uploadDir, d.storagePath);
  }

  await db.delete(conversation).where(eq(conversation.id, id));

  return NextResponse.json({ ok: true });
}
