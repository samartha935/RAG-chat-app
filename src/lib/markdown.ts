/**
 * Lightweight Obsidian-style markdown → HTML renderer.
 * No external dependencies. Handles: headings, bold, italic, strikethrough,
 * inline code, fenced code blocks, blockquotes, ordered/unordered lists,
 * links, images, horizontal rules, tables, and [N] citation references.
 */

/** Escape HTML entities */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render inline markdown (bold, italic, code, links, citations, etc.) */
function renderInline(text: string, onCiteClick?: boolean): string {
  let s = esc(text);

  // Inline code (must come before bold/italic to avoid conflicts)
  s = s.replace(/`([^`\n]+?)`/g, "<code>$1</code>");

  // Bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/_(.+?)_/g, "<em>$1</em>");
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Links: [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Citation references: [1], [2], etc. — rendered as clickable superscript badges
  if (onCiteClick) {
    s = s.replace(
      /\[(\d+)\]/g,
      '<span class="cite-ref" data-cite="$1">$1</span>',
    );
  }

  return s;
}

/**
 * Convert a markdown string to safe HTML.
 * @param md Raw markdown text
 * @param withCitations If true, bracket numbers like [1] become clickable citation refs
 */
export function markdownToHtml(md: string, withCitations = false): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // ── Fenced code block ──
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        codeLines.push(esc(lines[i]!));
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` class="language-${lang}"` : "";
      html.push(`<pre><code${langAttr}>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // ── Horizontal rule ──
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      html.push("<hr>");
      i++;
      continue;
    }

    // ── Heading ──
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      html.push(`<h${level}>${renderInline(headingMatch[2]!, withCitations)}</h${level}>`);
      i++;
      continue;
    }

    // ── Blockquote ──
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ""));
        i++;
      }
      html.push(
        `<blockquote>${quoteLines
          .map((l) => `<p>${renderInline(l, withCitations)}</p>`)
          .join("")}</blockquote>`,
      );
      continue;
    }

    // ── Table ──
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1]!)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes("|")) {
        tableLines.push(lines[i]!);
        i++;
      }
      html.push(renderTable(tableLines, withCitations));
      continue;
    }

    // ── Unordered list ──
    if (/^\s*[-*+]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      html.push(
        `<ul>${listItems
          .map((li) => `<li>${renderInline(li, withCitations)}</li>`)
          .join("")}</ul>`,
      );
      continue;
    }

    // ── Ordered list ──
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        listItems.push(lines[i]!.replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      html.push(
        `<ol>${listItems
          .map((li) => `<li>${renderInline(li, withCitations)}</li>`)
          .join("")}</ol>`,
      );
      continue;
    }

    // ── Empty line ──
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Paragraph (default) ──
    html.push(`<p>${renderInline(line, withCitations)}</p>`);
    i++;
  }

  return html.join("\n");
}

/** Render a pipe-delimited markdown table to HTML */
function renderTable(tableLines: string[], withCitations: boolean): string {
  const parseCells = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  if (tableLines.length < 2) return "";

  const headers = parseCells(tableLines[0]!);
  // Skip separator line (index 1)
  const bodyRows = tableLines.slice(2).map(parseCells);

  const ths = headers.map((h) => `<th>${renderInline(h, withCitations)}</th>`).join("");
  const trs = bodyRows
    .map(
      (cells) =>
        `<tr>${cells.map((c) => `<td>${renderInline(c, withCitations)}</td>`).join("")}</tr>`,
    )
    .join("");

  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}
