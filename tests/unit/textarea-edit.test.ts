import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEditToTextarea } from "@/features/estudo/editor/textarea-edit";

function makeTextarea(value: string, start: number, end = start) {
  const textarea = document.createElement("textarea");
  document.body.appendChild(textarea);
  textarea.value = value;
  textarea.setSelectionRange(start, end);
  return textarea;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (document as { execCommand?: unknown }).execCommand;
});

describe("applyEditToTextarea — sem execCommand", () => {
  it("grava value, chama onChange e restaura a seleção", () => {
    const textarea = makeTextarea("ola mundo", 4, 9);
    const onChange = vi.fn();

    applyEditToTextarea(textarea, { text: "ola **mundo**", selStart: 6, selEnd: 11 }, onChange);

    expect(textarea.value).toBe("ola **mundo**");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ola **mundo**");
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(11);
  });

  it("usa o caminho alternativo quando execCommand devolve false", () => {
    const textarea = makeTextarea("abc", 3);
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    const onChange = vi.fn();

    applyEditToTextarea(textarea, { text: "abc\n\n---", selStart: 8, selEnd: 8 }, onChange);

    expect(execCommand).toHaveBeenCalled();
    expect(textarea.value).toBe("abc\n\n---");
    expect(onChange).toHaveBeenCalledWith("abc\n\n---");
    expect(textarea.selectionStart).toBe(8);
    expect(textarea.selectionEnd).toBe(8);
  });
});

describe("applyEditToTextarea — com execCommand", () => {
  it("seleciona só o trecho que mudou e chama insertText com ele", () => {
    const textarea = makeTextarea("ola mundo fim", 4, 9);
    const selections: Array<[number, number]> = [];
    const execCommand = vi.fn((command: string, _ui: boolean, inserted: string) => {
      selections.push([textarea.selectionStart, textarea.selectionEnd]);
      const { selectionStart, selectionEnd, value } = textarea;
      textarea.value = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
      return command === "insertText";
    });
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    const onChange = vi.fn();

    applyEditToTextarea(textarea, { text: "ola **mundo** fim", selStart: 6, selEnd: 11 }, onChange);

    expect(execCommand).toHaveBeenCalledWith("insertText", false, "**mundo**");
    // O trecho trocado vai do primeiro ao último caractere diferente.
    expect(selections[0]).toEqual([4, 9]);
    expect(textarea.value).toBe("ola **mundo** fim");
    // O evento nativo de input é quem avisa o React; não chama onChange de novo.
    expect(onChange).not.toHaveBeenCalled();
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(11);
  });

  it("remoção pura insere texto vazio no trecho removido", () => {
    const textarea = makeTextarea("## ## titulo", 6);
    const selections: Array<[number, number]> = [];
    const execCommand = vi.fn((_command: string, _ui: boolean, inserted: string) => {
      selections.push([textarea.selectionStart, textarea.selectionEnd]);
      const { selectionStart, selectionEnd, value } = textarea;
      textarea.value = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
      return true;
    });
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });

    applyEditToTextarea(textarea, { text: "## titulo", selStart: 3, selEnd: 3 }, vi.fn());

    expect(execCommand).toHaveBeenCalledWith("insertText", false, "");
    // Prefixo e sufixo comuns não se sobrepõem: o trecho removido tem 3 caracteres.
    expect(selections[0]![1] - selections[0]![0]).toBe(3);
    expect(textarea.value).toBe("## titulo");
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });
});
