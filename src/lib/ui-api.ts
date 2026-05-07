export type ConversationSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentSummary = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  createdAt: string;
};

export type UsageSummary = {
  usedBytes: number;
  maxStorageBytesPerUser: number;
  maxUploadBytes: number;
  remainingBytes: number;
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export async function listConversations() {
  const res = await fetch("/api/conversations");
  return readJson<{ conversations: ConversationSummary[] }>(res);
}

export async function createConversation(title?: string) {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return readJson<{ id: string }>(res);
}

export async function renameConversation(id: string, title: string | null) {
  const res = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return readJson<{ ok: true; title: string | null }>(res);
}

export async function deleteConversation(id: string) {
  const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
  return readJson<{ ok: true }>(res);
}

export async function listMessages(id: string) {
  const res = await fetch(`/api/conversations/${id}/messages`);
  return readJson<{ messages: StoredMessage[] }>(res);
}

export async function listDocuments(id: string) {
  const res = await fetch(`/api/documents/${id}`);
  return readJson<{ documents: DocumentSummary[] }>(res);
}

export async function getUsage() {
  const res = await fetch("/api/usage");
  return readJson<UsageSummary>(res);
}
