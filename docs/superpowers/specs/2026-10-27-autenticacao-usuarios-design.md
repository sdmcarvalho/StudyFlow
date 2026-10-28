# Autenticação de usuários: design

Substitui o plano `docs/superpowers/plans/2026-10-28-autenticacao-usuarios.md` (baseado em Auth.js v5, com
cadastro aberto e sem papéis). Este documento é a spec; o novo plano de implementação sai dele.

## Objetivo

Cada usuário tem seus próprios dados: Estudos, Cards, Testes (resultados), Agenda e configuração de IA.
Existe um único **superusuário**, o único que cria os demais usuários e o único que vê e acessa a opção
**Usuários** (abaixo de "Configuração" no menu). Não há cadastro aberto.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Login | E-mail + senha |
| Sessão | Em banco, feita à mão (sem Auth.js): revogação imediata |
| Primeiro superusuário | `npm run auth:bootstrap`, por variáveis de ambiente; converte o `local-user` e herda os dados |
| Papéis | Um único superusuário (`SUPER`); todos os demais são `USER` |
| Gestão (tela Usuários) | Criar, redefinir senha, desativar/reativar, excluir usuário e dados |
| Senha própria | Cada usuário troca a própria senha em Configuração ("Minha conta") |
| Pastas no disco | Raiz por usuário: `<STUDYFLOW_BASE_DIR>\<folderName>`; imposto no servidor |
| Superusuário e pastas | Segue a mesma regra dos demais para pastas novas; Estudos antigos fora da raiz continuam abrindo |

## 1. Modelo de dados e bootstrap

**Pré-requisito (Tarefa 0).** `prisma/schema.prisma` está fora de sincronia com as migrations dos cards de
teste (`CardResult`, `Schedule` e `StudyRecord.lastTestedAt` só existem no SQL). Sincronizar antes de
qualquer mudança de autenticação.

**`User`** ganha:

- `email` (único, minúsculas), `passwordHash`, `folderName` (único, imutável);
- `role` (enum `Role { SUPER USER }`, padrão `USER`), `active` (padrão `true`), `createdAt`.

`email`, `passwordHash` e `folderName` ficam opcionais no banco apenas para a linha `local-user` já existente
poder receber a migration; o bootstrap os preenche, e o código de criação de usuário sempre os define.

`folderName` nasce do nome (sem acentos nem caracteres inválidos no Windows), com sufixo numérico em caso de
colisão. Não vem do e-mail, porque o e-mail pode mudar e a pasta não.

**`Session`** (nova): `id`, `tokenHash` (único, SHA-256 do token), `userId` (cascade), `expiresAt`, `createdAt`.
O banco nunca guarda o token cru.

Sem `Account` nem `VerificationToken`.

**Um único superusuário.** O sistema nunca cria outro `SUPER`; a tela Usuários só cria `USER`; o superusuário
não pode ser desativado, excluído nem ter a senha redefinida pela tela (a própria senha ele troca em
"Minha conta").

**Bootstrap** (`npm run auth:bootstrap`, lê `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD`, `SUPERUSER_NAME` do `.env`):

- se o `local-user` existe, é **convertido no lugar** (mesmo id; ganha e-mail, hash, nome, `folderName`,
  `role=SUPER`). Nenhuma chave estrangeira muda, então não há dado órfão nem script de migração de dados;
- se não existe (banco novo), cria o superusuário do zero;
- idempotente: se já existe um `SUPER`, não faz nada e **não sobrescreve a senha**.

`db:seed` e `tests/e2e/insert-study.ts` passam a usar o superusuário em vez do id fixo `local-user`.

**Exclusão de usuário.** Uma transação apaga, nesta ordem: `CardResult`, `Schedule`, `Card`, `StudyRecord`,
`AiSettings`, `Session`, `User`. As chaves estrangeiras atuais não mudam. As pastas no disco nunca são
apagadas (regra do app).

**Senha:** mínimo de 8 caracteres, com pelo menos uma letra e um número (Zod). Hash com `bcryptjs`, custo 10.

## 2. Sessão e login

Arquivos novos em `src/features/auth/`: `password.ts`, `session.ts`, `schema.ts`, `actions.ts`
(`loginAction`, `logoutAction`, `changePasswordAction`).

**Sessão.**

- Token de 32 bytes aleatórios, em base64url. Cookie `studyflow_session`: `httpOnly`, `sameSite=lax`,
  `secure` em produção, validade de 14 dias, sem renovação automática.
- Validação: acha o hash no banco; exige `expiresAt` no futuro e `user.active`. Sessão expirada ou usuário
  desativado conta como "sem sessão" (e a linha expirada é apagada).
- O papel (`role`) é lido do banco a cada requisição, nunca do cookie.

**Login.**

- Erro sempre genérico: "E-mail ou senha incorretos". E-mail inexistente também executa uma comparação de
  hash falsa, para não vazar a diferença pelo tempo de resposta.
- "Conta desativada" só aparece depois de a senha estar correta.
- Limite contra força bruta: 5 falhas por e-mail em 15 minutos bloqueiam novas tentativas (contador em
  memória; o app roda em um único processo).
- Destino pós-login vem de `?next=`, aceito só se começar com `/` e não com `//` (sem redirecionamento
  aberto). Quem já está logado e abre `/login` vai para `/estudo`.

**Troca e redefinição de senha.**

- O usuário troca a própria senha informando a atual; as outras sessões dele são encerradas e a atual continua.
- Quando o superusuário redefine a senha de alguém, todas as sessões dessa pessoa são encerradas.

**Onde cada checagem acontece.**

- `src/lib/current-user.ts`: `getCurrentUserId()` lê a sessão e lança "Não autenticado" se não houver (sem
  `upsert` de `local-user`). Também `requireUser()` (redireciona para `/login`) e `requireSuperuser()`.
- Layout `(app)`: usa `requireUser()` e passa nome e papel ao AppShell. A Sidebar mostra "Usuários" só para
  `SUPER`. A Topbar ganha o menu do usuário com "Sair".
- Server actions: capturam o erro e devolvem "Sessão expirada, entre novamente".
- Rotas de API: respondem 401 em JSON; as de escrita continuam usando `same-origin.ts`.
- `src/proxy.ts` (Next 16; `middleware` foi renomeado): checagem **otimista** do cookie. Sem cookie, páginas
  vão para `/login?next=…` e `/api/*` recebe 401. Deixa passar `/login` e os estáticos. Não protege nada
  sozinho; a proteção real é a camada acima.
- `/login` fica no grupo `(auth)`, sem Sidebar nem Topbar. Não existe `/register`.

## 3. Isolamento de pastas e tela Usuários

**Pastas.** Hoje o seletor navega o disco inteiro e `createStudyRecord` aceita qualquer caminho absoluto. A
regra passa a ser imposta no servidor:

- Raiz do usuário: `<STUDYFLOW_BASE_DIR>\<folderName>`, criada com `ensureFolder` quando necessária.
- Estudo novo, ou com a pasta alterada, só é aceito com a pasta dentro da raiz. A checagem usa o caminho
  normalizado e compara com a raiz seguida de `\` (para `...\ana` não casar com `...\ana2`), e confere
  `realpath` (uma junção do Windows não escapa da raiz). O erro aparece no campo Pasta.
- `/api/pastas` exige login, abre na raiz do usuário, não permite subir acima dela nem lista unidades, e
  rejeita `caminho` fora da raiz. O POST (criar subpasta) vale a mesma regra.
- Estudos antigos do superusuário em pastas fora da raiz (como `C:\Estudos\Cálculo`) continuam abrindo. A
  regra vale só ao criar ou mudar a pasta.
- Duplicidade entre contas não precisa de verificação global: as raízes são disjuntas, e `isFolderInUse` por
  usuário continua suficiente.
- O modal de novo Estudo começa com a raiz do usuário no campo Pasta. O seed cria as pastas de exemplo dentro
  da raiz do superusuário.

**Tela Usuários (`/usuarios`).**

- Acesso: `requireSuperuser()` na página; quem não é superusuário recebe `notFound()` (404).
- Menu: item "Usuários" (ícone novo) logo abaixo de "Configuração", só para `SUPER`.
- Lista: nome, e-mail, criado em, status (Ativo/Desativado) e ações. A linha do superusuário mostra o selo
  "Superusuário" e nenhuma ação. A lista traz só dados da conta e contagens, nunca o conteúdo de Estudos,
  Cards ou Agenda.
- Criar: modal com nome, e-mail e senha inicial (papel sempre `USER`; e-mail único, em minúsculas).
- Redefinir senha: modal com a nova senha; encerra as sessões do usuário afetado.
- Desativar/Reativar: bloqueia a conta e apaga as sessões; nada é excluído.
- Excluir: o modal mostra as contagens de Estudos, Cards e Agendas que serão apagados e exige digitar o
  e-mail do usuário. Irreversível; as pastas no disco ficam.
- Server actions em `src/features/usuarios/`: cada uma chama `requireSuperuser()` e recusa agir sobre o
  próprio superusuário. Reusa `Modal`, `Toast` e o padrão `ActionResult`.
- "Minha conta" (trocar a própria senha) é uma seção em Configuração.

## 4. Testes, ordem das tarefas e riscos

**Base de testes existente.** Os testes unitários chamam `getCurrentUserId()` de verdade (que hoje faz
`upsert` de `local-user` no `test.db`), e vários criam Estudos em pastas temporárias fora da raiz do
usuário; `tests/e2e/insert-study.ts` fixa `userId: "local-user"`. Há uma tarefa dedicada para adaptar:

- helper `tests/unit/helpers/auth.ts` com `createTestUser({ role })` e `signInAs(user)` (simula a sessão sem
  cookie);
- pastas de teste dentro da raiz do usuário de teste, com `STUDYFLOW_BASE_DIR` apontando para a pasta
  temporária de cada arquivo;
- seed e2e cria o superusuário com e-mail e senha conhecidos; os testes e2e entram por um helper de login.

**Testes novos.**

- Unitários: `password`, `session` (valida, expira, usuário desativado, revogação), schemas Zod, `next`
  seguro, limite de tentativas, `folder-scope` (dentro/fora da raiz, `..`, prefixo parecido, junção) e o
  bootstrap (converte o `local-user`, idempotente).
- Isolamento entre usuários: B recebe "não encontrado" ou 404 ao ler, editar ou excluir Estudos, Cards,
  Resultados e Agenda de A, e ao pedir as imagens dele; configurações de IA separadas.
- Permissões: usuário comum recebe 404 em `/usuarios`; todas as actions de `usuarios` recusam quem não é
  superusuário; o superusuário não age sobre si mesmo; a exclusão apaga tudo do usuário e não toca nas
  pastas do disco.
- E2E: login e logout; acesso sem sessão redireciona para `/login?next=…` e volta após entrar; só o
  superusuário vê "Usuários"; o superusuário cria um usuário, que entra e vê a lista vazia; dados de um não
  aparecem para o outro; usuário desativado perde a sessão imediatamente.

**Ordem das tarefas** (cada uma termina com testes verdes e um commit):

0. Sincronizar `schema.prisma` com as migrations dos cards (só o schema e o que ele exige).
1. Instalar `bcryptjs` e atualizar `.env.example` (`SUPERUSER_*`; sem `AUTH_SECRET`).
2. Migration: campos novos em `User`, enum `Role`, tabela `Session`.
3. `password`, `session` e schemas, com testes primeiro.
4. Reescrever `current-user.ts`, criar o helper de testes e adaptar os testes existentes.
5. Script de bootstrap, ajuste do seed e dos helpers e2e.
6. Login, logout, `proxy.ts`, `requireUser` no layout `(app)` e menu do usuário na Topbar.
7. Isolamento de pastas: `folder-scope`, actions de Estudo, `/api/pastas` e modal.
8. Feature `usuarios`, item no menu e página.
9. "Minha conta" em Configuração.
10. Auditoria de todas as actions, rotas e queries, mais os testes de isolamento.
11. E2E e verificação final: `npm test`, `npm run lint`, `tsc`, `npm run test:e2e`.

**Riscos e cuidados.**

- Entre as Tarefas 4 e 6 o app fica sem login: o trabalho roda na branch `feat/autenticacao`, e a `main` só
  recebe tudo junto.
- Antes de aplicar a migration, copiar `prisma/dev.db` para um backup.
- O proxy só olha o cookie; a segurança real está em `getCurrentUserId` e `requireSuperuser`, verificadas rota
  a rota na Tarefa 10.

**Revisão focada.**

1. Credenciais inválidas dão mensagem genérica.
2. Rota protegida sem sessão redireciona e preserva o `next`.
3. Nenhum registro fica sem dono após a conversão do `local-user`.
4. Sessão expirada em uma action devolve erro claro, sem quebrar a tela.
5. Nenhum caminho fora da raiz do usuário é aceito pelo servidor.

## Fora de escopo

Recuperação de senha por e-mail, login social, mais de um superusuário, troca de papel, autenticação em dois
fatores, renovação automática da sessão, e qualquer mudança nas pastas já existentes no disco.
