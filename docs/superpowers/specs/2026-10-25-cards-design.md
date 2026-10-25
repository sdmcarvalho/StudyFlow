# StudyFlow — Cards de teste a partir das células

Data: 2026-10-25
Status: aguardando revisão
Base: `docs/superpowers/specs/2026-10-25-editor-de-celulas-design.md` (editor de células, já implementado).

## 1. Objetivo e contexto

No editor do Estudo (`/estudo/[id]`), o usuário seleciona um trecho de uma célula e cria um **card** de pergunta e resposta. Os cards ficam ligados ao Estudo e à célula de origem e serão usados depois pela tela **Testes** (hoje "Em breve"). Esta spec cobre criar, listar, editar e excluir cards a partir do editor; a tela Testes e o agente de IA ficam fora.

### Decisões já tomadas

| Tema | Decisão |
|---|---|
| Onde ficam os cards | Tabela própria `Card` no banco (não dentro do `conteudo` do documento) |
| Texto da Pergunta | Texto selecionado na célula; sem seleção, o clipboard; sem acesso ao clipboard, vazio |
| Célula do card | A da seleção; sem seleção, a célula aberta ou a última focada; nenhuma focada → botão desabilitado |
| Ícone na célula | Canto inferior direito, com a quantidade; clicar abre a lista dos cards da célula |
| Botão IA | Presente no formulário; por ora só mostra um aviso, com o ponto de ligação pronto no código |
| Célula excluída | Os cards continuam no banco; só o ícone some com a célula (Desfazer traz os dois de volta) |

### Critérios de sucesso

- Selecionar um texto numa célula e clicar em "Card" abre o modal com o Tema = Descrição do Estudo e a Pergunta = texto selecionado; salvar cria o card e o ícone aparece na célula na hora.
- Depois de recarregar a página, o ícone continua na célula com a mesma quantidade, e a lista mostra os cards.
- Editar e excluir (com Desfazer) funcionam a partir da lista da célula.
- Um card nunca aponta para uma célula que não está salva no banco.
- Nenhuma ação lê ou altera cards de outro usuário ou de um Estudo excluído.

## 2. Dados

Nova tabela `Card` (migration Prisma):

| Campo | Tipo | Regra |
|---|---|---|
| `id` | String `@id @default(cuid())` | |
| `userId` | String → `User` | dono |
| `studyId` | String → `StudyRecord` | Estudo do card |
| `cellId` | String | id da célula de origem (`Cell.id` do `conteudo`); não aparece no modal |
| `tema` | String | obrigatório depois do `trim`, até 120 caracteres |
| `pergunta` | String | obrigatória depois do `trim`, até 5 000 caracteres |
| `resposta` | String `@default("")` | opcional, até 5 000 caracteres |
| `createdAt` / `updatedAt` | DateTime | |
| `deletedAt` | DateTime? | exclusão lógica, para o Desfazer |

Índice `@@index([userId, studyId])`. Criar ou editar um card **não** muda a "Data atualização" do Estudo (ela mede o documento).

Mensagens de validação (pt-BR, exibidas embaixo do campo): "Informe o tema.", "Informe a pergunta.", "Use no máximo 120 caracteres." / "Use no máximo 5 000 caracteres.".

## 3. Servidor

`src/features/cards/` (feature nova, mesma organização de `estudo`):

- `schema.ts` — `parseCardInput({ tema, pergunta, resposta })` (zod 4), usado no cliente e no servidor.
- `actions.ts` (server actions, todas com `typeof id === "string" && id.length > 0`, filtro `userId` + Estudo ativo + card não excluído):
  - `createCard(studyId, cellId, input)` → `{ ok: true, data: CardRow } | { ok: false, fieldErrors | message }`. Recusa se o Estudo não existe/é de outro usuário/está excluído, ou se `cellId` não está entre as células **salvas** do `conteudo` do Estudo ("A célula ainda não foi salva.").
  - `updateCard(cardId, input)`, `deleteCard(cardId)`, `restoreCard(cardId)`.
- `queries.ts` — `listStudyCards(studyId): CardRow[]` (ativos, mais recentes primeiro).
- `CardRow = { id, cellId, tema, pergunta, resposta, createdAt (ISO) }`.

A página do editor carrega os cards junto com o documento e passa `initialCards` ao `EditorView`.

## 4. Barra de ferramentas e criação

- Depois do grupo de visualização: divisória `|` e o botão **"Card"** (ícone de cartão; `title`/nome acessível "Criar card"). Funciona nos modos padrão, dividido e preview.
- No clique (o `mousedown` da barra já é cancelado, então a seleção não se perde):
  1. Seleção dentro de uma célula: na `textarea` em edição, o trecho `selectionStart..selectionEnd` (Markdown); no texto renderizado, `window.getSelection().toString()` cujo nó está dentro de `[data-cell-id]` (texto simples). A célula é a do trecho.
  2. Sem seleção: célula em edição, ou a última focada; Pergunta via `navigator.clipboard.readText()`. Se a API não existe (contexto inseguro, ex.: IP da rede) ou é negada, a Pergunta abre vazia com a dica "Cole o texto com Ctrl+V".
  3. Nenhuma célula focada no documento: botão desabilitado, dica "Selecione um texto numa célula".
- Antes de gravar o card, se o documento tem alterações pendentes, o editor salva o documento (`saveNow`). Se não conseguir salvar, o card não é gravado e aparece o toast "Salve o documento antes de criar o card.".

## 5. Formulário do card (modal)

- Título "Novo card" (criação) ou "Editar card" (edição).
- Campos: **Tema** (input, começa com a Descrição do Estudo), **Pergunta** (textarea), **Resposta** (textarea). Foco inicial: Resposta quando a Pergunta veio preenchida; senão Pergunta.
- Botões: **IA** (à esquerda; por ora mostra o toast "A IA será ligada em breve." — o componente recebe `onAi?: (card) => void`), **Cancelar**, **Salvar**.
- Salvar: erros embaixo dos campos (o modal fica aberto); sucesso → toast "Card criado." / "Card atualizado.". Falha de rede → toast "Não foi possível salvar o card." e o modal fica aberto com o texto.

## 6. Ícone na célula e lista

- No canto inferior direito da célula (editando ou renderizada, em todos os modos), quando há ≥ 1 card: ícone discreto (cinza) + quantidade; nome acessível e dica "1 card desta célula" / "N cards desta célula". Clicar não abre a edição da célula.
- Clique → modal "Cards da célula": cards do mais recente ao mais antigo, cada um com Tema, Pergunta (até 3 linhas) e Resposta (ou "Sem resposta" em cinza), e os botões **Editar** e **Excluir**.
- Excluir: remove na hora e mostra o toast "Card excluído." com **Desfazer** (restaura na mesma posição). Excluir o último card fecha o modal e o ícone some.
- A contagem vem do estado de cards do editor (sem consulta extra por célula).

## 7. Estrutura de arquivos

- `prisma/schema.prisma` + migration `cards`
- `src/features/cards/{schema,actions,queries,types}.ts`
- `src/features/cards/components/{CardFormModal,CellCardsModal}.tsx` e `.module.css`
- `src/features/estudo/editor/card-source.ts` — `captureCardSource(...)`: seleção/célula/clipboard (pura onde der, testável)
- Alterações: `Toolbar.tsx` (divisória + botão), `Cell.tsx` (ícone), `EditorView.tsx` (estado dos cards, modais), `src/app/(app)/estudo/[id]/page.tsx` (carregar cards), `src/components/ui/icons.tsx` (ícone de card)

## 8. Testes

- Unitários (node): schema; ações (dono, Estudo alheio/excluído, `cellId` não salvo, limites, ids inválidos, excluir/restaurar); `listStudyCards`.
- Unitários (jsdom): `captureCardSource` (textarea, texto renderizado, sem seleção + clipboard ok/negado/inexistente, nenhuma célula); `CardFormModal` (preenchimento, foco, validação, IA, falha); ícone e contagem; lista (editar, excluir + Desfazer, fechar ao excluir o último).
- E2e: selecionar texto numa célula → Card → Salvar → ícone com "1" → recarregar → ícone continua → abrir lista → editar a resposta → excluir → Desfazer.

## 9. Fora do escopo

Tela Testes (revisão dos cards), agente de IA, cards sem célula, mover cards entre células, exportar cards.
