"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Usage = {
  usedBytes: number;
  maxStorageBytesPerUser: number;
  maxUploadBytes: number;
  remainingBytes: number;
};

function formatMiB(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export function PdfUploadZone() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    const res = await fetch("/api/usage");
    if (res.status === 401) {
      setUsage(null);
      setUsageError("Sign in to see storage quota.");
      return;
    }
    if (!res.ok) {
      setUsageError(`Usage failed (${res.status})`);
      return;
    }
    const data = (await res.json()) as Usage;
    setUsage(data);
    setUsageError(null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadUsage();
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadUsage]);

  const createConversation = useCallback(async () => {
    setBusy("createConv");
    setLastMessage(null);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Upload demo" }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setLastMessage(data.error ?? `Failed (${res.status})`);
        return;
      }
      if (data.id) setConversationId(data.id);
      setLastMessage(`Conversation ${data.id}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const onUpload = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!conversationId) {
        setLastMessage("Create a conversation first.");
        return;
      }
      const form = e.currentTarget;
      const input = form.elements.namedItem("file") as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) {
        setLastMessage("Choose a PDF file.");
        return;
      }
      setBusy("upload");
      setLastMessage(null);
      try {
        const fd = new FormData();
        fd.set("conversationId", conversationId);
        fd.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `Upload failed (${res.status})`;
          setLastMessage(err);
          return;
        }
        const ok = data as {
          id?: string;
          chunkCount?: number;
          storagePath?: string;
        };
        const parts: string[] = [];
        if (ok.id) parts.push(`Uploaded document ${ok.id}`);
        if (typeof ok.chunkCount === "number") {
          parts.push(`${ok.chunkCount} chunks indexed`);
        }
        setLastMessage(parts.join(" · "));
        input.value = "";
        await loadUsage();
      } finally {
        setBusy(null);
      }
    },
    [conversationId, loadUsage],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">PDF storage (demo)</CardTitle>
        <CardDescription className="text-xs">
          VPS-local uploads with per-user total cap. Create a conversation, then
          upload a PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {usageError ? (
          <p className="text-muted-foreground text-xs">{usageError}</p>
        ) : null}
        {usage ? (
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              Used: {formatMiB(usage.usedBytes)} /{" "}
              {formatMiB(usage.maxStorageBytesPerUser)}
            </p>
            <p>Remaining: {formatMiB(usage.remainingBytes)}</p>
            <p>Max per file: {formatMiB(usage.maxUploadBytes)}</p>
          </div>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void createConversation()}
        >
          {busy === "createConv" ? "Creating…" : "Create conversation"}
        </Button>
        {conversationId ? (
          <p className="font-mono text-[10px] break-all">
            conversationId: {conversationId}
          </p>
        ) : null}
        <form className="flex flex-col gap-2" onSubmit={(e) => void onUpload(e)}>
          <Input name="file" type="file" accept="application/pdf,.pdf" />
          <Button type="submit" size="sm" disabled={busy !== null}>
            {busy === "upload" ? "Uploading…" : "Upload PDF"}
          </Button>
        </form>
        {lastMessage ? (
          <p className="text-muted-foreground text-xs">{lastMessage}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
