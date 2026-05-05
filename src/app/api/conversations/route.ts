import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { getSessionUser } from "@/lib/require-user";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(eq(conversation.userId, user.id))
    .orderBy(desc(conversation.updatedAt));

  return NextResponse.json({ conversations: rows });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let title: string | null = null;
  try {
    const body = (await request.json()) as { title?: unknown };
    if (typeof body.title === "string") {
      title = body.title.trim() || null;
    }
  } catch {
    // optional JSON body
  }

  const id = uuidv4();
  await db.insert(conversation).values({
    id,
    userId: user.id,
    title,
  });

  return NextResponse.json({ id }, { status: 201 });
}
