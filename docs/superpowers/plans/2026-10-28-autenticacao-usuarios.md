# Autenticação de Usuários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login por e-mail e senha, dados isolados por usuário (Estudos, Cards, Testes, Agenda, IA, pastas no disco) e um único superusuário que gerencia os demais na tela Usuários.

**Architecture:** Sessão em banco feita à mão (tabela `Session` guarda o SHA-256 do token; cookie `httpOnly`), sem Auth.js, para que desativar/excluir/redefinir senha revogue na hora. `getCurrentUserId()` passa a ler a sessão e é a autoridade; `src/proxy.ts` só faz checagem otimista do cookie. O superusuário nasce de `npm run auth:bootstrap`, que converte o `local-user` no lugar (mesmo id, sem migrar dados). Cada usuário tem uma raiz de pastas `<STUDYFLOW_BASE_DIR>\<folderName>` imposta no servidor.

**Tech Stack:** Next.js 16.4.3 App Router (`proxy.ts`, não `middleware.ts`), React 19, Prisma 7 + SQLite (libsql), `bcryptjs`, Zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-autenticacao-usuarios-design.md` (ler antes de começar; este plano a implementa).

## Global Constraints

- **AGENTS.md:** este Next tem breaking changes. Antes de escrever código que use APIs do Next, ler o guia correspondente em `node_modules/next/dist/docs/` (`01-app/02-guides/authentication.md`, `01-app/03-api-reference/03-file-conventions/proxy.md`). `cookies()` é assíncrono.
- Sem Auth.js/`next-auth`. Única dependência nova: `bcryptjs` (custo 10). Se a versão instalada não trouxer tipos próprios, instalar `@types/bcryptjs` como devDependency.
- Sessão: token de 32 bytes aleatórios em base64url; banco guarda só `SHA-256` (hex); cookie `studyflow_session`, `httpOnly`, `sameSite=lax`, `secure` em produção, 14 dias, sem renovação.
- Senha: mínimo 8 caracteres, ao menos uma letra e um número, no máximo 72 **bytes** UTF-8 (limite do bcrypt). E-mail: `trim().toLowerCase()`, único.
- Mensagens (pt-BR, exatas): `"E-mail ou senha incorretos."`, `"Conta desativada. Fale com o administrador."`, `"Muitas tentativas. Tente novamente em alguns minutos."`, `"Sessão expirada, entre novamente."`, `"Acesso negado."`.
- Limite de login: 5 falhas por e-mail em 15 minutos (contador em memória).
- Um único `SUPER`: nada no código cria outro; a tela Usuários só cria `USER` e nunca age sobre o `SUPER`.
- As pastas no disco nunca são apagadas pelo app (exclusão de usuário só apaga linhas do banco).
- `?next=` só é aceito se começar com `/` e não com `//` nem `/\`; nunca `/login`.
- Nomes de campos de formulário em português (`nome`, `email`, `senha`, `senhaAtual`, `novaSenha`, `confirmacao`), no estilo de `descricao`/`pasta`.
- Convenções do repo: CSS Modules, componentes cliente com `"use client"`, actions devolvem `{ ok, data | fieldErrors | message }`, testes de dados com `// @vitest-environment node` e o `prisma/test.db`.
- Tudo na branch `feat/autenticacao`. Commits em pt-BR, com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nunca commitar `.env`, `*.db`, `test-results/`, `docs/Pedido do editor de textos.docx`, `studyflow.bat`, `src/components/ui/input.tsx`, `src/components/ui/label.tsx`, `src/lib/utils.ts` (nada disso é desta feature).
- Verificação padrão ao fim de cada tarefa: `npm test`, `npx tsc --noEmit`, `npm run lint` verdes (as exceções estão indicadas).

## Review Focus

1. Senha com mais de 72 bytes (o bcrypt truncaria em silêncio): rejeitada na criação, redefinição e troca. Teste na Tarefa 2.
2. E-mail com maiúsculas/espaços (`" Ana@X.com "`) entra e não duplica conta existente. Testes nas Tarefas 5 e 8.
3. Nome sem caracteres válidos para pasta do Windows (`"***"`, `"CON"`, `"Ana."`) ou repetido: `folderName` sempre válido e único, sem diferenciar maiúsculas. Teste na Tarefa 2.
4. Cookie de sessão de usuário desativado/excluído durante a navegação: a próxima action devolve "Sessão expirada, entre novamente.", a API devolve 401 e a página redireciona; nada quebra. Testes na Tarefa 10.
5. Excluir usuário que tem Estudos na lixeira, Cards, Resultados, Agenda e sessões: nenhuma linha sobra e os dados de outros usuários ficam intactos. Teste na Tarefa 8.

---

### Task 0: Linha de base — WIP dos cards e sincronia do schema

O `schema.prisma` não descreve `CardResult`, `Schedule` e `StudyRecord.lastTestedAt`, que existem nas migrations (não commitadas) e já são usados pelo código dos cards/agenda (também não commitado). Sem isto as próximas tarefas não têm base limpa.

**Files:**
- Modify: `prisma/schema.prisma`
- Commit (já existem no disco): `prisma/migrations/20261026032859_add_card_results/`, `prisma/migrations/20261026045510_add_schedule/`, `src/app/api/cards/`, `src/app/api/testes/`, `src/features/agenda/`, `src/features/cards/components/TestList.*`, `src/features/cards/components/TestModal.*`, `tests/unit/ai-card-generation.test.ts`, `tests/unit/card-form-modal-ai.test.tsx`, `tests/unit/editor-summarize.test.tsx`

**Interfaces:**
- Produces: `schema.prisma` fiel às migrations: `model CardResult { id, cardId, studyId, userId, correct Boolean, createdAt DateTime @default(now()) }` com relações para `Card`, `StudyRecord` e `User`; `model Schedule { id, studyId, userId, reviewDate String, createdAt String, session String, status String @default("Ativo") }` com relações para `StudyRecord` e `User`; `StudyRecord.lastTestedAt DateTime?`; índices iguais aos do SQL (`[userId, cardId]`, `[userId, studyId]` em `CardResult`; `[userId, studyId]`, `[userId, reviewDate]` em `Schedule`). Relações inversas em `User` (`cardResults`, `schedules`), `StudyRecord` e `Card`.

- [ ] **Step 1: Confirmar que o código dos cards já compila**

Run: `npx tsc --noEmit`
Expected: sem erros (o client gerado em `src/generated/prisma` já conhece esses modelos). Se houver erros não relacionados ao schema, parar e avisar o usuário.

- [ ] **Step 2: Escrever os modelos no schema**

Espelhar exatamente as colunas, tipos (`Schedule.createdAt` e `reviewDate` são `String`, como no SQL) e índices das duas migrations.

- [ ] **Step 3: Verificar que schema e migrations coincidem**

Run: `npx prisma migrate dev --create-only --name probe`
Expected: "Already in sync, no schema change or pending migration was found." Se criar uma pasta `*_probe`, apagá-la, corrigir o schema e repetir.

- [ ] **Step 4: Regenerar o client e rodar tudo**

Run: `npm run db:generate && npx tsc --noEmit && npm test`
Expected: sem erros de tipo; testes verdes. Se algum teste do WIP dos cards falhar por motivo que não seja o schema, registrar quais falham e **avisar o usuário antes de seguir** (o commit de linha de base não deve esconder falhas).

- [ ] **Step 5: Commit da linha de base (dois commits)**

```bash
git add prisma/schema.prisma prisma/migrations/20261026032859_add_card_results prisma/migrations/20261026045510_add_schedule
git commit -m "fix(prisma): sincroniza schema.prisma com as migrations dos cards e da agenda"
git add src/app/api/cards src/app/api/testes src/features/agenda src/features/cards/components/TestList.module.css src/features/cards/components/TestList.tsx src/features/cards/components/TestModal.module.css src/features/cards/components/TestModal.tsx tests/unit/ai-card-generation.test.ts tests/unit/card-form-modal-ai.test.tsx tests/unit/editor-summarize.test.tsx
git commit -m "feat(cards): linha de base do WIP dos testes e da agenda antes da autenticação"
```

---

### Task 1: Dependência, variáveis de ambiente e migration de usuários e sessões

**Files:**
- Modify: `package.json`, `package-lock.json`, `.env.example`, `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_auth_users_sessions/migration.sql` (gerada)

**Interfaces:**
- Produces: `enum Role { SUPER USER }`; `User` com `email String? @unique`, `passwordHash String?`, `folderName String? @unique`, `role Role @default(USER)`, `active Boolean @default(true)`, `createdAt DateTime @default(now())`, `sessions Session[]`; `model Session { id String @id @default(cuid()); tokenHash String @unique; userId String; user User @relation(..., onDelete: Cascade); expiresAt DateTime; createdAt DateTime @default(now()); @@index([userId]) }`. Os três campos opcionais existem só para a linha `local-user` aceitar a migration; o código sempre os preenche.

- [ ] **Step 1: Backup do banco de desenvolvimento**

Run: `cp prisma/dev.db ../StudyFlow-dev.db.bak` (fora do repositório).
Expected: arquivo criado em `C:\Dev\StudyFlow-dev.db.bak`.

- [ ] **Step 2: Instalar `bcryptjs` e documentar o ambiente**

Run: `npm install bcryptjs`. Conferir se o pacote traz tipos (`node_modules/bcryptjs/types.d.ts` ou `"types"` no package.json); se não, `npm install -D @types/bcryptjs`.
Em `.env.example` acrescentar `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD`, `SUPERUSER_NAME` com comentário (usados só por `npm run auth:bootstrap`). Não existe `AUTH_SECRET`.

- [ ] **Step 3: Alterar o schema e gerar a migration**

Aplicar os modelos acima. Run: `npx prisma migrate dev --name auth_users_sessions`.
Expected: migration criada e aplicada ao `dev.db`; o `local-user` e seus dados continuam lá (`sqlite`: conferir com `npx tsx -e "import {db} from './src/lib/db'; db.user.findMany().then(console.log)"`, esperando `role: 'USER'`, `active: true`).

- [ ] **Step 4: Regenerar e verificar**

Run: `npm run db:generate && npx tsc --noEmit && npm test`
Expected: tudo verde (o app ainda usa o `local-user`; nada mudou no comportamento).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): bcryptjs, campos de usuário e tabela Session"
```

---

### Task 2: Primitivas de autenticação (senha, schemas, sessão, limite, `next`, `folderName`)

**Files:**
- Create: `src/features/auth/constants.ts`, `password.ts`, `schema.ts`, `session.ts`, `throttle.ts`, `next-url.ts`, `folder-name.ts`, `types.ts`
- Test: `tests/unit/auth-password.test.ts`, `auth-schema.test.ts`, `auth-session.test.ts`, `auth-throttle.test.ts`, `auth-next-url.test.ts`, `auth-folder-name.test.ts`

**Interfaces (produzidas; as tarefas seguintes dependem destes nomes):**
- `constants.ts` (sem imports, usável no proxy): `SESSION_COOKIE = "studyflow_session"`, `SESSION_DAYS = 14`.
- `types.ts`: `type Role = "SUPER" | "USER"`; `type SessionUser = { id: string; name: string; email: string; role: Role; folderName: string }`; `type ShellUser = Pick<SessionUser, "name" | "email" | "role">`; `type AuthResult<T = undefined, K extends string = string> = { ok: true; data: T } | { ok: false; fieldErrors?: Partial<Record<K, string>>; message?: string }`.
- `password.ts`: `hashPassword(plain: string): Promise<string>`; `verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean>` — sem hash compara contra um hash fixo descartável e devolve `false` (iguala o tempo de resposta).
- `schema.ts`: `parseLoginInput(input: unknown)` → `{ email, senha, next? }` (senha só precisa ser não vazia); `parseCreateUserInput` → `{ nome (2–80), email, senha }`; `parseResetPasswordInput` → `{ novaSenha }`; `parseChangePasswordInput` → `{ senhaAtual, novaSenha, confirmacao }` (`confirmacao` igual a `novaSenha`). Todos devolvem `{ ok: true, data } | { ok: false, fieldErrors }`, no formato de `parseStudyRecordInput`. Também exporta `normalizeEmail(value: string): string`.
- `session.ts`: `hashToken(token: string): string`; `createSession(userId: string): Promise<{ token: string; expiresAt: Date }>`; `findSessionUser(token: string | undefined): Promise<SessionUser | null>` (exige sessão não expirada, `active`, `email` e `folderName` preenchidos; sessão expirada é apagada); `deleteSession(token: string): Promise<void>`; `deleteUserSessions(userId: string, exceptToken?: string): Promise<void>`.
- `throttle.ts`: `isThrottled(email: string, now?: number): boolean`; `recordFailure(email: string, now?: number): void`; `clearFailures(email: string): void`; `resetThrottle(): void` (testes). Estado em `globalThis` para sobreviver ao HMR.
- `next-url.ts`: `safeNext(value: unknown, fallback = "/estudo"): string`.
- `folder-name.ts`: `slugFolderName(name: string): string` (remove acentos, tira caracteres proibidos no Windows, colapsa espaços, sem ponto/espaço no fim, máx. 40, usa `isValidSegment` de `folder-path.ts`, cai em `"usuario"` se nada sobrar); `uniqueFolderName(name: string, taken: string[]): string` (compara sem diferenciar maiúsculas; sufixo `" 2"`, `" 3"`…).

- [ ] **Step 1: Escrever os testes que falham**

Asserções a cobrir (com os valores da spec):
- `password`: `hashPassword` ≠ texto e `verifyPassword` aceita a senha certa/recusa a errada; `verifyPassword("x", null)` é `false`.
- `schema`: `"abc12345"` ok; `"abcdefgh"` (sem número), `"12345678"` (sem letra), `"a1"` (curta) recusadas com mensagem no campo certo; `"a1" + "é".repeat(36)` (74 bytes) recusada, `"a1" + "é".repeat(35)` (72 bytes) aceita; `" Ana@X.com "` vira `"ana@x.com"`; `confirmacao` diferente recusada; nome de 1 caractere recusado.
- `session` (banco real): `createSession` → `findSessionUser(token)` devolve o usuário; o registro guarda `hashToken(token)` e nunca o token; token desconhecido/`undefined` → `null`; `expiresAt` passado → `null` e a linha some; `active=false` → `null`; usuário sem `folderName` → `null`; `deleteUserSessions(id, tokenA)` apaga as outras e mantém a `tokenA`.
- `throttle`: 5 falhas → bloqueado; 4 não; passados 15 min (`now`) liberado; `clearFailures` libera; e-mails diferentes são independentes; maiúsculas/espaços no e-mail não burlam.
- `next-url`: `"/estudo?page=2"` mantido; `"//evil.com"`, `"https://x.com"`, `"/\\evil.com"`, `""`, `undefined`, `"/login"` → fallback.
- `folder-name`: `"José da Silva"` → `"Jose da Silva"`; `"***"` e `"CON"` → `"usuario"`; `"Ana."` → `"Ana"`; `uniqueFolderName("Ana", ["ana"])` → `"Ana 2"`; `uniqueFolderName("Ana", ["Ana", "ana 2"])` → `"Ana 3"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/auth-`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar os arquivos acima**

Usar `bcryptjs`, `node:crypto` (`randomBytes(32).toString("base64url")`, `createHash("sha256")`) e Zod 4 (`z.email()`). Em `schema.ts`, validar o limite de bytes com `Buffer.byteLength`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/auth-`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth tests/unit/auth-*.test.ts
git commit -m "feat(auth): senha, sessão em banco, limite de tentativas e utilitários"
```

---

### Task 3: `current-user.ts` baseado em sessão e base de testes

Depois desta tarefa nenhum código cria usuário sozinho: os testes passam a criar usuários e "entrar" explicitamente.

**Files:**
- Create: `src/features/auth/cookie.ts`, `src/lib/auth-response.ts`, `tests/unit/helpers/next-headers.ts`, `tests/unit/helpers/auth.ts`
- Modify: `src/lib/current-user.ts`
- Test: `tests/unit/current-user.test.ts`; adaptar todos os testes existentes que dependiam do `upsert` implícito (`estudo-content`, `estudo-data`, `image-routes`, e os que falharem em `npm test`: `ai-*`, `folder-route`, `card-*`…)

**Interfaces:**
- `cookie.ts` (server): `readSessionToken(): Promise<string | undefined>`; `setSessionCookie(token: string, expiresAt: Date): Promise<void>`; `clearSessionCookie(): Promise<void>` (opções do cookie conforme Global Constraints).
- `current-user.ts`: `class AuthError extends Error { code: "unauthenticated" | "forbidden" }`; `isAuthError(error: unknown): error is AuthError`; `getCurrentUser(): Promise<SessionUser | null>` (usa `cache` do React e `findSessionUser`); `getCurrentUserId(): Promise<string>` (lança `AuthError("unauthenticated")`); `assertSuperuser(): Promise<SessionUser>` (lança `unauthenticated` ou `forbidden`); `requireUser(): Promise<SessionUser>` (`redirect("/login")`); `requireSuperuser(): Promise<SessionUser>` (`redirect("/login")` sem sessão, `notFound()` se não for `SUPER`). Some o `upsert` de `local-user`.
- `auth-response.ts`: `SESSION_EXPIRED_MESSAGE`, `FORBIDDEN_MESSAGE` (textos das Global Constraints); `authErrorResponse(error: unknown): Response | null` (JSON `{ message }`, 401 para `unauthenticated`, 403 para `forbidden`, `null` se não for `AuthError`); `authActionMessage(error: unknown): string | null` (a mensagem correspondente, ou `null`).
- Helpers de teste: `tests/unit/helpers/next-headers.ts` exporta um `cookies()` assíncrono em memória (`get`, `set`, `delete`) e `resetCookies()`; cada arquivo de teste que toca autenticação declara `vi.mock("next/headers", () => import("./helpers/next-headers"))`. `tests/unit/helpers/auth.ts` exporta `createTestUser(overrides?: { role?: Role; email?: string; name?: string; active?: boolean; folderName?: string }): Promise<{ id; name; email; role; folderName }>` (senha `"Senha1234"`), `signInAs(user: { id: string }): Promise<string>` (cria `Session` real e grava o cookie simulado; devolve o token) e `signOut(): void`.

- [ ] **Step 1: Escrever `current-user.test.ts` (falha)**

Asserções: sem sessão `getCurrentUserId()` rejeita com `AuthError` de `code` `"unauthenticated"`; após `signInAs(user)` devolve `user.id`; usuário desativado depois do login → rejeita; `assertSuperuser()` com `USER` → `code` `"forbidden"`, com `SUPER` → devolve o usuário; `requireUser()` sem sessão rejeita com o erro de redirecionamento do Next (`digest` começando em `NEXT_REDIRECT`); `requireSuperuser()` com `USER` rejeita com o erro de `notFound()` (`digest` `NEXT_HTTP_ERROR_FALLBACK;404`); `authErrorResponse` devolve 401/403 e `null` para outros erros.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/current-user.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `cookie.ts`, `auth-response.ts`, `current-user.ts` e os helpers de teste**

Ler `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (seções "Setting cookies" e "Data Access Layer") antes.

- [ ] **Step 4: Adaptar os testes existentes**

Run: `npm test` e corrigir cada falha trocando o `upsert` implícito por `createTestUser()` + `signInAs()` no `beforeEach` (limpar também `session` e `user` nos `deleteMany`, na ordem das chaves estrangeiras). Não mudar o que cada teste verifica; só como o usuário nasce. Caminhos de pasta continuam como estão (a Tarefa 7 os ajusta).

- [ ] **Step 5: Verificar e commitar**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib src/features/auth/cookie.ts tests/unit
git commit -m "feat(auth): current-user lê a sessão; helpers de teste com usuário e login simulados"
```

---

### Task 4: Bootstrap do superusuário, seed e helpers e2e

**Files:**
- Create: `src/features/auth/bootstrap.ts`, `prisma/bootstrap.ts`, `tests/e2e/reset-users.ts`
- Modify: `prisma/seed.ts`, `package.json` (script `"auth:bootstrap": "tsx prisma/bootstrap.ts"`), `tests/e2e/insert-study.ts`, `tests/e2e/helpers.ts`
- Test: `tests/unit/auth-bootstrap.test.ts`

**Interfaces:**
- `bootstrap.ts`: `type BootstrapInput = { email: string; password: string; name: string }`; `type BootstrapResult = { status: "created" | "converted" | "exists"; userId: string }`; `bootstrapSuperuser(input: BootstrapInput): Promise<BootstrapResult>`. Valida com os parsers da Tarefa 2 (lança `Error` com a mensagem do primeiro campo inválido). Existindo um `SUPER`: devolve `exists` sem alterar nada (nem a senha). Existindo `local-user`: converte no lugar (mesmo `id`; define `name`, `email`, `passwordHash`, `folderName` via `uniqueFolderName`, `role: "SUPER"`). Senão cria do zero.
- `prisma/bootstrap.ts`: lê `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD`, `SUPERUSER_NAME` (com `dotenv/config`), chama `bootstrapSuperuser`, imprime o status; falta de variável → erro claro e `exitCode = 1`.
- `seed.ts`: busca o `SUPER` (`findFirst({ where: { role: "SUPER" } })`; sem ele, erro "Rode npm run auth:bootstrap antes do seed."); cria as pastas de exemplo em `path.win32.join(baseFolder(), superuser.folderName)`; remove o `upsert` de `local-user`.
- e2e: `E2E_SUPER = { email: "super@e2e.test", password: "Senha1234", name: "Admin" }` exportado de `helpers.ts` (e `E2E_USER_ROOT = path.join(E2E_BASE_DIR, "Admin")`); `resetData()` roda, nesta ordem, `tests/e2e/reset-users.ts` (apaga usuários não `SUPER`, com seus dados e sessões, e as sessões do `SUPER`), `prisma/bootstrap.ts` e `prisma/seed.ts`, com `SUPERUSER_*` no `E2E_ENV`; `insert-study.ts` usa o id do `SUPER`.

- [ ] **Step 1: Escrever `auth-bootstrap.test.ts` (falha)**

Asserções: com `local-user` + um Estudo, a chamada devolve `converted`, o usuário mantém `id: "local-user"`, tem `role SUPER`, `email` em minúsculas, hash que passa em `verifyPassword`, `folderName` preenchido, e o Estudo continua ligado a ele (nenhum registro órfão); banco sem `local-user` → `created`; segunda chamada com outra senha → `exists` e o `passwordHash` não muda; senha `"curta"` → lança e não cria nada; só existe um `SUPER` ao final.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/auth-bootstrap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar bootstrap, CLI, seed e helpers e2e**

- [ ] **Step 4: Rodar tudo e aplicar ao banco de desenvolvimento**

Run: `npm test && npx tsc --noEmit`, depois configurar `SUPERUSER_*` no `.env` local (não commitar) e `npm run auth:bootstrap`.
Expected: testes verdes; saída `converted` e o `local-user` (com os Estudos atuais) agora é `SUPER`. Conferir: `npx tsx -e "import {db} from './src/lib/db'; db.user.findMany({include:{_count:{select:{records:true}}}}).then(console.log)"`.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/bootstrap.ts prisma/bootstrap.ts prisma/seed.ts package.json tests/e2e tests/unit/auth-bootstrap.test.ts
git commit -m "feat(auth): bootstrap do superusuário, seed e helpers e2e usam o superusuário"
```

---

### Task 5: Login e logout

**Files:**
- Create: `src/features/auth/actions.ts`, `src/features/auth/components/LoginForm.tsx`, `LoginForm.module.css`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `(auth)/layout.module.css`
- Test: `tests/unit/auth-actions.test.ts`, `tests/unit/login-form.test.tsx`

**Interfaces:**
- Consumes: Tarefas 2 e 3.
- `actions.ts` (`"use server"`): `loginAction(input: unknown): Promise<AuthResult<{ redirectTo: string }, "email" | "senha">>` (cria sessão, grava cookie, limpa falhas; `redirectTo = safeNext(input.next)`); `logoutAction(): Promise<void>` (apaga a sessão e o cookie e `redirect("/login")`).
- `LoginForm` (cliente): props `{ next?: string }`; campos E-mail e Senha; mostra `message` e `fieldErrors`; em `ok` faz `router.replace(redirectTo)` e `router.refresh()`.
- `/login` (grupo `(auth)`, layout centralizado sem Sidebar/Topbar): lê `?next=` por `searchParams`; se já houver sessão (`getCurrentUser()`), `redirect(safeNext(next))`. Metadata `"Entrar · StudyFlow"`.

- [ ] **Step 1: Escrever os testes que falham**

`auth-actions.test.ts` (mock de `next/headers` e `next/navigation`): credenciais certas → `ok`, cookie `studyflow_session` gravado, linha em `Session`, `redirectTo` `"/estudo"`; `next: "/estudo/abc"` respeitado e `next: "//evil.com"` → `"/estudo"`; senha errada e e-mail inexistente → ambos `message: "E-mail ou senha incorretos."`; `" ANA@x.com "` entra na conta `ana@x.com`; usuário desativado com senha certa → `"Conta desativada. Fale com o administrador."`, com senha errada → mensagem genérica; 5 falhas seguidas e depois a senha **certa** → `"Muitas tentativas. Tente novamente em alguns minutos."` e nenhuma sessão criada; login com sucesso zera as falhas; `logoutAction` apaga a `Session`, limpa o cookie e redireciona para `/login`.
`login-form.test.tsx`: erro do servidor aparece; botão fica desabilitado durante o envio; em `ok` chama `router.replace` com `redirectTo`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/auth-actions.test.ts tests/unit/login-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar actions, formulário e páginas**

Seguir a marcação e o CSS de `AiSettingsForm`/`StudyFormModal` (campos com `label`, `aria-invalid`, mensagem de erro). A ordem em `loginAction`: validar → `isThrottled` → buscar usuário → `verifyPassword` (sempre, mesmo sem usuário) → falha: `recordFailure` e mensagem genérica → só então checar `active`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/auth-actions.test.ts tests/unit/login-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/app/\(auth\) tests/unit/auth-actions.test.ts tests/unit/login-form.test.tsx
git commit -m "feat(auth): login e logout com sessão em banco"
```

---

### Task 6: Proteção das rotas, shell com usuário e menu "Sair"

A partir daqui o app exige login.

**Files:**
- Create: `src/proxy.ts`, `src/features/auth/components/UserMenu.tsx`, `UserMenu.module.css`
- Modify: `src/app/(app)/layout.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/Topbar.tsx`, `src/components/layout/Topbar.module.css`, as páginas `src/app/(app)/{estudo/page.tsx,estudo/[id]/page.tsx,testes/page.tsx,agenda/page.tsx,configuracao/page.tsx}`
- Test: `tests/unit/proxy.test.ts`, `tests/unit/user-menu.test.tsx`; ajustar `tests/unit/app-shell.test.tsx`

**Interfaces:**
- `proxy.ts`: `proxy(request: NextRequest): NextResponse` e `config.matcher` que exclui `/login`, `/_next/static`, `/_next/image` e `favicon.ico`. Sem o cookie `SESSION_COOKIE` (de `constants.ts`): `/api/*` → 401 JSON `{ message: SESSION_EXPIRED_MESSAGE }`; demais → redirect para `/login?next=<caminho+query>` (sem `next` quando o caminho é `/`). Com cookie, segue. Não acessa banco.
- `AppShell` recebe `user: ShellUser` e repassa à `Topbar`. `Topbar` renderiza `UserMenu`.
- `UserMenu` (cliente): props `{ name: string; email: string }`; mostra o nome (e o e-mail no `title`) e um botão "Sair" dentro de um `<form action={logoutAction}>`.
- Layout `(app)` é `async`: `const user = await requireUser()`. **Cada página** de `(app)` também começa com `await requireUser()` (o layout não reexecuta em navegação do cliente). Em `estudo/[id]/page.tsx`, `generateMetadata` deve capturar `AuthError` e devolver `{ title: "StudyFlow" }`.

- [ ] **Step 1: Escrever os testes que falham**

`proxy.test.ts` (com `NextRequest`): sem cookie em `/estudo?page=2` → 307 para `/login?next=%2Festudo%3Fpage%3D2`; sem cookie em `/` → `/login`; sem cookie em `/api/cards` → 401 JSON; com cookie → passa (`NextResponse.next`). `user-menu.test.tsx`: mostra o nome e o botão "Sair". `app-shell.test.tsx`: passa a enviar `user` e continua verde.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/proxy.test.ts tests/unit/user-menu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Ler `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (matcher e exports) antes de escrever `proxy.ts`.

- [ ] **Step 4: Verificar e testar manualmente**

Run: `npm test && npx tsc --noEmit && npm run lint`, depois `npm run dev`.
Expected: verdes; sem login, `/estudo` leva a `/login?next=%2Festudo`; entrar com o superusuário volta para `/estudo`; "Sair" volta para `/login`.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/features/auth/components src/app src/components/layout tests/unit
git commit -m "feat(auth): proxy, requireUser nas páginas e menu do usuário na Topbar"
```

---

### Task 7: Isolamento de pastas por usuário

**Files:**
- Create: `src/features/estudo/folder-scope.ts`
- Modify: `src/features/estudo/actions.ts`, `src/app/api/pastas/route.ts`, `src/features/estudo/components/FolderPicker.tsx`, `src/app/(app)/estudo/page.tsx`
- Test: `tests/unit/folder-scope.test.ts`; adaptar `folder-route`, `folder-picker`, `estudo-data`, `estudo-content`, `image-routes`, `study-view`

**Interfaces:**
- `folder-scope.ts` (servidor): `userRoot(user: { folderName: string }): string` = `path.win32.join(baseFolder(), folderName)`; `isInsideRoot(root: string, target: string): boolean` (puro; normaliza com `normalizeFolderPath`, ignora maiúsculas, compara com `root + "\\"`; a própria raiz conta como dentro); `isFolderAllowed(root: string, target: string): Promise<boolean>` (`isInsideRoot` **e** o `realpath` do ancestral existente mais profundo de `target` dentro do `realpath` da raiz); `ensureUserRoot(user: { folderName: string }): Promise<string>` (usa `ensureFolder`, devolve a raiz).
- `createStudyRecord`/`updateStudyRecord`: depois de `isFolderInUse`, recusar com `fieldErrors.pasta = "A pasta precisa ficar dentro de <raiz>."` quando `!(await isFolderAllowed(root, pasta))`. No `update`, só checar se `folderKey(nova) !== folderKey(atual)` (Estudos antigos fora da raiz continuam editáveis sem mudar a pasta).
- `/api/pastas`: GET e POST exigem sessão (`authErrorResponse` → 401). GET: `caminho` ausente/vazio vira a raiz do usuário (criada com `ensureUserRoot`); `caminho` fora da raiz → 403; resposta com `drives: []` e `parent: null` quando `path` é a raiz. POST: `pai` fora da raiz → 403.
- `FolderPicker`: o botão "Pasta acima" fica desabilitado quando `view.parent === null`. `estudo/page.tsx` passa `baseDir={await ensureUserRoot(user)}` (o `user` vem de `requireUser()`).

- [ ] **Step 1: Escrever os testes que falham**

`folder-scope.test.ts`: raiz e `raiz\a\b` dentro; `raiz\..\x` fora (segmento `..` inválido); `C:\S\ana2` fora da raiz `C:\S\ana`; `c:\s\ANA\x` dentro de `C:\S\ana`; outra unidade fora; `isFolderAllowed` recusa `raiz\link\sub` quando `link` é uma junção para fora (`it.skipIf(process.platform !== "win32")`, junção criada com `fs.symlink(alvo, link, "junction")` em pasta temporária); aceita pasta que ainda não existe dentro da raiz. Ações: criar Estudo fora da raiz → erro de campo `pasta`; dentro → ok; editar Estudo antigo (pasta fora da raiz) sem mudar a pasta → ok; mudar para fora → erro. Rota: sem sessão → 401; `GET` sem `caminho` → raiz com `drives: []`, `parent: null`; subpasta → `parent` = raiz; `caminho` fora → 403; `POST` fora → 403, dentro → 201. Picker: "Pasta acima" desabilitado na raiz.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/folder-scope.test.ts tests/unit/folder-route.test.ts tests/unit/folder-picker.test.tsx tests/unit/estudo-data.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Adaptar testes existentes**

Nos testes que criam Estudos por action em pastas temporárias: `process.env.STUDYFLOW_BASE_DIR = <tmp do arquivo>` e as pastas passam a `path.join(userRoot(usuarioDeTeste), "Nome")`. Testes que inserem direto no banco (`db.studyRecord.create`) não mudam.

- [ ] **Step 5: Verificar e commitar**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add src tests/unit
git commit -m "feat(auth): pastas dos Estudos isoladas na raiz de cada usuário"
```

---

### Task 8: Tela Usuários (superusuário)

**Files:**
- Create: `src/features/usuarios/{types.ts,queries.ts,actions.ts}`, `src/features/usuarios/components/{UsersView,UserFormModal,ResetPasswordModal,DeleteUserModal}.tsx` com `.module.css`, `src/app/(app)/usuarios/page.tsx`
- Modify: `src/components/ui/icons.tsx` (acrescentar `UsersIcon`), `src/components/layout/Sidebar.tsx`, `src/components/layout/AppShell.tsx`
- Test: `tests/unit/usuarios-actions.test.ts`, `usuarios-queries.test.ts`, `users-view.test.tsx`, `sidebar.test.tsx`

**Interfaces:**
- `types.ts`: `UserRow = { id: string; name: string; email: string; role: Role; active: boolean; createdAt: string; studyCount: number; cardCount: number; scheduleCount: number }` (contagens dos itens não excluídos).
- `queries.ts`: `listUsers(): Promise<UserRow[]>` — `assertSuperuser()`, `SUPER` primeiro, depois `createdAt` crescente. Nunca devolve conteúdo de Estudos/Cards/Agenda.
- `actions.ts` (`"use server"`), todas começam com `assertSuperuser()` (falha → `authActionMessage`) e recusam alvo inexistente ou `SUPER` com `"Usuário não encontrado."`:
  - `createUser(input: unknown): Promise<AuthResult<{ id: string }, "nome" | "email" | "senha">>` — papel `USER`, `active: true`, `folderName` por `uniqueFolderName` sobre todos os `folderName` existentes; e-mail repetido → `fieldErrors.email = "Já existe um usuário com este e-mail."`.
  - `resetUserPassword(userId: string, input: unknown): Promise<AuthResult<undefined, "novaSenha">>` — troca o hash e chama `deleteUserSessions(userId)`.
  - `setUserActive(userId: string, active: boolean): Promise<AuthResult>` — ao desativar, `deleteUserSessions(userId)`.
  - `deleteUser(userId: string, emailConfirmacao: string): Promise<AuthResult<undefined, "emailConfirmacao">>` — confirmação diferente do e-mail do alvo (sem diferenciar maiúsculas) → erro de campo; senão uma transação apaga, nesta ordem, `CardResult`, `Schedule`, `Card`, `StudyRecord` (inclusive excluídos), `AiSettings`, `Session`, `User`. Não toca no disco.
  - Todas chamam `revalidatePath("/usuarios")`.
- `Sidebar` recebe `isSuper: boolean`; com `true`, o item `{ href: "/usuarios", label: "Usuários", Icon: UsersIcon }` aparece **logo depois** de "Configuração". `AppShell` passa `isSuper={user.role === "SUPER"}`.
- `/usuarios`: `await requireSuperuser()`, `await connection()`, `listUsers()`, `<PageHeader title="Usuários" />` e `UsersView`. `UsersView`: tabela (nome, e-mail, criado em, status, ações) reaproveitando o estilo de `StudyTable`; botão "Novo usuário"; a linha do `SUPER` mostra o selo "Superusuário" e nenhuma ação; ações por linha: Redefinir senha, Desativar/Reativar, Excluir. `DeleteUserModal` lista as contagens e só habilita "Excluir" quando o e-mail digitado confere. Feedback por `Toast`, como em `StudyView`.

- [ ] **Step 1: Escrever os testes que falham**

Actions: `USER` logado recebe `"Acesso negado."` em cada uma das quatro; sem sessão, `"Sessão expirada, entre novamente."`; `createUser` com `" Bia@X.com "` cria `bia@x.com`, papel `USER`, `folderName` único (dois usuários chamados "Ana" → `"Ana"` e `"Ana 2"`); e-mail repetido com outra caixa → erro de campo; `resetUserPassword` muda o hash e apaga as sessões do alvo (as de outros ficam); `setUserActive(false)` apaga as sessões e o alvo não consegue mais `findSessionUser`; nenhuma das quatro age sobre o `SUPER` (nem sobre o próprio superusuário); `deleteUser` com e-mail errado não apaga; com e-mail certo apaga **todas** as linhas do alvo (Estudo ativo e na lixeira, Card, `CardResult`, `Schedule`, `AiSettings`, `Session`, `User`) e preserva por completo os dados de outro usuário e as pastas no disco. Queries: contagens corretas e ordem; usuário comum rejeita. `users-view`: linha do `SUPER` sem botões; "Excluir" desabilitado até digitar o e-mail. `sidebar`: "Usuários" só com `isSuper`, imediatamente depois de "Configuração".

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/usuarios- tests/unit/users-view.test.tsx tests/unit/sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar; conferir no navegador**

Run: `npm test && npx tsc --noEmit && npm run lint`, depois `npm run dev`.
Expected: verdes. No navegador, como superusuário: o item aparece abaixo de Configuração, a tela lista, cria, redefine, desativa e exclui. Digitar `/usuarios` logado como usuário comum mostra 404.

- [ ] **Step 5: Commit**

```bash
git add src tests/unit
git commit -m "feat(auth): tela Usuários para o superusuário"
```

---

### Task 9: "Minha conta" (trocar a própria senha)

**Files:**
- Modify: `src/features/auth/actions.ts`, `src/app/(app)/configuracao/page.tsx`
- Create: `src/features/auth/components/ChangePasswordForm.tsx`, `ChangePasswordForm.module.css`
- Test: acrescentar a `tests/unit/auth-actions.test.ts`; criar `tests/unit/change-password-form.test.tsx`

**Interfaces:**
- `changePasswordAction(input: unknown): Promise<AuthResult<undefined, "senhaAtual" | "novaSenha" | "confirmacao">>` — exige sessão; `senhaAtual` errada → `fieldErrors.senhaAtual = "Senha atual incorreta."`; sucesso grava o novo hash e chama `deleteUserSessions(userId, tokenAtual)` (o token vem de `readSessionToken()`).
- `ChangePasswordForm` (cliente) sob o título "Minha conta" em `/configuracao`, abaixo de `AiSettingsForm`; limpa os campos e mostra um `Toast` de sucesso.

- [ ] **Step 1: Escrever os testes que falham**

Action: senha atual errada → erro de campo e hash inalterado; nova fraca (`"abcdefgh"`) → erro em `novaSenha`; `confirmacao` diferente → erro; sucesso → hash novo (`verifyPassword` da nova passa, da antiga falha), a sessão atual continua válida e as outras sessões do usuário somem; sem sessão → `"Sessão expirada, entre novamente."`. Formulário: mostra erros de campo e limpa os campos no sucesso.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/auth-actions.test.ts tests/unit/change-password-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/unit/auth-actions.test.ts tests/unit/change-password-form.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/unit
git commit -m "feat(auth): Minha conta com troca da própria senha"
```

---

### Task 10: Auditoria de acesso e testes de isolamento

Cobre o resto do código que ainda chama `getCurrentUserId()` e engole o erro como falha genérica.

**Files:**
- Modify: `src/features/estudo/actions.ts`, `src/features/cards/actions.ts`, `src/features/agenda/actions.ts`, `src/features/ai/actions.ts`, `src/app/api/cards/route.ts`, `src/app/api/testes/resumo/route.ts`, `src/app/api/ai/modelos/route.ts`, `src/app/api/ai/testar/route.ts`, `src/app/(app)/estudo/[id]/imagens/route.ts`, `src/app/(app)/estudo/[id]/imagens/[arquivo]/route.ts`, `src/app/(app)/testes/page.tsx`, `src/app/(app)/agenda/page.tsx`
- Test: `tests/unit/user-isolation.test.ts`, `tests/unit/session-expired.test.ts`

**Interfaces:**
- Consumes: `isAuthError`, `authActionMessage`, `authErrorResponse` (Tarefa 3).
- Regra: em cada `catch` das server actions, `authActionMessage(error)` não nulo vira `{ ok: false, message }`; chamadas a `getCurrentUserId()` fora de `try` (`listUserSchedules`, `checkStudyHasActiveSchedules`, `listStudyCards`…) ficam dentro dele ou propagam `AuthError` para o chamador tratar. Rotas de API devolvem `authErrorResponse(error)` antes do 500 genérico. As rotas de imagem continuam respondendo 404 sem detalhes.
- Inventário obrigatório: `grep -rn "getCurrentUserId\|catch" src --include=*.ts --include=*.tsx` — nenhuma ocorrência pode ficar sem tratamento de `AuthError`.

- [ ] **Step 1: Escrever os testes que falham**

`user-isolation.test.ts` (A cria: Estudo com conteúdo, Card, `CardResult`, `Schedule`, `AiSettings`; depois `signInAs(B)`): `listStudyRecords` não mostra o Estudo de A; `getStudyDocument`, `getStudyFolder` e `listStudyCards(idDeA)` → `null`/vazio; `updateStudyRecord`, `saveStudyContent`, `deleteStudyRecord`, `restoreStudyRecord` com ids de A → "Registro não encontrado." e as linhas de A ficam intactas; `createCard` num Estudo de A, `updateCard`, `deleteCard`, `restoreCard` num Card de A → "não encontrado"; `GET /api/cards?studyId=<A>` → `[]`; `GET /api/testes/resumo` sem os Estudos de A; `listUserSchedules` sem a agenda de A e `completeSchedule(idDeA)` falha sem alterar nada; `GET` da imagem de um Estudo de A → 404; `getAiSettings()` de B vem vazio e `saveAiSettings` de B não altera a linha de A.
`session-expired.test.ts` (sem sessão, ou sessão de usuário desativado): cada server action exportada de `estudo`, `cards`, `agenda`, `ai` devolve `{ ok: false, message: "Sessão expirada, entre novamente." }`; cada rota de API responde 401 com `{ message }`; a rota de imagem responde 404.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/user-isolation.test.ts tests/unit/session-expired.test.ts`
Expected: FAIL (o isolamento já deve passar onde as queries filtram por `userId`; falhas indicam furos reais e devem ser corrigidas no código, não no teste).

- [ ] **Step 3: Implementar os tratamentos de `AuthError` e corrigir furos achados**

- [ ] **Step 4: Rodar tudo**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/unit
git commit -m "feat(auth): tratamento de sessão expirada em actions e rotas; testes de isolamento entre usuários"
```

---

### Task 11: Testes e2e e verificação final

**Files:**
- Modify: `tests/e2e/helpers.ts` (acrescentar `login(page, who?)` e `createUserViaDb`/helper para um segundo usuário), `playwright.config.ts` (`url` do webServer passa a `/login`), `tests/e2e/{estudo,editor,configuracao,navegacao}.spec.ts` (login no `beforeEach` depois de `resetData()`; caminhos de pasta digitados passam a usar `E2E_USER_ROOT`)
- Create: `tests/e2e/auth.spec.ts`

**Interfaces:**
- `login(page: Page, credentials?: { email: string; password: string }): Promise<void>` — abre `/login`, preenche, envia e espera sair de `/login` (padrão: `E2E_SUPER`).

- [ ] **Step 1: Escrever `auth.spec.ts` (falha)**

Cenários: sem sessão, `/estudo` redireciona para `/login?next=%2Festudo` e, após entrar, volta para `/estudo`; senha errada mostra "E-mail ou senha incorretos."; "Sair" volta para `/login` e `/estudo` volta a exigir login; o superusuário vê "Usuários" abaixo de "Configuração", cria um usuário pela tela, sai, entra como ele, **não** vê "Usuários", `/usuarios` mostra 404 e a lista de Estudos está vazia (os 8 do superusuário não aparecem); o usuário comum cria um Estudo na própria raiz e o superusuário não o vê; Pasta fora da raiz mostra o erro no campo; o superusuário desativa o usuário e a próxima navegação dele cai em `/login`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:e2e -- auth.spec.ts`
Expected: FAIL. (O `test:e2e` faz build e sobrescreve `.next`: parar o `npm run dev` antes.)

- [ ] **Step 3: Adaptar os specs existentes e o helper**

- [ ] **Step 4: Verificação final completa**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run test:e2e`
Expected: tudo verde.

- [ ] **Step 5: Revisão de pendências e commit**

Conferir `git status` (nada sensível staged), que `docs/superpowers/plans/2026-10-28-autenticacao-usuarios.md` está commitado (substitui o plano antigo) e atualizar `README.md` com a seção "Autenticação" (variáveis `SUPERUSER_*`, `npm run auth:bootstrap`, raiz de pastas por usuário).

```bash
git add tests/e2e playwright.config.ts README.md docs/superpowers/plans/2026-10-28-autenticacao-usuarios.md
git commit -m "test(auth): e2e de login, permissões e isolamento; README"
```
