import type { Cell } from "../content-schema";

export type CardSource = {
  cellId: string | null;
  pergunta: string;
};

/**
 * Captura o texto selecionado numa célula ou recorre ao clipboard se não houver seleção.
 * @param selection A seleção atual da janela (window.getSelection()).
 * @param editingId O id da célula que está atualmente em edição (textarea).
 * @param focusedId O id da última célula que recebeu foco.
 * @param cells A lista de células do documento.
 */
export async function captureCardSource(
  selection: Selection | null,
  editingId: string | null,
  focusedId: string | null,
  cells: Cell[]
): Promise<CardSource> {
  const textarea = document.activeElement;
  if (textarea instanceof HTMLTextAreaElement) {
    const id = textarea.closest("[data-cell-id]")?.getAttribute("data-cell-id");
    if (id && cells.some((cell) => cell.id === id) && textarea.selectionEnd > textarea.selectionStart) {
      return { cellId: id, pergunta: textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) };
    }
  }
  // 1. Tentar obter texto da seleção
  let selectedText = "";
  let sourceCellId: string | null = null;

  if (selection && !selection.isCollapsed) {
    const text = selection.toString().trim();
    if (text) {
      selectedText = text;
      // Verificar se a seleção está dentro de uma célula renderizada [data-cell-id]
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer as Node;
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      const cellElement = element?.closest("[data-cell-id]");
      if (cellElement) {
        sourceCellId = cellElement.getAttribute("data-cell-id");
      }
    }
  }

  if (!cells.some((cell) => cell.id === sourceCellId)) {
    selectedText = "";
    sourceCellId = null;
  }
  // 2. Se não houve seleção válida, tentar usar a célula em edição ou focada
  if (!selectedText) {
    const targetId = [editingId, focusedId].find((id) => cells.some((cell) => cell.id === id));
    if (targetId) {
      sourceCellId = targetId;
      // Tentar ler do clipboard
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          selectedText = await navigator.clipboard.readText();
        }
      } catch {
        // Clipboard indisponível ou negado
      }
    }
  }

  return {
    cellId: sourceCellId,
    pergunta: selectedText,
  };
}