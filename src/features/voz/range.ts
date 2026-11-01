// Validação do intervalo de células da Voz. Módulo puro (sem banco, sem fs, sem React):
// usado pela tela, pela página `ler` e pelas rotas, sempre com as mesmas mensagens.

export const MSG_FEW_CELLS = "O estudo precisa de pelo menos 2 células para usar a Voz.";

export type RangeErrors = { start?: string; end?: string };

const MSG_NOT_INT = "Use um número inteiro.";
const MSG_EMPTY_START = "Informe a célula inicial.";
const MSG_EMPTY_END = "Informe a célula final.";

type Parsed = { kind: "ok"; value: number } | { kind: "empty" } | { kind: "invalid" };

// Número (inteiro) ou texto só com dígitos ASCII depois do trim. "1e2", "2.5", "-1", "1,5",
// "+3" e afins são "invalid"; null/undefined/"" são "empty".
function parseCell(raw: unknown): Parsed {
  if (raw === undefined || raw === null) return { kind: "empty" };
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? { kind: "ok", value: raw } : { kind: "invalid" };
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return { kind: "empty" };
    if (!/^\d+$/.test(t)) return { kind: "invalid" };
    // Textos gigantes viram Infinity: são inteiros, mas a conferência de faixa os recusa.
    return { kind: "ok", value: Number(t) };
  }
  return { kind: "invalid" };
}

export function validateRange(
  start: unknown,
  end: unknown,
  total: number,
): { ok: true; start: number; end: number } | { ok: false; errors: RangeErrors } {
  if (!Number.isInteger(total) || total < 2) {
    return { ok: false, errors: { start: MSG_FEW_CELLS, end: MSG_FEW_CELLS } };
  }

  const errors: RangeErrors = {};
  const s = parseCell(start);
  const e = parseCell(end);

  let startValue: number | null = null;
  if (s.kind === "empty") errors.start = MSG_EMPTY_START;
  else if (s.kind === "invalid") errors.start = MSG_NOT_INT;
  else if (s.value < 1 || s.value > total - 1) {
    errors.start = `A célula inicial deve estar entre 1 e ${total - 1}.`;
  } else startValue = s.value;

  // Com a inicial inválida, a final só é conferida contra a faixa mais larga (2 a N).
  const minEnd = startValue === null ? 2 : startValue + 1;
  let endValue: number | null = null;
  if (e.kind === "empty") errors.end = MSG_EMPTY_END;
  else if (e.kind === "invalid") errors.end = MSG_NOT_INT;
  else if (e.value < minEnd || e.value > total) {
    errors.end = `A célula final deve estar entre ${minEnd} e ${total}.`;
  } else endValue = e.value;

  if (startValue === null || endValue === null) return { ok: false, errors };
  return { ok: true, start: startValue, end: endValue };
}

export function defaultRange(total: number): { start: number; end: number } {
  return { start: 1, end: total };
}

// Ao mudar a inicial: a final só muda se ficar <= inicial.
export function adjustEnd(start: number, end: number, total: number): number {
  return end > start ? end : Math.min(start + 1, total);
}

const MAX_DESCRIPTION = 80;
// Caracteres inválidos em nome de arquivo no Windows e controles (inclui \0, \n, \t).
const INVALID_FILE_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;

export function audioFileName(descricao: string, start: number, end: number): string {
  // Trunca ANTES de compor (por pontos de código, para não partir um par substituto).
  const cut = Array.from(descricao.trim()).slice(0, MAX_DESCRIPTION).join("").trim();
  const base = cut === "" ? "Voz" : cut.replace(INVALID_FILE_CHARS, "-");
  return `${base} - células ${start} a ${end}.mp3`;
}
