import path from "path";
import { readFile, stat } from "fs/promises";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, document } from "@/db/schema";
import { getSessionUser } from "@/lib/require-user";
import { getUploadDir } from "@/lib/upload-config";

type RouteParams = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, ctx: RouteParams) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename: raw } = await ctx.params;
  const filename = path.basename(raw);

  const [row] = await db
    .select({
      storagePath: document.storagePath,
      userId: conversation.userId,
    })
    .from(document)
    .innerJoin(conversation, eq(document.conversationId, conversation.id))
    .where(eq(document.storagePath, filename));

  if (!row || row.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const uploadDir = getUploadDir();
  const absPath = path.join(uploadDir, filename);

  try {
    const s = await stat(absPath);
    if (!s.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await readFile(absPath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
