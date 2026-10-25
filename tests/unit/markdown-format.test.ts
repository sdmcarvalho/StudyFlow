import { describe, expect, it } from "vitest";

import {
  applyFormat,
  imageMarkdown,
  type Edit,
  type FormatAction,
} from "@/features/estudo/editor/markdown-format";

function run(text: string, start: number, end: number, action: FormatAction): Edit {
  return applyFormat(text, start, end, action);
}

function selected(edit: Edit): string {
  return edit.text.slice(edit.selStart, edit.selEnd);
}

const TABLE = "| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|  |  |  |";

describe.each([
  ["bold", "**"],
  ["italic", "*"],
  ["strike", "~~"],
] as const)("%s", (action, marker) => {
  it("envolve a seleção e a mantém selecionada", () => {
    const edit = run("ola", 0, 3, action);
    expect(edit.text).toBe(`${marker}ola${marker}`);
    expect(selected(edit)).toBe("ola");
  });

  it("desfaz quando os marcadores cercam a seleção", () => {
    const text = `${marker}ola${marker}`;
    const edit = run(text, marker.length, marker.length + 3, action);
    expect(edit.text).toBe("ola");
    expect(selected(edit)).toBe("ola");
  });

  it("desfaz quando a própria seleção inclui os marcadores", () => {
    const text = `${marker}ola${marker}`;
    const edit = run(text, 0, text.length, action);
    expect(edit.text).toBe("ola");
    expect(selected(edit)).toBe("ola");
  });

  it("sem seleção em texto vazio insere o modelo com 'texto' selecionado", () => {
    const edit = run("", 0, 0, action);
    expect(edit.text).toBe(`${marker}texto${marker}`);
    expect(selected(edit)).toBe("texto");
  });

  it("sem seleção no meio de uma palavra insere na posição do cursor", () => {
    const edit = run("abcd", 2, 2, action);
    expect(edit.text).toBe(`ab${marker}texto${marker}cd`);
    expect(selected(edit)).toBe("texto");
  });

  it("envolve só a seleção no meio do texto", () => {
    const edit = run("um dois tres", 3, 7, action);
    expect(edit.text).toBe(`um ${marker}dois${marker} tres`);
    expect(selected(edit)).toBe("dois");
  });
});

describe("negrito versus itálico", () => {
  it("*ola* selecionado não conta como negrito: envolve", () => {
    const edit = run("*ola*", 0, 5, "bold");
    expect(edit.text).toBe("***ola***");
    expect(selected(edit)).toBe("*ola*");
  });

  it("*ola* com a seleção só em ola não conta como negrito: envolve", () => {
    const edit = run("*ola*", 1, 4, "bold");
    expect(edit.text).toBe("***ola***");
    expect(selected(edit)).toBe("ola");
  });

  it("**ola** selecionado não conta como itálico: envolve", () => {
    const edit = run("**ola**", 0, 7, "italic");
    expect(edit.text).toBe("***ola***");
    expect(selected(edit)).toBe("**ola**");
  });

  it("**ola** com a seleção só em ola não conta como itálico: envolve", () => {
    const edit = run("**ola**", 2, 5, "italic");
    expect(edit.text).toBe("***ola***");
    expect(selected(edit)).toBe("ola");
  });

  it("negrito sobre ***ola*** desfaz só o negrito", () => {
    const edit = run("***ola***", 3, 6, "bold");
    expect(edit.text).toBe("*ola*");
    expect(selected(edit)).toBe("ola");
  });

  it("itálico sobre ***ola*** desfaz só o itálico", () => {
    const edit = run("***ola***", 3, 6, "italic");
    expect(edit.text).toBe("**ola**");
    expect(selected(edit)).toBe("ola");
  });
});

describe("títulos", () => {
  it("h2 prefixa a linha", () => {
    const edit = run("Titulo", 0, 0, "h2");
    expect(edit.text).toBe("## Titulo");
    expect(selected(edit)).toBe("## Titulo");
  });

  it("h1 e h3 usam um e três #", () => {
    expect(run("T", 0, 0, "h1").text).toBe("# T");
    expect(run("T", 0, 0, "h3").text).toBe("### T");
  });

  it("repetir o mesmo nível tira o prefixo", () => {
    const edit = run("## Titulo", 0, 0, "h2");
    expect(edit.text).toBe("Titulo");
    expect(selected(edit)).toBe("Titulo");
  });

  it("outro nível troca o prefixo", () => {
    expect(run("## Titulo", 0, 0, "h3").text).toBe("### Titulo");
    expect(run("### Titulo", 0, 0, "h1").text).toBe("# Titulo");
  });

  it("a posição do cursor no meio da linha vale para a linha inteira", () => {
    expect(run("abc\nTitulo\nxyz", 7, 7, "h2").text).toBe("abc\n## Titulo\nxyz");
  });

  it("seleção de 2 linhas prefixa as duas", () => {
    const edit = run("um\ndois\ntres", 1, 5, "h2");
    expect(edit.text).toBe("## um\n## dois\ntres");
    expect(selected(edit)).toBe("## um\n## dois");
  });

  it("seleção que termina logo após uma quebra não inclui a linha seguinte", () => {
    const edit = run("um\ndois\ntres", 0, 3, "h1");
    expect(edit.text).toBe("# um\ndois\ntres");
  });

  it("linha vazia no meio da seleção não ganha prefixo", () => {
    const edit = run("um\n\ntres", 0, 8, "h1");
    expect(edit.text).toBe("# um\n\n# tres");
  });

  it("não tira o prefixo quando apenas parte das linhas tem o nível", () => {
    const edit = run("## um\ndois", 0, 10, "h2");
    expect(edit.text).toBe("## um\n## dois");
  });

  it("linha vazia isolada ganha o prefixo", () => {
    expect(run("", 0, 0, "h1").text).toBe("# ");
  });
});

describe("linha horizontal", () => {
  it("no fim do texto vira linha própria com linhas em branco depois", () => {
    const edit = run("a", 1, 1, "hr");
    expect(edit.text).toBe("a\n\n---\n\n");
    expect(edit.selStart).toBe(edit.text.length);
    expect(edit.selEnd).toBe(edit.text.length);
  });

  it("no meio de um texto fica em linha própria com linha em branco antes e depois", () => {
    const edit = run("ab cd", 2, 2, "hr");
    expect(edit.text).toBe("ab\n\n---\n\n cd");
    expect(edit.selStart).toBe(edit.text.indexOf(" cd"));
    expect(edit.selEnd).toBe(edit.selStart);
  });

  it("em texto vazio não adiciona linha em branco antes", () => {
    expect(run("", 0, 0, "hr").text).toBe("---\n\n");
  });

  it("não duplica linhas em branco que já existem", () => {
    const edit = run("a\n\nb", 3, 3, "hr");
    expect(edit.text).toBe("a\n\n---\n\nb");
    expect(edit.selStart).toBe(edit.text.indexOf("b"));
  });

  it("completa apenas a quebra que falta", () => {
    expect(run("a\nb", 2, 2, "hr").text).toBe("a\n\n---\n\nb");
  });

  it("insere depois da seleção sem apagá-la", () => {
    const edit = run("abc", 0, 3, "hr");
    expect(edit.text).toBe("abc\n\n---\n\n");
  });
});

describe("listas e citação", () => {
  const cases = [
    ["ul", "- a\n- b\n- c"],
    ["ol", "1. a\n2. b\n3. c"],
    ["task", "- [ ] a\n- [ ] b\n- [ ] c"],
    ["quote", "> a\n> b\n> c"],
  ] as const;

  it.each(cases)("%s prefixa 3 linhas selecionadas", (action, expected) => {
    const edit = run("a\nb\nc", 0, 5, action);
    expect(edit.text).toBe(expected);
    expect(selected(edit)).toBe(expected);
  });

  it.each(cases)("%s tira quando todas as linhas já têm", (action, prefixed) => {
    const edit = run(prefixed, 0, prefixed.length, action);
    expect(edit.text).toBe("a\nb\nc");
    expect(selected(edit)).toBe("a\nb\nc");
  });

  it("prefixa as linhas tocadas pela seleção, mesmo parcial", () => {
    expect(run("a\nb\nc", 3, 3, "ul").text).toBe("a\n- b\nc");
    expect(run("a\nb\nc", 1, 4, "ul").text).toBe("- a\n- b\nc");
  });

  it("seleção que termina logo após quebra não inclui a linha seguinte", () => {
    expect(run("a\nb\nc", 0, 4, "ul").text).toBe("- a\n- b\nc");
  });

  it("linha vazia no meio da seleção não ganha prefixo", () => {
    expect(run("a\n\nb", 0, 4, "ul").text).toBe("- a\n\n- b");
  });

  it("linha vazia não conta para decidir se todas já têm o prefixo", () => {
    const edit = run("- a\n\n- b", 0, 8, "ul");
    expect(edit.text).toBe("a\n\nb");
  });

  it("numeração da lista ordenada não consome número na linha vazia", () => {
    expect(run("a\n\nb", 0, 4, "ol").text).toBe("1. a\n\n2. b");
  });

  it("ul sobre linhas numeradas troca o marcador", () => {
    expect(run("1. a\n2. b", 0, 9, "ul").text).toBe("- a\n- b");
  });

  it("ol sobre linhas com marcador troca por numeração", () => {
    expect(run("- a\n- b", 0, 7, "ol").text).toBe("1. a\n2. b");
  });

  it("task sobre '- x' troca por '- [ ] x'", () => {
    const edit = run("- x", 0, 3, "task");
    expect(edit.text).toBe("- [ ] x");
    expect(selected(edit)).toBe("- [ ] x");
  });

  it("ul sobre tarefa troca por marcador simples", () => {
    expect(run("- [ ] x", 0, 7, "ul").text).toBe("- x");
  });

  it("tarefa marcada também é tirada pelo botão de tarefas", () => {
    expect(run("- [x] x", 0, 7, "task").text).toBe("x");
  });

  it("preserva o recuo das listas aninhadas", () => {
    expect(run("  a", 0, 3, "ul").text).toBe("  - a");
    expect(run("  - a", 0, 5, "ul").text).toBe("  a");
  });

  it("linha vazia isolada ganha o marcador", () => {
    expect(run("", 0, 0, "ul").text).toBe("- ");
  });
});

describe("link", () => {
  it("usa a seleção como texto e seleciona 'url'", () => {
    const edit = run("site", 0, 4, "link");
    expect(edit.text).toBe("[site](url)");
    expect(selected(edit)).toBe("url");
  });

  it("sem seleção insere o modelo com 'texto' selecionado", () => {
    const edit = run("", 0, 0, "link");
    expect(edit.text).toBe("[texto](url)");
    expect(selected(edit)).toBe("texto");
  });

  it("sem seleção no meio do texto insere no cursor", () => {
    const edit = run("ab", 1, 1, "link");
    expect(edit.text).toBe("a[texto](url)b");
    expect(selected(edit)).toBe("texto");
  });
});

describe("código", () => {
  it("seleção de uma linha vira código em linha", () => {
    const edit = run("x", 0, 1, "code");
    expect(edit.text).toBe("`x`");
    expect(selected(edit)).toBe("x");
  });

  it("vazio insere o modelo com 'código' selecionado", () => {
    const edit = run("", 0, 0, "code");
    expect(edit.text).toBe("`código`");
    expect(selected(edit)).toBe("código");
  });

  it("duas linhas viram bloco com crases em linhas próprias", () => {
    const edit = run("a\nb", 0, 3, "code");
    expect(edit.text).toBe("```\na\nb\n```\n\n");
    expect(edit.selStart).toBe(edit.text.length);
    expect(edit.selEnd).toBe(edit.text.length);
  });

  it("bloco no meio do texto fica com linhas em branco em volta", () => {
    const edit = run("antes\na\nb\ndepois", 6, 9, "code");
    expect(edit.text).toBe("antes\n\n```\na\nb\n```\n\ndepois");
    expect(edit.selStart).toBe(edit.text.indexOf("depois"));
  });

  it("seleção de uma linha com a quebra final continua em linha", () => {
    expect(run("x\ny", 0, 2, "code").text).toBe("`x`\ny");
  });
});

describe("fórmula", () => {
  it("seleção de uma linha vira fórmula em linha", () => {
    const edit = run("x", 0, 1, "formula");
    expect(edit.text).toBe("$x$");
    expect(selected(edit)).toBe("x");
  });

  it("vazio insere o modelo com 'fórmula' selecionado", () => {
    const edit = run("", 0, 0, "formula");
    expect(edit.text).toBe("$fórmula$");
    expect(selected(edit)).toBe("fórmula");
  });

  it("duas linhas viram bloco $$", () => {
    const edit = run("a\nb", 0, 3, "formula");
    expect(edit.text).toBe("$$\na\nb\n$$\n\n");
    expect(edit.selStart).toBe(edit.text.length);
    expect(edit.selEnd).toBe(edit.text.length);
  });
});

describe("tabela", () => {
  it("insere a estrutura de 3 colunas em linha própria", () => {
    const edit = run("", 0, 0, "table");
    expect(edit.text).toBe(`${TABLE}\n\n`);
    expect(edit.selStart).toBe(edit.text.length);
    expect(edit.selEnd).toBe(edit.text.length);
  });

  it("no meio do texto tem linhas em branco antes e depois", () => {
    const edit = run("ab\ncd", 2, 2, "table");
    expect(edit.text).toBe(`ab\n\n${TABLE}\n\ncd`);
    expect(edit.selStart).toBe(edit.text.indexOf("cd"));
  });
});

describe("imageMarkdown", () => {
  it("monta a sintaxe de imagem", () => {
    expect(imageMarkdown("foto", "imagens/a.png")).toBe("![foto](imagens/a.png)");
  });
});
