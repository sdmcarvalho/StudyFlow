# Testes, Agenda, agendamento e IA nos cards — recuperação do que foi perdido

Data: 2026-10-31. Branch: `feat/testes-agenda` (a partir da `main`).

## Objetivo

Devolver ao StudyFlow o que existia no diretório de trabalho do usuário e nunca foi commitado:
as telas **Testes** e **Agenda**, o **agendamento de revisões** e a **IA nos cards e no editor**.
Depois do merge, a `main` volta a compilar e a ter todos os testes passando, e o resultado vai para a VPS
(`https://estudo.aiontecno.com.br`).

## O que já existe (e não se refaz)

- Telas: `TestList`, `TestModal` (commit `1b31980`, "wip"), `ScheduleList`, `ScheduleConfirmModal`.
- Rotas: `GET /api/testes/resumo`, `GET /api/cards?studyId=`.
- Ações da Agenda: `createSchedules`, `completeSchedule`, `listUserSchedules`, `checkStudyHasActiveSchedules`.
- Banco: `CardResult`, `Schedule`, `StudyRecord.lastTestedAt` (migrações já aplicadas, incluindo na VPS). **Sem migração nova.**
- Os 3 testes em andamento (`ai-card-generation`, `card-form-modal-ai`, `editor-summarize`): são a especificação da IA.
- `CardFormModal` já tem o botão "IA" ligado a um `onAi` opcional que só mostra "A IA será ligada em breve.".

## O que falta (e foi decidido)

Decisões do usuário: escopo **completo**; agendar **ao fim do teste**; "Fazer" na Agenda **abre Testes com a
linha destacada** e o agendamento vira "Realizado" **ao finalizar esse teste**.

### 1. Backend de Testes

- `StudyTestSummary` em `src/features/cards/types.ts`:
  `{ studyId, studyName, lastCardCreated: string|null, lastTested: string|null, totalCards, correctAnswers, totalAttempts, accuracyPercent: number|null }` (datas em ISO). `TestList` passa a importar o tipo de `../types`.
- `listStudyTestSummaries()` em `cards/queries.ts`: só do usuário atual; Estudos não excluídos com pelo menos 1 card ativo; conta só cards ativos e só resultados de cards ativos; 3 consultas no total (sem laço por Estudo). `GET /api/testes/resumo` passa a devolver o resultado dela.
- Ações em `cards/actions.ts` (mesmo padrão `CardResult`, `failure()` e `getCurrentUserId()`):
  - `recordCardResult(cardId, studyId, correct)`: valida tipos (`correct` booleano); o card tem de ser do usuário, estar no Estudo informado e não estar excluído, e o Estudo não pode estar excluído; grava um `CardResult`.
  - `getCardAccuracy(cardId)` → `{ accuracyPercent: number|null, attempts: number }`, só de cards do usuário.
  - `updateLastTested(studyId)`: grava `lastTestedAt = agora` no Estudo do usuário **sem alterar `updatedAt`** (a "Data atualização" do Estudo é do conteúdo, não de ter feito um teste; o `@updatedAt` do Prisma seria disparado, então se passa o valor atual de `updatedAt` explicitamente).

### 2. Páginas

- `/testes` (servidor): `requireUser()`, `listStudyTestSummaries()`, título "Testes" (h1, `PageHeader`). Lê `?study=` e `?schedule=` (Next 16: `searchParams` é uma Promise). `?study` só vale se for um dos Estudos listados; `?schedule` só vale se existir entre os agendamentos **ativos** do usuário **daquele** Estudo (conferido via `listUserSchedules`). Valores inválidos são ignorados.
- `TestList` ganha `highlightStudyId?` e `scheduleId?`: destaca a linha, rola até ela, e só repassa `scheduleId` ao `TestModal` quando o teste iniciado é do Estudo destacado.
- `/agenda` (servidor): `requireUser()`, `listUserSchedules()`, título "Agenda" (h1). "Fazer" vira `<Link href="/testes?study=ID&schedule=ID">` (sem `window.location`).

### 3. Conclusão e agendamento

- Ao finalizar o teste (último card → "Finalizar"): `updateLastTested(studyId)` e, se houver `scheduleId`, `completeSchedule(scheduleId)`. Falha em qualquer um não trava a tela de conclusão; mostra aviso.
- A tela "Teste Concluído" ganha **"Agendar revisões"**: chama `checkStudyHasActiveSchedules(studyId)`; abre o `ScheduleConfirmModal` (com aviso "já possui agendamentos ativos" quando houver) e, ao confirmar, `createSchedules({ studyId, studyName, force: hadActive })`. Sucesso: mensagem "Agendamentos criados." e o botão fica desabilitado. Erro: a mensagem da ação aparece no modal.
- O `ScheduleConfirmModal` deixa de calcular datas com `toISOString()` (UTC; depois das 21h no Brasil mostra o dia seguinte) e usa `toIsoDate` de `lib/dates` com soma de dias local, igual à ação do servidor.
- **Fuso do servidor:** a ação usa a data local do processo; na VPS isso é UTC. `ecosystem.config.js` passa a definir `TZ: "America/Sao_Paulo"` no processo do StudyFlow e o README registra isso.

### 4. IA nos cards e no editor

- Em `src/features/ai/actions.ts`, três ações (`"use server"`), todas com o resultado `{ ok: true, text } | { ok: false, message }`:
  - `generateCardQuestion(text)` — prompt do usuário: `Faça uma pergunta com um parágrafo curto do texto: <texto>`.
  - `generateCardAnswer(question)` — `Responda em um parágrafo curto a pergunta <pergunta>`.
  - `summarizeText(text)` — `Resuma em um parágrafo curto o texto: <texto>`.
  - Regras comuns: entrada precisa ser `string` não vazia (depois de `trim`); no máximo 20 000 caracteres (mensagem cita "20 000"); configuração por `resolveAiConfig({}, { requireModel: false })` (usa a Configuração salva); sem modelo escolhido → mensagem que cita "modelo"; chamada por `createGatewayClient(config).chat(system, user)` (a mesma defesa contra SSRF do deploy); `AiError` repassa a própria mensagem; qualquer outro erro vira mensagem genérica sem detalhe interno; erro de sessão vira a mensagem de sessão expirada; resposta vazia é falha; resposta cortada em 5000 caracteres (limite dos campos do card). O prompt de sistema é definido na implementação (curto, em português, "responda só com o texto pedido").
- `CardFormModal`: o botão **"IA"** lê o clipboard, gera a pergunta (`generateCardQuestion`) e depois a resposta (`generateCardAnswer(pergunta)`), substituindo os dois campos; estado "Gerando…" com o botão desabilitado; clipboard vazio ou negado → `onError` com texto que cita "Ctrl+C"; erro de rede/servidor → `onError` com texto que cita "IA". O prop `onAi` e a mensagem "em breve" saem.
- Editor: botão **"Resumir"** na `Toolbar` (props `onSummarize`, `canSummarize`, `summarizing`), habilitado quando há célula atual (em edição ou focada, como o botão de card). Verifica o limite de células **antes** de chamar a IA; célula vazia → "A célula está vazia."; ao chegar o resumo, se a célula foi excluída → "A célula foi excluída; o resumo foi descartado."; senão cria a célula logo abaixo com o resumo e avisa "Resumo criado abaixo da célula."; o autosave salva. Enquanto trabalha, o botão segue chamado "Resumir" (desabilitado) e aparece o texto "Resumindo…".
- Os testes em andamento mockam `createAiClient`; passam a mockar `createGatewayClient` de `@/features/ai/gateway`. É a única alteração permitida neles.

### 5. Testes que precisam acompanhar

- `session-expired.test.ts` exige que **toda action exportada** tenha um caso: entram as 3 de cards e as 3 de IA (a contagem esperada sobe de 12 para 18).
- `user-isolation.test.ts`: casos de isolamento para `recordCardResult`, `getCardAccuracy`, `updateLastTested` e `listStudyTestSummaries` (usuário B não enxerga nem altera dados de A).
- Unitários novos: ações e consulta de Testes (incluindo `updatedAt` preservado), `TestList` (destaque, `scheduleId` só do Estudo destacado), `TestModal` (finalizar, agendar), `ScheduleConfirmModal` (datas locais, aviso), páginas.
- `tests/e2e/navegacao.spec.ts` deixa de esperar "Em breve" em Testes e Agenda (continua conferindo o título e o item ativo). Um e2e novo percorre: Estudo com 2 cards → Testes → Todos → ver resposta / acertei → finalizar → agendar revisões → Agenda mostra 6 linhas → "Fazer" abre Testes com a linha destacada.

## Fora do escopo

- O botão "Áudio" do menu.
- O certificado HTTPS na VPS (depende do `certbot`, que o usuário vai rodar).
- Mudar a regra dos 6 intervalos de revisão, notificações, ou refinar a lógica de repetição espaçada.

## Entrega

1. Implementação por tarefas, na branch `feat/testes-agenda`, com revisão de cada tarefa e da branch inteira.
2. Merge na `main` (que volta a compilar e a passar a suíte) e `git push`.
3. Na VPS: `git pull`, `npm ci`, `npx prisma migrate deploy` (sem migração nova), `npm run build`, `pm2 startOrReload ecosystem.config.js` (relê o arquivo, para pegar o `TZ`; um `pm2 restart` simples não relê), conferência pelo domínio. O HTTPS continua pendente do `certbot`.
