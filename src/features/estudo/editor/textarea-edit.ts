import type { Edit } from "./markdown-format";

/**
 * Aplica uma edição de `applyFormat` na textarea. Troca só o trecho que mudou com
 * `execCommand('insertText')`, que entra no histórico do navegador (Ctrl+Z). Quando o
 * navegador não suporta o comando, grava `value` e avisa por `onChange`.
 */
export function applyEditToTextarea(
  textarea: HTMLTextAreaElement,
  edit: Edit,
  onChange: (value: string) => void,
): void {
  const before = textarea.value;
  const after = edit.text;

  if (before !== after) {
    const maxCommon = Math.min(before.length, after.length);
    let prefix = 0;
    while (prefix < maxCommon && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < maxCommon - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix++;
    }
    const inserted = after.slice(prefix, after.length - suffix);

    textarea.focus();
    textarea.setSelectionRange(prefix, before.length - suffix);
    if (!insertText(inserted) || textarea.value !== after) {
      // Sem suporte (ou o navegador ignorou o comando): grava direto.
      textarea.value = after;
      onChange(after);
    }
  }

  textarea.setSelectionRange(edit.selStart, edit.selEnd);
}

function insertText(inserted: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  try {
    return document.execCommand("insertText", false, inserted);
  } catch {
    return false;
  }
}
