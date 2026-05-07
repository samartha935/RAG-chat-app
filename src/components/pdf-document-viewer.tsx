"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  fileUrl: string;
  width?: number;
  highlightText?: string | null;
  onLoadSuccess?: (numPages: number) => void;
};

/**
 * Scrollable, multi-page PDF viewer with text-layer highlighting.
 *
 * When `highlightText` changes, the component searches every rendered
 * text-layer `<span>` for a fuzzy match and applies a pulsing highlight,
 * then scrolls to the first hit.
 */
export function PdfDocumentViewer({
  fileUrl,
  width = 390,
  highlightText,
  onLoadSuccess,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      onLoadSuccess?.(pages);
    },
    [onLoadSuccess],
  );

  // --------------- Highlight logic ---------------
  useEffect(() => {
    // Clear any previous highlights
    const container = containerRef.current;
    if (!container) return;

    // Remove old highlights
    container
      .querySelectorAll(".rag-highlight")
      .forEach((el) => el.classList.remove("rag-highlight"));

    if (!highlightText || highlightText.trim().length < 8) return;

    // Wait a tick for text layers to finish rendering after page change / load
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);

    highlightTimeoutRef.current = setTimeout(() => {
      applyHighlight(container, highlightText);
    }, 600);

    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [highlightText, numPages]);

  return (
    <div
      ref={containerRef}
      className="pdf-scroll-container"
      style={{ maxHeight: "100%", overflowY: "auto" }}
    >
      <Document
        file={fileUrl}
        loading={
          <p className="p-6 text-center text-sm text-slate-600">Loading PDF…</p>
        }
        error={
          <p className="p-6 text-center text-sm text-slate-600">
            Unable to render PDF preview.
          </p>
        }
        onLoadSuccess={handleLoadSuccess}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page-${i + 1}`}
            pageNumber={i + 1}
            width={width}
            renderAnnotationLayer={false}
            renderTextLayer={true}
          />
        ))}
      </Document>
    </div>
  );
}

// ────────────────────────────────────────────────────
// Highlight helpers
// ────────────────────────────────────────────────────

/** Normalize whitespace for fuzzy matching. */
function norm(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Walk every text-layer `<span>` inside `container`, build a running
 * concatenation, find where `needle` sits, then mark matching spans.
 */
function applyHighlight(container: HTMLElement, needle: string) {
  const normalizedNeedle = norm(needle);
  // Take a reasonable prefix to search for (long excerpts may not match exactly)
  const searchText = normalizedNeedle.slice(0, 120);

  const textLayers = container.querySelectorAll(".react-pdf__Page__textContent");
  if (textLayers.length === 0) return;

  let firstHighlighted: HTMLElement | null = null;

  for (const layer of textLayers) {
    const spans = Array.from(layer.querySelectorAll("span")) as HTMLSpanElement[];
    if (spans.length === 0) continue;

    // Build concatenated text and track span boundaries
    const entries: { span: HTMLSpanElement; start: number; end: number }[] = [];
    let running = "";

    for (const span of spans) {
      const text = span.textContent ?? "";
      const normalizedSpan = norm(text);
      if (normalizedSpan.length === 0) continue;
      const start = running.length;
      running += (running.length > 0 ? " " : "") + normalizedSpan;
      entries.push({ span, start, end: running.length });
    }

    const idx = running.indexOf(searchText);
    if (idx === -1) continue;

    const matchEnd = idx + searchText.length;

    for (const entry of entries) {
      if (entry.end > idx && entry.start < matchEnd) {
        entry.span.classList.add("rag-highlight");
        if (!firstHighlighted) firstHighlighted = entry.span;
      }
    }

    // Only highlight in the first matching page
    if (firstHighlighted) break;
  }

  if (firstHighlighted) {
    firstHighlighted.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
