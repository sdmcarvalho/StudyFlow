# Configuração do agente de IA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/configuracao` (item de menu abaixo de Agenda) para configurar um gateway de IA compatível com OpenAI, escolher o modelo, ajustar parâmetros, testar e salvar.

**Architecture:** Feature nova `src/features/ai/` (schema zod, queries, server action, cliente `fetch`, resolução de configuração para as rotas), duas rotas `POST /api/ai/*` protegidas como `/api/pastas`, um formulário client component e uma tabela Prisma `AiSettings` (uma linha por usuário).

**Tech Stack:** Next.js 16.4.3 (App Router, params/searchParams são Promises), React 19, TS, Prisma 7.10.1 + SQLite (libsql), zod 4, CSS Modules, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-configuracao-ia-design.md`

## Global Constraints

- Ler a doc relevante em `node_modules/next/dist/docs/` antes de mexer em rota/página (AGENTS.md); seguir os padrões de `src/app/api/pastas/route.ts` e `src/features/cards/actions.ts`.
- Interface e mensagens em pt-BR; só os rótulos "Gateway base URL" e "Gateway API key" ficam em inglês.
- Limites: temperatura 0–2 (padrão 0,2); timeout inteiro 10–600 s (padrão 300); modelo ≤ 200 caracteres; URL `http`/`https`, sem barra final; extras = objeto JSON sem as chaves `model`, `messages`, `stream`.
- A chave completa nunca chega ao navegador, nunca vai para log e nunca aparece em mensagens de erro. Máscara: `chave.slice(0,4) + "…" + chave.slice(-4)`; se ≤ 8 caracteres, `"…"`.
- Sem dependência npm nova. `fetch` nativo.
- Padrão por provedor: `enable_thinking: false` só quando a URL contém `aliyuncs.com`; extras do usuário vencem.
- Testes de banco: `// @vitest-environment node`, `prisma/test.db`, e limpar as linhas de `AiSettings` que criarem (outros testes apagam `User`). e2e: só `prisma/e2e.db` e `os.tmpdir()`; nunca chave real nem rede externa.
- Git: `git add` e `git commit` só de caminhos explícitos (`git commit -o -m "..." -- <caminhos>`); nunca `-A`/`.`; nunca commitar `studyflow.bat`, `docs/Pedido do editor de textos.docx` nem os `*.txt` soltos da raiz. Rodapé do commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Heredocs no Bash do Windows estragam crases e barras: criar arquivos com Write/Edit.

## Review Focus

- Salvar com a chave em branco mantém a chave já guardada (Task 2).
- Testar/Buscar modelos com URL diferente da salva e chave em branco → 400, sem enviar a chave salva a outro destino (Task 4).
- Gateway lento, fora do ar ou respondendo lixo: `testConnection` devolve `ok:false` com mensagem, nunca lança (Task 3).
- URL com espaços/barras finais e chave colada com espaços ou quebra de linha são normalizadas antes de usar (Tasks 1 e 3).
- Mensagem de erro do gateway que repete a chave não vaza a chave (Task 3).

---

### Task 0: Workspace isolado

O trabalho dos cards (staged em `feat/editor-refactor`) altera `src/components/ui/icons.tsx` e `prisma/seed.ts`; um commit aqui misturaria os dois. Executar em worktree a partir da `main`.

- [ ] **Step 1:** Usar `superpowers:using-git-worktrees` para criar a branch `feat/configuracao-ia` a partir de `main` em `C:\Dev\StudyFlow-config`.
- [ ] **Step 2:** Na worktree: `git cherry-pick ea97600` e o commit deste plano; copiar `.env` do repo principal; `npm ci`; `npx prisma generate`.
- [ ] **Step 3:** Verificar a base: `npx vitest run tests/unit/app-shell.test.tsx` → PASS.

### Task 1: Schema de validação e utilitários (puro)

**Files:**
- Create: `src/features/ai/types.ts`, `src/features/ai/schema.ts`
- Test: `tests/unit/ai-schema.test.ts`

**Interfaces:**
- Produces (`types.ts`): `AiSettingsPublic = { baseUrl: string; apiKeyMasked: string; hasKey: boolean; model: string; temperature: number; timeout: number; extraParams: string }`; `AiSettingsInput = { baseUrl: string; apiKey: string; model: string; temperature: number; timeout: number; extraParams: string }`; `AiFieldErrors = Partial<Record<keyof AiSettingsInput, string>>`.
- Produces (`schema.ts`): `parseAiSettingsInput(input: unknown): { ok: true; data: AiSettingsInput } | { ok: false; fieldErrors: AiFieldErrors }`; `normalizeBaseUrl(text: string): string | null` (trim, remove `/` finais; `null` se não for `http`/`https` válido); `parseExtraParams(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string }`; `maskKey(key: string): string`; `DEFAULT_TEMPERATURE = 0.2`, `DEFAULT_TIMEOUT = 300`.

- [ ] **Step 1: Escrever `tests/unit/ai-schema.test.ts`** com estes casos (asserções exatas):
  - válido: `{baseUrl:" https://gw.exemplo.com/v1/ ", apiKey:" sk-abc\n", model:"m1", temperature:"0.5", timeout:"120", extraParams:""}` → `ok:true`, `data.baseUrl === "https://gw.exemplo.com/v1"`, `data.apiKey === "sk-abc"`, `data.temperature === 0.5`, `data.timeout === 120`.
  - `baseUrl` vazio → `fieldErrors.baseUrl === "Informe a URL do gateway."`; `"ftp://x"` e `"não é url"` → `"Use uma URL http ou https válida."`.
  - temperatura `"3"` e `""` → `"Use um valor entre 0 e 2."`; timeout `"5"`, `"601"`, `"10.5"`, `""` → `"Use um valor inteiro entre 10 e 600."`.
  - model com 201 caracteres → `"Use no máximo 200 caracteres."`; model vazio é aceito.
  - `parseExtraParams("")` → `{ok:true, value:{}}`; `'{"top_p":0.8}'` → value `{top_p:0.8}`; `"{oops"` → mensagem começando por `"JSON inválido em Parâmetros extras:"`; `"[1]"` → `'Parâmetros extras devem ser um objeto JSON, por exemplo {"top_p": 0.8}'`; `'{"model":"x","stream":true}'` → `"Parâmetros extras não podem definir: model, stream"`. O erro do campo `extraParams` em `parseAiSettingsInput` é essa mesma mensagem.
  - `maskKey("sk-abcdefghij1234")` → `"sk-a…1234"`, `maskKey("curta")` → `"…"`, `maskKey("")` → `""`.
- [ ] **Step 2:** `npx vitest run tests/unit/ai-schema.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** `types.ts` e `schema.ts` seguindo `src/features/cards/schema.ts` (zod 4, `safeParse`, primeiro erro por campo). Temperatura/timeout aceitam número ou string numérica; string vazia é inválida (não vira 0).
- [ ] **Step 4:** mesmo comando → PASS. Rodar `npx tsc --noEmit` → sem erros.
- [ ] **Step 5: Commit** `feat(ai): schema de validação da configuração` — `git commit -o -- src/features/ai/types.ts src/features/ai/schema.ts tests/unit/ai-schema.test.ts`.

### Task 2: Tabela, consultas e salvar

**Files:**
- Modify: `prisma/schema.prisma` (model `AiSettings` exatamente como na spec + `aiSettings AiSettings?` em `User`), `prisma/seed.ts` (apagar `aiSettings` antes de apagar usuários)
- Create: `prisma/migrations/<timestamp>_ai_settings/migration.sql` (via `npx prisma migrate dev --name ai_settings`), `src/features/ai/queries.ts`, `src/features/ai/actions.ts`
- Test: `tests/unit/ai-settings.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseAiSettingsInput`, `maskKey`, tipos, defaults); `getCurrentUserId` de `@/lib/current-user`; `db` de `@/lib/db`.
- Produces (`queries.ts`): `getAiSettings(): Promise<AiSettingsPublic>` (sem linha → `{baseUrl:"", apiKeyMasked:"", hasKey:false, model:"", temperature:0.2, timeout:300, extraParams:""}`); `getAiSettingsWithKey(): Promise<(AiSettingsPublic & { apiKey: string })>` (só servidor).
- Produces (`actions.ts`, `"use server"`): `saveAiSettings(input: unknown): Promise<{ ok: true; data: AiSettingsPublic } | { ok: false; fieldErrors?: AiFieldErrors; message?: string }>`; falha de banco → `message: "Não foi possível salvar a configuração."`.

- [ ] **Step 1: Escrever `tests/unit/ai-settings.test.ts`** (`// @vitest-environment node`, `afterEach` apaga `db.aiSettings`):
  - sem linha: `getAiSettings()` devolve os padrões acima.
  - `saveAiSettings` válido grava e devolve `data.hasKey === true`, `data.apiKeyMasked` mascarada, e o objeto retornado **não** tem a propriedade `apiKey`.
  - segundo save com `apiKey: ""` e `model` diferente: `getAiSettingsWithKey().apiKey` continua a chave original e o modelo mudou.
  - save com `apiKey` nova substitui a chave.
  - entrada inválida (`baseUrl:""`) → `ok:false` com `fieldErrors.baseUrl` e nada gravado.
  - duas chamadas seguidas mantêm uma única linha (`db.aiSettings.count() === 1`).
- [ ] **Step 2:** `npx vitest run tests/unit/ai-settings.test.ts` → FAIL.
- [ ] **Step 3:** Editar `prisma/schema.prisma`, rodar `npx prisma migrate dev --name ai_settings` (só adiciona tabela) e `npx prisma generate`; editar `seed.ts`.
- [ ] **Step 4: Implementar** `queries.ts` e `actions.ts` (upsert por `userId`; `apiKey` só entra no `update` quando não vazia; `revalidatePath("/configuracao")` com `vi.mock("next/cache")` no teste, como em `tests/unit/estudo-content.test.ts`).
- [ ] **Step 5:** `npx vitest run tests/unit/ai-settings.test.ts` → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 6: Commit** `feat(ai): tabela AiSettings, consulta e ação de salvar` — caminhos explícitos (schema, migration, seed, queries, actions, teste).

### Task 3: Cliente OpenAI-compatível

**Files:**
- Create: `src/features/ai/client.ts`
- Test: `tests/unit/ai-client.test.ts`

**Interfaces:**
- Produces: `type AiClientConfig = { baseUrl: string; apiKey: string; model: string; temperature: number; timeout: number; extraParams: Record<string, unknown> }`; `type TestResult = { ok: boolean; latencyMs: number; reply: string; error: string | null; status: number | null }`; `class AiError extends Error { status: number | null }`; `createAiClient(config: AiClientConfig, fetchImpl: typeof fetch = fetch): { listModels(): Promise<string[]>; testConnection(): Promise<TestResult>; chat(system: string, user: string, maxTokens?: number): Promise<{ text: string; finishReason: string }> }`.

Comportamento: `baseUrl` sem `/` final; `Authorization: Bearer <apiKey.trim()>` só se houver chave; `listModels` = `GET {baseUrl}/models` (timeout 30 s), ids ordenados, não-200 → `AiError("HTTP <status>: <texto>")`; `testConnection` = `POST {baseUrl}/chat/completions` com `{model, messages:[{role:"user",content:"Responda apenas: OK"}], max_tokens:5, ...extra}` (timeout 60 s), nunca lança; `chat` usa `temperature` e timeout da config, `max_tokens` opcional; corpo = `{model, temperature, messages, ...providerDefaults, ...extraParams}`. Texto de erro: `error.message` do JSON ou corpo bruto, truncado em 500, com toda ocorrência da chave (se ≥ 4 caracteres) trocada por `***`. Timeout → `error: "Tempo esgotado (60 s)."`; falha de rede → `"Erro de rede: <mensagem>"`; 200 sem `choices[0].message.content` em `chat` → `AiError("Resposta inesperada da API: …")`.

- [ ] **Step 1: Escrever `tests/unit/ai-client.test.ts`** com `fetchImpl` simulado (guarda url/headers/body da chamada):
  - `listModels` devolve `["a","b"]` ordenado a partir de `{data:[{id:"b"},{id:"a"}]}` e chama `https://gw.exemplo.com/v1/models` mesmo com `baseUrl` terminando em `/`.
  - 401 em `/models` → rejeita com `AiError`, `status === 401`, mensagem `"HTTP 401: chave inválida"`.
  - `testConnection` 200 → `{ok:true, reply:"OK", status:200, error:null}` e `latencyMs` número ≥ 0; corpo enviado tem `max_tokens:5`, `model`, e **não** tem `temperature`.
  - `testConnection` 401 → `ok:false`, `status:401`, `error` com a mensagem; 500 com corpo não-JSON → `ok:false` e `error` ≤ 500 caracteres.
  - `fetchImpl` rejeitando `new DOMException("x","TimeoutError")` → `ok:false`, `error === "Tempo esgotado (60 s)."`; rejeitando `new TypeError("fetch failed")` → `error` começa por `"Erro de rede:"`; 200 com corpo não-JSON → `ok:false` (nunca lança).
  - Erro 401 cujo texto contém a chave (`apiKey:"sk-segredo-123"`) → `error` não contém `"sk-segredo-123"`.
  - Chave com espaços/`\n` nas pontas: header `Authorization === "Bearer sk-abc"`. Sem chave: sem header `Authorization`.
  - `baseUrl` com `aliyuncs.com` → corpo contém `enable_thinking:false`; outro host → não contém; `extraParams:{enable_thinking:true}` na Alibaba vence.
  - `chat` 200 devolve `{text:"oi", finishReason:"stop"}` e envia `temperature`; resposta sem `choices` → rejeita `AiError`.
- [ ] **Step 2:** `npx vitest run tests/unit/ai-client.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `client.ts` (`AbortSignal.timeout(ms)` para os timeouts; sem retentativas — o teste deve ser rápido).
- [ ] **Step 4:** mesmo comando → PASS; `npx tsc --noEmit` limpo.
- [ ] **Step 5: Commit** `feat(ai): cliente OpenAI-compatível com teste de conexão`.

### Task 4: Rotas de teste e de modelos

**Files:**
- Create: `src/lib/same-origin.ts`, `src/features/ai/route-guard.ts`, `src/features/ai/resolve-config.ts`, `src/app/api/ai/testar/route.ts`, `src/app/api/ai/modelos/route.ts`
- Modify: `src/app/api/pastas/route.ts` (importar `isSameOrigin` de `@/lib/same-origin` em vez da cópia local)
- Test: `tests/unit/ai-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 (`normalizeBaseUrl`, `parseExtraParams`, defaults), Task 2 (`getAiSettingsWithKey`), Task 3 (`createAiClient`, `AiClientConfig`); `isLocalHost` de `@/features/estudo/folder-browser`.
- Produces: `isSameOrigin(request: Request): boolean` (lógica atual do `/api/pastas`); `rejectUnsafePost(request: Request): Response | null` (403 `{message:"A configuração de IA só funciona neste computador ou na rede local."}` se Host não local ou Origin alheio; 415 `{message:"Envie os dados em JSON."}` sem JSON); `resolveAiConfig(body: unknown, options: { requireModel: boolean }): Promise<{ ok: true; config: AiClientConfig } | { ok: false; status: number; message: string }>`.

Regras de `resolveAiConfig`: valores digitados (strings/números, todos opcionais, trim) vencem os salvos. Sem `baseUrl` efetiva ou inválida → 400 `"Informe uma URL http ou https válida para o gateway."`. Se `baseUrl` digitada difere da salva e `apiKey` digitada está em branco → 400 `"Para testar outra Base URL, digite a API key junto (ou salve antes)."` (a chave salva nunca é usada com outra URL). `requireModel` e modelo vazio → 400 `"Escolha o modelo antes de testar."`. Extras inválidos → 400 com a mensagem de `parseExtraParams`. Rotas: `POST` → `rejectUnsafePost`, depois JSON inválido → 400 `"Envie os dados em JSON."`, depois `resolveAiConfig`; `testar` responde `200` com o `TestResult`; `modelos` responde `200 {models}` ou `502 {message:"Não foi possível listar os modelos: <erro>"}`.

- [ ] **Step 1: Escrever `tests/unit/ai-routes.test.ts`** (`// @vitest-environment node`; `vi.stubGlobal("fetch", ...)` simula o gateway; salvar configuração via `db`/`saveAiSettings` com `vi.mock("next/cache")`; limpar `aiSettings` ao fim; helper `post(path, body, {host, origin, contentType})` como em `tests/unit/folder-route.test.ts`):
  - Host `exemplo.com` → 403 (as duas rotas); Origin `http://outro-site.com` → 403; `content-type: text/plain` → 415; corpo `"{oops"` → 400.
  - Salvo `{baseUrl:"https://gw/v1", apiKey:"sk-salva", model:"m1"}`: `POST testar {}` → fetch chamado com `Authorization: Bearer sk-salva` e `200 {ok:true,…}`.
  - Digitado `{baseUrl:"https://outro/v1", apiKey:""}` → 400 com a mensagem da regra acima e **fetch não chamado**; com `apiKey:"sk-nova"` → ok e fetch recebe `sk-nova`.
  - Digitar só `{model:"m2"}` usa URL e chave salvas; `baseUrl` digitada igual à salva (com barra final) conta como igual.
  - Sem nada salvo e `{}` → 400 `"Informe uma URL http ou https válida para o gateway."`; `testar` sem modelo → 400 `"Escolha o modelo antes de testar."`, `modelos` sem modelo → 200.
  - `modelos`: gateway com `{data:[{id:"b"},{id:"a"}]}` → `{models:["a","b"]}`; gateway 401 → 502 com `"Não foi possível listar os modelos: HTTP 401…"`.
  - Respostas nunca contêm a chave salva.
- [ ] **Step 2:** `npx vitest run tests/unit/ai-routes.test.ts` → FAIL.
- [ ] **Step 3: Implementar** os arquivos; ajustar `pastas/route.ts` e rodar `npx vitest run tests/unit/folder-route.test.ts` → PASS (sem mudança de comportamento).
- [ ] **Step 4:** `npx vitest run tests/unit/ai-routes.test.ts` → PASS; `npx tsc --noEmit` e `npx eslint src tests` limpos.
- [ ] **Step 5: Commit** `feat(ai): rotas para testar o gateway e listar modelos`.

### Task 5: Menu, página e formulário

**Files:**
- Modify: `src/components/ui/icons.tsx` (`SettingsIcon`, engrenagem 20×20 no estilo dos demais), `src/components/layout/Sidebar.tsx` (item após Agenda), `tests/unit/app-shell.test.tsx`, `docs/superpowers/specs/2026-10-25-configuracao-ia-design.md` (campo Modelo vira `<input list>` com `<datalist>`: aceita lista buscada e texto livre)
- Create: `src/app/(app)/configuracao/page.tsx`, `src/features/ai/components/AiSettingsForm.tsx`, `src/features/ai/components/AiSettingsForm.module.css`
- Test: `tests/unit/ai-settings-form.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`getAiSettings`, `saveAiSettings`), Task 4 (rotas `/api/ai/testar` e `/api/ai/modelos`), `Button`, `PageHeader`, `Toast`/`useToast`.
- Produces: `AiSettingsForm({ initial }: { initial: AiSettingsPublic })`. Página: `await connection()` (de `next/server`, para não ser pré-renderizada com o banco do build), `metadata.title = "Configuração · StudyFlow"`, `PageHeader title="Configuração"`, painel com título "Agente de IA".

Rótulos exatos (`getByLabelText`): "Gateway base URL", "Gateway API key" (`type="password"`, valor sempre vazio, `placeholder` = chave mascarada quando `hasKey`, senão vazio; texto de ajuda "Deixe em branco para manter a chave salva."), "Modelo", "Temperatura", "Timeout (segundos)", "Parâmetros extras (JSON)". Botões: "Buscar modelos", "Testar", "Salvar" (desabilitam enquanto pendentes). Resultado do Testar em `role="status"`: `OK · 820 ms · resposta: OK` ou `Falha · HTTP 401 · <erro>` / `Falha · <erro>`. Salvar: erros de campo abaixo de cada campo (`role="alert"`); sucesso → toast `"Configuração salva."`; falha → toast com `message`. Buscar modelos preenche o `<datalist>`; falha mostra a mensagem em linha. O corpo enviado às rotas contém só os campos digitados (`apiKey` só se não vazio).

- [ ] **Step 1: Escrever `tests/unit/ai-settings-form.test.tsx`** (`vi.mock("@/features/ai/actions")`, `fetch` simulado, user-event):
  - renderiza com `initial` e mostra a chave só como placeholder (`"sk-s…VdU"`); o valor do campo está vazio e o HTML não contém a chave completa.
  - Testar com fetch `200 {ok:true,latencyMs:820,reply:"OK",error:null,status:200}` mostra `OK · 820 ms · resposta: OK`; com `{ok:false,status:401,error:"chave inválida",…}` mostra `Falha · HTTP 401 · chave inválida`; resposta `400 {message:"Escolha o modelo antes de testar."}` mostra essa mensagem; o corpo do POST tem `baseUrl` e **não** tem `apiKey` quando o campo está vazio.
  - Buscar modelos: `{models:["a","b"]}` cria `<option value="a">` e `"b"` no datalist; 502 mostra a mensagem.
  - Salvar chama `saveAiSettings` com os valores do formulário; sucesso mostra o toast; `fieldErrors` aparecem sob o campo certo.
  - `app-shell.test.tsx`: o nav contém "Configuração", `href="/configuracao"`, e ela vem depois de Agenda.
- [ ] **Step 2:** `npx vitest run tests/unit/ai-settings-form.test.tsx tests/unit/app-shell.test.tsx` → FAIL.
- [ ] **Step 3: Implementar** ícone, item de menu, página, formulário e CSS (tokens de `src/styles/tokens.css`; layout em coluna, largura máx. ~640 px, legível em 375 px). Ajustar o spec conforme acima.
- [ ] **Step 4:** mesmos testes → PASS; `npx tsc --noEmit` e `npx eslint src tests` limpos.
- [ ] **Step 5: Commit** `feat(ai): item Configuração e formulário do agente de IA`.

### Task 6: e2e e verificação final

**Files:**
- Create: `tests/e2e/configuracao.spec.ts`
- Modify: `tests/e2e/navegacao.spec.ts` (o teste mobile continua válido; acrescentar `Configuração` ao drawer se a altura de 760 px ainda couber)

- [ ] **Step 1: Escrever `tests/e2e/configuracao.spec.ts`**: `beforeAll` sobe um `http.createServer` em `127.0.0.1:3299` (gateway falso: `GET /v1/models` → `{data:[{id:"modelo-b"},{id:"modelo-a"}]}`; `POST /v1/chat/completions` → 401 `{error:{message:"chave inválida"}}` se `Authorization !== "Bearer chave-falsa-123"`, senão `{choices:[{message:{content:"OK"}}]}`); `afterAll` fecha. `beforeEach(resetData)`. Fluxo: ir para `/estudo`, clicar em "Configuração" na navegação (aparece depois de "Agenda"), URL termina em `/configuracao`, item com `aria-current="page"`; preencher URL `http://127.0.0.1:3299/v1` e chave `chave-falsa-123`; "Buscar modelos"; preencher Modelo `modelo-a`; "Testar" mostra `OK ·` e `resposta: OK`; trocar a chave para `errada`, "Testar" mostra `Falha · HTTP 401`; "Salvar" com a chave em branco → toast "Configuração salva."; recarregar: URL e modelo persistem, o campo da chave está vazio com placeholder mascarado, e "Testar" volta a funcionar usando a chave salva — o texto do `body` da página nunca contém `chave-falsa-123`. Segundo teste: trocar a URL para `http://127.0.0.1:3298/v1` com a chave em branco e "Testar" mostra a mensagem "Para testar outra Base URL, digite a API key junto (ou salve antes)."
- [ ] **Step 2:** Pelo PowerShell, garantir que nada escuta na porta 3200 (`Stop-Process` do dono, se houver); `npx playwright test tests/e2e/configuracao.spec.ts tests/e2e/navegacao.spec.ts` → PASS.
- [ ] **Step 3: Verificação completa:** `npx tsc --noEmit`, `npx eslint src tests`, `npx vitest run` (todos verdes; ~4 min), `npm run build`, `npx playwright test` (suite inteira). Registrar a contagem real de testes.
- [ ] **Step 4:** Rodar `superpowers:verification-before-completion`; conferir `git status` sem arquivos indevidos.
- [ ] **Step 5: Commit** `test(ai): e2e da tela de configuração` com os caminhos dos testes.
- [ ] **Step 6:** Atualizar a memória do projeto (`project-editor-celulas-estado.md` ou nova entrada) com: tela `/configuracao`, tabela `AiSettings`, `src/features/ai/client.ts` reutilizável pela futura IA dos cards, e o aviso de que a chave fica em texto no SQLite.
