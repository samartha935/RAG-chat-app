import { and, eq } from "drizzle-orm";
import type { ModelMessage, UIMessage } from "ai";
import { convertToModelMessages, generateText } from "ai";
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
    return `You are a helpful AI assistant. This conversation has no indexed PDF context yet, so answer normally from general knowledge when appropriate. If the user asks about an uploaded document, explain that there are no uploaded documents available to cite.

Format your responses using markdown: use **bold** for emphasis, headings (## or ###) for sections, bullet lists for enumerations, \`code\` for technical terms, and > blockquotes when quoting. Structure your answers clearly.`;
  }

  const blocks = sources.map(
    (s, i) =>
      `[${i + 1}] (document: ${s.filename}, chunk #${s.chunkIndex})\n${s.content}`,
  );

  return `You are a helpful AI assistant with optional PDF context.

**Response formatting:** Always format your responses using Obsidian-style markdown:
- Use **bold** for key terms and emphasis
- Use headings (## or ###) to organize longer answers into sections
- Use bullet lists or numbered lists for enumerations
- Use \`inline code\` for technical terms, file names, or data values
- Use > blockquotes when directly quoting from the document
- Use tables when comparing information
- Structure answers clearly and make them scannable

**Citation rules:** When you rely on PDF content, cite using bracket numbers exactly matching the excerpt numbers below (e.g. [1], [2], [3]). Place citations inline right after the relevant sentence or claim. Only cite excerpts you actually use — do not cite all of them.

If the user's question is general, conversational, or not related to the uploaded PDF, answer normally from general knowledge without forcing PDF citations.

If the user asks about the PDF but the retrieved excerpts do not contain the answer, say that the uploaded document context does not include enough information, then provide any clearly-labeled general context only if it is useful.

--- Retrieved excerpts ---

${blocks.join("\n\n")}`;
}

function isQuotaLikeError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    /\b429\b/.test(text) ||
    text.toLowerCase().includes("quota") ||
    text.toLowerCase().includes("resource_exhausted") ||
    text.toLowerCase().includes("rate limit")
  );
}

function buildPrototypeFallback(lastUserText: string, sources: RagSource[]): string {
  if (sources.length === 0) {
    return [
      "Gemini is currently unavailable because the API key or selected model is hitting quota/rate limits.",
      "For the prototype, I saved your message, but there is no indexed PDF context yet to summarize locally.",
      `Your question was: "${lastUserText}"`,
    ].join("\n\n");
  }

  const excerpts = sources
    .slice(0, 3)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.filename}, chunk ${s.chunkIndex}\n${s.content.slice(0, 700)}`,
    )
    .join("\n\n");

  return [
    "Gemini is currently unavailable because the API key or selected model is hitting quota/rate limits.",
    "For the prototype, here are the most relevant retrieved PDF excerpts so you can still inspect the document context:",
    excerpts,
  ].join("\n\n");
}

function textStreamResponse(text: string, sources: unknown[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "text-delta", delta: text })}\n`),
        );
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ metadata: { sources } })}\n`),
        );
        controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    },
  );
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

  let assistantText: string;
  try {
    const result = await generateText({
      model,
      system,
      messages: modelMessages,
      /** Retrying on 429/quota burns attempts and delays a clear fallback. */
      maxRetries: 0,
    });
    assistantText = result.text;
  } catch (error) {
    if (!isQuotaLikeError(error)) {
      throw error;
    }
    console.warn("[chat] Gemini quota/rate-limit fallback", error);
    assistantText = buildPrototypeFallback(lastUserText, sources);
  }

  await db.insert(message).values({
    id: assistantMessageId,
    conversationId,
    role: "assistant",
    content: assistantText,
  });

  return textStreamResponse(assistantText, sourcesPayload);
}
