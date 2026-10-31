# Testes, Agenda, agendamento e IA nos cards — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Devolver ao StudyFlow as telas Testes e Agenda funcionando, o agendamento de revisões ao fim do teste e a IA nos cards (botão "IA") e no editor (botão "Resumir"), deixando a `main` compilando e com todos os testes passando.

**Architecture:** Backend de Testes (consulta de resumos + 3 ações) em `features/cards`; páginas `/testes` e `/agenda` em servidor que alimentam as telas já existentes (`TestList`, `TestModal`, `ScheduleList`, `ScheduleConfirmModal`); três ações de IA em `features/ai/actions.ts` que passam pelo `createGatewayClient` (defesa SSRF já existente); botões de IA nos componentes de card e de editor. Sem migração de banco.

**Tech Stack:** Next.js 16.4.3 (App Router), TypeScript, Prisma 7/libsql, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-testes-agenda-ia-design.md`

## Global Constraints

- **Next 16:** `AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de escrever código de página/rota (aqui: `PageProps`/`searchParams` como Promise, Server Actions, `router.refresh`).
- Textos de interface e mensagens em **pt-BR**. Commits em pt-BR `tipo(escopo): mensagem`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Branch `feat/testes-agenda` (já criada). **Nunca** alterar nem commitar os arquivos do usuário que seguem sem commit: `docs/Pedido do editor de textos.docx`, `src/components/ui/{input,label}.tsx`, `src/lib/utils.ts`, `studyflow.bat`. Nunca ler/imprimir `.env`.
- Os 3 testes `tests/unit/{ai-card-generation,card-form-modal-ai,editor-summarize}.test.*` já estão commitados e são a **especificação da IA**: só a Task 4 pode editá-los, e **apenas** para trocar o mock de `createAiClient` por `createGatewayClient`. Nenhuma outra asserção muda.
- Nenhuma dependência nova. Sem migração Prisma nova.
- Isolamento por usuário: toda consulta/ação filtra por `getCurrentUserId()` e por Estudo/card **não excluído** (`deletedAt: null`). Padrão de erro: `authActionMessage` / `failure()` como em `cards/actions.ts`.
- Toda action exportada precisa de um caso em `tests/unit/session-expired.test.ts` (o teste de cobertura falha senão).
- **Gates (rodar antes de cada commit):**
  - `npx tsc --noEmit` — Tasks 1–3: filtrar com `grep -v -E "ai-card-generation|card-form-modal-ai|editor-summarize|src/lib/utils|components/ui/(input|label)"` (saída vazia = ok; os 3 testes só compilam depois da Task 4/5/6). Task 4 em diante: `grep -v -E "src/lib/utils|components/ui/(input|label)"`.
  - `npx vitest run <arquivos tocados e os citados na tarefa>`.
  - `npx eslint <arquivos tocados>` sem erros novos.
  - `npm test` completo **uma vez no fim da tarefa**, em segundo plano (>5 min). Linha de base atual: **1368 passam, 32 falham** (ai-card-generation 17, card-form-modal-ai 7, editor-summarize 8). Esperado ao fim: Task 4 → 15 falhas; Task 5 → 8; Task 6 → 0. Qualquer falha fora disso é regressão.
- Shell: Windows (Git Bash/PowerShell).

## Review Focus

Entradas que o spec implica e nenhum teste óbvio cobre; cada uma tem seu teste na tarefa dona:

1. Usuário B nunca lê nem altera dados de A: `recordCardResult`, `getCardAccuracy`, `updateLastTested`, `listStudyTestSummaries`, `completeSchedule` (Tasks 1 e 2).
2. `/testes?study=…&schedule=…` forjado: agendamento de outro usuário, de **outro Estudo**, já "Realizado" ou id inexistente **não** pode ser concluído nem destacar nada (Task 2).
3. Perto da meia-noite no Brasil (23:30 de 31/10): a prévia do modal e o servidor geram as mesmas datas locais, nunca o dia seguinte em UTC (Task 3).
4. Clique duplo: "Confirmar" do agendamento não cria 12 linhas; "Finalizar" duas vezes não duplica efeitos (Tasks 2 e 3).
5. Texto da IA inserido como célula/campo é só Markdown/texto (sem HTML executável), no tamanho máximo de 5000 e nunca vazio; entrada acima de 20 000 caracteres recusada antes de chamar a IA (Tasks 4 e 6).

---

### Task 1: Backend de Testes (resumos e 3 ações)

**Files:**
- Modify: `src/features/cards/types.ts`, `src/features/cards/queries.ts`, `src/features/cards/actions.ts`, `src/app/api/testes/resumo/route.ts`, `src/features/cards/components/TestList.tsx` (só o `import type`)
- Create: `tests/unit/test-backend.test.ts`
- Modify: `tests/unit/session-expired.test.ts`, `tests/unit/user-isolation.test.ts`

**Interfaces:**
- Produces:
  - `type StudyTestSummary = { studyId: string; studyName: string; lastCardCreated: string | null; lastTested: string | null; totalCards: number; correctAnswers: number; totalAttempts: number; accuracyPercent: number | null }` (`types.ts`; datas ISO)
  - `listStudyTestSummaries(): Promise<StudyTestSummary[]>` (`queries.ts`)
  - `recordCardResult(cardId: string, studyId: string, correct: boolean): Promise<CardResult>`
  - `getCardAccuracy(cardId: string): Promise<CardResult<{ accuracyPercent: number | null; attempts: number }>>`
  - `updateLastTested(studyId: string): Promise<CardResult>`
  - `GET /api/testes/resumo` devolve o mesmo array (a rota apenas delega a `listStudyTestSummaries`).
- Consumes: padrão `CardResult`, `failure()`, `NOT_FOUND`, `validId` de `cards/actions.ts`.

- [ ] **Step 1: Ler** `tests/unit/user-isolation.test.ts` e `tests/unit/session-expired.test.ts` (como criam usuários/Estudos/cards no banco de teste e como simulam a sessão) e copiar o padrão.

- [ ] **Step 2: Escrever `tests/unit/test-backend.test.ts` (deve falhar)**, com banco real de teste como os outros, cobrindo:
  - `listStudyTestSummaries`: Estudo com 2 cards (1 excluído) e resultados dos dois cards → `totalCards` 1, `totalAttempts`/`correctAnswers` contam **só** resultados do card ativo; `accuracyPercent` = acertos/tentativas × 100; sem tentativas → `null` (e `totalAttempts` 0); `lastCardCreated` = `createdAt` ISO do card ativo mais novo; `lastTested` ISO ou `null`; Estudo sem card ativo, Estudo excluído e Estudo de outro usuário **não aparecem**; ordenação por `updatedAt` desc.
  - `recordCardResult`: grava 1 `CardResult` (`correct` true/false); `correct` não booleano → `{ ok: false }`; ids vazios/não string → `{ ok: false }`; card de outro usuário, card de **outro Estudo** que não o informado, card excluído, Estudo excluído → `{ ok: false }` e **nada gravado**.
  - `getCardAccuracy`: 3 resultados (2 certos) → `{ ok: true, data: { accuracyPercent: 66.666…, attempts: 3 } }`; nenhum → `{ accuracyPercent: null, attempts: 0 }`; card de outro usuário ou excluído → `{ ok: false }`.
  - `updateLastTested`: preenche `lastTestedAt`; `updatedAt` do Estudo **não muda** (comparar antes/depois); Estudo de outro usuário ou excluído → `{ ok: false }` e `lastTestedAt` intacto.

- [ ] **Step 3: Rodar** `npx vitest run tests/unit/test-backend.test.ts` — esperado: FALHA (funções não existem).

- [ ] **Step 4: Implementar.** Tipos e consulta: 3 consultas no total (Estudos com `cards: { some }` + `_count` de cards ativos; `groupBy` de `Card` por `studyId` com `_max.createdAt` dos ativos; `groupBy` de `CardResult` por `studyId` e `correct` restrito a `card: { deletedAt: null }`), montando o resumo em memória, sem laço de consultas por Estudo. A rota passa a `return NextResponse.json(await listStudyTestSummaries())` mantendo o tratamento de erro atual (`authErrorResponse`). Ações: transação onde houver leitura+escrita; `updateLastTested` lê o `updatedAt` atual do Estudo (do usuário, não excluído) e grava `lastTestedAt: new Date()` **passando esse mesmo `updatedAt`** no `data` para o `@updatedAt` do Prisma não ser disparado. `TestList.tsx`: `import type { StudyTestSummary } from "../types"`.

- [ ] **Step 5: Atualizar** `session-expired.test.ts` (3 entradas `cards.*` em `actionCalls`, contagem esperada 12 → 15, `queries.listStudyTestSummaries` em `throwingCalls` e na lista de cobertura, se o teste listar consultas) e `user-isolation.test.ts` (B não enxerga nem altera nada de A nas 4 funções novas; `listStudyTestSummaries()` de B é `[]`).

- [ ] **Step 6: Rodar** `npx vitest run tests/unit/test-backend.test.ts tests/unit/session-expired.test.ts tests/unit/user-isolation.test.ts tests/unit/cards-actions.test.ts` (e qualquer outro teste de `cards`/`api/testes` que o Grep achar) — esperado: PASS.

- [ ] **Step 7: Gates e commit** `feat(testes): consulta de resumos e ações de resultado dos cards`.

---

### Task 2: Páginas Testes e Agenda, conclusão do teste

**Files:**
- Create: `src/features/cards/test-target.ts`, `tests/unit/test-target.test.ts`, `tests/unit/test-list.test.tsx`, `tests/unit/test-modal.test.tsx`
- Modify: `src/app/(app)/testes/page.tsx`, `src/app/(app)/agenda/page.tsx`, `src/features/cards/components/TestList.tsx` (+ `.module.css` para o destaque), `src/features/cards/components/TestModal.tsx`, `src/features/agenda/components/ScheduleList.tsx`, `tests/e2e/navegacao.spec.ts`

**Interfaces:**
- Consumes (Task 1): `listStudyTestSummaries`, `StudyTestSummary`, `recordCardResult`, `getCardAccuracy`, `updateLastTested`; da Agenda: `listUserSchedules`, `completeSchedule`, `ScheduleRow`.
- Produces:
  - `resolveTestTarget(params: { study?: string | string[]; schedule?: string | string[] }, studies: StudyTestSummary[], schedules: ScheduleRow[]): { highlightStudyId: string | null; scheduleId: string | null }` (`test-target.ts`, pura)
  - `TestList` props: `{ studies: StudyTestSummary[]; highlightStudyId?: string | null; scheduleId?: string | null }`
  - `TestModal` props: acrescenta `scheduleId?: string | null`

- [ ] **Step 1: Escrever `tests/unit/test-target.test.ts` (deve falhar):** `study` listado → `highlightStudyId` igual; `study` não listado, ausente ou array → ambos `null`; `schedule` só vale com `study` válido **e** se o agendamento existe, é desse Estudo e tem `status === "Ativo"` (ids de outro Estudo, `"Realizado"`, inexistente, vazio ou array → `scheduleId: null`, mas o destaque do Estudo continua); `schedule` sem `study` → ambos `null`.

- [ ] **Step 2: Escrever `tests/unit/test-list.test.tsx` e `tests/unit/test-modal.test.tsx` (devem falhar),** com `vi.mock` das ações e de `next/navigation` (`useRouter` → `{ refresh }`):
  - `TestList`: a linha de `highlightStudyId` tem `data-highlighted="true"` e é a única; sem destaque nenhuma; `scrollIntoView` chamado na linha destacada (stub em `Element.prototype`); abrir o teste (botão "Todos") do **Estudo destacado** passa `scheduleId` ao `TestModal`, e de **outro** Estudo passa `null`; ao fechar o modal chama `router.refresh()`.
  - `TestModal` (mock de `fetch` para `/api/cards`): ao avaliar ("Acertei"/"Errei") chama `recordCardResult(cardId, studyId, correct)` e depois `getCardAccuracy(cardId)`; se `recordCardResult` devolver `{ ok: false, message }`, a mensagem aparece na tela (`role="alert"`) e o card **não** fica avaliado; ao finalizar o último card chama `updateLastTested(studyId)` e, **só se houver `scheduleId`**, `completeSchedule(scheduleId)`; se qualquer uma falhar, a tela "Teste Concluído" continua e mostra o aviso "Teste concluído, mas não foi possível registrar o resultado no histórico/na agenda."; clicar duas vezes em "Finalizar" não chama as ações duas vezes.
  - `ScheduleList`: "Fazer" é um link (`role="link"`) com `href="/testes?study=<studyId>&schedule=<id>"` só para status "Ativo".

- [ ] **Step 3: Rodar** os 3 arquivos novos — esperado: FALHA.

- [ ] **Step 4: Implementar.** `test-target.ts` conforme a interface. `testes/page.tsx`: `async function TestesPage({ searchParams }: PageProps<"/testes">)`, `await requireUser()`, `listStudyTestSummaries()` e `listUserSchedules()` em paralelo, `resolveTestTarget(await searchParams, …)`, `<PageHeader title="Testes" />` seguido de `<TestList … />` (copie a estrutura de `estudo/page.tsx`/`ComingSoon`; o título tem que ser o `h1` "Testes"). `agenda/page.tsx`: `requireUser`, `listUserSchedules()`, `<PageHeader title="Agenda" />` + `<ScheduleList schedules={…} />`; remover `ComingSoon` das duas. `TestList`: destaque via atributo + classe, `useEffect` com `scrollIntoView?.({ block: "center" })`, `useRouter().refresh()` ao fechar o modal, repasse condicional de `scheduleId`. `TestModal`: prop `scheduleId`, estado `error` (`role="alert"`) no lugar do `console.error`, `finishing` para impedir duplo "Finalizar", chamadas ao final conforme o teste. `ScheduleList`: `next/link` com o visual do botão secundário (se `Button` não aceitar `href`, use a classe do módulo). Remover o `window.location`.

- [ ] **Step 5: Atualizar `tests/e2e/navegacao.spec.ts`:** Testes e Agenda continuam conferindo `h1` e `aria-current="page"`, mas no lugar de "Em breve" verificam o estado vazio (`"Nenhum estudo com cards cadastrados encontrado."` e `"Nenhum agendamento encontrado para este filtro."`).

- [ ] **Step 6: Rodar** `npx vitest run tests/unit/test-target.test.ts tests/unit/test-list.test.tsx tests/unit/test-modal.test.tsx tests/unit/app-shell.test.tsx` — esperado: PASS.

- [ ] **Step 7: Gates e commit** `feat(testes): páginas Testes e Agenda ligadas às telas e conclusão do teste`.

---

### Task 3: Agendar revisões ao fim do teste e fuso do servidor

**Files:**
- Create: `src/features/agenda/sessions.ts`, `tests/unit/agenda-sessions.test.ts`, `tests/unit/schedule-confirm-modal.test.tsx`
- Modify: `src/features/agenda/actions.ts` (usar `sessions.ts`), `src/features/agenda/components/ScheduleConfirmModal.tsx`, `src/features/cards/components/TestModal.tsx`, `tests/unit/test-modal.test.tsx`, `ecosystem.config.js`, `README.md`

**Interfaces:**
- Produces (`sessions.ts`, pura, sem `"use server"`):
  - `REVIEW_SESSIONS: ReadonlyArray<{ session: string; days: number }>` = Imediata 0, 24 horas 1, 3 dias 3, 1 semana 7, 1 mês 30, 6 meses 180
  - `reviewDateFor(now: Date, days: number): string` — data local `YYYY-MM-DD` (usa `toIsoDate` e soma de dias local)
- Altera `ScheduleConfirmModal` props: `{ open; studyId; studyName; warning?: string; onClose; onConfirm: () => Promise<{ ok: true } | { ok: false; message: string }> }`

- [ ] **Step 1: Escrever testes (devem falhar):**
  - `agenda-sessions.test.ts`: com `process.env.TZ = "America/Sao_Paulo"` definido no topo do arquivo e `vi.setSystemTime(new Date(2026, 9, 31, 23, 30))`: `reviewDateFor(now, 0)` → `"2026-10-31"` (nunca `"2026-11-01"`), `reviewDateFor(now, 1)` → `"2026-11-01"`, `reviewDateFor(now, 180)` → `"2027-04-29"`; a lista tem as 6 sessões nessa ordem.
  - `schedule-confirm-modal.test.tsx`: mostra 6 linhas com datas no formato `dd/mm/aaaa` iguais às de `reviewDateFor`; com `warning` mostra o aviso; "Confirmar" chama `onConfirm` **uma vez** mesmo com dois cliques rápidos (botão desabilitado enquanto confirma); `{ ok: false, message }` mostra a mensagem e **não** fecha; `{ ok: true }` chama `onClose`.
  - `test-modal.test.tsx` (acrescentar): na tela "Teste Concluído" o botão "Agendar revisões" chama `checkStudyHasActiveSchedules(studyId)`; sem ativos abre o modal sem aviso e, ao confirmar, chama `createSchedules({ studyId, studyName, force: false })`; com ativos abre com aviso e usa `force: true`; sucesso mostra "Agendamentos criados." e deixa o botão desabilitado; falha de `createSchedules` mostra a mensagem dela no modal; se `checkStudyHasActiveSchedules` lançar, mostra erro e não abre o modal.

- [ ] **Step 2: Rodar** os testes novos/alterados — esperado: FALHA.

- [ ] **Step 3: Implementar.** `sessions.ts` conforme a interface; `createSchedules` passa a montar as linhas com `REVIEW_SESSIONS`/`reviewDateFor` (comportamento igual, mesmos campos). `ScheduleConfirmModal`: remover cálculo com `toISOString`, usar `sessions.ts`, prop `warning`, `confirming` bloqueia clique duplo, resultado do `onConfirm` tratado conforme a interface. `TestModal`: estado e fluxo de "Agendar revisões" na tela de conclusão (desabilitado após criar). `ecosystem.config.js`: `env: { NODE_ENV: "production", TZ: "America/Sao_Paulo" }`; README, na seção "Deploy na VPS": uma linha explicando o `TZ` e que a atualização usa `pm2 startOrReload ecosystem.config.js`.

- [ ] **Step 4: Rodar** `npx vitest run tests/unit/agenda-sessions.test.ts tests/unit/schedule-confirm-modal.test.tsx tests/unit/test-modal.test.tsx tests/unit/user-isolation.test.ts tests/unit/session-expired.test.ts` — esperado: PASS.

- [ ] **Step 5: Gates e commit** `feat(agenda): agendar revisões ao fim do teste, datas locais e TZ do servidor`.

---

### Task 4: Ações de IA (`generateCardQuestion`, `generateCardAnswer`, `summarizeText`)

**Files:**
- Modify: `src/features/ai/actions.ts`, `tests/unit/ai-card-generation.test.ts` (**só o mock**, ver abaixo), `tests/unit/session-expired.test.ts`

**Interfaces:**
- Produces (todas `"use server"` async):
  - `type AiTextResult = { ok: true; text: string } | { ok: false; message: string }`
  - `generateCardQuestion(text: string): Promise<AiTextResult>`
  - `generateCardAnswer(question: string): Promise<AiTextResult>`
  - `summarizeText(text: string): Promise<AiTextResult>`
- Consumes: `resolveAiConfig({}, { requireModel: false })`, `createGatewayClient` de `@/features/ai/gateway`, `AiError` de `@/features/ai/client`, `authActionMessage`.

- [ ] **Step 1: Ajustar o mock do teste existente** `tests/unit/ai-card-generation.test.ts`: no lugar de `vi.mock("@/features/ai/client", …createAiClient…)` usar `vi.mock("@/features/ai/gateway", () => ({ createGatewayClient: vi.fn() }))`; importar `createGatewayClient` de `@/features/ai/gateway`; `vi.mocked(createGatewayClient).mockReturnValue({ chat } as unknown as ReturnType<typeof createGatewayClient>)`; e a asserção `expect(createAiClient).toHaveBeenCalledWith(config)` vira `expect(createGatewayClient).toHaveBeenCalledWith(config)`. `AiError` continua importado do módulo real. Nenhuma outra linha muda.

- [ ] **Step 2: Rodar** `npx vitest run tests/unit/ai-card-generation.test.ts` — esperado: FALHA (ações não existem). Os prompts de usuário exatos que o teste exige:
  - pergunta: `Faça uma pergunta com um parágrafo curto do texto: ${texto}`
  - resposta: `Responda em um parágrafo curto a pergunta ${pergunta}`
  - resumo: `Resuma em um parágrafo curto o texto: ${texto}`

- [ ] **Step 3: Implementar** as três ações com um helper interno compartilhado (`runAiText(system, userPrompt)`), sem duplicar a lógica: entrada `string` não vazia após `trim` (senão `{ ok: false }` sem chamar a IA); máximo 20 000 caracteres (mensagem contendo "20 000", p.ex. "O texto é grande demais (máximo de 20 000 caracteres)."); `resolveAiConfig` com `ok: false` → `{ ok: false, message: resultado.message }`; modelo vazio → mensagem contendo "modelo" ("Escolha o modelo em Configuração antes de usar a IA."); chamada `createGatewayClient(config).chat(system, userPrompt)`; resposta `.trim()`, vazia → falha, cortada em 5000 caracteres; `AiError` → `{ ok: false, message: error.message }`; erro de sessão (`authActionMessage`) → essa mensagem; qualquer outro erro → mensagem genérica sem o detalhe ("Não foi possível gerar o texto."). O prompt de sistema é curto, em português, pedindo só o texto solicitado, sem preâmbulo nem formatação extra.

- [ ] **Step 4: Atualizar** `session-expired.test.ts`: 3 entradas `ai.*` em `actionCalls` (contagem 15 → 18) — conferir que com sessão inválida o resultado é a mesma mensagem de sessão expirada das outras actions (se `resolveAiConfig` já a devolve, nada mais a fazer; se não, tratar na ação).

- [ ] **Step 5: Rodar** `npx vitest run tests/unit/ai-card-generation.test.ts tests/unit/session-expired.test.ts tests/unit/ai-routes.test.ts tests/unit/ai-settings.test.ts` — esperado: PASS. `npm test` completo: esperado **15 falhas** (card-form-modal-ai 7 + editor-summarize 8).

- [ ] **Step 6: Gates e commit** `feat(ai): ações de pergunta, resposta e resumo com o gateway protegido`.

---

### Task 5: Botão "IA" no formulário de card

**Files:**
- Modify: `src/features/cards/components/CardFormModal.tsx`, `src/features/estudo/editor/components/EditorView.tsx` (só se ainda passar `onAi`; o Grep atual não achou chamador)

**Interfaces:**
- Consumes (Task 4): `generateCardQuestion`, `generateCardAnswer`.
- Remove: prop `onAi` e a mensagem "A IA será ligada em breve.".

- [ ] **Step 1: Rodar** `npx vitest run tests/unit/card-form-modal-ai.test.tsx` — esperado: FALHA nos 7 casos da IA (a Task 4 deixou as ações existirem; falta a UI). Não editar esse teste.

- [ ] **Step 2: Implementar** `handleAi` assíncrono em `CardFormModal`: estado `generating`; lê `navigator.clipboard.readText()`; negado/lançou ou texto vazio após `trim` → `onError("Não foi possível ler a área de transferência. Copie o texto (Ctrl+C) e tente de novo.")` (o texto precisa conter "Ctrl+C"); chama `generateCardQuestion(clipboard)`; `ok: false` → `onError(message)` sem mexer nos campos; `ok: true` → `setPergunta(text)` e chama `generateCardAnswer(text)`; resposta `ok: false` → mantém a pergunta gerada, limpa a resposta e `onError(message)`; `ok: true` → `setResposta(text)`. Qualquer exceção de rede/servidor → `onError("Não foi possível usar a IA. Tente novamente.")`. Botão: rótulo "IA", durante o trabalho "Gerando…" e `disabled`; sempre reabilita no `finally`. Respeitar `maxLength` dos campos (o servidor já corta em 5000).

- [ ] **Step 3: Rodar** `npx vitest run tests/unit/card-form-modal-ai.test.tsx tests/unit/card-form-modal.test.tsx` (e os testes de `CardFormModal`/editor-cards que o Grep achar) — esperado: PASS. `npm test` completo: esperado **8 falhas** (só editor-summarize).

- [ ] **Step 4: Gates e commit** `feat(cards): botão IA gera pergunta e resposta a partir do clipboard`.

---

### Task 6: Botão "Resumir" no editor

**Files:**
- Modify: `src/features/estudo/editor/components/Toolbar.tsx` (+ `.module.css` se preciso), `src/features/estudo/editor/components/EditorView.tsx`

**Interfaces:**
- Consumes (Task 4): `summarizeText`.
- Produces: `Toolbar` props novas `onSummarize?: () => void; canSummarize?: boolean; summarizing?: boolean`. O botão tem o nome acessível **"Resumir"** (não muda enquanto trabalha; fica `disabled`); um texto de status "Resumindo…" aparece enquanto `summarizing`.

- [ ] **Step 1: Rodar** `npx vitest run tests/unit/editor-summarize.test.tsx` — esperado: FALHA. Não editar esse teste.

- [ ] **Step 2: Implementar.** `canSummarize` = há célula atual (`exists(editingId) || exists(focusedId)`, o mesmo critério do botão de card) e não está resumindo. `handleSummarize` em `EditorView`: célula atual = `editingId` ou `focusedId` existente; (a) se `cells.length >= MAX_CELLS` → toast com o texto do limite de células (o teste exige `/limite de células/i`; reaproveitar `CONTENT_LIMIT_MESSAGE` se já tiver essa frase, senão usar "O documento já está no limite de células.") **sem chamar a IA**; (b) texto vazio após `trim` → toast "A célula está vazia." sem chamar a IA; (c) `summarizeText(texto)` com `summarizing` ligado; erro → toast com a mensagem e nenhuma célula nova; (d) ao chegar, se a célula original já não existe → toast "A célula foi excluída; o resumo foi descartado."; (e) senão `addBelow(id)` e `changeText(newId, resumo)` (resumo entra como texto Markdown comum), toast "Resumo criado abaixo da célula."; o autosave existente salva. Exceção de rede → toast "Não foi possível usar a IA. Tente novamente.". `summarizing` sempre volta a falso no `finally`.

- [ ] **Step 3: Rodar** `npx vitest run tests/unit/editor-summarize.test.tsx tests/unit/editor-view.test.tsx tests/unit/toolbar.test.tsx tests/unit/cell.test.tsx tests/unit/cell-list.test.tsx` — esperado: PASS. `npm test` completo: esperado **0 falhas**.

- [ ] **Step 4: Gates (tsc agora com filtro só dos 3 arquivos do usuário sem commit) e commit** `feat(editor): botão Resumir cria uma célula com o resumo da célula atual`.

---

### Task 7: e2e do fluxo e verificação final da branch

**Files:**
- Create: `tests/e2e/testes-agenda.spec.ts`
- Modify: `tests/e2e/helpers.ts` e/ou `tests/e2e/insert-study.ts` (helper para inserir cards direto no banco do e2e, no padrão de `insertStudy`)

- [ ] **Step 1: Escrever `tests/e2e/testes-agenda.spec.ts`:** `resetData()`, `login`, Estudo inserido com 2 cards (helper novo). Fluxo: menu Testes → linha do Estudo mostra 2 cards → "Todos" → "Ver resposta" → "Acertei" → "Próximo" → "Ver resposta" → "Errei" → "Finalizar" → "Teste Concluído" mostra "1 de 2" → "Agendar revisões" → modal lista 6 sessões → "Confirmar" → "Agendamentos criados." → fechar → menu Agenda mostra 6 linhas "Ativo" → "Fazer" da primeira abre `/testes?study=…&schedule=…` com a linha destacada → fazer o teste e finalizar → voltar à Agenda: aquela linha agora "Realizado". Confirmar também que "Último teste" e "% de acertos" da linha de Testes foram atualizados.

- [ ] **Step 2: Verificação completa.** (a) `npm test` em segundo plano — esperado **0 falhas**; (b) `npx tsc --noEmit | grep -v -E "src/lib/utils|components/ui/(input|label)"` — vazio; (c) `npx eslint src tests` — sem erros novos (linha de base: avisos da agenda e arquivos do usuário sem commit); (d) e2e: confirmar porta 3200 livre e `Get-NetTCPConnection -LocalPort 3200`; `prisma/dev.db` com `Get-FileHash` antes e depois (iguais); excluir temporariamente de `tsconfig.json` `src/lib/utils.ts`, `src/components/ui/input.tsx` e `src/components/ui/label.tsx` (arquivos do usuário sem commit), rodar `npm run test:e2e` — esperado todos passando (47 testes: os 46 anteriores + o novo, ajustado pelo `navegacao.spec`) — e **reverter** o `tsconfig.json` (`git diff tsconfig.json` mostra só a sua mudança; depois `git checkout -- tsconfig.json`); (e) **clone limpo:** `git clone --no-hardlinks . <scratchpad>/sf-clean`, `npm ci`, `DATABASE_URL=file:<scratchpad>/clean.db npx prisma migrate deploy`, `npx next build` — esperado: **build conclui sem erros**, provando que o código commitado compila sozinho; apagar o clone; (f) `Grep` por `createAiClient(` em `src` (só `gateway.ts`), por `console.error` novo nos componentes de Testes e por `ComingSoon` em `testes`/`agenda` (nenhum).

- [ ] **Step 3:** `git status --short` — só os 4 arquivos do usuário sem commit; `git log --oneline main..HEAD` — spec, plano e commits das Tasks 1–7. Correções entram como commits `fix(...)`.
