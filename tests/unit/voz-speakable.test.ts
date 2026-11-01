import { describe, expect, it } from "vitest";
import { selectSpeakable, toSpeakable } from "@/features/voz/speakable";
import { MAX_CELL_CHARS } from "@/features/estudo/content-schema";

describe("toSpeakable — texto simples", () => {
  it("texto puro fica como está", () => {
    expect(toSpeakable("Olá, mundo")).toBe("Olá, mundo");
  });

  it("vazio e só espaços viram ''", () => {
    expect(toSpeakable("")).toBe("");
    expect(toSpeakable("  \n\t \n")).toBe("");
  });

  it("quebras de linha viram espaço e espaços repetidos colapsam", () => {
    expect(toSpeakable("linha 1\nlinha 2\r\nlinha   3\rlinha 4")).toBe(
      "linha 1 linha 2 linha 3 linha 4",
    );
  });

  it("parágrafos distintos ganham pausa (ponto) entre si", () => {
    expect(toSpeakable("Primeiro\n\nSegundo")).toBe("Primeiro. Segundo");
    expect(toSpeakable("Primeiro!\n\nSegundo")).toBe("Primeiro! Segundo");
  });
});

describe("toSpeakable — ênfase, links, imagens, HTML", () => {
  it("remove marcadores de ênfase", () => {
    expect(toSpeakable("**negrito**")).toBe("negrito");
    expect(toSpeakable("_it_")).toBe("it");
    expect(toSpeakable("*it* e __forte__ e ~~riscado~~")).toBe("it e forte e riscado");
    expect(toSpeakable("***tudo***")).toBe("tudo");
  });

  it("sublinhado dentro de palavra vira espaço (identificadores)", () => {
    expect(toSpeakable("use snake_case_name")).toBe("use snake case name");
  });

  it("asterisco com escape é mantido", () => {
    expect(toSpeakable("2 \\* 3")).toBe("2 * 3");
  });

  it("link vira só o texto", () => {
    expect(toSpeakable("veja [o site](https://exemplo.com/a_b) agora")).toBe("veja o site agora");
    expect(toSpeakable("[ref][1]")).toBe("ref");
    expect(toSpeakable("[wiki](https://x.org/a_(b)) fim")).toBe("wiki fim");
  });

  it("imagem some", () => {
    expect(toSpeakable("![x](a.png)")).toBe("");
    expect(toSpeakable("antes ![legenda](a.png \"t\") depois")).toBe("antes depois");
    expect(toSpeakable("![x][img]")).toBe("");
  });

  it("imagem dentro de link some e o link some junto", () => {
    expect(toSpeakable("[![logo](a.png)](https://x.com)")).toBe("");
  });

  it("remove tags HTML mas mantém o texto", () => {
    expect(toSpeakable("<b>x</b>")).toBe("x");
    expect(toSpeakable("a<br>b")).toBe("a b");
    expect(toSpeakable('<div class="c">olá</div>')).toBe("olá");
    expect(toSpeakable("<div\n  class=\"c\">olá</div>")).toBe("olá");
  });

  it("remove comentários, script e style com o conteúdo", () => {
    expect(toSpeakable("a <!-- oculto --> b")).toBe("a b");
    expect(toSpeakable("a\n<!--\noculto\n\ncontinua\n-->\nb")).toBe("a b");
    expect(toSpeakable("a<script>alert(1)</script>b")).toBe("ab");
    expect(toSpeakable("<style>\n.x { color: red }\n</style>\ntexto")).toBe("texto");
    expect(toSpeakable("texto\n<!-- nunca fecha\nmais texto")).toBe("texto");
  });

  it("autolink e e-mail entre <> somem", () => {
    expect(toSpeakable("veja <https://x.com/a> ok")).toBe("veja ok");
    expect(toSpeakable("fale <a@b.com> ok")).toBe("fale ok");
  });

  it("sinais de menor e maior soltos permanecem", () => {
    expect(toSpeakable("5 < 6 e 7 > 2")).toBe("5 < 6 e 7 > 2");
  });

  it("decodifica entidades HTML comuns", () => {
    expect(toSpeakable("a&nbsp;b &amp; c &lt;d&gt; &#65; &#x42; &#99999999;")).toBe(
      "a b & c <d> A B &#99999999;",
    );
  });

  it("código inline mantém o texto sem crases e protege o conteúdo", () => {
    expect(toSpeakable("use `npm install` aqui")).toBe("use npm install aqui");
    expect(toSpeakable("`a*b*c` e `<b>x</b>`")).toBe("a*b*c e <b>x</b>");
  });

  it("matemática $...$ não tem tratamento especial: fica como texto", () => {
    expect(toSpeakable("vale $x + 1$ aqui")).toBe("vale $x + 1$ aqui");
    // sem letras ou dígitos sobrando, a célula inteira é descartada
    expect(toSpeakable("$$")).toBe("");
    expect(toSpeakable("$$\n$$")).toBe("");
  });
});

describe("toSpeakable — blocos", () => {
  it("título vira frase própria", () => {
    expect(toSpeakable("# Título")).toBe("Título.");
    expect(toSpeakable("## Sub título ##\ntexto")).toBe("Sub título. texto");
    expect(toSpeakable("###### Seis")).toBe("Seis.");
    expect(toSpeakable("# Pergunta?")).toBe("Pergunta?");
  });

  it("#hashtag sem espaço não é título", () => {
    expect(toSpeakable("#hashtag")).toBe("#hashtag");
  });

  it("título setext", () => {
    expect(toSpeakable("Título\n======\ntexto")).toBe("Título. texto");
    expect(toSpeakable("Subtítulo\n---\ntexto")).toBe("Subtítulo. texto");
  });

  it("régua horizontal é ignorada", () => {
    expect(toSpeakable("a\n\n---\n\nb")).toBe("a. b");
    expect(toSpeakable("a\n\n***\n\nb")).toBe("a. b");
    expect(toSpeakable("a\n\n- - -\n\nb")).toBe("a. b");
  });

  it("lista não ordenada: uma frase por item, na ordem", () => {
    expect(toSpeakable("- a\n- b")).toBe("a. b.");
    expect(toSpeakable("* a\n+ b")).toBe("a. b.");
  });

  it("lista ordenada", () => {
    expect(toSpeakable("1. a\n2. b\n10) c")).toBe("a. b. c.");
  });

  it("itens aninhados e lista de tarefas", () => {
    expect(toSpeakable("- a\n  - b\n    - c\n- d")).toBe("a. b. c. d.");
    expect(toSpeakable("- [ ] fazer\n- [x] feito")).toBe("fazer. feito.");
  });

  it("número com ponto no meio de um parágrafo não vira item", () => {
    expect(toSpeakable("O resultado foi\n42. Fim")).toBe("O resultado foi 42. Fim");
    expect(toSpeakable("Texto\n1. primeiro\n2. segundo")).toBe("Texto. primeiro. segundo.");
  });

  it("marcador sem conteúdo não é item", () => {
    expect(toSpeakable("-\n- a")).toBe("a.");
  });

  it("item com continuação na linha seguinte vira uma frase só", () => {
    expect(toSpeakable("- um item\n  que continua\n- outro")).toBe("um item que continua. outro.");
  });

  it("item que já termina em pontuação não ganha outro ponto", () => {
    expect(toSpeakable("- será?\n- sim!")).toBe("será? sim!");
    expect(toSpeakable('- ele disse "ok."')).toBe('ele disse "ok."');
  });

  it("citação em bloco", () => {
    expect(toSpeakable("> citação aqui")).toBe("citação aqui");
    expect(toSpeakable("> a\n> b\n>\n> c")).toBe("a b. c");
    expect(toSpeakable("> # Título\n> - item")).toBe("Título. item.");
    expect(toSpeakable(">> aninhada")).toBe("aninhada");
  });

  it("tabela GFM: cada linha vira uma frase com vírgulas", () => {
    const md = "| Nome | Idade |\n|------|:-----:|\n| Ana | 30 |\n| Bia | 25 |";
    expect(toSpeakable(md)).toBe("Nome, Idade. Ana, 30. Bia, 25.");
  });

  it("tabela sem barras nas pontas e com texto depois", () => {
    expect(toSpeakable("A | B\n--|--\n1 | 2\n\ndepois")).toBe("A, B. 1, 2. depois");
  });

  it("tabela ignora células vazias e formatação", () => {
    expect(toSpeakable("| **A** | |\n|---|---|\n| [x](u) | `c` |")).toBe("A. x, c.");
  });

  it("linha com barra sem delimitador não é tabela", () => {
    expect(toSpeakable("a | b")).toBe("a | b");
  });

  it("bloco de código cercado vira 'trecho de código.'", () => {
    expect(toSpeakable("```\nconst a = 1;\n```")).toBe("trecho de código.");
    expect(toSpeakable("```js\nconst a = 1;\n```")).toBe("trecho de código.");
    expect(toSpeakable("~~~python\nprint(1)\n~~~")).toBe("trecho de código.");
    expect(toSpeakable("antes\n\n```\nx\n\ny\n```\n\ndepois")).toBe(
      "antes. trecho de código. depois",
    );
  });

  it("cerca sem fechamento vai até o fim; cerca maior só fecha com cerca igual ou maior", () => {
    expect(toSpeakable("```\nx\ny")).toBe("trecho de código.");
    expect(toSpeakable("````\n```\nx\n```\n````\ndepois")).toBe("trecho de código. depois");
  });

  it("bloco de código vazio não gera fala", () => {
    expect(toSpeakable("```\n```")).toBe("");
    expect(toSpeakable("```\n\n  \n```")).toBe("");
  });

  it("código indentado vira 'trecho de código.'", () => {
    expect(toSpeakable("texto\n\n    a = 1\n\n    b = 2\n\nfim")).toBe(
      "texto. trecho de código. fim",
    );
  });

  it("indentação dentro de lista não é código", () => {
    expect(toSpeakable("- a\n\n    continua o item\n- b")).toBe("a. continua o item. b.");
  });

  it("definições de link de referência somem", () => {
    expect(toSpeakable("texto [a][1]\n\n[1]: https://x.com")).toBe("texto a");
  });
});

describe("toSpeakable — células sem texto falável (R7)", () => {
  it.each([
    ["só imagem", "![x](a.png)"],
    ["só código", "```\ncódigo\n```".replace("código", "")],
    ["pontos", "..."],
    ["traços", "---"],
    ["exclamação", "!"],
    ["só emoji", "😀"],
    ["emojis e pontuação", "😀 !!! 🎉"],
    ["só HTML", "<div></div>"],
    ["igual", "==="],
    ["só barras", "|||"],
    ["só controle", "\0\u0001\u0002"],
  ])("%s => ''", (_n, md) => {
    expect(toSpeakable(md)).toBe("");
  });

  it("textos curtos com letra ou dígito continuam falaveis", () => {
    expect(toSpeakable("12345")).toBe("12345");
    expect(toSpeakable("a")).toBe("a");
    expect(toSpeakable("(x)")).toBe("(x)");
    expect(toSpeakable("é")).toBe("é");
    expect(toSpeakable("日本語")).toBe("日本語");
    expect(toSpeakable("😀 ok")).toBe("😀 ok");
  });

  it("blocos sem letra/dígito são removidos mesmo ao lado de texto", () => {
    expect(toSpeakable("a\n\n...\n\nb")).toBe("a. b");
  });
});

describe("toSpeakable — sempre uma linha só", () => {
  it("nunca devolve \\n, \\r, \\0 nem espaços repetidos", () => {
    const entradas = [
      "a\nb\r\nc\rd\u2028e\u2029f\u0085g",
      "x\0y",
      "# t\n\n- a\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nc\n```",
      "a\u000bb\u000cc\u0001d",
      "  muito   espaço  \t aqui ",
    ];
    for (const e of entradas) {
      const out = toSpeakable(e);
      expect(out).not.toMatch(/[\n\r\0\u2028\u2029\u0085\u000b\u000c]/);
      expect(out).not.toMatch(/\s\s/);
      expect(out).toBe(out.trim());
    }
    expect(toSpeakable("x\0y")).toBe("xy");
  });
});

describe("toSpeakable — desempenho em células enormes", () => {
  const big = (unit: string) => unit.repeat(Math.ceil(MAX_CELL_CHARS / unit.length)).slice(0, MAX_CELL_CHARS);

  it.each([
    ["*_[](", "*_[]("],
    ["![](", "![]("],
    ["[](", "[]("],
    ["<", "<"],
    ["<a ", "<a "],
    ["`", "`"],
    ["``a", "``a"],
    ["(", "("],
    ["|", "|"],
    ["| a |\n|-|\n", "| a |\n|-|\n"],
    ["espaços", " "],
    ["espaços + x", " "],
    ["_a", "_a"],
    ["*", "*"],
    ["# ", "# "],
    ["> ", "> "],
    ["- ", "- "],
    ["<!--", "<!--"],
    ["[a](b(", "[a](b("],
    ["!\\", "!\\"],
    ["linhas curtas", "a\n"],
    ["itens", "- a\n"],
    ["citações", "> a\n"],
    ["cercas", "```\nx\n"],
    ["recuo", "    a\n"],
    ["setext", "a\n---\n"],
    ["tabela", "a|b\n-|-\n"],
    ["crases", "`a` `"],
    ["&#", "&#"],
  ])("converte 200.000 caracteres de %j em tempo curto", (_n, unit) => {
    const text = _n === "espaços + x" ? " ".repeat(MAX_CELL_CHARS - 1) + "x" : big(unit);
    const t0 = performance.now();
    const out = toSpeakable(text);
    const dt = performance.now() - t0;
    expect(typeof out).toBe("string");
    expect(out).not.toMatch(/[\n\r\0]/);
    expect(dt).toBeLessThan(1500);
  });

  it("uma linha de 200.000 palavras comuns também é rápida", () => {
    const t0 = performance.now();
    const out = toSpeakable("palavra ".repeat(25_000));
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(out.startsWith("palavra palavra")).toBe(true);
  });
});

describe("selectSpeakable", () => {
  const cells = [
    { id: "a", texto: "Primeira" },
    { id: "b", texto: "![x](a.png)" },
    { id: "c", texto: "# Terceira" },
    { id: "d", texto: "" },
    { id: "e", texto: "Quinta" },
  ];

  it("seleciona o intervalo (1-based, inclusivo), mantém n e pula células vazias", () => {
    const r = selectSpeakable(cells, 2, 5);
    expect(r.items).toEqual([
      { n: 3, text: "Terceira." },
      { n: 5, text: "Quinta" },
    ]);
    expect(r.skipped).toEqual([2, 4]);
    expect(r.chars).toBe("Terceira.".length + "Quinta".length);
  });

  it("intervalo completo", () => {
    const r = selectSpeakable(cells, 1, 5);
    expect(r.items.map((i) => i.n)).toEqual([1, 3, 5]);
    expect(r.skipped).toEqual([2, 4]);
    expect(r.chars).toBe("Primeira".length + "Terceira.".length + "Quinta".length);
  });

  it("todas sem texto: items vazio e chars 0", () => {
    const r = selectSpeakable(cells, 2, 2);
    expect(r).toEqual({ items: [], skipped: [2], chars: 0 });
    expect(selectSpeakable(cells, 4, 4)).toEqual({ items: [], skipped: [4], chars: 0 });
  });

  it("não lê fora da lista de células", () => {
    const r = selectSpeakable(cells, 4, 99);
    expect(r.items).toEqual([{ n: 5, text: "Quinta" }]);
    expect(r.skipped).toEqual([4]);
    expect(selectSpeakable(cells, 0, 1).items).toEqual([{ n: 1, text: "Primeira" }]);
    expect(selectSpeakable([], 1, 3)).toEqual({ items: [], skipped: [], chars: 0 });
  });
});
