# Editor de células em Markdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao clicar numa linha da grade de Estudo, abrir um editor de documentos em células de Markdown (estilo Colab), com barra de ferramentas fixa, imagens guardadas na pasta física do Estudo, salvamento manual e automático no banco.

**Architecture:** O texto vive em `StudyRecord.conteudo` (JSON de células). O campo Pasta passa a ser o caminho absoluto da pasta do Estudo no disco; imagens ficam em `<pasta>\imagens` e são servidas por rotas do app. Lógica de edição é pura e testável (`markdown-format`, `cells`, `image-width`, `autosave`); a interface é uma camada fina sobre ela.

**Tech Stack:** Next.js 16 (App Router, `params` e `searchParams` são Promises), Prisma 7 + SQLite, zod 4, `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight`, `@dnd-kit`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-editor-de-celulas-design.md`. Base já implementada: `docs/superpowers/specs/2026-10-25-studyflow-estrutura-design.md` e `docs/superpowers/plans/2026-10-25-studyflow-estrutura.md`.

## Global Constraints

- Windows apenas: caminhos de pasta são `C:\…` ou UNC `\\servidor\compartilhamento\…`.
- O app **nunca apaga nem sobrescreve** arquivos do disco. Só cria pastas e arquivos novos.
- Todo `id` vindo do cliente (actions, queries e rotas) é validado com `typeof id === 'string' && id.length > 0` antes de ir para o Prisma; senão, "Registro não encontrado.".
- Toda query e action filtra por `userId` (de `getCurrentUserId()`) e `deletedAt: null`.
- Markdown **sem HTML cru** (nenhum `rehype-raw`). Esquemas `javascript:`, `data:` e `file:` nunca chegam a `src`/`href`.
- Limites: 500 células; 200 000 caracteres por célula; 5 MB de JSON; imagem de até 10 MB (PNG, JPG, GIF, WebP; SVG recusado); Pasta até 260 caracteres; largura de imagem 32 a 2000 px.
- Textos de interface em pt-BR, exatamente os da spec: "Célula excluída.", "Documento salvo.", "Célula vazia. Clique para editar.", "Sair sem salvar?", "Não foi possível criar a pasta.", "Já existe um Estudo usando esta pasta.", "Informe um caminho absoluto, como C:\Estudos\Cálculo.", "Não foi possível salvar a imagem.", "Registro não encontrado.", "Não foi possível salvar. Tente novamente.".
- Estilo: CSS Modules sobre `src/styles/tokens.css`; sem Tailwind; sem sombras.
- Dependências entre pastas: nenhuma feature importa outra; `components/ui` não conhece features. Módulos que usam `node:fs` nunca são importados por componentes client; `folder-path.ts` e `content-schema.ts` são client-safe.
- O Next é 16.4.3 e difere do conhecimento comum: consulte `node_modules/next/dist/docs/` antes de usar route handlers e `params`.
- Testes de dados usam `prisma/test.db`; pastas de teste ficam em `os.tmpdir()` (nunca em `C:\StudyFlow`). E2E usa `prisma/e2e.db` e `STUDYFLOW_BASE_DIR` apontando para uma pasta temporária.

## Review Focus

1. Pasta com `..`, caminho relativo, UNC malformado, `C:\a\` e `c:\A` (barra final e caixa diferentes): rejeitados ou normalizados, e a unicidade ignora caixa e barra final. Task 2 e Task 3.
2. Nome de arquivo malicioso na rota de imagem (`..\..\x.png`, `a/b.png`, `%2e%2e`, `x.svg`, arquivo inexistente, Estudo de outro usuário): sempre `404`, sem ler fora de `imagens`. Task 4.
3. Envio com extensão mentirosa (texto chamado `.png`), arquivo vazio, acima de 10 MB e SVG: recusados; nome com acento e espaço vira nome limpo único. Task 4.
4. Markdown hostil no preview (`<script>`, `[x](javascript:alert(1))`, `![x](data:image/png;base64,AA)`, `![x](file:///C:/x.png)`, fórmula LaTeX inválida): nada é executado nem carregado, e a célula não quebra. Task 8.
5. Estado do documento: `conteudo` corrompido no banco abre uma célula vazia sem erro; excluir a última célula deixa uma vazia; falha ao salvar mantém o rascunho; alteração durante um salvamento não se perde. Tasks 1, 6, 7 e 11.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/features/estudo/content-schema.ts` | `Cell`, validação e (de)serialização de `conteudo` |
| `src/features/estudo/folder-path.ts` | normalização e chave de comparação do caminho (puro, client-safe) |
| `src/features/estudo/folders.ts` | disco: criar pasta, copiar `imagens`, pasta base (server) |
| `src/features/estudo/images.ts` | assinatura, nome seguro, tipo de conteúdo das imagens |
| `src/app/(app)/estudo/[id]/imagens/route.ts` e `[arquivo]/route.ts` | `POST` de envio e `GET` de exibição |
| `src/features/estudo/editor/markdown-format.ts` | `applyFormat` (botões da barra) |
| `src/features/estudo/editor/cells.ts` | operações puras sobre a lista de células |
| `src/features/estudo/editor/image-width.ts` | ler e reescrever `![alt\|largura](…)` |
| `src/features/estudo/editor/autosave.ts` | salvamento automático (debounce, retentativas) |
| `src/features/estudo/editor/components/*` | MarkdownView, Toolbar, Cell, CellList, ImageDialog, ImageResizer, UnsavedDialog, EditorView |
| `src/app/(app)/estudo/[id]/page.tsx` | página do editor |

---

### Task 1: Conteúdo no banco e ação de salvar

**Files:**
- Create: `src/features/estudo/content-schema.ts`, `prisma/migrations/<timestamp>_add_conteudo/` (gerada)
- Modify: `prisma/schema.prisma`, `src/features/estudo/actions.ts`, `src/features/estudo/queries.ts`
- Test: `tests/unit/content-schema.test.ts`, `tests/unit/estudo-content.test.ts`

**Interfaces:**
- Produces:
  - `type Cell = { id: string; texto: string }`
  - `MAX_CELLS = 500`, `MAX_CELL_CHARS = 200_000`, `MAX_CONTENT_BYTES = 5 * 1024 * 1024`
  - `parseContent(raw: unknown): { ok: true; cells: Cell[] } | { ok: false }` (valida lista, ids únicos de 1 a 64 caracteres, limites)
  - `parseStoredContent(json: string): Cell[]` (nunca lança; JSON inválido ou fora das regras devolve `[]`)
  - `serializeContent(cells: Cell[]): string`
  - `type StudyDocument = { id: string; descricao: string; pasta: string; cells: Cell[] }`
  - `getStudyDocument(id: string): Promise<StudyDocument | null>` (usuário atual, não excluído; id inválido devolve `null`)
  - `saveStudyContent(id: string, cells: unknown): Promise<ActionResult<{ savedAt: string }>>` (`savedAt` em ISO)

- [ ] **Step 1: Escrever `content-schema.test.ts`:**
  - lista válida de 2 células passa
  - 501 células falham; 500 passam
  - `texto` de 200 000 caracteres passa e de 200 001 falha
  - `id` vazio, com 65 caracteres e repetido falham
  - JSON total acima de 5 MB falha
  - `null`, `{}`, `"x"`, `[1]`, `[{ id: 1, texto: "a" }]` retornam `{ ok: false }` sem lançar
  - `parseStoredContent('')`, `('{')`, `('[1]')` devolvem `[]`; `serializeContent` seguido de `parseStoredContent` devolve as mesmas células
- [ ] **Step 2: Escrever `estudo-content.test.ts`** (modelo de `estudo-data.test.ts`: `// @vitest-environment node`, mock de `next/cache`, `beforeEach` limpa tabelas):
  - `getStudyDocument` de registro novo devolve `cells: []`; com `conteudo` corrompido gravado direto no banco devolve `cells: []` sem lançar
  - `saveStudyContent` válido grava, `getStudyDocument` devolve as mesmas células na mesma ordem, e `updatedAt` aumenta (a "Data atualização" da listagem muda)
  - células inválidas (501) devolvem `{ ok: false }` e não gravam
  - id inexistente, de outro usuário, já excluído, vazio, `{ not: "" }` e `42` devolvem `{ ok: false, message: 'Registro não encontrado.' }`; `getStudyDocument` desses ids devolve `null`
- [ ] **Step 3: Rodar os dois arquivos** e confirmar que falham.
- [ ] **Step 4: Migration:** adicionar `conteudo String @default("[]")` ao `StudyRecord` e rodar `npm run db:migrate -- --name add_conteudo`; depois `npx prisma generate`.
- [ ] **Step 5: Implementar `content-schema.ts`, `getStudyDocument` e `saveStudyContent`** com as assinaturas acima. `saveStudyContent` valida o id (Global Constraints), usa `updateMany` com `{ id, userId, deletedAt: null }` (o `@updatedAt` atualiza a data) e devolve `SAVE_FAILED` em exceção.
- [ ] **Step 6: Rodar `npx vitest run`** e confirmar tudo verde (a suíte inteira).
- [ ] **Step 7: Commit** `feat(estudo): conteudo em células no banco e ação de salvar`.

---

### Task 2: Caminho da pasta (regras puras)

**Files:**
- Create: `src/features/estudo/folder-path.ts`
- Modify: `src/features/estudo/schema.ts`
- Test: `tests/unit/folder-path.test.ts`, `tests/unit/estudo-schema.test.ts` (atualizar)

**Interfaces:**
- Produces:
  - `normalizeFolderPath(input: string): { ok: true; path: string } | { ok: false; message: string }`
  - `folderKey(path: string): string` (caminho normalizado em minúsculas, para comparar)
  - `MAX_FOLDER_CHARS = 260`
  - `parseStudyRecordInput` passa a devolver `data.pasta` normalizado

- [ ] **Step 1: Escrever `folder-path.test.ts`:**
  - aceitam: `C:\Estudos\Cálculo`, `c:/Estudos/Cálculo` (vira `c:\Estudos\Cálculo`), `C:\Estudos\Cálculo\` (sem a barra final), `D:\`, `\\servidor\pasta\sub`
  - rejeitam com a mensagem "Informe um caminho absoluto, como C:\Estudos\Cálculo.": `Matemática`, `Estudos\Cálculo`, `.\x`, `C:Estudos`, `C:\a\..\b`, `C:\..`, `\\servidor`, `\\\\`, `C:\a\\b` (segmento vazio)
  - 260 caracteres passam, 261 falham com "Use no máximo 260 caracteres."
  - espaços nas pontas são removidos; vazio devolve "Informe uma pasta."
  - `folderKey('C:\\A\\')` e `folderKey('c:/a')` são iguais
- [ ] **Step 2: Atualizar `estudo-schema.test.ts`:** a pasta válida de `valid` passa a ser `C:\Estudos\Matemática`; os testes de pasta vazia, 40/41 caracteres são trocados pelos de caminho (vazio → "Informe uma pasta."; `Matemática` → mensagem de caminho absoluto; `data.pasta` sai normalizado). O texto de `Use no máximo 40 caracteres.` deixa de existir.
- [ ] **Step 3: Rodar os dois arquivos** e confirmar que falham.
- [ ] **Step 4: Implementar `folder-path.ts`** sem usar `node:path` (o módulo roda no navegador): regex para unidade `^[A-Za-z]:\\` e UNC `^\\\\[^\\]+\\[^\\]+`, normalização de `/` para `\`, remoção de barra final (exceto raiz `D:\`), recusa de segmentos vazios ou `..`. Em `schema.ts`, `pasta` usa `normalizeFolderPath` e propaga a mensagem.
- [ ] **Step 5: Manter o restante verde, sem tocar no disco ainda:** em `estudo-data.test.ts`, `estudo-content.test.ts` e `study-view.test.tsx`, trocar as pastas de fixture por textos absolutos (`C:\Estudos\Matemática`, `C:\Estudos\Geral`); em `prisma/seed.ts`, gravar `pasta = C:\StudyFlow\<nome do protótipo>` (a criação das pastas e a variável `STUDYFLOW_BASE_DIR` entram na Task 3); em `tests/e2e/estudo.spec.ts`, `createRecord` preenche a Pasta com `C:\StudyFlow\<nome>`; o teste de edição mantém a pasta seedada, que agora é válida.
- [ ] **Step 6: Rodar `npx vitest run` e `npm run test:e2e`** e confirmar tudo verde.
- [ ] **Step 7: Commit** `feat(estudo): pasta como caminho absoluto (regras puras)`.

---

### Task 3: Pasta no disco, unicidade e seed

**Files:**
- Create: `src/features/estudo/folders.ts`
- Modify: `src/features/estudo/actions.ts`, `src/features/estudo/components/StudyFormModal.tsx`, `StudyView.tsx`, `StudyTable.tsx`, `src/app/(app)/estudo/page.tsx`, `prisma/seed.ts`, `.env.example`, `README.md`, `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/estudo.spec.ts`, `tests/unit/estudo-data.test.ts`
- Test: `tests/unit/folders.test.ts`, `tests/unit/estudo-data.test.ts` (atualizar)

**Interfaces:**
- Consumes: `normalizeFolderPath`, `folderKey` (Task 2)
- Produces:
  - `ensureFolder(path: string): Promise<boolean>` (`mkdir -p`; `false` se falhar)
  - `copyImages(fromFolder: string, toFolder: string): Promise<void>` (copia `<from>\imagens\*` para `<to>\imagens`, sem sobrescrever; sem `imagens` na origem é no-op)
  - `imagesDir(folder: string): string` (`<folder>\imagens`)
  - `baseFolder(): string` (`STUDYFLOW_BASE_DIR` ou `C:\StudyFlow`)
  - `createStudyRecord` e `updateStudyRecord` devolvem `fieldErrors.pasta` = "Já existe um Estudo usando esta pasta." ou "Não foi possível criar a pasta."
  - `StudyView` recebe `baseDir: string`; o modal de novo Estudo começa com Pasta `<baseDir>\`

- [ ] **Step 1: Escrever `folders.test.ts`** (`// @vitest-environment node`, pasta temporária por teste via `fs.mkdtemp` em `os.tmpdir()`):
  - `ensureFolder` cria pasta aninhada inexistente e devolve `true`; pasta existente devolve `true`; caminho impossível (`Z:\naoexiste\x` sem a unidade, ou dentro de um arquivo comum) devolve `false` sem lançar
  - `copyImages` copia `a.png` e `b.png` de `A\imagens` para `B\imagens`, mantém os originais, **não sobrescreve** um `a.png` já existente em `B\imagens` (conteúdo do destino permanece), e é no-op sem `A\imagens`
  - `baseFolder()` devolve `C:\StudyFlow` sem a variável e o valor dela quando definida
- [ ] **Step 2: Atualizar `estudo-data.test.ts`:** `input` e `insert` passam a usar pastas temporárias reais (`path.join(base, 'Calculo')` em um `mkdtemp` do arquivo). Novos testes:
  - criar com pasta inexistente cria a pasta no disco
  - criar com `Matemática` (relativo) devolve `fieldErrors.pasta` de caminho absoluto e não grava
  - criar com a mesma pasta de um Estudo ativo, também com caixa e barra final diferentes, devolve "Já existe um Estudo usando esta pasta."; a pasta de um Estudo **excluído** pode ser reutilizada
  - criar com pasta impossível devolve "Não foi possível criar a pasta." e não grava
  - editar sem mudar a pasta não acusa a si mesmo como duplicado
  - editar para outra pasta copia `imagens\` antigo para a nova e deixa a antiga intacta
  - registros legados com pasta fora do padrão continuam aparecendo na listagem
- [ ] **Step 3: Rodar** `folders.test.ts` e `estudo-data.test.ts` e confirmar que falham.
- [ ] **Step 4: Implementar `folders.ts` e as regras nas actions:** em create e update, depois de `parseStudyRecordInput`: checar unicidade (consulta os registros ativos do usuário e compara `folderKey`, excluindo o próprio id no update), `ensureFolder`, e no update com `folderKey` diferente `copyImages(antiga, nova)`; só então gravar no banco.
- [ ] **Step 5: Seed:** `prisma/seed.ts` passa de `C:\StudyFlow\<nome>` fixo para `baseFolder()` e grava `pasta = <base>\<nome do protótipo>` (Matemática, Medicina…), criando cada pasta. `.env.example` e `README.md` documentam `STUDYFLOW_BASE_DIR`.
- [ ] **Step 6: Interface:** `estudo/page.tsx` lê `baseFolder()` e passa `baseDir` a `StudyView` → `StudyFormModal`, que inicia o campo Pasta de um novo Estudo com `<baseDir>\`. `StudyTable` mostra a pasta com `title` igual ao caminho completo.
- [ ] **Step 7: E2E:** `playwright.config.ts` define `STUDYFLOW_BASE_DIR` (pasta temporária, exportada de `tests/e2e/helpers.ts` como `E2E_BASE_DIR`) no `env` do `webServer`; `resetData()` passa a mesma variável ao seed. Em `estudo.spec.ts`, `createRecord` preenche a Pasta com `<E2E_BASE_DIR>\<nome>`; adicionar o teste "Pasta relativa mostra a mensagem de caminho absoluto no modal".
- [ ] **Step 8: Rodar `npx vitest run` e `npm run test:e2e`** e confirmar tudo verde.
- [ ] **Step 9: Commit** `feat(estudo): pasta física com unicidade, criação e cópia de imagens`.

---

### Task 4: Imagens no servidor (envio e exibição)

**Files:**
- Create: `src/features/estudo/images.ts`, `src/app/(app)/estudo/[id]/imagens/route.ts`, `src/app/(app)/estudo/[id]/imagens/[arquivo]/route.ts`
- Modify: `src/features/estudo/queries.ts`
- Test: `tests/unit/images.test.ts`, `tests/unit/image-routes.test.ts`

**Interfaces:**
- Consumes: `ensureFolder`, `imagesDir` (Task 3)
- Produces:
  - `MAX_IMAGE_BYTES = 10 * 1024 * 1024`; `type ImageKind = 'png' | 'jpg' | 'gif' | 'webp'`
  - `detectImageKind(bytes: Uint8Array): ImageKind | null` (por assinatura)
  - `safeImageName(originalName: string, now: Date, kind: ImageKind): string` (ex.: `foto-20261025-101530.png`)
  - `isSafeImageFileName(name: string): boolean` (`^[A-Za-z0-9._-]+$` e extensão permitida)
  - `contentTypeFor(fileName: string): string | null`
  - `getStudyFolder(id: string): Promise<string | null>`
  - `POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response>` → `200 { path: 'imagens/<nome>', alt: '<nome-limpo>' }` ou `4xx { message }`
  - `GET(request: Request, ctx: { params: Promise<{ id: string; arquivo: string }> }): Promise<Response>`

- [ ] **Step 1: Escrever `images.test.ts`:**
  - `detectImageKind` reconhece cabeçalhos de PNG (`89 50 4E 47 0D 0A 1A 0A`), JPG (`FF D8 FF`), GIF (`GIF87a`/`GIF89a`) e WebP (`RIFF....WEBP`); devolve `null` para texto, SVG (`<svg`), vazio e menos de 12 bytes
  - `safeImageName('Foto da Praia (1).JPG', new Date(2026, 9, 25, 10, 15, 30), 'jpg')` é `foto-da-praia-1-20261025-101530.jpg`; nome só com símbolos vira `imagem-20261025-101530.png`; a extensão vem do `kind`, nunca do nome original
  - `isSafeImageFileName`: `a.png` e `foto-1.webp` passam; `..\x.png`, `a/b.png`, `x.svg`, `x.png.exe`, `.png`, `a b.png`, `%2e%2e.png` falham
  - `contentTypeFor('a.jpg') === 'image/jpeg'`, `('a.png') === 'image/png'`, `('a.svg') === null`
- [ ] **Step 2: Escrever `image-routes.test.ts`** (`@vitest-environment node`, banco real, pasta temporária): helper cria um Estudo com pasta temporária; chamar `POST`/`GET` diretamente com `new Request(...)` e `FormData`:
  - `POST` com PNG válido (bytes reais) grava `<pasta>\imagens\<nome>`, devolve `path` relativo e o arquivo existe no disco
  - `POST` com texto chamado `a.png`, arquivo vazio, 10 MB + 1 byte, SVG e requisição sem arquivo devolvem `400` com mensagem e **não criam** arquivo
  - dois envios do mesmo nome no mesmo segundo geram nomes diferentes (nunca sobrescreve)
  - `POST` em Estudo inexistente, de outro usuário ou excluído devolve `404`
  - `GET` do arquivo gravado devolve `200`, `Content-Type: image/png`, `X-Content-Type-Options: nosniff` e os mesmos bytes
  - `GET` devolve `404` para: arquivo inexistente, `..%5C..%5Cx.png`, `a%2Fb.png`, `%2e%2e`, `x.svg`, um arquivo `.png` que é um link simbólico para fora de `imagens` (se o sistema permitir criar o link; senão o teste é pulado), Estudo de outro usuário
- [ ] **Step 3: Rodar os dois arquivos** e confirmar que falham.
- [ ] **Step 4: Implementar `images.ts`, `getStudyFolder` e as rotas** (consultar `node_modules/next/dist/docs` sobre route handlers e `params` assíncrono). O `GET` valida `isSafeImageFileName`, resolve o caminho, confere com `fs.realpath` que ele está dentro de `imagesDir(pasta)` e responde com `Content-Type` e `nosniff`. O `POST` lê `formData()`, valida tamanho e assinatura, garante `imagens` com `ensureFolder` e grava com a flag `wx` (falha se existir).
- [ ] **Step 5: Rodar `npx vitest run`** e confirmar tudo verde.
- [ ] **Step 6: Commit** `feat(estudo): envio e exibição de imagens na pasta do Estudo`.

---

### Task 5: Formatação Markdown (barra de ferramentas, lógica pura)

**Files:**
- Create: `src/features/estudo/editor/markdown-format.ts`
- Test: `tests/unit/markdown-format.test.ts`

**Interfaces:**
- Produces:
  - `type FormatAction = 'bold' | 'italic' | 'strike' | 'h1' | 'h2' | 'h3' | 'hr' | 'ul' | 'ol' | 'task' | 'quote' | 'link' | 'code' | 'formula' | 'table'`
  - `type Edit = { text: string; selStart: number; selEnd: number }`
  - `applyFormat(text: string, selStart: number, selEnd: number, action: FormatAction): Edit`
  - `imageMarkdown(alt: string, src: string): string` (`![alt](src)`)

- [ ] **Step 1: Escrever `markdown-format.test.ts`** (cada caso afirma o `text` e a seleção resultante):
  - **bold:** `("ola", 0, 3)` → `**ola**` com seleção em `ola`; já envolvido (`**ola**` selecionando `ola`) desfaz para `ola`; sem seleção em `""` → `**texto**` com `texto` selecionado; no meio de uma palavra sem seleção, insere `**texto**` na posição do cursor
  - **italic** `*ola*` e **strike** `~~ola~~` com os mesmos três comportamentos
  - **h1/h2/h3:** `("Titulo", 0, 0, 'h2')` → `## Titulo`; repetir `h2` em `## Titulo` → `Titulo`; `h3` em `## Titulo` → `### Titulo`; seleção de 2 linhas prefixa as duas
  - **hr:** em `"a"` com cursor no fim → `a\n\n---\n\n`; no meio de um texto, `---` fica em linha própria com linha em branco antes e depois
  - **ul/ol/task/quote:** 3 linhas selecionadas ganham `- `, `1. 2. 3. `, `- [ ] `, `> `; se todas já têm, tiram; `ul` sobre linhas com `1. ` troca; `task` sobre `- x` troca por `- [ ] x`; linha vazia no meio da seleção não ganha prefixo
  - **link:** `("site", 0, 4, 'link')` → `[site](url)` com `url` selecionado; sem seleção → `[texto](url)` com `texto` selecionado
  - **code:** seleção de uma linha → `` `x` ``; vazia → `` `código` `` com `código` selecionado; duas linhas → bloco com três crases abrindo e fechando em linhas próprias
  - **formula:** uma linha → `$x$`; vazia → `$fórmula$` com `fórmula` selecionado; duas linhas → `$$\n…\n$$`
  - **table:** insere exatamente `| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|  |  |  |` em linha própria, com linhas em branco em volta
  - `imageMarkdown('foto', 'imagens/a.png') === '![foto](imagens/a.png)'`
- [ ] **Step 2: Rodar** e confirmar que falha.
- [ ] **Step 3: Implementar `applyFormat` e `imageMarkdown`** (função pura, sem DOM; trabalha por linhas inteiras para os prefixos).
- [ ] **Step 4: Rodar `npx vitest run tests/unit/markdown-format.test.ts`** e depois a suíte inteira; confirmar verde.
- [ ] **Step 5: Commit** `feat(editor): formatação Markdown pura`.

---

### Task 6: Estado das células e largura de imagem

**Files:**
- Create: `src/features/estudo/editor/cells.ts`, `src/features/estudo/editor/image-width.ts`
- Test: `tests/unit/cells.test.ts`, `tests/unit/image-width.test.ts`

**Interfaces:**
- Consumes: `Cell` (Task 1)
- Produces:
  - `newCellId(): string` (`crypto.randomUUID()`)
  - `ensureAtLeastOne(cells: Cell[], newId?: string): Cell[]` (lista vazia vira uma célula vazia)
  - `addCellAfter(cells: Cell[], afterId: string, newId: string): Cell[]`
  - `removeCell(cells: Cell[], id: string, newId: string): { cells: Cell[]; removed: { cell: Cell; index: number } | null }` (nunca devolve lista vazia)
  - `restoreCell(cells: Cell[], removed: { cell: Cell; index: number }): Cell[]`
  - `moveCell(cells: Cell[], fromIndex: number, toIndex: number): Cell[]`
  - `updateCellText(cells: Cell[], id: string, texto: string): Cell[]`
  - `clampWidth(n: number): number` (32 a 2000, inteiro)
  - `parseImageAlt(alt: string): { alt: string; width: number | null }`
  - `setImageWidth(texto: string, start: number, end: number, width: number): string` (`start`/`end` são os offsets do trecho `![…](…)` em `texto`)

- [ ] **Step 1: Escrever `cells.test.ts`:**
  - `ensureAtLeastOne([])` devolve 1 célula com `texto: ''`; lista com itens volta igual
  - `addCellAfter` insere logo depois do id dado; id inexistente adiciona no fim; não muta o array original
  - `removeCell` do meio devolve `removed` com `index` e a lista menor; da **última** célula restante devolve lista com uma célula vazia de id `newId`; id inexistente devolve `removed: null` e lista igual
  - `restoreCell` volta a célula na posição original; com `index` maior que o tamanho coloca no fim
  - `moveCell(['a','b','c'], 0, 2)` → `b, c, a`; `(2, 0)` → `c, a, b`; índices iguais ou fora do intervalo devolvem a lista igual
  - `updateCellText` altera só a célula do id; id inexistente não altera nada
- [ ] **Step 2: Escrever `image-width.test.ts`:**
  - `clampWidth`: `10 → 32`, `5000 → 2000`, `300.7 → 301`, `NaN → 32`
  - `parseImageAlt('foto|300')` → `{ alt: 'foto', width: 300 }`; `('foto')` → `{ alt: 'foto', width: null }`; `('a|b')` e `('foto|0')`, `('foto|abc')` → largura `null` e alt inteiro; `('foto|99999')` → largura 2000
  - `setImageWidth` em `"Texto ![foto](imagens/a.png) fim"` com os offsets da imagem e largura 300 → `"Texto ![foto|300](imagens/a.png) fim"`; sobre `![foto|300](…)` com 450 → `|450` (sem acumular); só o trecho indicado muda, inclusive com duas imagens iguais no texto; largura fora do intervalo é ajustada por `clampWidth`
- [ ] **Step 3: Rodar** os dois arquivos e confirmar que falham.
- [ ] **Step 4: Implementar** `cells.ts` e `image-width.ts`.
- [ ] **Step 5: Rodar `npx vitest run`** e confirmar verde.
- [ ] **Step 6: Commit** `feat(editor): estado das células e largura de imagem`.

---

### Task 7: Salvamento automático

**Files:**
- Create: `src/features/estudo/editor/autosave.ts`
- Test: `tests/unit/autosave.test.ts`

**Interfaces:**
- Consumes: `Cell` (Task 1)
- Produces:
  - `type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'retrying' | 'failed'`
  - `type AutosaveState = { status: SaveStatus; savedAt: Date | null }`
  - `createAutosave(opts: { save: (cells: Cell[]) => Promise<boolean>; onState: (state: AutosaveState) => void; delayMs?: number; retryDelaysMs?: number[]; now?: () => Date }): { change(cells: Cell[]): void; saveNow(): Promise<boolean>; hasPending(): boolean; dispose(): void }`
  - padrões: `delayMs = 2000`, `retryDelaysMs = [5000, 10000, 20000]`

- [ ] **Step 1: Escrever `autosave.test.ts`** (timers falsos do Vitest; `save` é um `vi.fn` controlável):
  - `change` põe `dirty` imediatamente e só chama `save` depois de 2000 ms sem novas alterações; uma segunda `change` aos 1500 ms reinicia a contagem e `save` recebe as células da **última** chamada
  - sucesso: estado `saving` → `saved` com `savedAt` igual a `now()`; `hasPending()` vira `false`
  - `change` **durante** um `save` em andamento: ao terminar, um novo salvamento é agendado (2000 ms) com as células novas, e nada se perde
  - `save` devolvendo `false`: estado `retrying`, nova tentativa aos 5000 ms, depois 10 000 ms, depois 20 000 ms; se a terceira tentativa falhar, estado `failed`, sem novas tentativas automáticas e `hasPending()` continua `true`
  - uma tentativa que dá certo no meio volta a `saved` e para de repetir
  - `saveNow()` salva imediatamente, cancela o timer pendente, devolve o resultado e, em falha, mantém `dirty`/`failed` sem apagar o rascunho; chamado em `failed` tenta de novo
  - `dispose()` cancela timers e nenhuma chamada a `save` ocorre depois
- [ ] **Step 2: Rodar** e confirmar que falha.
- [ ] **Step 3: Implementar `createAutosave`** com contador de versão (as células salvas são as da versão mais recente no momento do envio; após o fim de um envio, compara a versão enviada com a atual).
- [ ] **Step 4: Rodar `npx vitest run`** e confirmar verde.
- [ ] **Step 5: Commit** `feat(editor): máquina de estados do salvamento automático`.

---

### Task 8: Renderização Markdown (MarkdownView)

**Files:**
- Create: `src/features/estudo/editor/components/MarkdownView.tsx`, `MarkdownView.module.css`, `src/features/estudo/editor/resolve-image-src.ts`
- Modify: `package.json` (dependências), `src/app/layout.tsx` (CSS do KaTeX)
- Test: `tests/unit/resolve-image-src.test.ts`, `tests/unit/markdown-view.test.tsx`

**Interfaces:**
- Consumes: `parseImageAlt` (Task 6)
- Produces:
  - `resolveImageSrc(src: string, studyId: string): string | null` (`imagens/x.png` → `/estudo/<id>/imagens/x.png`; `http(s)://…` igual; qualquer outro esquema, caminho absoluto, `..` ou vazio → `null`)
  - `MarkdownView({ texto: string; studyId: string; onResizeImage?: (range: { start: number; end: number }, width: number) => void })`

- [ ] **Step 1: Instalar** `react-markdown remark-gfm remark-math rehype-katex katex rehype-highlight` (e os tipos necessários).
- [ ] **Step 2: Escrever `resolve-image-src.test.ts`:** `imagens/a.png` e `imagens/a%20b.png` resolvem para a rota do Estudo; `https://x.com/a.png` e `http://…` passam; `javascript:alert(1)`, `data:image/png;base64,AA`, `file:///C:/x.png`, `//evil.com/a.png`, `C:\x.png`, `/etc/x`, `imagens/../x.png`, `..\x.png` e `''` devolvem `null`.
- [ ] **Step 3: Escrever `markdown-view.test.tsx`:**
  - texto `**negrito**`, tabela GFM, `~~tachado~~` e `- [x] tarefa` renderizam `strong`, `table`, `del` e um checkbox **desabilitado e marcado**
  - ```` ```python\nprint(1)\n``` ```` renderiza `code` com classes `hljs`/`language-python`; sem linguagem não há classes `hljs-*`
  - `$x^2$` e `$$\\frac{a}{b}$$` geram elementos `.katex`; `$\\frac{$` (inválida) renderiza sem lançar e sem `.katex-display` vazio, com texto de erro visível na célula
  - **hostil:** `<script>alert(1)</script>` e `<img src=x onerror=alert(1)>` aparecem como texto e não existe `script` nem `img[onerror]` no DOM; `[x](javascript:alert(1))` não gera `href` com `javascript:`; `![x](data:image/png;base64,AA)` e `![x](file:///C:/x.png)` não geram `img` com esse `src`
  - `![foto|300](imagens/a.png)` gera `img` com `src="/estudo/ID/imagens/a.png"`, `alt="foto"` e largura 300; sem `|` a largura é natural e `max-width: 100%`
  - com `onResizeImage`, clicar na imagem a seleciona (`aria-selected` ou classe de seleção) e mostra o campo "Largura"; digitar `450` e confirmar chama `onResizeImage({ start, end }, 450)` com os offsets do trecho `![…](…)` no texto; sem `onResizeImage` a imagem não é selecionável
- [ ] **Step 4: Rodar** os dois arquivos e confirmar que falham.
- [ ] **Step 5: Implementar `resolve-image-src.ts` e `MarkdownView`:** `urlTransform` usando `resolveImageSrc` para `src` e `defaultUrlTransform` para `href`; `components.img` com `parseImageAlt` e os offsets de `node.position`; `remarkPlugins=[remarkGfm, remarkMath]`, `rehypePlugins=[[rehypeKatex, { throwOnError: false, trust: false }], [rehypeHighlight, { detect: false }]]` com um conjunto enxuto de linguagens; tema claro do realce em `MarkdownView.module.css` com variáveis do design system; importar `katex/dist/katex.min.css` no layout raiz. A seleção e a alça de arrastar entram na Task 10, aqui só o campo de largura.
- [ ] **Step 6: Rodar `npx vitest run` e `npm run build`** e confirmar verdes.
- [ ] **Step 7: Commit** `feat(editor): renderização Markdown com GFM, LaTeX e código colorido`.

---

### Task 9: Barra de ferramentas, células e arrastar

**Files:**
- Create: `src/features/estudo/editor/textarea-edit.ts`, `src/features/estudo/editor/components/{Toolbar,Cell,CellList}.tsx` e `.module.css`
- Modify: `package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Test: `tests/unit/toolbar.test.tsx`, `tests/unit/cell.test.tsx`, `tests/unit/textarea-edit.test.ts`

**Interfaces:**
- Consumes: `applyFormat`, `FormatAction`, `Edit` (Task 5); `Cell` (Task 1); `AutosaveState` (Task 7); `MarkdownView` (Task 8)
- Produces:
  - `type EditorMode = 'default' | 'split' | 'preview'`
  - `applyEditToTextarea(textarea: HTMLTextAreaElement, edit: Edit, onChange: (value: string) => void): void` (calcula o trecho que mudou, usa `document.execCommand('insertText')` para preservar o Ctrl+Z e, se não houver suporte, grava `value` e chama `onChange`; sempre restaura `selStart`/`selEnd`)
  - `Toolbar({ mode, onModeChange, canFormat, onFormat, onImage, imageDisabled, state, onSave })` com `onFormat(action: FormatAction)`
  - `Cell({ cell, index, total, mode, editing, studyId, onEdit, onStopEditing, onChange, onAddBelow, onDelete, onResizeImage, registerTextarea })`
  - `CellList({ cells, mode, editingId, studyId, onReorder: (from: number, to: number) => void, … })` (mesmas callbacks de `Cell`)

- [ ] **Step 1: Escrever `textarea-edit.test.ts`:** sem `execCommand` (jsdom), `applyEditToTextarea` grava `value`, chama `onChange` com o texto novo e deixa a seleção em `selStart`/`selEnd`; com `execCommand` simulado, ele é chamado com `'insertText'` e o trecho inserido.
- [ ] **Step 2: Escrever `toolbar.test.tsx`:**
  - mostra os botões por nome acessível: "Negrito", "Itálico", "Tachado", "Título", "Linha horizontal", "Lista com marcadores", "Lista numerada", "Lista de tarefas", "Citação", "Link", "Imagem", "Código", "Fórmula", "Tabela", "Visualização dividida", "Visualização (preview)", "Salvar"
  - com `canFormat = false` os botões de formatação ficam desabilitados e "Salvar" e os modos não
  - clicar em "Negrito" chama `onFormat('bold')`; o menu "Título" abre e "H2" chama `onFormat('h2')`; "Imagem" chama `onImage` e fica desabilitado com `imageDisabled`
  - `mousedown` nos botões de formatação tem `defaultPrevented` (não tira o foco do texto)
  - "Visualização dividida" tem `aria-pressed`; clicar quando já ativo chama `onModeChange('default')`; idem para preview
  - o indicador mostra "● Alterações não salvas", "Salvando…", "Salvo às 10:42" (a partir de `savedAt`) e "Falha ao salvar. Tentando de novo…" conforme `state.status`; `failed` mostra "Não salvo"
- [ ] **Step 3: Escrever `cell.test.tsx`:**
  - modo padrão com texto: mostra o Markdown renderizado; célula vazia mostra "Célula vazia. Clique para editar."
  - clicar na célula, e Enter com ela focada, chamam `onEdit(id)`; com `editing`, mostra a `textarea` (com o texto) e o resultado ao vivo; `Esc` chama `onStopEditing`
  - digitar chama `onChange(id, texto)`
  - o botão "Adicionar célula abaixo" chama `onAddBelow(id)`; a lixeira ("Excluir célula") chama `onDelete(id)`; ambos ausentes no modo preview
  - modo `split` mostra a `textarea` e o resultado em todas as células; modo `preview` não mostra `textarea` nem alça
  - cada célula tem `role="group"` com nome "Célula N de M"
- [ ] **Step 4: Rodar** os três arquivos e confirmar que falham.
- [ ] **Step 5: Implementar** `textarea-edit.ts`, `Toolbar`, `Cell` e `CellList` (dnd-kit: `DndContext` com `PointerSensor` com atraso para toque, `KeyboardSensor` e `sortableKeyboardCoordinates`, `SortableContext` vertical, alça como único ativador, textos de acessibilidade em pt-BR). A barra é `position: sticky` abaixo da barra superior no mobile e rola na horizontal.
- [ ] **Step 6: Rodar `npx vitest run` e `npm run build`** e confirmar verdes.
- [ ] **Step 7: Commit** `feat(editor): barra de ferramentas, células e arrastar`.

---

### Task 10: Imagens na interface (diálogo, colar, arrastar e redimensionar)

**Files:**
- Create: `src/features/estudo/editor/upload.ts`, `src/features/estudo/editor/components/ImageDialog.tsx` e `.module.css`, `ImageResizer.tsx` e `.module.css`
- Modify: `src/features/estudo/editor/components/Cell.tsx`, `MarkdownView.tsx`
- Test: `tests/unit/upload.test.ts`, `tests/unit/image-dialog.test.tsx`, `tests/unit/image-resizer.test.tsx`

**Interfaces:**
- Consumes: rota `POST /estudo/[id]/imagens` (Task 4); `imageMarkdown` (Task 5); `MarkdownView` e `setImageWidth` (Tasks 8 e 6)
- Produces:
  - `uploadImage(studyId: string, file: File): Promise<{ ok: true; path: string; alt: string } | { ok: false; message: string }>` (rede ou resposta inesperada viram `{ ok: false, message: 'Não foi possível salvar a imagem.' }`)
  - `ImageDialog({ open, studyId, onClose, onInsert }: { …; onInsert: (markdown: string) => void })`
  - `ImageResizer` (alça no canto inferior direito) usada pelo `MarkdownView` quando há `onResizeImage`

- [ ] **Step 1: Escrever `upload.test.ts`:** com `fetch` simulado, resposta `200 { path, alt }` vira `ok: true`; `400 { message }` repassa a mensagem; `fetch` rejeitando e JSON inválido viram `'Não foi possível salvar a imagem.'`; a requisição é `POST` para `/estudo/ID/imagens` com `FormData` contendo `file`.
- [ ] **Step 2: Escrever `image-dialog.test.tsx`:**
  - aba "URL": `https://x.com/a.png` com alt `foto` chama `onInsert('![foto](https://x.com/a.png)')`; `javascript:alert(1)` mostra o erro "Use um endereço http ou https." e não insere
  - aba "Enviar do computador": escolher um arquivo chama `uploadImage`, e em sucesso `onInsert('![<alt>](imagens/<nome>)')`; em falha mostra a mensagem no diálogo e não insere; durante o envio o botão fica desabilitado
  - `alt` começa com o nome do arquivo sem extensão e é editável antes de inserir
- [ ] **Step 3: Escrever `image-resizer.test.tsx`:** arrastar a alça 120 px para a direita (eventos de ponteiro) de uma imagem de 300 px chama `onResize(420)` só ao **soltar**, e durante o arrasto a largura exibida muda; o resultado respeita `clampWidth`; o campo "Largura" com `450` + Enter chama `onResize(450)`; teclas `+`/`-` na imagem selecionada mudam 10 px.
- [ ] **Step 4: Rodar** os três arquivos e confirmar que falham.
- [ ] **Step 5: Implementar** `upload.ts`, `ImageDialog` (usa `Modal`), `ImageResizer`, e ligar na `Cell`: colar (`onPaste` com arquivo de imagem) e soltar (`onDrop`) chamam `uploadImage` e inserem `imageMarkdown(alt, path)` na posição do cursor via `applyEditToTextarea`; falha mostra toast "Não foi possível salvar a imagem." (callback `onError`). O reescrever do Markdown usa `setImageWidth`.
- [ ] **Step 6: Rodar `npx vitest run`** e confirmar verde.
- [ ] **Step 7: Commit** `feat(editor): imagens com envio, colar, arrastar e redimensionar`.

---

### Task 11: EditorView, aviso de sair e página

**Files:**
- Create: `src/features/estudo/editor/unsaved-guard.ts`, `src/features/estudo/editor/components/{EditorView,UnsavedDialog}.tsx` e `.module.css`, `src/app/(app)/estudo/[id]/page.tsx`
- Test: `tests/unit/unsaved-guard.test.tsx`, `tests/unit/editor-view.test.tsx`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 10; `saveStudyContent` (Task 1); `getStudyDocument` (Task 1); `normalizeFolderPath` (Task 2)
- Produces:
  - `useUnsavedGuard(active: boolean): { pendingHref: string | null; stay(): void; leave(): void }` (registra, em captura, um `click` que intercepta `<a>` internos enquanto `active`; registra `beforeunload`; `leave()` navega com `router.push(pendingHref)`)
  - `UnsavedDialog({ open, onStay, onLeave })`: título "Sair sem salvar?", botões "Continuar editando" e "Sair sem salvar"
  - `EditorView({ studyId, descricao, pasta, initialCells })` (client)
  - `page.tsx`: `params` Promise; `getStudyDocument(id)`; `null` mostra "Registro não encontrado" com link "← Estudo"

- [ ] **Step 1: Escrever `unsaved-guard.test.tsx`:** inativo não intercepta cliques; ativo, clicar num `<a href="/testes">` chama `preventDefault`, define `pendingHref`; `leave()` chama `router.push('/testes')`; `stay()` limpa `pendingHref`; links externos (`https://…`), com `target="_blank"` ou com Ctrl/Meta pressionado não são interceptados; com `active` verdadeiro o `beforeunload` chama `preventDefault` e com `false` não.
- [ ] **Step 2: Escrever `editor-view.test.tsx`** (`next/navigation` e a action de salvar simulados; timers falsos onde necessário):
  - `initialCells: []` mostra uma célula vazia; com 2 células mostra as duas na ordem
  - clicar em "Adicionar célula abaixo" cria a célula logo abaixo já em edição; "Excluir célula" mostra o toast "Célula excluída." com "Desfazer", e "Desfazer" devolve a célula na mesma posição; excluir a única célula deixa uma vazia
  - editar um texto, esperar 2000 ms e ver `saveStudyContent` chamada com as células atuais e o indicador "Salvo às …"; antes disso, "● Alterações não salvas"
  - "Salvar" e Ctrl+S salvam na hora e mostram o toast "Documento salvo."
  - `saveStudyContent` rejeitando ou devolvendo `{ ok: false }` mostra "Falha ao salvar. Tentando de novo…" e **mantém o texto digitado**
  - clicar em "Visualização dividida" mostra `textarea` em todas as células; "Visualização (preview)" remove `textarea`, alças, lixeiras e "+"; clicar de novo no ativo volta ao padrão
  - `pasta` legada (`Matemática`) mostra o aviso "Defina uma pasta válida para usar imagens" e o botão "Imagem" fica desabilitado; o resto funciona
  - alterações pendentes + clique num link interno abre "Sair sem salvar?"; "Continuar editando" fecha o diálogo; sem alterações pendentes não abre
- [ ] **Step 3: Rodar** os dois arquivos e confirmar que falham.
- [ ] **Step 4: Implementar** `unsaved-guard.ts`, `UnsavedDialog` (usa `Modal`), `EditorView` (estado das células com `cells.ts`, `createAutosave`, toast com `useToast`, modos, célula em edição, ligação da barra à `textarea` da célula em foco, Ctrl+B/I/S) e `page.tsx` com `generateMetadata` usando a Descrição. O cabeçalho mostra "← Estudo" e a Descrição.
- [ ] **Step 5: Rodar `npx vitest run` e `npm run build`** e confirmar verdes.
- [ ] **Step 6: Commit** `feat(editor): página do editor com salvamento e aviso de sair`.

---

### Task 12: Grade abre o editor

**Files:**
- Modify: `src/features/estudo/components/{StudyTable,StudyCardList,RowActions,StudyView}.tsx` e `.module.css`
- Test: `tests/unit/study-view.test.tsx` (acrescentar), `tests/unit/study-rows.test.tsx`

**Interfaces:**
- Consumes: rota `/estudo/[id]` (Task 11)
- Produces: `StudyTable` e `StudyCardList` com `onOpen: (record: StudyRecordRow) => void`; `StudyView` navega com `router.push('/estudo/' + id)`

- [ ] **Step 1: Escrever `study-rows.test.tsx`:** clicar na linha (célula de pasta, de data) e no card chama `onOpen(record)`; a Descrição é um link com `href="/estudo/ID"`; clicar em "Editar registro" e "Excluir registro" chama só `onEdit`/`onDelete`, **não** `onOpen`; Enter na linha focada abre; a linha tem `cursor: pointer` (classe).
- [ ] **Step 2: Acrescentar a `study-view.test.tsx`:** clicar numa linha chama `router.push('/estudo/1')` (id do fixture).
- [ ] **Step 3: Rodar** e confirmar que falha.
- [ ] **Step 4: Implementar:** `onClick` na linha e no card, `stopPropagation` nos botões de `RowActions`, Descrição como `Link`, linha com `tabIndex=0` e Enter. Manter os nomes acessíveis atuais dos botões.
- [ ] **Step 5: Rodar `npx vitest run`** e confirmar verde.
- [ ] **Step 6: Commit** `feat(estudo): clicar na linha abre o editor`.

---

### Task 13: E2E e verificação final

**Files:**
- Create: `tests/e2e/editor.spec.ts`, `tests/e2e/fixtures/pixel.png` (PNG de 1×1 válido)
- Modify: `tests/e2e/helpers.ts` (limpar a pasta temporária base antes de cada teste)

**Interfaces:**
- Consumes: todas as anteriores; `E2E_BASE_DIR` (Task 3)

- [ ] **Step 1: Escrever `editor.spec.ts`** (cada teste recria os dados com `resetData()` e começa em `/estudo`):
  - clicar numa linha abre `/estudo/<id>`; o menu lateral continua e "Estudo" está ativo; a Descrição é o título; "← Estudo" volta à grade
  - adicionar uma célula pelo "+", digitar `# Título` e ver `h1` renderizado ao sair da edição (`Esc`)
  - usar "Negrito" com texto selecionado e ver `**texto**` no Markdown; Ctrl+Z desfaz a formatação
  - salvar com o botão, recarregar a página e ver o mesmo conteúdo e a mesma ordem; a "Data atualização" da grade mudou
  - **autosave:** digitar, esperar o indicador "Salvo às", recarregar e ver o texto
  - reordenar com o teclado (foco na alça, Espaço, seta para baixo, Espaço) e confirmar a nova ordem depois de salvar e recarregar
  - excluir uma célula e clicar em "Desfazer"; excluir a única célula deixa uma vazia
  - modos: "Visualização dividida" mostra Markdown e resultado em todas; "Visualização (preview)" esconde alças e "+"; clicar de novo volta ao padrão
  - **sair sem salvar:** digitar e, antes dos 2 s, clicar em "Testes" mostra "Sair sem salvar?"; "Continuar editando" permanece; depois de salvo, o clique navega direto
  - **imagem:** abrir "Imagem" → enviar `pixel.png` → o arquivo existe em `<pasta do Estudo>\imagens\` (verificado pelo teste via `fs`), a imagem aparece no preview e continua aparecendo depois de recarregar
  - **redimensionar:** selecionar a imagem, digitar 200 no campo "Largura" e ver `|200` no Markdown da célula e a largura aplicada
  - **LaTeX e código:** `$x^2$` mostra `.katex`; um bloco ```` ```js ```` mostra classes `hljs`
  - um Estudo com pasta legada (inserida direto no banco como `Matemática`) abre, mostra o aviso e salva texto normalmente
  - HTML hostil (`<img src=x onerror=alert(1)>`) numa célula não dispara diálogo
- [ ] **Step 2: Rodar `npm run test:e2e`** e corrigir o que falhar na aplicação (nunca relaxar o teste).
- [ ] **Step 3: Verificação final:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` e `npm run test:e2e` passam; `git status` não mostra mudanças em `Design/`; nenhuma pasta fora de `os.tmpdir()` foi criada pelos testes.
- [ ] **Step 4: Commit** `test: e2e do editor de células`.
