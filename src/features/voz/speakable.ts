// Markdown de uma célula -> texto para fala (função pura, sem dependências, client-safe).
//
// Regras simples sobre o texto, sem parser de Markdown e sem executar nem renderizar HTML.
// Todas as expressões regulares usam classes disjuntas e partem de um caractere âncora (`[`, `<`,
// crase...) para ficarem lineares numa célula de MAX_CELL_CHARS (200.000) mesmo com entrada
// patológica; os casos que não cabem em regex (aspas de citação, cercas, título, tabela) são
// varridos à mão. Há um teste de desempenho em tests/unit/voz-speakable.test.ts.
//
// Decisões:
// - Parágrafos seguidos ganham um ponto entre si (pausa); o último parágrafo da célula fica como veio.
//   Títulos, itens de lista e linhas de tabela sempre terminam em ponto (frase própria).
// - Código inline mantém o texto (sem as crases); blocos de código (cercados ou indentados) viram
//   "trecho de código." e o conteúdo não é lido; bloco vazio não gera fala.
// - Matemática ($...$, $$...$$) não tem tratamento especial: o texto fica como está. Se sobrar só
//   pontuação (sem letra nem dígito), a regra geral abaixo descarta o bloco.
// - REGRA GERAL: o Piper aborta (exit 1) numa linha sem letra nem dígito. Todo bloco e o resultado
//   final sem nenhum \p{L}/\p{N} viram "". A saída é sempre uma linha só, sem \0 nem controles.
import type { Cell } from "@/features/estudo/content-schema";

const CODE_SPOKEN = "trecho de código.";

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const hasContent = (s: string): boolean => LETTER_OR_DIGIT.test(s);

// Marcadores de código inline são guardados fora do texto (caracteres de uso privado) para que
// ênfase, HTML e links não mexam no conteúdo.
const PH_OPEN = "";
const PH_CLOSE = "";

// Tags de bloco: removidas e trocadas por espaço (separam palavras).
const BLOCK_TAGS = new Set([
  "br", "p", "div", "li", "ul", "ol", "tr", "td", "th", "table", "thead", "tbody", "blockquote",
  "section", "article", "header", "footer", "hr", "pre", "h1", "h2", "h3", "h4", "h5", "h6",
  "details", "summary", "figure", "figcaption", "nav", "main", "center", "picture", "video",
  "audio", "iframe", "img", "source",
]);
// Tags em linha: removidas sem espaço. Só nomes destas duas listas contam como HTML; qualquer
// outro `<...>` ("x<y and y>z", "List<String>") é texto e fica como está. Falha mais segura para
// o áudio: a fala pode soar estranha, mas nenhuma palavra some. Forma falada de "List<String>":
// o próprio texto, sem alteração.
const INLINE_TAGS = new Set([
  "a", "abbr", "b", "code", "em", "i", "mark", "s", "small", "span", "strong", "sub", "sup", "u",
  "kbd", "del", "ins", "font",
]);
// Atributos sem valor aceitos (`<details open>`); os demais precisam ser nome=valor. Assim
// "a<b e c>d" (um `b` com "atributos" soltos) não é tag.
const BOOL_ATTRS = "open|controls|autoplay|loop|muted|hidden|checked|disabled|selected|reversed|async|defer";
const ATTR_VALUE = `(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`;
const HTML_TAG = new RegExp(
  `<(/?)([A-Za-z][A-Za-z0-9]*)` +
    `((?:\\s+[A-Za-z_:][\\w:.-]*\\s*=\\s*${ATTR_VALUE}|\\s+(?:${BOOL_ATTRS})(?![\\w:.-]))*)` +
    `\\s*/?>`,
  "g",
);

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z]{2,6}));/g, (m, dec, hex, name) => {
    if (name !== undefined) return ENTITIES[name.toLowerCase()] ?? m;
    const code = dec !== undefined ? Number(dec) : parseInt(hex, 16);
    if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return m;
    return String.fromCodePoint(code);
  });
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && ch !== "" && /[\p{L}\p{N}]/u.test(ch);

// Texto de uma linha/parágrafo/célula de tabela, já sem marcadores de bloco.
function inline(input: string): string {
  const codes: string[] = [];
  // Código inline primeiro (protege o conteúdo).
  let s = input.split(PH_OPEN).join("").split(PH_CLOSE).join("");
  s = s.replace(/`+([^`]*)`+/g, (_m, body: string) => {
    codes.push(body.trim());
    return `${PH_OPEN}${codes.length - 1}${PH_CLOSE}`;
  });
  s = s.replace(/`+/g, ""); // crases soltas

  // Imagens (inclusive de referência) somem; depois links e links de referência viram o texto.
  s = s.replace(/!\[[^[\]]*\](?:\((?:[^()]|\([^()]*\))*\)|\[[^[\]]*\])/g, "");
  s = s.replace(/\[([^[\]]*)\](?:\((?:[^()]|\([^()]*\))*\)|\[[^[\]]*\])/g, "$1");

  // Autolinks e e-mails entre <> somem; depois as tags HTML (blocos viram espaço).
  s = s.replace(/<(?:https?|ftp|mailto):[^<>\s]*>|<[^<>\s@]+@[^<>\s@]+>/gi, "");
  s = s.replace(HTML_TAG, (m, closing: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    const block = BLOCK_TAGS.has(tag);
    if (!block && !INLINE_TAGS.has(tag)) return m;
    if (closing && attrs) return m; // "</b x>" não é tag
    return block ? " " : "";
  });

  // Ênfase: `*` some; `_` some nas bordas de palavra e vira espaço dentro da palavra
  // (snake_case). Com escape (`\*`, `\_`) o caractere é mantido.
  s = s.replace(/(\\?)([*_]+)/g, (m, esc: string, run: string, offset: number, whole: string) => {
    if (esc) return run;
    if (run[0] === "*") return "";
    const before = whole[offset - 1];
    const after = whole[offset + m.length];
    return isWordChar(before) && isWordChar(after) ? " " : "";
  });
  s = s.replace(/~{2,}/g, "");

  s = decodeEntities(s);
  s = s.replace(/\\([!-/:-@[-`{-~])/g, "$1");
  s = s.replace(/\\$/, ""); // quebra de linha forçada
  s = s.replace(/(\d+)/g, (_m, i: string) => codes[Number(i)] ?? "");
  return collapse(s);
}

// Uma linha só: controles, \0 e separadores Unicode viram espaço; espaços repetidos colapsam.
function collapse(s: string): string {
  return s
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Remove comentários HTML, <script> e <style> (com o conteúdo), mesmo em várias linhas.
// `state.until` guarda o que ainda falta fechar. Linhas de código não passam por aqui.
const HIDDEN_OPEN = /<!--|<script(?=[\s/>])|<style(?=[\s/>])/gi;
function stripHidden(line: string, state: { until: RegExp | null }): string {
  let out = "";
  let rest = line;
  for (;;) {
    if (state.until) {
      state.until.lastIndex = 0;
      const m = state.until.exec(rest);
      if (!m) return out;
      rest = rest.slice(m.index + m[0].length);
      state.until = null;
    }
    HIDDEN_OPEN.lastIndex = 0;
    const open = HIDDEN_OPEN.exec(rest);
    if (!open) return out + rest;
    out += rest.slice(0, open.index);
    rest = rest.slice(open.index + open[0].length);
    const tag = open[0].toLowerCase();
    state.until = tag === "<!--" ? /-->/ : tag === "<script" ? /<\/script\s*>/i : /<\/style\s*>/i;
  }
}

// stripHidden sem mexer em código inline: os trechos entre crases são guardados antes e devolvidos
// depois, então `<script>` ou `<!--` dentro de crases nunca abrem um bloco oculto.
function stripHiddenOutsideCode(line: string, state: { until: RegExp | null }): string {
  const spans: string[] = [];
  const masked = line.replace(/`+[^`]*`+/g, (m) => {
    spans.push(m);
    return `${PH_OPEN}${spans.length - 1}${PH_CLOSE}`;
  });
  const out = stripHidden(masked, state);
  return out.replace(new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g"), (_m, i: string) => spans[Number(i)] ?? "");
}

// Remove os `>` iniciais de citação (até 3 espaços antes de cada um), sem copiar a linha a cada passo.
function stripQuote(line: string): string {
  let i = 0;
  for (;;) {
    let j = i;
    while (j < line.length && j - i < 3 && line[j] === " ") j++;
    if (line[j] !== ">") break;
    j++;
    if (line[j] === " ") j++;
    i = j;
  }
  return i === 0 ? line : line.slice(i);
}

function isHr(t: string): boolean {
  // `---`, `***`, `___` e variações com espaços (3 ou mais), sem nada além disso.
  let marker = "";
  let count = 0;
  for (const ch of t) {
    if (ch === " " || ch === "\t") continue;
    if (marker === "") {
      if (ch !== "-" && ch !== "*" && ch !== "_") return false;
      marker = ch;
    } else if (ch !== marker) return false;
    count++;
  }
  return count >= 3;
}

function isSetextUnderline(t: string): boolean {
  if (t === "") return false;
  const c = t[0];
  if (c !== "=" && c !== "-") return false;
  for (const ch of t) if (ch !== c) return false;
  return true;
}

function splitTableRow(row: string): string[] {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1);
  return r.split(/(?<!\\)\|/);
}

function isTableDelimiter(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return splitTableRow(t).every((c) => /^:?-+:?$/.test(c.trim()));
}

type Block = { text: string; sentence: boolean };

// Item de lista com conteúdo (marcador sozinho não conta). `interrupts` segue o CommonMark: só uma
// lista ordenada que começa em 1 pode interromper um parágrafo ("...em\n2020. Foi" é texto).
function listItem(trimmedLine: string): { content: string; interrupts: boolean } | null {
  const m = /^(?:([-*+])|(\d{1,9})[.)])[ \t]+(\S.*)$/.exec(trimmedLine);
  if (!m) return null;
  return {
    content: m[3].replace(/^\[[ xX]\][ \t]+/, ""),
    interrupts: m[1] !== undefined || Number(m[2]) === 1,
  };
}

function headingContent(line: string): string | null {
  const m = /^ {0,3}#{1,6}(?:[ \t]+(.*))?$/.exec(line);
  if (!m) return null;
  let t = (m[1] ?? "").trimEnd();
  // marcadores de fechamento (`## Título ##`), à mão para não ter regex quadrática
  let k = t.length;
  while (k > 0 && t[k - 1] === "#") k--;
  if (k < t.length && (k === 0 || t[k - 1] === " " || t[k - 1] === "\t")) t = t.slice(0, k).trimEnd();
  return t;
}

export function toSpeakable(markdown: string): string {
  // \0 e os marcadores de uso privado (reservados aos placeholders de código) saem da entrada.
  const lines = markdown
    .split("\0").join("")
    .split(PH_OPEN).join("")
    .split(PH_CLOSE).join("")
    .split(/\r\n|\r|\n/);

  const blocks: Block[] = [];
  let para: string[] = [];
  let paraKind: "p" | "item" | null = null;
  let fence: { ch: string; len: number; has: boolean } | null = null;
  let indentCode: { has: boolean } | null = null;
  let listCtx = false;
  const hidden = { until: null as RegExp | null };

  const emit = (text: string, sentence: boolean) => {
    if (hasContent(text)) blocks.push({ text, sentence });
  };
  const flushPara = () => {
    if (para.length > 0) emit(inline(para.join(" ")), paraKind === "item");
    para = [];
    paraKind = null;
  };
  const closeIndent = () => {
    if (indentCode?.has) blocks.push({ text: CODE_SPOKEN, sentence: true });
    indentCode = null;
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (fence) {
      const t = stripQuote(line).trim();
      if (t.length >= fence.len && t[0] === fence.ch && /^(?:`+|~+)$/.test(t)) {
        if (fence.has) blocks.push({ text: CODE_SPOKEN, sentence: true });
        fence = null;
      } else if (t !== "") fence.has = true;
      continue;
    }

    line = stripQuote(line);

    // Comentários, <script> e <style> (podem abrir ou fechar nesta linha). Não valem em código:
    // nem inline (crases) nem em linha de código indentado.
    const startsIndented = line.startsWith("\t") || line.startsWith("    ");
    const isIndentedCode =
      startsIndented &&
      line.trim() !== "" &&
      hidden.until === null &&
      (indentCode !== null || (para.length === 0 && !listCtx));
    if (!isIndentedCode) {
      const wasHidden = hidden.until !== null;
      const before = line;
      line = stripHiddenOutsideCode(line, hidden);
      if ((wasHidden || line !== before) && line.trim() === "") continue;
    }
    const trimmed = line.trim();

    if (trimmed === "") {
      // Em bloco de código indentado, linhas em branco não encerram o bloco.
      if (!indentCode) flushPara();
      continue;
    }

    const indent = line.length - line.trimStart().length;

    // Código indentado (4 espaços ou tab): só fora de parágrafo e de lista.
    if (indent >= 4 || line.startsWith("\t")) {
      if (indentCode) {
        indentCode.has = true;
        continue;
      }
      if (para.length === 0 && !listCtx) {
        indentCode = { has: true };
        continue;
      }
    } else if (indentCode) {
      closeIndent();
    }

    // Cerca de código.
    const f = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
    if (f && !(f[1][0] === "`" && f[2].includes("`"))) {
      flushPara();
      if (indent === 0) listCtx = false;
      fence = { ch: f[1][0], len: f[1].length, has: false };
      continue;
    }

    // Título setext: linha de `===` ou `---` logo abaixo de um parágrafo.
    if (paraKind === "p" && indent < 4 && isSetextUnderline(trimmed)) {
      emit(inline(para.join(" ")), true);
      para = [];
      paraKind = null;
      continue;
    }

    // Régua horizontal.
    if (indent < 4 && isHr(trimmed)) {
      flushPara();
      listCtx = false;
      continue;
    }

    // Título ATX.
    const h = headingContent(line);
    if (h !== null) {
      flushPara();
      listCtx = false;
      emit(inline(h), true);
      continue;
    }

    // Tabela GFM: linha com `|` seguida da linha de delimitadores.
    if (line.includes("|") && i + 1 < lines.length && isTableDelimiter(stripQuote(lines[i + 1]))) {
      flushPara();
      if (indent === 0) listCtx = false;
      let j = i;
      while (j < lines.length) {
        const row = stripQuote(lines[j]);
        if (j === i + 1) {
          j++;
          continue;
        }
        if (row.trim() === "" || !row.includes("|")) break;
        const cells = splitTableRow(row)
          .map((c) => inline(c))
          .filter((c) => c !== "");
        emit(cells.length > 0 ? `${cells.join(", ")}.` : "", true);
        j++;
      }
      i = j - 1;
      continue;
    }

    // Definição de link de referência / nota de rodapé: não é fala.
    if (para.length === 0 && /^ {0,3}\[[^[\]]+\]:[ \t]*\S/.test(line)) continue;

    // Item de lista (um por frase).
    const item = listItem(trimmed);
    if (item !== null && (paraKind !== "p" || item.interrupts)) {
      flushPara();
      listCtx = true;
      para = [item.content];
      paraKind = "item";
      continue;
    }

    if (indent === 0) listCtx = false;
    if (paraKind === null) paraKind = "p";
    para.push(trimmed);
  }

  if (fence && (fence as { has: boolean }).has) blocks.push({ text: CODE_SPOKEN, sentence: true });
  closeIndent();
  flushPara();

  // Pausa entre blocos: todo bloco que não é o último termina em pontuação; títulos, itens e
  // linhas de tabela também quando são o último.
  const END_PUNCT = /[.!?…:;]["'”’)\]»]*$/;
  const parts = blocks.map((b, idx) => {
    const needsEnd = b.sentence || idx < blocks.length - 1;
    return needsEnd && !END_PUNCT.test(b.text) ? `${b.text}.` : b.text;
  });

  const out = collapse(parts.join(" "));
  return hasContent(out) ? out : "";
}

export function selectSpeakable(
  cells: Cell[],
  start: number,
  end: number,
): { items: { n: number; text: string }[]; skipped: number[]; chars: number } {
  const items: { n: number; text: string }[] = [];
  const skipped: number[] = [];
  let chars = 0;
  const from = Math.max(1, start);
  const to = Math.min(cells.length, end);
  for (let n = from; n <= to; n++) {
    const text = toSpeakable(cells[n - 1].texto);
    if (text === "") {
      skipped.push(n);
    } else {
      items.push({ n, text });
      chars += text.length;
    }
  }
  return { items, skipped, chars };
}
