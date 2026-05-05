import path from "path";
import { writeFile } from "fs/promises";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db";
import { conversation, document, documentChunk } from "@/db/schema";
import { chunkText } from "@/lib/chunker";
import { embedChunksBatched } from "@/lib/embed-chunks";
import { extractPdfText } from "@/lib/extract-pdf-text";
import { getSessionUser } from "@/lib/require-user";
import { ensureUploadDir, removeStoredPdf } from "@/lib/pdf-storage";
import { getTotalPdfBytesForUser } from "@/lib/storage-quota";
import {
  getMaxStorageBytesPerUser,
  getMaxUploadBytes,
  getUploadDir,
} from "@/lib/upload-config";

function looksLikePdf(buffer: Buffer): boolean {
  const sig = buffer.subarray(0, 5).toString("latin1");
  return sig.startsWith("%PDF");
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxUpload = getMaxUploadBytes();
  const maxTotal = getMaxStorageBytesPerUser();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const conversationIdRaw = formData.get("conversationId");
  const file = formData.get("file");

  if (typeof conversationIdRaw !== "string" || !conversationIdRaw.trim()) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const conversationId = conversationIdRaw.trim();

  const [conv] = await db
    .select({ id: conversation.id })
    .from(conversation)
    .where(
      and(eq(conversation.id, conversationId), eq(conversation.userId, user.id)),
    );

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const mime = file.type || "application/octet-stream";
  if (mime !== "application/pdf" && !mime.endsWith("/pdf")) {
    return NextResponse.json(
      { error: "Only PDF uploads are allowed" },
      { status: 400 },
    );
  }

  const size = file.size;
  if (size > maxUpload) {
    return NextResponse.json(
      { error: "file_too_large", maxBytes: maxUpload },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== size) {
    return NextResponse.json({ error: "Upload size mismatch" }, { status: 400 });
  }

  if (!looksLikePdf(buffer)) {
    return NextResponse.json({ error: "invalid_pdf" }, { status: 400 });
  }

  const used = await getTotalPdfBytesForUser(user.id);
  if (used + buffer.length > maxTotal) {
    return NextResponse.json(
      {
        error: "storage_quota_exceeded",
        usedBytes: used,
        maxStorageBytesPerUser: maxTotal,
      },
      { status: 403 },
    );
  }

  let text: string;
  try {
    text = await extractPdfText(buffer);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: "pdf_parse_failed",
        message: e instanceof Error ? e.message : "Failed to parse PDF",
      },
      { status: 400 },
    );
  }

  const rawChunks = chunkText(text, 512, 50);
  const chunks = rawChunks.map((c) => c.trim()).filter((c) => c.length > 0);

  let embeddings: number[][] = [];
  if (chunks.length > 0) {
    try {
      embeddings = await embedChunksBatched(chunks);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: "embedding_failed",
          message: msg,
          hint: "Ensure Docker is running and the rag-embedder image exists: docker build -t rag-embedder ./python",
        },
        { status: 503 },
      );
    }

    for (const vec of embeddings) {
      if (vec.length !== 384) {
        return NextResponse.json(
          {
            error: "embedding_dimension_mismatch",
            expected: 384,
            got: vec.length,
          },
          { status: 500 },
        );
      }
    }
  }

  const uploadDir = getUploadDir();
  await ensureUploadDir(uploadDir);

  const docId = uuidv4();
  const safeFilename = path.basename(file.name) || "document.pdf";
  const storageFileName = `${docId}.pdf`;
  const fullPath = path.join(uploadDir, storageFileName);

  await writeFile(fullPath, buffer);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(document).values({
        id: docId,
        conversationId,
        filename: safeFilename,
        mimeType: "application/pdf",
        storagePath: storageFileName,
        sizeBytes: buffer.length,
      });

      if (chunks.length > 0) {
        await tx.insert(documentChunk).values(
          chunks.map((content, i) => ({
            id: uuidv4(),
            documentId: docId,
            chunkIndex: i,
            content,
            embedding: embeddings[i]!,
          })),
        );
      }
    });
  } catch (e) {
    console.error(e);
    await removeStoredPdf(uploadDir, storageFileName);
    return NextResponse.json(
      { error: "Failed to save document" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: docId,
    conversationId,
    filename: safeFilename,
    storagePath: storageFileName,
    sizeBytes: buffer.length,
    chunkCount: chunks.length,
  });
}
