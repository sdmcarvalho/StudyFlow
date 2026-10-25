export type FormatAction =
  | "bold"
  | "italic"
  | "strike"
  | "h1"
  | "h2"
  | "h3"
  | "hr"
  | "ul"
  | "ol"
  | "task"
  | "quote"
  | "link"
  | "code"
  | "formula"
  | "table";

export type Edit = { text: string; selStart: number; selEnd: number };

const WRAP_MARKERS = { bold: "**", italic: "*", strike: "~~" } as const;
const HEADING_LEVELS = { h1: 1, h2: 2, h3: 3 } as const;
const TABLE =
  "| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|  |  |  |";

// Caracteres que fechariam o token, virariam a largura (`|N`) ou escapariam o `]`.
const UNSAFE_ALT = /[[\]|\\\r\n]+/g;

/** `![alt](src)`. O alt vem do usuário ou do nome do arquivo: só sobra texto que não quebra o token. */
export function imageMarkdown(alt: string, src: string): string {
  const safeAlt = alt.replace(UNSAFE_ALT, " ").replace(/\s+/g, " ").trim();
  return `![${safeAlt}](${src})`;
}

export function applyFormat(
  text: string,
  selStart: number,
  selEnd: number,
  action: FormatAction,
): Edit {
  switch (action) {
    case "bold":
    case "italic":
    case "strike":
      return toggleWrap(text, selStart, selEnd, WRAP_MARKERS[action]);
    case "h1":
    case "h2":
    case "h3":
      return headingEdit(text, selStart, selEnd, HEADING_LEVELS[action]);
    case "ul":
    case "ol":
    case "task":
      return listEdit(text, selStart, selEnd, action);
    case "quote":
      return quoteEdit(text, selStart, selEnd);
    case "hr":
      return insertBlock(text, selEnd, selEnd, "---");
    case "table":
      return insertBlock(text, selEnd, selEnd, TABLE);
    case "link":
      return linkEdit(text, selStart, selEnd);
    case "code":
      return codeLikeEdit(text, selStart, selEnd, "`", "código", "```");
    case "formula":
      return codeLikeEdit(text, selStart, selEnd, "$", "fórmula", "$$");
  }
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
  selStart: number,
  selEnd: number,
): Edit {
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    selStart,
    selEnd,
  };
}

function runLength(
  text: string,
  from: number,
  step: 1 | -1,
  char: string,
): number {
  let count = 0;
  for (let i = from; i >= 0 && i < text.length && text[i] === char; i += step) {
    count++;
  }
  return count;
}

function isWrapped(
  marker: string,
  leading: number,
  trailing: number,
): boolean {
  if (marker === "*") return leading % 2 === 1 && trailing % 2 === 1;
  return leading >= marker.length && trailing >= marker.length;
}

function toggleWrap(
  text: string,
  selStart: number,
  selEnd: number,
  marker: string,
): Edit {
  const n = marker.length;
  const char = marker[0];
  const { start, end } = trimmedRange(text, selStart, selEnd);

  if (start === end) {
    return replaceRange(
      text,
      start,
      end,
      `${marker}texto${marker}`,
      start + n,
      start + n + 5,
    );
  }

  const selection = text.slice(start, end);
  const leading = runLength(selection, 0, 1, char);
  const trailing = runLength(selection, selection.length - 1, -1, char);
  if (
    leading + trailing < selection.length &&
    isWrapped(marker, leading, trailing) &&
    isSingleSpan(marker, selection.slice(n, selection.length - n))
  ) {
    const inner = selection.slice(n, selection.length - n);
    return replaceRange(text, start, end, inner, start, start + inner.length);
  }

  const before = runLength(text, start - 1, -1, char);
  const after = runLength(text, end, 1, char);
  if (isWrapped(marker, before, after)) {
    return {
      text: text.slice(0, start - n) + selection + text.slice(end + n),
      selStart: start - n,
      selEnd: end - n,
    };
  }

  return replaceRange(
    text,
    start,
    end,
    `${marker}${selection}${marker}`,
    start + n,
    end + n,
  );
}

function trimmedRange(
  text: string,
  selStart: number,
  selEnd: number,
): { start: number; end: number } {
  const selection = text.slice(selStart, selEnd);
  const core = selection.trim();
  if (core === "") return { start: selStart, end: selStart };
  const start = selStart + (selection.length - selection.trimStart().length);
  return { start, end: start + core.length };
}

function isSingleSpan(marker: string, inner: string): boolean {
  const char = marker[0];
  const first = runLength(inner, 0, 1, char);
  const last = runLength(inner, inner.length - 1, -1, char);
  if (first + last >= inner.length) return true;
  return !inner.slice(first, inner.length - last).includes(marker);
}

function linkEdit(text: string, selStart: number, selEnd: number): Edit {
  const { start, end } = trimmedRange(text, selStart, selEnd);
  if (start === end) {
    return replaceRange(text, start, end, "[texto](url)", start + 1, start + 6);
  }
  const selection = text.slice(start, end);
  const urlStart = start + selection.length + 3;
  return replaceRange(
    text,
    start,
    end,
    `[${selection}](url)`,
    urlStart,
    urlStart + 3,
  );
}

function codeLikeEdit(
  text: string,
  selStart: number,
  selEnd: number,
  inlineMarker: string,
  placeholder: string,
  blockMarker: string,
): Edit {
  const end = selEnd > selStart && text[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const selection = text.slice(selStart, end);

  if (selection.includes("\n")) {
    return insertBlock(
      text,
      selStart,
      end,
      `${blockMarker}\n${selection}\n${blockMarker}`,
    );
  }

  const content = selection === "" ? placeholder : selection;
  const n = inlineMarker.length;
  return replaceRange(
    text,
    selStart,
    end,
    `${inlineMarker}${content}${inlineMarker}`,
    selStart + n,
    selStart + n + content.length,
  );
}

function insertBlock(
  text: string,
  start: number,
  end: number,
  block: string,
): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const trailingBreaks = Math.min(2, runLength(before, before.length - 1, -1, "\n"));
  const leadingBreaks = Math.min(2, runLength(after, 0, 1, "\n"));
  const lead = before === "" ? "" : "\n".repeat(2 - trailingBreaks);
  const trail = "\n".repeat(2 - leadingBreaks);
  const cursor = start + lead.length + block.length + 2;
  return {
    text: before + lead + block + trail + after,
    selStart: cursor,
    selEnd: cursor,
  };
}

type LineBlock = { start: number; end: number; lines: string[] };

function selectedLines(text: string, selStart: number, selEnd: number): LineBlock {
  const start = selStart === 0 ? 0 : text.lastIndexOf("\n", selStart - 1) + 1;
  const probe = selEnd > selStart && text[selEnd - 1] === "\n" ? selEnd - 1 : selEnd;
  const found = text.indexOf("\n", probe);
  const end = found === -1 ? text.length : found;
  return { start, end, lines: text.slice(start, end).split("\n") };
}

function transformLines(
  text: string,
  selStart: number,
  selEnd: number,
  transform: (lines: string[], skip: (line: string) => boolean) => string[] | null,
): Edit {
  const block = selectedLines(text, selStart, selEnd);
  const skipEmpty = block.lines.length > 1;
  const result = transform(block.lines, (line) => skipEmpty && line.trim() === "");
  if (result === null) return { text, selStart, selEnd };
  const joined = result.join("\n");
  if (selStart === selEnd) {
    const shifted = selStart + joined.length - (block.end - block.start);
    const cursor = Math.min(
      Math.max(shifted, block.start),
      block.start + joined.length,
    );
    return replaceRange(text, block.start, block.end, joined, cursor, cursor);
  }
  return replaceRange(
    text,
    block.start,
    block.end,
    joined,
    block.start,
    block.start + joined.length,
  );
}

function headingEdit(
  text: string,
  selStart: number,
  selEnd: number,
  level: number,
): Edit {
  const prefix = `${"#".repeat(level)} `;
  const anyHeading = /^#{1,6} /;
  return transformLines(text, selStart, selEnd, (lines, skip) => {
    const targets = lines.filter((line) => !skip(line));
    if (targets.length === 0) return null;
    const allHaveIt = targets.every(
      (line) => line.startsWith(prefix) && !line.startsWith(`${prefix}#`),
    );
    return lines.map((line) => {
      if (skip(line)) return line;
      const bare = line.replace(anyHeading, "");
      return allHaveIt ? bare : prefix + bare;
    });
  });
}

function quoteEdit(text: string, selStart: number, selEnd: number): Edit {
  return transformLines(text, selStart, selEnd, (lines, skip) => {
    const targets = lines.filter((line) => !skip(line));
    if (targets.length === 0) return null;
    const allHaveIt = targets.every((line) => line.startsWith("> "));
    return lines.map((line) => {
      if (skip(line)) return line;
      return allHaveIt ? line.slice(2) : `> ${line}`;
    });
  });
}

const TASK_MARKER = /^[-*+] \[[ xX]\] /;
const BULLET_MARKER = /^[-*+] /;
const NUMBER_MARKER = /^\d+\. /;
const ANY_LIST_MARKER = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+\. )/;

function hasListMarker(
  action: "ul" | "ol" | "task",
  body: string,
): boolean {
  if (action === "task") return TASK_MARKER.test(body);
  if (action === "ol") return NUMBER_MARKER.test(body);
  return BULLET_MARKER.test(body) && !TASK_MARKER.test(body);
}

function listEdit(
  text: string,
  selStart: number,
  selEnd: number,
  action: "ul" | "ol" | "task",
): Edit {
  return transformLines(text, selStart, selEnd, (lines, skip) => {
    const parts = lines.map((line) => {
      const indent = /^\s*/.exec(line)?.[0] ?? "";
      return { indent, body: line.slice(indent.length), skipped: skip(line) };
    });
    const targets = parts.filter((part) => !part.skipped);
    if (targets.length === 0) return null;
    const allHaveIt = targets.every((part) => hasListMarker(action, part.body));
    let number = 0;
    return parts.map((part, index) => {
      if (part.skipped) return lines[index];
      const bare = part.body.replace(ANY_LIST_MARKER, "");
      if (allHaveIt) return part.indent + bare;
      number++;
      const prefix =
        action === "ol" ? `${number}. ` : action === "task" ? "- [ ] " : "- ";
      return part.indent + prefix + bare;
    });
  });
}
