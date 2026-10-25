# StudyFlow — Design da estrutura do projeto

Data: 2026-10-25
Status: aguardando revisão

## 1. Objetivo e contexto

O StudyFlow é um app para organizar temas de estudo. Existe um protótipo estático em `Design/` (HTML, CSS e JS puro, dados em memória) com três áreas no menu: **Estudo**, **Testes** e **Agenda**. Só **Estudo** está desenhada: uma tabela de registros com busca, paginação, modal de criar/editar, confirmação de exclusão e desfazer.

Este documento define a estrutura de pastas, o modelo de dados e as regras de organização do app real. O protótipo é a referência visual e de comportamento.

### Decisões já tomadas

| Tema | Decisão |
|---|---|
| Plataforma | Web app full-stack |
| Stack | Next.js (App Router) + TypeScript |
| Banco | SQLite via Prisma (trocável por Postgres sem mudar o código das features) |
| Usuários | Usuário único agora; registros já têm `userId` para permitir login depois |
| Organização | Por feature (uma pasta por área do menu) |
| Estilo | CSS Modules sobre tokens CSS do design system existente (sem Tailwind) |

### Critérios de sucesso

- A estrutura permite implementar Estudo e depois Testes e Agenda sem alterar o código de Estudo.
- Adicionar login depois exige mudar apenas `lib/current-user.ts` e as telas de autenticação.
- A área Estudo reproduz o comportamento do protótipo, com dados persistidos.
- `Design/` permanece intocada.

### Fora de escopo

- Implementação de Testes e Agenda (cada uma terá spec própria).
- Autenticação e multiusuário.
- Deploy e CI.

## 2. Estrutura de pastas

```
StudyFlow/
├── Design/                  # referência visual, não é alterada
├── docs/superpowers/
│   ├── specs/               # specs de design
│   └── plans/               # planos de implementação
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts              # dados de exemplo do protótipo
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx       # fonte Inter, estilos globais
│   │   ├── globals.css
│   │   ├── page.tsx         # redireciona para /estudo
│   │   └── (app)/           # grupo de rotas com sidebar
│   │       ├── layout.tsx   # AppShell: Sidebar + Topbar
│   │       ├── estudo/page.tsx
│   │       ├── testes/page.tsx   # página "em breve"
│   │       └── agenda/page.tsx   # página "em breve"
│   ├── features/
│   │   └── estudo/
│   │       ├── components/  # StudyView, StudyTable, StudyCardList, StudyFormModal, DeleteConfirmModal
│   │       ├── actions.ts   # criar, editar, excluir, desfazer (server actions)
│   │       ├── queries.ts   # lê o banco e entrega os registros ordenados
│   │       ├── list.ts      # funções puras: busca sem acento, paginação, URL
│   │       └── schema.ts    # validação com zod
│   ├── components/
│   │   ├── ui/              # Button, Modal, Toast, SearchField, Pagination, EmptyState
│   │   └── layout/          # Sidebar, Topbar
│   ├── lib/
│   │   ├── db.ts            # cliente Prisma
│   │   ├── current-user.ts  # devolve o usuário único; ponto de troca para o login
│   │   └── dates.ts         # formatação de data em pt-BR
│   └── styles/
│       └── tokens.css       # variáveis CSS derivadas de Design/tokens.json
├── tests/
│   ├── unit/
│   └── e2e/
└── package.json, tsconfig.json, next.config.ts, .env.example, .gitignore, README.md
```

`features/testes/` e `features/agenda/` não são criadas agora. Cada uma nasce com a forma de `features/estudo/` (`components/`, `actions.ts`, `queries.ts`, `schema.ts`) quando sua spec existir. Até lá, as rotas `/testes` e `/agenda` mostram uma página "em breve" e o menu já aponta para elas.

### Regras de dependência

- `app/` só compõe telas e importa de `features/` e `components/`.
- Uma feature não importa de outra feature.
- `components/ui` não conhece nenhuma feature.
- Só `features/*/queries.ts` e `features/*/actions.ts` acessam o banco, via `lib/db.ts`.
- Toda query e toda action filtra por `userId`, obtido em `lib/current-user.ts`.

## 3. Modelo de dados

```prisma
model User {
  id      String        @id @default(cuid())
  name    String
  records StudyRecord[]
}

model StudyRecord {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  descricao   String    // máx. 80 caracteres
  pasta       String    // máx. 40 caracteres
  dataInicial String    // YYYY-MM-DD (SQLite não tem tipo date; evita problema de fuso)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt   // exibido como "Data atualização"
  deletedAt   DateTime?              // exclusão lógica, suporta o "Desfazer"

  @@index([userId, updatedAt])
}
```

- Os campos refletem as colunas do protótipo: Descrição, Pasta, Data inicial, Data atualização.
- A exclusão é lógica. Uma limpeza definitiva de registros com `deletedAt` fica fora de escopo.
- Testes e Agenda ganham seus modelos nas respectivas specs.
- `seed.ts` cria o usuário único e os 8 registros de exemplo do protótipo.

## 4. Fluxo de dados

1. `estudo/page.tsx` é um Server Component. Lê `?q=` e `?page=` da URL e chama `listStudyRecords({ q, page })`.
2. A busca ignora acentos e maiúsculas e procura em descrição e pasta. A ordenação é por `updatedAt` decrescente, com 5 registros por página (valores do protótipo).
3. Criar, editar, excluir e desfazer são server actions em `actions.ts`. Cada uma valida com zod, grava e chama `revalidatePath('/estudo')`.
4. O estado de interface fica em componentes client: modal aberto, registro em edição, toast de desfazer.
5. Busca e página ficam na URL, então são linkáveis e sobrevivem ao recarregar.
6. "Desfazer" limpa `deletedAt` do registro excluído. O toast tem a janela de tempo do protótipo.

## 5. Tratamento de erros

- Validação falhou: a action devolve erros por campo e o modal exibe a mensagem junto ao campo, com os textos do protótipo (ex.: "Informe uma descrição.").
- Falha ao gravar: toast de erro; o modal permanece aberto com os dados preenchidos.
- Lista vazia: `EmptyState` com duas variantes, "nenhum registro" e "nada encontrado na busca".
- Registro inexistente ou de outro usuário numa action: erro tratado, sem vazar a existência do registro.

## 6. Design system

- `Design/tokens.json` e `Design/styles.css` continuam como referência.
- `src/styles/tokens.css` recebe as variáveis CSS (cores, raios, espaçamentos, Inter) copiadas de `Design/`.
- Os componentes de `components/ui` usam CSS Modules sobre esses tokens.
- O comportamento responsivo do protótipo é preservado: tabela no desktop, cards no mobile, sidebar recolhível.
- Os contrastes ajustados no protótipo (ex.: `borderStrong` `#807d72`) valem para o app real.

## 7. Testes

- `tests/unit` (Vitest): `schema.ts`, normalização de busca, `dates.ts`.
- `tests/e2e` (Playwright): criar, editar, excluir com desfazer, buscar e paginar.

## 8. Ordem sugerida de implementação

1. Scaffold do projeto (Next.js, TypeScript, Prisma, Vitest, Playwright) e estrutura de pastas vazia.
2. Tokens e componentes `ui/` e `layout/`.
3. Banco, seed e `lib/`.
4. Feature Estudo (queries, actions, componentes, página).
5. Páginas "em breve" de Testes e Agenda.
6. Testes e2e.

O detalhamento passo a passo fica no plano de implementação (próxima etapa).
