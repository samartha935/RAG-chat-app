"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Props = {
  fileUrl: string;
  highlightText?: string | null;
  onLoadSuccess?: (numPages: number) => void;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.15;

/**
 * Scrollable, multi-page PDF viewer with text-layer highlighting and zoom
 * (Ctrl+scroll or buttons).
 *
 * When `highlightText` changes, the component searches every rendered
 * text-layer `<span>` for a fuzzy match and applies a pulsing highlight,
 * then scrolls to the first hit.
 */
export function PdfDocumentViewer({
  fileUrl,
  highlightText,
  onLoadSuccess,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages);
      onLoadSuccess?.(pages);
    },
    [onLoadSuccess],
  );

  // --------------- Zoom helpers ---------------
  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  }, []);

  const resetZoom = useCallback(() => setScale(1.0), []);

  // Ctrl + mouse-wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
      } else {
        setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  // --------------- Highlight logic ---------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Remove old highlights
    container
      .querySelectorAll(".rag-highlight")
      .forEach((el) => el.classList.remove("rag-highlight"));

    if (!highlightText || highlightText.trim().length < 8) return;

    // Wait for text layers to finish rendering after page change / load
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);

    highlightTimeoutRef.current = setTimeout(() => {
      applyHighlight(container, highlightText);
    }, 800);

    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, [highlightText, numPages]);

  // Compute page width based on container size and scale
  const [containerWidth, setContainerWidth] = useState(390);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        // Leave some padding
        setContainerWidth(Math.floor(entry.contentRect.width - 16));
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(200, containerWidth * scale);

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Zoom controls */}
      <div className="flex items-center justify-center">
        <div className="pdf-zoom-controls">
          <button type="button" onClick={zoomOut} title="Zoom out (Ctrl + Scroll down)">
            −
          </button>
          <button
            type="button"
            className="zoom-level"
            onClick={resetZoom}
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={zoomIn} title="Zoom in (Ctrl + Scroll up)">
            +
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="pdf-scroll-container"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}
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
              width={pageWidth}
              renderAnnotationLayer={false}
              renderTextLayer={true}
            />
          ))}
        </Document>
      </div>
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
 *
 * Uses progressively shorter prefixes of the needle to increase match chance
 * (long excerpts from chunking often won't match the exact PDF text layer).
 */
function applyHighlight(container: HTMLElement, needle: string) {
  const normalizedNeedle = norm(needle);
  if (normalizedNeedle.length < 6) return;

  const textLayers = container.querySelectorAll(".react-pdf__Page__textContent");
  if (textLayers.length === 0) return;

  let firstHighlighted: HTMLElement | null = null;

  // Try progressively shorter search prefixes for better match rates
  const searchLengths = [200, 120, 80, 50, 30];

  for (const maxLen of searchLengths) {
    if (firstHighlighted) break;
    const searchText = normalizedNeedle.slice(0, Math.min(maxLen, normalizedNeedle.length));
    if (searchText.length < 6) continue;

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
  }

  // If exact substring didn't work, try word-level matching
  if (!firstHighlighted) {
    firstHighlighted = applyWordHighlight(container, normalizedNeedle);
  }

  if (firstHighlighted) {
    firstHighlighted.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * Fallback: extract significant words from the needle and highlight spans
 * that contain a high density of those words.
 */
function applyWordHighlight(container: HTMLElement, normalizedNeedle: string): HTMLElement | null {
  // Extract significant words (>=4 chars, skip common stop words)
  const stopWords = new Set([
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
    "her", "was", "one", "our", "out", "has", "have", "been", "this", "that",
    "with", "from", "they", "will", "each", "make", "like", "than", "them",
    "then", "what", "when", "which", "would", "could", "should", "these",
    "their", "there", "about", "other", "into", "some", "very",
  ]);

  const words = normalizedNeedle
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  if (words.length < 3) return null;

  // Use first 8-10 significant words for matching
  const searchWords = words.slice(0, 10);
  const minWordMatches = Math.max(3, Math.ceil(searchWords.length * 0.4));

  const textLayers = container.querySelectorAll(".react-pdf__Page__textContent");
  let firstHighlighted: HTMLElement | null = null;

  for (const layer of textLayers) {
    const spans = Array.from(layer.querySelectorAll("span")) as HTMLSpanElement[];
    if (spans.length === 0) continue;

    // Sliding window of spans
    for (let start = 0; start < spans.length; start++) {
      let windowText = "";
      let matchCount = 0;
      const windowEnd = Math.min(start + 15, spans.length);

      for (let j = start; j < windowEnd; j++) {
        windowText += " " + norm(spans[j]!.textContent ?? "");
      }

      for (const word of searchWords) {
        if (windowText.includes(word)) matchCount++;
      }

      if (matchCount >= minWordMatches) {
        for (let j = start; j < windowEnd; j++) {
          spans[j]!.classList.add("rag-highlight");
          if (!firstHighlighted) firstHighlighted = spans[j]!;
        }
        return firstHighlighted;
      }
    }
  }

  return null;
}
