"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  FileText,
  Loader2,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Send,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { PdfUploadZone } from "@/components/pdf-upload-zone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createConversation,
  deleteConversation,
  listConversations,
  listDocuments,
  listMessages,
  renameConversation,
  type ConversationSummary,
  type DocumentSummary,
  type StoredMessage,
} from "@/lib/ui-api";

const PdfDocumentViewer = dynamic(
  () =>
    import("@/components/pdf-document-viewer").then(
      (mod) => mod.PdfDocumentViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="p-6 text-center text-sm text-slate-600">Loading PDF viewer</p>
    ),
  },
);

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
};

type RagSource = {
  chunkId: string;
  documentId: string;
  filename: string;
  chunkIndex: number;
  excerpt: string;
  distance: number;
};

function formatGeminiStreamError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("quota") ||
    s.includes("resource_exhausted") ||
    s.includes("exceeded your current quota") ||
    /\b429\b/.test(raw)
  ) {
    return [
      "Gemini rejected the request because of API quota or rate limits (often free-tier caps on the chosen model).",
      "Try another model via GEMINI_MODEL (for example gemini-2.5-flash), a different API key or Google Cloud project, billing if needed, or retry after the reset shown in the provider message.",
      `Provider: ${raw.slice(0, 280)}${raw.length > 280 ? "…" : ""}`,
    ].join(" ");
  }
  return raw;
}

function titleFor(conv: ConversationSummary) {
  return conv.title?.trim() || "Untitled analysis";
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function messagesForApi(messages: ChatMessage[]) {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  }));
}

function extractStreamPart(line: string): {
  text?: string;
  sources?: RagSource[];
  error?: string;
} {
  const raw = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!raw || raw === "[DONE]") return {};
  try {
    const parsed = JSON.parse(raw) as {
      type?: string;
      delta?: unknown;
      text?: unknown;
      errorText?: unknown;
      metadata?: { sources?: RagSource[] };
      messageMetadata?: { sources?: RagSource[] };
    };
    if (parsed.type === "error" && typeof parsed.errorText === "string") {
      return { error: parsed.errorText };
    }
    if (parsed.type?.includes("text") && typeof parsed.delta === "string") {
      return { text: parsed.delta };
    }
    if (parsed.type?.includes("text") && typeof parsed.text === "string") {
      return { text: parsed.text };
    }
    const sources = parsed.metadata?.sources ?? parsed.messageMetadata?.sources;
    if (sources) return { sources };
  } catch {
    if (!line.includes("{") && !line.includes("}")) {
      return { text: raw };
    }
  }
  return {};
}

export function ChatWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentSummary | null>(null);
  const [prompt, setPrompt] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [jumpSource, setJumpSource] = useState<RagSource | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: listConversations,
  });

  const documentsQuery = useQuery({
    queryKey: ["documents", conversationId],
    queryFn: () => listDocuments(conversationId),
    enabled: conversationId !== "new",
  });

  const storedMessagesQuery = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => listMessages(conversationId),
    enabled: conversationId !== "new",
  });

  const activeConversation = conversationsQuery.data?.conversations.find(
    (c) => c.id === conversationId,
  );

  const storedMessages = useMemo<ChatMessage[]>(() => {
    const rows = storedMessagesQuery.data?.messages ?? [];
    return rows
      .filter((m: StoredMessage) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  }, [storedMessagesQuery.data?.messages]);

  const messages = localMessages.length > 0 ? localMessages : storedMessages;
  const documents = documentsQuery.data?.documents ?? [];
  const currentDocument = selectedDocument ?? documents[0] ?? null;

  const createMutation = useMutation({
    mutationFn: createConversation,
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push(`/chat/${id}`);
      setSidebarOpen(false);
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteConversation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push("/chat/new");
    },
  });

  const ensureConversation = useCallback(async () => {
    if (conversationId !== "new") return conversationId;
    const created = await createConversation("New analysis");
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    router.replace(`/chat/${created.id}`);
    return created.id;
  }, [conversationId, queryClient, router]);

  const sendMessage = useCallback(async () => {
    const text = prompt.trim();
    if (!text || streaming) return;
    setPrompt("");
    setChatError(null);
    setStreaming(true);

    const id = await ensureConversation();
    const outgoing: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistant: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const base = [...messages, outgoing, assistant];
    setLocalMessages(base);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          messages: messagesForApi([...messages, outgoing]),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          retryAfterSec?: number;
        };
        const retry = data.retryAfterSec ? ` Retry in ${data.retryAfterSec}s.` : "";
        throw new Error(`${data.message ?? data.error ?? `Chat failed (${res.status})`}.${retry}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let assistantSources: RagSource[] | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const part = extractStreamPart(line);
          if (part.error) {
            throw new Error(formatGeminiStreamError(part.error));
          }
          if (part.text) assistantText += part.text;
          if (part.sources) assistantSources = part.sources;
          setLocalMessages((prev) =>
            prev.map((m) =>
              m.id === assistant.id
                ? { ...m, content: assistantText, sources: assistantSources }
                : m,
            ),
          );
        }
      }
      if (buffer) {
        const part = extractStreamPart(buffer);
        if (part.error) {
          throw new Error(formatGeminiStreamError(part.error));
        }
        if (part.text) assistantText += part.text;
        if (part.sources) assistantSources = part.sources;
      }
      setLocalMessages((prev) =>
        prev.map((m) =>
          m.id === assistant.id
            ? {
                ...m,
                content: assistantText || "I could not read a response from the stream.",
                sources: assistantSources,
              }
            : m,
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ["messages", id] });
    } catch (error) {
      setChatError(error instanceof Error ? error.message : String(error));
      setLocalMessages((prev) => prev.filter((m) => m.id !== assistant.id));
    } finally {
      setStreaming(false);
    }
  }, [ensureConversation, messages, prompt, queryClient, streaming]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] border-r border-white/10 bg-[#111118]/95 p-4 backdrop-blur transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Scholar Doc AI
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </div>
          <Button
            onClick={() => createMutation.mutate("New analysis")}
            disabled={createMutation.isPending}
            className="justify-start"
          >
            <MessageSquarePlus className="size-4" />
            New analysis
          </Button>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {conversationsQuery.data?.conversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                active={conv.id === conversationId}
                onRename={(title) => renameMutation.mutate({ id: conv.id, title })}
                onDelete={() => deleteMutation.mutate(conv.id)}
              />
            ))}
          </div>
          <PdfUploadZone
            conversationId={conversationId === "new" ? undefined : conversationId}
            compact
            onEnsureConversation={ensureConversation}
          />
        </div>
      </aside>

      <main className="grid min-w-0 flex-1 grid-rows-[auto_1fr_auto]">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#13121a]/80 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-5" />
            </Button>
            <div>
              <p className="text-sm font-semibold">
                {activeConversation ? titleFor(activeConversation) : "New analysis"}
              </p>
              <p className="text-xs text-muted-foreground">
                {documents.length} document{documents.length === 1 ? "" : "s"} connected
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1 font-mono text-xs text-secondary sm:flex">
            citations enabled
          </div>
        </header>

        <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:p-6">
          <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-[#16161e]/80">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 lg:p-6">
              {messages.length === 0 ? (
                <EmptyChat />
              ) : (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onSourceClick={(source) => setJumpSource(source)}
                  />
                ))
              )}
              {streaming ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-primary shadow-[0_0_18px_rgb(141_127_255/0.8)]" />
                  Thinking across retrieved context
                </div>
              ) : null}
            </div>
            {chatError ? (
              <div className="mx-4 mb-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
                {chatError}
              </div>
            ) : null}
          </section>

          <DocumentPanel
            documents={documents}
            currentDocument={currentDocument}
            jumpSource={jumpSource}
            onSelect={setSelectedDocument}
          />
        </div>

        <form
          className="border-t border-white/10 bg-[#13121a]/90 p-4 backdrop-blur lg:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
        >
          <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-white/10 bg-[#0e0d15] p-2 focus-within:border-primary/60 focus-within:shadow-[0_0_28px_rgb(141_127_255/0.14)]">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask a cited question about your document..."
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="sm" disabled={streaming || !prompt.trim()}>
              {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(titleFor(conversation));

  return (
    <div className={`group rounded-xl border p-2 ${active ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/3"}`}>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onRename(title);
            setEditing(false);
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setEditing(false)}
            autoFocus
            className="h-8 border-white/10 bg-[#0e0d15] text-xs"
          />
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <Link href={`/chat/${conversation.id}`} className="min-w-0 flex-1 text-sm" onDoubleClick={() => setEditing(true)}>
            <span className="block truncate">{titleFor(conversation)}</span>
          </Link>
          <Button variant="ghost" size="sm" className="size-7 opacity-0 group-hover:opacity-100" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-primary/10">
        <Bot className="size-7 text-primary" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Start with a document-backed question</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        Upload a PDF from the sidebar, then ask for summaries, claims, contradictions,
        or page-specific explanations.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  onSourceClick,
}: {
  message: ChatMessage;
  onSourceClick: (source: RagSource) => void;
}) {
  const assistant = message.role === "assistant";
  return (
    <div className={`flex ${assistant ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[82%] rounded-2xl border p-4 text-sm leading-6 ${
          assistant
            ? "rounded-bl-md border-primary/20 bg-primary/10"
            : "rounded-br-md border-white/10 bg-white/4.5"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.sources?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.sources.slice(0, 5).map((source, i) => (
              <button
                key={source.chunkId}
                type="button"
                onClick={() => onSourceClick(source)}
                className="rounded-full border border-secondary/40 bg-secondary/10 px-2.5 py-1 font-mono text-xs text-secondary"
              >
                Source {i + 1} · {source.filename}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DocumentPanel({
  documents,
  currentDocument,
  jumpSource,
  onSelect,
}: {
  documents: DocumentSummary[];
  currentDocument: DocumentSummary | null;
  jumpSource: RagSource | null;
  onSelect: (document: DocumentSummary) => void;
}) {
  return (
    <aside className="hidden min-h-0 flex-col rounded-2xl border border-white/10 bg-[#16161e]/80 lg:flex">
      <div className="border-b border-white/10 p-4">
        <p className="text-sm font-semibold">Source document</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Citations jump to the connected PDF context.
        </p>
      </div>
      <div className="space-y-2 border-b border-white/10 p-3">
        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
            Upload a PDF to preview it here.
          </div>
        ) : (
          documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onSelect(doc)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                doc.id === currentDocument?.id
                  ? "border-secondary/40 bg-secondary/10"
                  : "border-white/10 bg-white/3"
              }`}
            >
              <FileText className="size-4 text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{doc.filename}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatBytes(doc.sizeBytes)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
      <PdfPreview document={currentDocument} jumpSource={jumpSource} />
    </aside>
  );
}

function PdfPreview({
  document,
  jumpSource,
}: {
  document: DocumentSummary | null;
  jumpSource: RagSource | null;
}) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const url = document ? `/api/pdf/${document.storagePath}` : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {document && url ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0e0d15] px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              Page {page}
              {numPages ? ` / ${numPages}` : ""}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
            >
              Next
            </Button>
          </div>
          {jumpSource ? (
            <div className="rounded-xl border border-secondary/30 bg-secondary/10 p-3">
              <p className="font-mono text-xs text-secondary">
                Chunk {jumpSource.chunkIndex} · {jumpSource.filename}
              </p>
              <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">
                {jumpSource.excerpt}
              </p>
            </div>
          ) : null}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/95 p-2">
            <PdfDocumentViewer
              fileUrl={url}
              page={page}
              onLoadSuccess={(loadedPages) => {
                setNumPages(loadedPages);
                setPage((p) => Math.min(p, loadedPages));
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-sm text-muted-foreground">
          PDF preview appears after upload.
        </div>
      )}
    </div>
  );
}
