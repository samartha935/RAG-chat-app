"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUsage } from "@/lib/ui-api";

type Props = {
  conversationId?: string;
  compact?: boolean;
  onEnsureConversation?: () => Promise<string>;
  onUploaded?: () => void;
};

type UploadResponse = {
  error?: string;
  message?: string;
  conversationId: string;
  chunkCount?: number;
};

function formatMiB(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

export function PdfUploadZone({
  conversationId,
  compact = false,
  onEnsureConversation,
  onUploaded,
}: Props) {
  const queryClient = useQueryClient();
  const fileInputId = useId();
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const activeConversationId = conversationId ?? (await onEnsureConversation?.());
      if (!activeConversationId) {
        throw new Error("Create or open a conversation before uploading.");
      }
      const fd = new FormData();
      fd.set("conversationId", activeConversationId);
      fd.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as UploadResponse;
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `Upload failed (${res.status})`);
      }
      return { ...data, conversationId: data.conversationId ?? activeConversationId };
    },
    onSuccess: async (data) => {
      const chunks = typeof data.chunkCount === "number" ? `${data.chunkCount} chunks indexed` : "PDF indexed";
      setLastMessage(chunks);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["usage"] }),
        queryClient.invalidateQueries({ queryKey: ["documents", data.conversationId] }),
      ]);
      onUploaded?.();
    },
    onError: (error) => {
      setLastMessage(error instanceof Error ? error.message : String(error));
    },
  });

  const disabled = uploadMutation.isPending || (!conversationId && !onEnsureConversation);
  const usage = usageQuery.data;

  const uploadFile = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        setLastMessage("Choose a PDF file.");
        return false;
      }
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setLastMessage("Only PDF files can be uploaded.");
        return false;
      }
      if (usage && file.size > usage.maxUploadBytes) {
        setLastMessage(`This PDF is larger than ${formatMiB(usage.maxUploadBytes)}.`);
        return false;
      }
      setLastMessage(null);
      await uploadMutation.mutateAsync(file);
      return true;
    },
    [uploadMutation, usage],
  );

  const onUpload = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const input = form.elements.namedItem("file") as HTMLInputElement;
      if (await uploadFile(input.files?.[0])) {
        input.value = "";
      }
    },
    [uploadFile],
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      void uploadFile(e.dataTransfer.files[0]);
    },
    [disabled, uploadFile],
  );

  return (
    <div className={compact ? "space-y-3" : "rounded-2xl border border-white/10 bg-white/[0.035] p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Upload PDF</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {usage ? `Max ${formatMiB(usage.maxUploadBytes)} per file` : "PDF files only"}
          </p>
        </div>
        <FileUp className="size-5 text-secondary" />
      </div>
      {usage ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-secondary"
            style={{
              width: `${Math.min(100, (usage.usedBytes / usage.maxStorageBytesPerUser) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      <form className="space-y-3" onSubmit={(e) => void onUpload(e)}>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-xl border border-dashed p-3 transition ${
            isDragging
              ? "border-secondary bg-secondary/10"
              : "border-white/10 bg-[#0e0d15]"
          } ${disabled ? "opacity-60" : ""}`}
        >
          <Input
            id={fileInputId}
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            disabled={disabled}
            className="border-white/10 bg-[#0e0d15]"
          />
          <label
            htmlFor={fileInputId}
            className="mt-2 block cursor-pointer text-center text-xs text-muted-foreground"
          >
            Drag a PDF here or pick one from your computer.
          </label>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={disabled}
          className="w-full"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Indexing
            </>
          ) : (
            "Upload and index"
          )}
        </Button>
      </form>
      {usage ? (
        <p className="text-xs text-muted-foreground">
          {formatMiB(usage.usedBytes)} used · {formatMiB(usage.remainingBytes)} remaining
        </p>
      ) : null}
      {lastMessage ? <p className="text-xs text-muted-foreground">{lastMessage}</p> : null}
    </div>
  );
}
