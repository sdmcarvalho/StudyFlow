# StudyFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o projeto StudyFlow (Next.js + TypeScript) com a estrutura de pastas por feature e a área Estudo funcional e persistida, fiel ao protótipo em `Design/`.

**Architecture:** App Router do Next.js; uma pasta por área em `src/features/`; componentes genéricos em `src/components/`; acesso ao banco só por `queries.ts`/`actions.ts` de cada feature, sempre filtrando por `userId`. Busca, ordenação e paginação são puras (`list.ts`) e testadas sem banco.

**Tech Stack:** Next.js (App Router) + TypeScript, Prisma + SQLite, zod, CSS Modules, Vitest (+ Testing Library, jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-studyflow-estrutura-design.md`. O protótipo `Design/index.html`, `Design/script.js`, `Design/styles.css` e `Design/tokens.json` é a referência de visual, comportamento e textos.

## Global Constraints

- `Design/` não é alterada. Fica excluída do `tsconfig.json` (`exclude`) e do ESLint.
- Idioma da interface: pt-BR. Todo texto visível vem de `Design/index.html` e `Design/script.js`, copiado literalmente. Textos novos definidos neste plano: `Não foi possível salvar. Tente novamente.`, `Registro não encontrado.`, `Use no máximo {n} caracteres.`.
- Limites: descrição 80 caracteres, pasta 40, página com 5 registros, toast com 5000 ms.
- Mensagens de validação: `Informe uma descrição.`, `Informe uma pasta.`, `Informe uma data válida.`.
- `dataInicial` é string `YYYY-MM-DD`. "Data atualização" exibida vem de `updatedAt`, formatada `DD/MM/AAAA`.
- Exclusão é lógica (`deletedAt`). Toda query e action filtra por `userId` vindo de `getCurrentUserId()` e por `deletedAt: null` (exceto `restore`).
- Regras de dependência: `components/ui` não importa de `features/`; uma feature não importa de outra; só `queries.ts`/`actions.ts` usam `lib/db.ts`.
- Estilo: CSS Modules sobre `src/styles/tokens.css`; sem Tailwind; sem sombras (profundidade só por bordas de 1px); cores e contrastes de `Design/tokens.json`.
- Testes unitários usam um banco SQLite próprio (`prisma/test.db`), nunca `dev.db`. Ambos ficam no `.gitignore`.
- Testes e2e usam `prisma/e2e.db`.

## Review Focus

1. `?page=` inválido ou fora do intervalo (`abc`, `0`, `-3`, `2.5`, `999`) e exclusão do último item da última página: a lista mostra página 1 ou a última página, sem erro. Testado na Task 3 e na Task 7.
2. Descrição ou pasta só com espaços, acima do limite, e data inexistente (`2026-02-30`): rejeitados com a mensagem do campo. Task 3.
3. Busca com `%`, `_`, `(`, `\`, `.*` e com acentos: tratada como texto literal; `calculo` acha `Cálculo`. Task 3.
4. HTML na descrição (`<img src=x onerror=alert(1)>`): exibido como texto, nunca interpretado. Task 7.
5. Editar, excluir ou restaurar id inexistente, de outro usuário ou já excluído: devolve `{ ok: false, message: 'Registro não encontrado.' }` sem exceção. Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/dates.ts` | `formatDateBR`, `toIsoDate`, `todayIso`, `isValidIsoDate` |
| `src/lib/db.ts` | cliente Prisma único (`db`) |
| `src/lib/current-user.ts` | `getCurrentUserId()`, ponto de troca para o login |
| `src/styles/tokens.css` | variáveis CSS de `Design/tokens.json` |
| `src/components/ui/*` | Button, Modal, Toast (+ `useToast`), SearchField, Pagination, EmptyState |
| `src/components/layout/*` | AppShell, Sidebar, Topbar |
| `src/features/estudo/schema.ts` | validação zod e `parseStudyRecordInput` |
| `src/features/estudo/list.ts` | funções puras: `normalize`, `parsePageParam`, `buildListPage`, `buildStudyHref` |
| `src/features/estudo/queries.ts` | `listStudyRecords` |
| `src/features/estudo/actions.ts` | server actions de criar, editar, excluir, restaurar |
| `src/features/estudo/components/*` | StudyView, StudyTable, StudyCardList, StudyFormModal, DeleteConfirmModal |

`list.ts` e `StudyView.tsx` não estavam na árvore original da spec. Foram adicionados para manter a lógica pura testável e o estado de interface em um único componente; a árvore da spec já foi atualizada.

---

### Task 1: Scaffold, ferramentas e esqueleto de pastas

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `README.md`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- As demais pastas da árvore da spec nascem nas tasks seguintes, junto com os arquivos que as ocupam (git não guarda pastas vazias).

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `start`, `lint`, `test` (`vitest run`), `test:e2e` (`playwright test`), `db:migrate` (`prisma migrate dev`), `db:seed` (`tsx prisma/seed.ts`). Alias `@/*` → `src/*` no TypeScript e no Vitest.

- [ ] **Step 1: Inicializar git na raiz** (`git init`; a pasta ainda não é repositório). Adicionar `.gitignore` com `node_modules`, `.next`, `.env`, `*.db`, `*.db-journal`, `test-results`, `playwright-report`.
- [ ] **Step 2: Gerar o app** com `npx create-next-app@latest` numa pasta temporária vazia, com TypeScript, App Router, `src/`, ESLint, npm, sem Tailwind, alias `@/*`. Mover os arquivos gerados para a raiz sem tocar em `Design/` nem `docs/`.
- [ ] **Step 3: Excluir `Design` do `tsconfig.json` e do ESLint.**
- [ ] **Step 4: Instalar dependências:** `prisma`, `@prisma/client` (e o adapter SQLite que a versão corrente do Prisma exigir), `zod`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@vitejs/plugin-react`, `@playwright/test`, `tsx`. Instalar os navegadores do Playwright.
- [ ] **Step 5: Criar `vitest.config.ts`** com ambiente `jsdom`, alias `@`, `include: ['tests/unit/**/*.test.{ts,tsx}']`.
- [ ] **Step 6: Criar `src/app/page.tsx`** que faz `redirect('/estudo')`, `.env.example` com `DATABASE_URL="file:./dev.db"` e `README.md` com setup (`npm install`, copiar `.env.example`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`) e a lista de scripts.
- [ ] **Step 7: Verificar:** `npm run build` termina sem erros e `npx vitest run --passWithNoTests` termina com código 0.
- [ ] **Step 8: Commit** `chore: scaffold Next.js, tooling e README`.

---

### Task 2: Tokens, componentes `ui/` e `lib/dates.ts`

**Files:**
- Create: `src/styles/tokens.css`, `src/lib/dates.ts`, `src/components/ui/{Button,Modal,Toast,SearchField,Pagination,EmptyState}.tsx` e um `.module.css` por componente
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: `tests/unit/dates.test.ts`, `tests/unit/pagination.test.tsx`, `tests/unit/modal.test.tsx`

**Interfaces:**
- Produces:
  - `formatDateBR(iso: string): string`, `toIsoDate(date: Date): string` (data local), `todayIso(): string`, `isValidIsoDate(s: string): boolean`
  - `Button({ variant: 'primary' | 'secondary' | 'danger', icon?: ReactNode, ...ButtonHTMLAttributes })`
  - `Modal({ open: boolean, title: string, onClose: () => void, role?: 'dialog' | 'alertdialog', initialFocusRef?: RefObject<HTMLElement>, children })`
  - `SearchField({ value: string, onChange: (v: string) => void, onClear: () => void })`
  - `Pagination({ page: number, totalPages: number, onPageChange: (p: number) => void })`
  - `EmptyState({ icon: ReactNode, title: string, description: string, action?: ReactNode })`
  - `Toast({ message: string, visible: boolean, onUndo?: () => void })` e `useToast(): { toast: { message: string, onUndo?: () => void } | null, show(message: string, onUndo?: () => void): void, hide(): void }` (some após 5000 ms)

- [ ] **Step 1: Escrever `tests/unit/dates.test.ts`:**
  - `formatDateBR('2026-10-25') === '25/10/2026'`
  - `toIsoDate(new Date(2026, 9, 5)) === '2026-10-05'`
  - `isValidIsoDate` é `true` para `'2026-02-28'` e `'2024-02-29'`; `false` para `'2026-02-30'`, `'2026-02-29'`, `'2026-13-01'`, `''`, `'2026-2-3'`, `'04/08/2026'`
- [ ] **Step 2: Escrever `tests/unit/pagination.test.tsx`:**
  - `totalPages = 1` não renderiza nada
  - página 1 desabilita "Página anterior"; última página desabilita "Próxima página"
  - exibe `Página 2 de 3`
  - clicar em "Próxima página" chama `onPageChange(3)` estando na página 2
- [ ] **Step 3: Escrever `tests/unit/modal.test.tsx`:**
  - `open = false` não renderiza
  - `Escape` e clique no overlay chamam `onClose`; clique dentro do painel não chama
  - o foco inicial vai para `initialFocusRef` (ou o primeiro campo) e volta ao elemento anterior ao fechar
  - título ligado por `aria-labelledby`, `aria-modal="true"`
- [ ] **Step 4: Rodar `npx vitest run`** e confirmar que os 3 arquivos falham (módulos inexistentes).
- [ ] **Step 5: Implementar `src/lib/dates.ts`** com as assinaturas acima; `isValidIsoDate` valida formato `^\d{4}-\d{2}-\d{2}$` e que a data existe no calendário.
- [ ] **Step 6: Criar `src/styles/tokens.css`** com todas as variáveis de `Design/tokens.json` usando os nomes `cssVar` do arquivo (cores, raios, espaçamentos, layout, motion). `--font-sans` usa `var(--font-inter)` seguido do stack do token. Em `layout.tsx`, carregar Inter (400, 500, 600) com `next/font/google` expondo `--font-inter`; importar `tokens.css` em `globals.css`; `lang="pt-BR"`.
- [ ] **Step 7: Implementar os componentes `ui/`** portando visual e comportamento de `Design/styles.css`/`script.js` para CSS Modules. Modal: overlay + painel, `Escape`, clique fora, retorno de foco. Toast: `role="status"`, `aria-live="polite"`, botão "Desfazer" só com `onUndo`. Sem importar nada de `features/`.
- [ ] **Step 8: Rodar `npx vitest run`** e confirmar que passa; rodar `npm run build`.
- [ ] **Step 9: Commit** `feat: tokens, componentes ui e utilitários de data`.

---

### Task 3: Schema e listagem puras da feature Estudo

**Files:**
- Create: `src/features/estudo/schema.ts`, `src/features/estudo/list.ts`
- Test: `tests/unit/estudo-schema.test.ts`, `tests/unit/estudo-list.test.ts`

**Interfaces:**
- Consumes: `isValidIsoDate` (Task 2)
- Produces:
  - `type StudyRecordInput = { descricao: string, pasta: string, dataInicial: string }`
  - `type FieldErrors = Partial<Record<keyof StudyRecordInput, string>>`
  - `parseStudyRecordInput(input: unknown): { ok: true, data: StudyRecordInput } | { ok: false, fieldErrors: FieldErrors }` (faz trim)
  - `type StudyRecordRow = { id: string, descricao: string, pasta: string, dataInicial: string, dataAtualizacao: string }`
  - `type ListPage = { items: StudyRecordRow[], total: number, totalAll: number, page: number, totalPages: number, start: number }` (`total` = após o filtro; `totalAll` = sem filtro; `start` = índice base 0 do primeiro item)
  - `PAGE_SIZE = 5`
  - `normalize(s: string): string` (minúsculas, sem acentos)
  - `parsePageParam(raw: string | string[] | undefined): number` (primeiro elemento se array; inteiro positivo, senão 1)
  - `buildListPage(rows: StudyRecordRow[], opts: { q: string, page: number }): ListPage` (mantém a ordem recebida; `q` com trim; busca em `descricao` e `pasta`; ajusta `page` ao intervalo `1..totalPages`; `NaN` vira 1; `totalPages` mínimo 1)
  - `buildStudyHref(q: string, page: number): string`

- [ ] **Step 1: Escrever `estudo-schema.test.ts`:**
  - entrada válida `{ descricao: '  Cálculo I  ', pasta: ' Matemática ', dataInicial: '2026-08-04' }` retorna `data.descricao === 'Cálculo I'` e `data.pasta === 'Matemática'`
  - descrição vazia ou `'   '` → `fieldErrors.descricao === 'Informe uma descrição.'`; pasta idem com `'Informe uma pasta.'`
  - `dataInicial` `''`, `'2026-02-30'` e `'04/08/2026'` → `'Informe uma data válida.'`
  - descrição de 80 caracteres passa; de 81 falha com `'Use no máximo 80 caracteres.'`; pasta 40 passa, 41 falha com `'Use no máximo 40 caracteres.'`
  - `parseStudyRecordInput(null)` e objeto sem campos retornam `ok: false` sem lançar
- [ ] **Step 2: Escrever `estudo-list.test.ts`** com 8 linhas de fixture (as do seed):
  - `normalize('Cálculo') === 'calculo'`, `normalize('AÇÃO') === 'acao'`
  - sem `q`, página 1: 5 itens, `total 8`, `totalPages 2`, `start 0`; página 2: 3 itens, `start 5`
  - `page` 999 → 2; `0`, `-3`, `NaN` → 1
  - `q: 'calculo'` acha "Cálculo I…"; `q: 'MEDICINA'` acha pela pasta; `q: '   '` equivale a sem filtro
  - `q` igual a `%`, `_`, `(`, `\`, `.*` não lança e retorna `total 0`; uma linha com `'Taxa 100% real'` é achada por `'100%'`
  - `totalAll` é 8 mesmo com `q` sem resultados; lista vazia → `items []`, `total 0`, `totalAll 0`, `totalPages 1`, `page 1`
  - `parsePageParam`: `undefined`→1, `'2'`→2, `'abc'`→1, `'0'`→1, `'-3'`→1, `'2.5'`→1, `['3','4']`→3
  - `buildStudyHref('',1)==='/estudo'`, `('calc',1)==='/estudo?q=calc'`, `('',2)==='/estudo?page=2'`, `('a b',2)==='/estudo?q=a+b&page=2'`
- [ ] **Step 3: Rodar os dois arquivos** e confirmar que falham.
- [ ] **Step 4: Implementar `schema.ts` e `list.ts`** com as assinaturas acima. A busca usa `String.prototype.includes` sobre texto normalizado (nunca regex nem SQL `LIKE`).
- [ ] **Step 5: Rodar `npx vitest run`** e confirmar que passa.
- [ ] **Step 6: Commit** `feat(estudo): validação e listagem puras`.

---

### Task 4: Banco, usuário local, queries e actions

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/db.ts`, `src/lib/current-user.ts`, `src/features/estudo/queries.ts`, `src/features/estudo/actions.ts`, `tests/unit/setup-db.ts`
- Modify: `vitest.config.ts` (variável `DATABASE_URL` apontando para `prisma/test.db`, `setupFiles: ['tests/unit/setup-db.ts']`)
- Test: `tests/unit/estudo-data.test.ts`

**Interfaces:**
- Consumes: `parseStudyRecordInput`, `buildListPage`, `StudyRecordRow`, `ListPage`, `FieldErrors` (Task 3); `toIsoDate` (Task 2)
- Produces:
  - `db` (cliente Prisma) em `src/lib/db.ts`
  - `getCurrentUserId(): Promise<string>`: faz `upsert` do usuário de id `local-user` e nome `Usuário local` e devolve o id
  - `listStudyRecords(params: { q?: string, page?: number }): Promise<ListPage>`: busca todos os registros não excluídos do usuário ordenados por `updatedAt desc`, mapeia para `StudyRecordRow` (`dataAtualizacao = toIsoDate(updatedAt)`) e chama `buildListPage`
  - `type ActionResult<T = undefined> = { ok: true, data: T } | { ok: false, fieldErrors?: FieldErrors, message?: string }`
  - `createStudyRecord(input: unknown): Promise<ActionResult<{ id: string }>>`
  - `updateStudyRecord(id: string, input: unknown): Promise<ActionResult>`
  - `deleteStudyRecord(id: string): Promise<ActionResult>`
  - `restoreStudyRecord(id: string): Promise<ActionResult>`

- [ ] **Step 1: Criar `prisma/schema.prisma`** com os modelos `User` e `StudyRecord` da seção 3 da spec (`dataInicial String`), datasource SQLite lendo `DATABASE_URL`, e criar a migration `init` com `npm run db:migrate -- --name init`. Seguir a documentação da versão corrente do Prisma para o client e o adapter SQLite.
- [ ] **Step 2: Implementar `db.ts`** (instância única, reaproveitada em dev) e `current-user.ts`.
- [ ] **Step 3: Implementar `prisma/seed.ts`:** garante o usuário `local-user`, apaga os registros dele e recria os 8 registros de `Design/script.js` (`records`), gravando `dataInicial` e `updatedAt` iguais ao protótipo (`updatedAt` explícito, às 12:00 locais). Idempotente.
- [ ] **Step 4: Montar `tests/unit/setup-db.ts`:** antes da suíte roda `prisma migrate deploy` contra `prisma/test.db`; antes de cada teste apaga `studyRecord` e `user`. Mockar `next/cache` (`revalidatePath` como `vi.fn()`) com `vi.mock`, porque a função lança fora de uma requisição Next.
- [ ] **Step 5: Escrever `estudo-data.test.ts`:**
  - `createStudyRecord` válido → `ok: true`; o registro aparece em `listStudyRecords` com `dataAtualizacao` igual a hoje
  - `createStudyRecord` inválido → `ok: false` com `fieldErrors.descricao` e nada gravado
  - `updateStudyRecord` altera os campos e devolve `ok: true`; com dados inválidos devolve `fieldErrors`
  - `deleteStudyRecord` some da lista; `restoreStudyRecord` volta com o mesmo `dataAtualizacao` e na mesma posição da ordenação (criar A e B com `updatedAt` explícitos, excluir e restaurar A, comparar a ordem antes e depois)
  - `updateStudyRecord`, `deleteStudyRecord` e `restoreStudyRecord` com id inexistente → `{ ok: false, message: 'Registro não encontrado.' }`
  - registro de outro usuário (criado direto via `db`) não aparece na lista e as três actions nele devolvem `Registro não encontrado.`
  - excluir um registro já excluído e restaurar um não excluído → `Registro não encontrado.`
  - com 7 registros, `listStudyRecords({ page: 2 })` devolve 2 itens; `listStudyRecords({ q: 'calculo' })` filtra sem acento
  - excluir o único item da página 2 e listar `{ page: 2 }` devolve a página 1
  - descrição `<img src=x onerror=alert(1)>` é gravada e devolvida sem alteração (escape é responsabilidade da renderização)
- [ ] **Step 6: Rodar o teste** e confirmar que falha.
- [ ] **Step 7: Implementar `queries.ts` e `actions.ts`** (`'use server'`). Cada action chama `getCurrentUserId()`, valida com `parseStudyRecordInput`, usa `where: { id, userId, deletedAt: null }` e, em `delete`/`restore`, passa `updatedAt` explícito igual ao valor atual para não alterá-lo. Chama `revalidatePath('/estudo')` em sucesso. Exceções inesperadas viram `{ ok: false, message: 'Não foi possível salvar. Tente novamente.' }`.
- [ ] **Step 8: Rodar `npx vitest run`** e confirmar que passa; rodar `npm run db:seed` e conferir 8 registros.
- [ ] **Step 9: Commit** `feat(estudo): banco, queries e actions`.

---

### Task 5: Layout da aplicação e páginas "em breve"

**Files:**
- Create: `src/components/layout/{AppShell,Sidebar,Topbar}.tsx` e `.module.css`, `src/app/(app)/layout.tsx`, `src/app/(app)/testes/page.tsx`, `src/app/(app)/agenda/page.tsx`

**Interfaces:**
- Consumes: `EmptyState` (Task 2)
- Produces: `AppShell({ children })` (client) que envolve as páginas autenticadas; itens do menu Estudo (`/estudo`), Testes (`/testes`), Agenda (`/agenda`) com ícones de `Design/index.html` e item ativo por `usePathname()`.

- [ ] **Step 1: Implementar `Sidebar`, `Topbar` e `AppShell`** a partir de `Design/index.html` e `Design/styles.css`: sidebar de 248px no desktop, 72px com tooltips no tablet, drawer com overlay no mobile (< 768px). Estado do drawer no `AppShell`: abre pelo botão do menu (`aria-expanded`, `aria-controls`, `aria-label` alternando "Abrir menu"/"Fechar menu"), fecha com `Escape`, clique no overlay, clique num item e ao redimensionar para ≥ 768px; bloqueia o scroll do `body` enquanto aberto.
- [ ] **Step 2: Criar `(app)/layout.tsx`** usando `AppShell`, e as páginas `testes` e `agenda` com `EmptyState` de título "Em breve" e descrição curta, dentro do cabeçalho de página igual ao do protótipo (`h1` com o nome da área).
- [ ] **Step 3: Verificar:** `npm run build` passa; `npm run dev` e abrir `/testes` e `/agenda` (menu e drawer funcionando em 375px e 1024px). `/estudo` ainda dá 404 até a Task 6.
- [ ] **Step 4: Commit** `feat: layout com sidebar e páginas em breve`.

---

### Task 6: Tela de Estudo

**Files:**
- Create: `src/app/(app)/estudo/page.tsx`, `src/features/estudo/components/{StudyView,StudyTable,StudyCardList,StudyFormModal,DeleteConfirmModal}.tsx` e `.module.css`

**Interfaces:**
- Consumes: `listStudyRecords`, actions e tipos (Tasks 3 e 4); `buildStudyHref`, `parsePageParam`; componentes `ui/` (Task 2); `todayIso`, `formatDateBR`
- Produces:
  - `page.tsx` (Server Component) que aguarda `searchParams` (é uma Promise nas versões correntes do Next), lê `q` e `page`, chama `listStudyRecords` e renderiza `<StudyView page={ListPage} q={string} />`
  - `StudyView({ page: ListPage, q: string })` (client)
  - `StudyTable` e `StudyCardList`: `({ items: StudyRecordRow[], onEdit: (r: StudyRecordRow) => void, onDelete: (r: StudyRecordRow) => void })`
  - `StudyFormModal({ open: boolean, record: StudyRecordRow | null, onClose: () => void, onSaved: (kind: 'created' | 'updated') => void })`; chama `createStudyRecord`/`updateStudyRecord` e mostra `fieldErrors` junto de cada campo
  - `DeleteConfirmModal({ record: StudyRecordRow | null, pending: boolean, onClose: () => void, onConfirm: () => void })`; foco inicial no botão "Excluir"

- [ ] **Step 1: Implementar `page.tsx`** e `StudyView`. Textos, ordem de colunas, tabela no desktop e cards no mobile, rodapé com contagem, estados vazios (`totalAll === 0` → "Nenhum registro de estudo ainda"; `total === 0` com busca → "Nenhum resultado encontrado" com botão "Limpar pesquisa"): copiar de `Design/index.html` e `Design/script.js`.
- [ ] **Step 2: Busca na URL:** o campo mantém estado local e, após 250 ms sem digitar, faz `router.replace(buildStudyHref(q, 1))`; "Limpar" limpa na hora. Paginação usa `router.push(buildStudyHref(q, p))`.
- [ ] **Step 3: Criar e editar:** após `onSaved`, fechar o modal, ir para `buildStudyHref(q, 1)` e mostrar o toast "Registro criado." ou "Registro atualizado.". Data padrão do modal de criação: `todayIso()`. Em falha geral da action, toast `Não foi possível salvar. Tente novamente.` e o modal continua aberto com os dados.
- [ ] **Step 4: Excluir e desfazer:** confirmar no `DeleteConfirmModal`; ao concluir, toast "Registro excluído." com "Desfazer", que chama `restoreStudyRecord(id)`. A página atual é mantida; o servidor ajusta ao intervalo válido.
- [ ] **Step 5: Renderizar `descricao` e `pasta` sempre como texto React** (sem `dangerouslySetInnerHTML`).
- [ ] **Step 6: Verificar:** `npm run build` passa; `npm run dev`, rodar `npm run db:seed` e conferir manualmente criar, editar, excluir com desfazer, busca com acento e paginação em 375px e 1024px.
- [ ] **Step 7: Commit** `feat(estudo): tela de estudo com busca, paginação, modais e desfazer`.

---

### Task 7: Testes e2e e verificação final

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/estudo.spec.ts`, `tests/e2e/navegacao.spec.ts`

**Interfaces:**
- Consumes: scripts e seed (Tasks 1 e 4), telas (Tasks 5 e 6)

- [ ] **Step 1: Configurar `playwright.config.ts`:** `webServer` que sobe a aplicação com `DATABASE_URL=file:./e2e.db`, `baseURL` local, projeto Chromium; `globalSetup` aplica `prisma migrate deploy` e o seed no `e2e.db`. Um `beforeEach` em `estudo.spec.ts` reinicia os dados executando o seed (`tsx prisma/seed.ts`) com `DATABASE_URL=file:./e2e.db`.
- [ ] **Step 2: Escrever `tests/e2e/estudo.spec.ts`:**
  - `/` redireciona para `/estudo`; a primeira página mostra 5 linhas e "Mostrando 1–5 de 8 registros"
  - criar um registro: aparece no topo, toast "Registro criado."
  - editar a descrição: toast "Registro atualizado." e o registro vai para o topo
  - modal com campos vazios mostra as 3 mensagens de validação e não fecha
  - excluir → toast "Registro excluído." → "Desfazer" → o registro volta na mesma posição
  - excluir sem desfazer: o registro não volta ao recarregar a página
  - busca `calculo` mostra "1 resultado para “calculo”"; busca sem resultado mostra "Nenhum resultado encontrado" e "Limpar pesquisa" restaura a lista; a URL contém `?q=`
  - `/estudo?page=999` e `/estudo?page=abc` carregam sem erro (última página e primeira)
  - descrição `<img src=x onerror=alert(1)>` aparece como texto e nenhum diálogo é disparado
  - com o seed (8 registros, página 2 com 3 itens), excluir 2 registros e depois o único item restante da página 2 (em `/estudo?page=2`) deixa a tela na página 1, sem erro
- [ ] **Step 3: Escrever `tests/e2e/navegacao.spec.ts`:** clicar em Testes e Agenda mostra "Em breve" e marca o item ativo; em viewport 375px o menu abre o drawer e fecha com `Escape`.
- [ ] **Step 4: Rodar `npm run test:e2e`** e corrigir o que falhar na aplicação (não relaxar os testes).
- [ ] **Step 5: Verificação final:** `npm run lint`, `npm test`, `npm run build` e `npm run test:e2e` passam; `git status` não mostra mudanças em `Design/`.
- [ ] **Step 6: Commit** `test: e2e da área Estudo e navegação`.
