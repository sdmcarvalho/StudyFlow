# StudyFlow — Editor de células em Markdown

Data: 2026-10-25
Status: aguardando revisão
Base: `docs/superpowers/specs/2026-10-25-studyflow-estrutura-design.md` (estrutura do projeto e tela Estudo, já implementadas).

## 1. Objetivo e contexto

A tela Estudo hoje lista registros (Descrição, Pasta, datas). Esta spec define o **centro do app**: ao clicar numa linha da grade, o editor de documentos abre no lugar da lista. O documento é uma lista ordenada de **células de Markdown**, como no Google Colab, com barra de ferramentas fixa, arrastar/adicionar/excluir células, imagens guardadas numa pasta física do Estudo e salvamento no banco.

### Decisões já tomadas

| Tema | Decisão |
|---|---|
| Onde fica o texto | No banco: coluna `conteudo` (JSON) no `StudyRecord` |
| Pasta | O campo **Pasta** passa a ser o **caminho absoluto da pasta física do Estudo** (ex.: `C:\Teste\Cálculo`) |
| Imagens | Em `<pasta>\imagens\`, referenciadas por caminho relativo no Markdown |
| Motor de edição | `<textarea>` por célula; renderização com `react-markdown` + `remark-gfm` (sem HTML cru) |
| Arrastar | `@dnd-kit` (mouse, toque e teclado) |
| Comportamento | Estilo Colab: células renderizadas, clique abre a edição |
| Incluídos no escopo | Colorização de código, LaTeX, salvamento automático, redimensionar imagens |

### Critérios de sucesso

- Clicar numa linha da grade abre `/estudo/[id]` com o documento daquele Estudo; o menu lateral continua e "Estudo" segue ativo.
- Todos os botões da barra de ferramentas produzem a sintaxe Markdown descrita na seção 6, e Ctrl+Z desfaz o que eles fizeram.
- Adicionar, arrastar (mouse e teclado) e excluir células (com Desfazer) funcionam; o documento nunca fica com zero células.
- Salvar (manual ou automático) persiste o documento; ao recarregar, o conteúdo e a ordem voltam iguais, e a "Data atualização" da grade muda.
- Uma imagem enviada fica em `<pasta>\imagens\`, aparece no preview e continua aparecendo depois de recarregar.
- Nenhuma entrada do usuário consegue ler ou escrever fora de `<pasta>` de um Estudo existente, nem executar HTML ou script no preview.
- O app nunca apaga arquivos do disco.

### Fora de escopo

- Imagens SVG, apagar ou renomear arquivos do disco, mover a pasta quando o Estudo é renomeado.
- Edição colaborativa; com duas abas no mesmo Estudo, a última gravação vence.
- Busca dentro do texto dos documentos (a busca da grade continua em Descrição e Pasta).
- Tema de cores do código além de um tema claro alinhado ao design system.

## 2. Rotas e navegação

- `src/app/(app)/estudo/[id]/page.tsx` (Server Component) carrega o Estudo (`params` é uma Promise no Next 16) e renderiza o editor. Id inexistente, excluído ou de outro usuário mostra "Registro não encontrado" com link de volta para `/estudo`.
- Na grade, a **linha inteira** (tabela) e o **card** (mobile) levam ao editor. A Descrição vira um `Link` real (teclado, abrir em nova aba). Os botões Editar e Excluir não disparam a navegação.
- Cabeçalho do editor: "← Estudo" e a Descrição como título.
- Rotas de imagem:
  - `POST /estudo/[id]/imagens` recebe o envio (multipart).
  - `GET /estudo/[id]/imagens/[arquivo]` devolve a imagem.

## 3. Dados

`StudyRecord` ganha `conteudo String @default("[]")`, JSON `[{ id, texto }]`. Migration nova; registros existentes ficam com `[]`.

Validação (zod) de `conteudo`:

- até **500 células**;
- `id` texto de 1 a 64 caracteres, único dentro do documento;
- `texto` com até **200 000 caracteres**;
- JSON total de até **5 MB**.

Um documento sem células abre com **uma célula vazia**, gravada só no primeiro salvamento.

Ação `saveStudyContent(id: string, cells: unknown): Promise<ActionResult<{ savedAt: string }>>`:

- valida `id` (texto não vazio) e `cells`;
- atualiza onde `{ id, userId, deletedAt: null }`, o que também atualiza `updatedAt` ("Data atualização" da grade);
- id inexistente, de outro usuário ou excluído devolve `{ ok: false, message: 'Registro não encontrado.' }`;
- erro inesperado devolve `{ ok: false, message: 'Não foi possível salvar. Tente novamente.' }`.

## 4. Pasta física

O valor de **Pasta** é o caminho absoluto da pasta do Estudo. Regras (módulo `features/estudo/folders.ts`):

- **Formato:** caminho absoluto do Windows (`C:\…` ou UNC `\\servidor\compartilhamento\…`), sem segmentos `..`, até **260 caracteres**. Barras `/` são normalizadas para `\` e a barra final é removida. Mensagem: "Informe um caminho absoluto, como C:\Estudos\Cálculo."
- **Criação:** ao criar ou editar um Estudo, o servidor cria a pasta (recursivamente) se não existir **antes** de gravar no banco. Se não conseguir: "Não foi possível criar a pasta."
- **Unicidade:** dois Estudos ativos do mesmo usuário não podem usar a mesma pasta; a comparação ignora maiúsculas e barra final. Mensagem: "Já existe um Estudo usando esta pasta."
- **Mudança de pasta:** se `<pasta antiga>\imagens` existir, o app **copia** o conteúdo para `<nova>\imagens` (sem sobrescrever arquivos já existentes lá) e deixa a pasta antiga intacta. O Markdown não muda, porque as imagens usam caminho relativo.
- **Exclusão do Estudo:** continua lógica e não mexe na pasta. O app nunca apaga nada do disco.
- **Pasta base:** a variável opcional `STUDYFLOW_BASE_DIR` (padrão `C:\StudyFlow`) é usada pelo seed e como valor inicial sugerido do campo Pasta (`<base>\`) no modal de novo Estudo.
- **Registros legados** com Pasta que não é um caminho absoluto (ex.: "Matemática") continuam abrindo: o editor mostra um aviso "Defina uma pasta válida para usar imagens" e desabilita só o botão de imagem. Editar o Estudo exige corrigir o campo.
- **Seed:** os 8 registros de exemplo recebem pastas `<STUDYFLOW_BASE_DIR>\<Nome>` e o seed as cria.
- A tabela da grade mostra o caminho truncado com o caminho completo no `title`.

## 5. Imagens

**Adicionar** (botão Imagem da barra, na célula em foco) com um diálogo:

- **URL:** o app insere `![alt](url)` para um endereço `http(s)`, sem baixar nada.
- **Enviar do computador:** seletor de arquivo. Também é possível colar (Ctrl+V) ou arrastar uma imagem para dentro da célula, com o mesmo fluxo.
- O `alt` começa com o nome do arquivo e é editável no diálogo.

**Armazenamento:**

- `POST /estudo/[id]/imagens` salva em `<pasta>\imagens\<nome-limpo>-<AAAAMMDD-HHMMSS>.<ext>`. O nome-limpo não tem acento, espaço nem caracteres especiais, e o sufixo impede sobrescrever outro arquivo.
- Aceitos: **PNG, JPG, GIF e WebP**, até **10 MB**, validados pela **assinatura do arquivo** (não só pela extensão). SVG é recusado.
- O Markdown guarda o caminho **relativo**: `![foto](imagens/foto-20261025-101530.png)`.
- O envio é imediato, antes de salvar o documento. Descartar a célula não apaga a imagem.
- Erros: tipo ou tamanho inválido aparecem no diálogo; pasta inacessível ou disco cheio mostram o toast "Não foi possível salvar a imagem." e nada é inserido.

**Exibição:**

- `GET /estudo/[id]/imagens/[arquivo]` lê somente dentro de `<pasta>\imagens` **do próprio Estudo**. O nome do arquivo precisa casar com `^[A-Za-z0-9._-]+$` e ter extensão permitida, e o caminho resolvido (após `realpath`) precisa estar dentro de `imagens`. Resposta com o tipo da imagem, `X-Content-Type-Options: nosniff` e `404` para qualquer outro caso.
- O preview troca `imagens/...` por essa rota. URLs `http(s)` passam direto; qualquer outro esquema (`javascript:`, `file:`, `data:`) é bloqueado.

**Redimensionar:**

- Sintaxe: a largura em pixels no texto alternativo, `![foto|300](imagens/foto.png)`. Sem `|número`, a imagem mantém o tamanho natural, limitada à largura da célula. Largura mínima 32, máxima 2000.
- `components.img` do `react-markdown` interpreta `foto|300`: `alt="foto"` e largura 300.
- Clicar numa imagem renderizada a **seleciona** (contorno, **alça** no canto inferior direito e campo "Largura: [300] px") sem abrir a edição da célula. Ao soltar a alça ou confirmar o campo, o app reescreve apenas aquele trecho `![…](…)` no Markdown, localizado pela posição que o `react-markdown` informa para o nó. O resto do texto não muda.
- No modo Preview a imagem é somente leitura.

## 6. Editor de células

**Tela:** cabeçalho, **barra de ferramentas fixa** (fica visível ao rolar; no mobile fica logo abaixo da barra superior, com rolagem horizontal) e lista de células.

**Cada célula:**

- Alça de arrastar (⋮⋮) e lixeira à esquerda, visíveis ao passar o mouse ou focar a célula e sempre visíveis no toque.
- Botão pequeno **"+"** no fim ("Adicionar célula abaixo"): a nova célula já nasce em edição, com o cursor dentro.
- **Excluir** remove do rascunho na hora e mostra o toast "Célula excluída." com **Desfazer** (5 s). Se for a última, o documento volta a ter uma célula vazia.
- **Arrastar** com `@dnd-kit` pela alça (mouse, toque com pequeno atraso). Teclado: foco na alça, Espaço pega, setas movem, Espaço solta, com avisos em pt-BR.

**Modos:**

- **Padrão (Colab):** células renderizadas. Clicar na célula (ou Enter com ela focada) abre a edição: Markdown à esquerda e resultado ao vivo à direita (empilhados no mobile). Só uma célula em edição por vez; `Esc` ou clicar fora a renderiza de novo. Célula vazia mostra "Célula vazia. Clique para editar."
- **Dividida:** todas as células com Markdown à esquerda e resultado à direita.
- **Preview:** tudo renderizado e somente leitura, sem alças, lixeiras nem "+". Clicar de novo no botão ativo volta ao padrão.

**Renderização** (`MarkdownView`): `react-markdown` + `remark-gfm` (tabelas, tarefas, tachado) + `remark-math` + `rehype-katex` + `rehype-highlight`, sem HTML cru.

- Caixas de tarefa do preview são só de leitura.
- **Código:** realce por linguagem da cerca (` ```python `) com um conjunto enxuto de linguagens comuns e tema claro do design system. Sem linguagem, o bloco fica sem cor (não adivinha).
- **LaTeX:** `$x^2$` em linha e `$$ … $$` em bloco, com `throwOnError: false` (fórmula inválida aparece em vermelho, sem quebrar a célula) e `trust: false`.

**Barra de ferramentas** (age sobre a seleção da célula em edição; em Dividida, sobre a última célula focada; desabilitada fora de edição e no Preview). Lógica pura `applyFormat(texto, seleção, ação)` em `markdown-format.ts`:

| Botão | Resultado |
|---|---|
| Negrito / Itálico / Tachado | `**sel**` / `*sel*` / `~~sel~~`; se já envolvido, desfaz; sem seleção insere `**texto**` com "texto" selecionado |
| Título (menu H1, H2, H3) | `# `, `## ` ou `### ` no início das linhas selecionadas; repetir o nível tira, outro nível troca |
| Linha horizontal | `---` em linha própria, com linhas em branco em volta |
| Marcadores / Numerada / Tarefas / Citação | `- ` / `1. 2. …` / `- [ ] ` / `> ` em cada linha selecionada; se todas já têm, tira; se têm outro marcador de lista, troca |
| Link | `[texto](url)` com "url" selecionado |
| Imagem | abre o diálogo da seção 5 |
| Código | seleção de uma linha ou vazia: `` `código` ``; várias linhas: bloco com três crases |
| Fórmula (Σ) | mesma regra do código: uma linha ou vazia: `$fórmula$`; várias linhas: bloco `$$` |
| Tabela | estrutura básica de 3 colunas (cabeçalho, `\| --- \|`, uma linha vazia) |
| Dividida / Preview | alternam o modo |
| Salvar | salva na hora |

- As alterações usam `execCommand('insertText')` para preservar o **Ctrl+Z**, com alternativa caso o navegador não suporte.
- Atalhos: Ctrl+B, Ctrl+I, Ctrl+S.
- Os botões não tiram o foco do texto (`mousedown` sem foco), têm `title` e `aria-label`.

## 7. Salvamento

- O texto fica no navegador até ser salvo. O indicador percorre "● Alterações não salvas" → "Salvando…" → "Salvo às HH:MM".
- **Automático:** 2 s depois da última alteração. Uma alteração durante um salvamento em andamento agenda um novo salvamento depois que ele termina (controle por contador de versão; nada se perde).
- **Falha:** o indicador mostra "Falha ao salvar. Tentando de novo…" e há 3 tentativas (5 s, 10 s e 20 s). Depois fica em "Não salvo" até o usuário clicar em **Salvar**; o rascunho nunca é descartado.
- **Salvar** e Ctrl+S salvam na hora e mostram o toast "Documento salvo.".
- **Sair:** com algo pendente ou com falha, clicar num link interno abre "Sair sem salvar?" ("Continuar editando" / "Sair sem salvar"), e fechar a aba dispara `beforeunload`. O botão Voltar do navegador não é interceptável; com o autosave, a janela de risco é de no máximo 2 s.

## 8. Estrutura de arquivos

```
src/app/(app)/estudo/[id]/
  page.tsx                       # editor
  imagens/route.ts               # POST: envio
  imagens/[arquivo]/route.ts     # GET: exibição
src/features/estudo/
  folders.ts                     # caminho, criação, unicidade, cópia de imagens
  images.ts                      # assinatura, nome seguro, extensões
  content-schema.ts              # zod de conteudo
  actions.ts                     # + saveStudyContent; criar/editar com regras de pasta
  editor/
    components/                  # EditorView, Toolbar, CellList, Cell, ImageDialog,
                                 # MarkdownView, ImageResizer, UnsavedDialog
    cells.ts                     # estado das células: adicionar, excluir, mover, desfazer
    markdown-format.ts           # applyFormat
    image-width.ts               # ler e reescrever |largura
    autosave.ts                  # máquina de estados do salvamento
```

Dependências novas: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`, `rehype-highlight`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Regras de dependência herdadas da spec base continuam valendo (nenhuma feature importa outra; `components/ui` não conhece features).

## 9. Testes

- **Unitários:**
  - `applyFormat` (todos os botões, alternar, seleção vazia, várias linhas, Fórmula);
  - estado das células (adicionar, excluir, último excluído, mover, desfazer);
  - `content-schema` e limites;
  - `folders.ts` (caminho absoluto e inválido, `..`, criação, unicidade sem diferenciar maiúsculas, cópia de `imagens` sem sobrescrever) em pastas temporárias;
  - `images.ts` (assinaturas, SVG recusado, nome seguro, tamanho);
  - rota de imagem (`..`, barras, unidade, extensão, arquivo inexistente, outro usuário);
  - `saveStudyContent` (válido, inválido, id de filtro, outro usuário, excluído);
  - `image-width` (ler e reescrever sem tocar no resto do texto);
  - `autosave` (debounce, alteração durante o salvamento, tentativas 5/10/20 s, salvar manual).
- **Componentes:** `Toolbar`, `ImageDialog`, `MarkdownView` (LaTeX, código colorido, HTML cru neutralizado, esquemas `javascript:`/`data:` bloqueados), `Cell`.
- **E2E:** abrir pela linha; adicionar, editar e arrastar células pelo teclado; usar a barra; salvar e recarregar; autosave (esperar 2 s); excluir e Desfazer; modos Dividida e Preview; sair sem salvar; enviar uma imagem para uma pasta temporária e vê-la no preview; redimensionar pelo campo de largura; erros de pasta no modal.

## 10. Ordem sugerida de implementação

1. Pasta física: validação, criação, unicidade, cópia, migration de `conteudo` e seed.
2. Conteúdo: schema e `saveStudyContent`.
3. Lógica pura: `markdown-format`, `cells`, `image-width`, `autosave`.
4. `MarkdownView` (GFM, LaTeX, código) e rotas de imagem.
5. Interface do editor: barra, células, arrastar, diálogo de imagem, redimensionar.
6. Ligação grade → editor e aviso de sair.
7. E2E.

O detalhamento passo a passo fica no plano de implementação (próxima etapa).
