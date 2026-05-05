import { and, eq } from "drizzle-orm";
import type { ModelMessage, UIMessage } from "ai";
import { convertToModelMessages, streamText } from "ai";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { generateEmbeddings } from "@/lib/embedder";
import { getGeminiLanguageModel } from "@/lib/gemini";
import { checkAndConsumeChatRateLimit } from "@/lib/rate-limit";
import type { RagSource } from "@/lib/rag-search";
import { searchSimilarChunks } from "@/lib/rag-search";
import { getSessionUser } from "@/lib/require-user";

const chatBodySchema = z.object({
  conversationId: z.string().min(1),
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
});

function getLastUserText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    const { content } = m;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const parts = content
        .filter(
          (p): p is { type: "text"; text: string } =>
            typeof p === "object" &&
            p !== null &&
            "type" in p &&
            p.type === "text" &&
            "text" in p &&
            typeof (p as { text: unknown }).text === "string",
        )
        .map((p) => p.text);
      return parts.join("\n").trim();
    }
  }
  return "";
}

function buildSystemPrompt(sources: RagSource[]): string {
  if (sources.length === 0) {
    return `You are a helpful assistant for document Q&A. This conversation has no indexed document chunks yet — answer briefly from general knowledge if appropriate, and say there are no uploaded documents to cite.`;
  }

  const blocks = sources.map(
    (s, i) =>
      `[${i + 1}] (document: ${s.filename}, chunk #${s.chunkIndex})\n${s.content}`,
  );

  return `You are a helpful assistant answering questions using ONLY the retrieved excerpts below when they are relevant. If the excerpts do not contain the answer, say so clearly. Cite sources using bracket numbers like [1] that match the excerpt labels.

--- Retrieved excerpts ---

${blocks.join("\n\n")}`;
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = getGeminiLanguageModel();
  if (!model) {
    return NextResponse.json(
      { error: "gemini_not_configured", message: "Set GEMINI_API_KEY" },
      { status: 503 },
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { conversationId, messages: rawMessages } = parsed.data;

  const [conv] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(and(eq(conversation.id, conversationId), eq(conversation.userId, user.id)));

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  let modelMessages: ModelMessage[];
  try {
    modelMessages = await convertToModelMessages(
      rawMessages as unknown as Omit<UIMessage, "id">[],
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Invalid messages", message: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const lastUserText = getLastUserText(modelMessages);
  if (!lastUserText) {
    return NextResponse.json({ error: "Missing user message text" }, { status: 400 });
  }

  let queryEmbedding: number[];
  try {
    const batch = await generateEmbeddings([lastUserText]);
    queryEmbedding = batch[0]!;
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: "embedding_failed",
        message: e instanceof Error ? e.message : String(e),
        hint: "Ensure Docker is running and rag-embedder image exists.",
      },
      { status: 503 },
    );
  }

  const sources = await searchSimilarChunks(conversationId, user.id, queryEmbedding);

  const rate = await checkAndConsumeChatRateLimit(user.id);
  if (!rate.ok) {
    const headers = new Headers();
    if (rate.reason === "rpm" && rate.retryAfterSec != null) {
      headers.set("Retry-After", String(rate.retryAfterSec));
    }
    return NextResponse.json(
      {
        error: "rate_limit_exceeded",
        reason: rate.reason,
        ...(rate.retryAfterSec != null ? { retryAfterSec: rate.retryAfterSec } : {}),
      },
      { status: 429, headers },
    );
  }

  const system = buildSystemPrompt(sources);
  const sourcesPayload = sources.map((s) => ({
    chunkId: s.chunkId,
    documentId: s.documentId,
    filename: s.filename,
    chunkIndex: s.chunkIndex,
    excerpt: s.content.length > 400 ? `${s.content.slice(0, 400)}…` : s.content,
    distance: s.distance,
  }));

  const userMessageId = uuidv4();
  await db.insert(message).values({
    id: userMessageId,
    conversationId,
    role: "user",
    content: lastUserText,
  });

  const assistantMessageId = uuidv4();

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    onFinish: async ({ text }) => {
      try {
        await db.insert(message).values({
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: text,
        });
      } catch (err) {
        console.error("[chat] failed to persist assistant message", err);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: rawMessages as unknown as UIMessage[],
    generateMessageId: () => assistantMessageId,
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return { sources: sourcesPayload };
      }
      return undefined;
    },
  });
}
