# Publicação do StudyFlow em servidor Linux (estudo.aiontecno.com.br) — Design

Data: 2026-10-29
Branch: `feat/publicacao-linux` (a partir da `main`, que já contém a autenticação)

## Objetivo

Rodar o StudyFlow em `https://estudo.aiontecno.com.br`, na VPS Linux da Hostinger que já hospeda o CRM
(`2.25.204.244`), sem quebrar o uso atual no Windows de desenvolvimento. O registro DNS `A`
(`estudo.aiontecno.com.br → 2.25.204.244`) já existe e propagou.

O app foi feito para um PC Windows local e tem três impedimentos para ir ao ar:

1. **Caminhos só de Windows.** `folder-path.ts`, `folder-scope.ts`, `folders.ts`, `folder-browser.ts` e as rotas de
   imagem usam `path.win32` e exigem `C:\…` ou UNC. No Linux, `C:\StudyFlow\ana` viraria um nome de arquivo com
   barras invertidas na pasta atual do processo.
2. **`isLocalHost` bloqueia domínio público.** `/api/pastas` e `/api/ai/testar|modelos` respondem 403 para qualquer
   Host que não seja localhost, IP privado ou `.local`.
3. **SSRF pelo `baseUrl` da IA.** O `baseUrl` é digitado pelo usuário e o servidor faz `fetch` nele. O guarda de Host
   era a única contenção; sem ele, um usuário logado faria a VPS chamar endereços internos (na mesma VPS roda a
   Evolution API do CRM em `127.0.0.1:8081`).

## Premissas

- O mesmo código serve ao Windows (desenvolvimento) e ao Linux (VPS).
- No servidor, cada usuário continua com uma raiz de pastas (`<STUDYFLOW_BASE_DIR>/<folderName>`); o campo Pasta e o
  seletor continuam existindo dentro dela. Não há mudança de produto, só de plataforma.
- O público são o superusuário e os usuários que ele cria, todos autenticados.
- A instância da VPS começa vazia (superusuário criado pelo `auth:bootstrap`, nenhum Estudo).

## Fora do escopo

Migrar os Estudos existentes do Windows (caminhos `C:\…`), limite de tentativas de login por IP dentro do app, rotina
de backup do banco e das pastas, Docker, Evolution/CRM (não são tocados).

## 1. Módulo de caminhos puro (`folder-path.ts`)

Abordagem escolhida: o **sabor** do caminho vem do próprio texto. Descartadas: escolher por `process.platform` (o
navegador não sabe o sistema do servidor, e o sabor Linux só seria testável em Linux) e guardar caminhos relativos à
raiz no banco (muda modelo de dados e tela, exige migrar dados reais).

- `flavorOf(path): "win32" | "posix" | null` — `C:\…`/`C:/…`/UNC é `win32`; `/…` é `posix`; relativo é `null`.
- `normalizeFolderPath` aceita as duas sintaxes. POSIX: barra final removida, `//` colapsado, relativo inválido,
  segmentos `.` e `..` inválidos. Windows: comportamento atual, inalterado.
- **Regras de nome de segmento** (`isValidSegment`): as mesmas para os dois sabores (caracteres proibidos do Windows,
  ponto ou espaço no fim, nomes de dispositivo). Os dados ficam portáveis entre Windows e Linux; o custo é que um
  segmento POSIX com `:` ou `?` é recusado.
- **Maiúsculas e minúsculas:** Windows compara sem diferenciar (como hoje). POSIX **diferencia**. É regra de
  segurança: `/var/sf/ana` e `/var/sf/ANA` são pastas diferentes no Linux, e comparar sem diferenciar abriria uma brecha
  na isolação entre usuários. `folderKey` e `isInsideRoot` seguem o sabor do caminho.
- Limite de 260 caracteres para os dois sabores.
- A mensagem "Informe um caminho absoluto, como C:\Estudos\Cálculo." passa a mostrar um exemplo do sabor da pasta base
  (o servidor já entrega `baseDir` ao formulário).
- O módulo continua puro (sem `node:path`/`node:fs`), pois roda no navegador.

## 2. Lado do servidor

- `pathApi(flavor)` (só servidor) devolve `path.win32` ou `path.posix`. Todo `path.win32.*` fixo passa a usar o `path`
  do sabor do caminho tratado.
- **Pasta base:** `STUDYFLOW_BASE_DIR` precisa ter o sabor do sistema onde o servidor roda; `C:\…` no Linux (ou `/…`
  no Windows) é erro de configuração e `baseFolder()` falha com mensagem clara. Padrão sem a variável: `C:\StudyFlow`
  no Windows, `/var/lib/studyflow` no Linux.
- **Isolação (`folder-scope.ts`):** `userRoot` junta base e `folderName` pelo sabor da base. `isInsideRoot` é
  comparação de texto sem tocar o disco; sabores diferentes ⇒ "fora" imediatamente, antes de qualquer acesso a
  disco. `resolveReal`/`isFolderAllowed` (checagem de `realpath` contra links e junções) mantêm a lógica com o `path`
  do sabor.
- **Imagens:** `imagesDir`, a gravação em `imagens/` e a leitura de `[arquivo]` juntam pelo sabor da pasta do Estudo.
  Nome de arquivo com `/` ou `\` é recusado nos dois sabores.
- **Seletor (`folder-browser.ts`):** `parentOf` usa o sabor (a raiz `/` não tem pai); `createSubfolder` usa o sabor
  da pasta pai e continua recusando nomes com `/` ou `\`; `listDrives` só consulta o PowerShell quando o servidor é
  Windows e devolve `[]` caso contrário (o seletor já não mostra unidades: a rota devolve `drives: []`).

## 3. Guardas de rede e proteção da IA

- `isLocalHost` sai de `/api/pastas` e de `/api/ai/*`; a função e seus testes são removidos, assim como as mensagens
  "só funciona neste computador ou na rede local" e a menção no README. Ele protegia um app local sem login; agora a
  barreira é a sessão, a raiz do usuário (pastas) e a política de destino (IA).
- `isSameOrigin` e a exigência de JSON nos `POST` permanecem.
- O plano confirma que as duas rotas de IA exigem sessão válida e respondem 401 sem ela (hoje só o proxy olha o
  cookie; a conferência no banco ocorre quando a rota lê a configuração). Se faltar, entra checagem explícita.

**Política de destino do `baseUrl` (`src/features/ai/url-policy.ts`, só servidor):**

- Ponto único de aplicação: o `fetch` padrão de `createAiClient`, não as rotas. Chamadas futuras (geração de cards)
  já nascem protegidas.
- Esquema precisa ser `https`. O host é resolvido por DNS e a chamada é recusada se **algum** endereço for loopback,
  privado (10/8, 172.16/12, 192.168/16), link-local (169.254/16, inclui o metadata 169.254.169.254), CGNAT
  (100.64/10), 0.0.0.0/8, multicast ou reservado; o mesmo em IPv6 (`::1`, `fc00::/7`, `fe80::/10`, IPv4 mapeado). IP
  literal no host passa pelas mesmas regras.
- A validação ocorre no momento da conexão, na função `lookup` do agente HTTP, e a conexão usa o endereço validado
  (sem janela entre checagem e uso). Redirecionamentos já são bloqueados (`redirect: "error"`).
- Mensagem: "Endereço do gateway não permitido", sem revelar o IP resolvido.
- Validação ao salvar na tela: checagem sintática (https e host que não seja `localhost` nem IP privado), apenas para
  dar erro cedo; quem manda é a checagem na conexão.
- Padrão estrito. `STUDYFLOW_AI_ALLOW_PRIVATE=1` (no `.env` local) libera http e destinos privados, para gateway local
  (ex.: `http://localhost:11434`). Em produção a variável não existe.
- Risco técnico: o agente com `lookup` próprio exige o pacote `undici` compatível com o `fetch` embutido do Node. A
  viabilidade é validada logo no início do plano; se não encaixar, usa-se `node:https` com um invólucro que devolve
  `Response`, sem dependência nova.

## 4. Entrega

Arquivos em `deploy/`, no molde do CRM (`C:\Dev\CrmAT`: PM2 + Nginx + Certbot, Ubuntu/Debian):

- `deploy/nginx/studyflow.conf`: `server_name estudo.aiontecno.com.br` → `127.0.0.1:3001`; cabeçalhos `Host`,
  `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For` (sem `X-Forwarded-Host` as server actions do Next
  recusam a origem); `client_max_body_size` alinhado ao limite de upload de imagens; `limit_req` moderado em `/login`.
- `ecosystem.config.js`: processo `studyflow` no PM2 com `next start -p 3001 -H 127.0.0.1` (só escuta no localhost; a
  porta 3000 do CRM não é tocada).
- Seção "Deploy na VPS" no README: clone, `npm ci`, `.env`, `prisma migrate deploy`, `auth:bootstrap`, `build`, PM2,
  Nginx, Certbot.
- Banco e pastas dos usuários **fora** da pasta do código (`/opt/studyflow-data/…`, `/var/lib/studyflow`), para um
  redeploy nunca encostar neles.
- O deploy usa só o que está commitado; o WIP sem commit (`TestList`, `TestModal`, 3 testes) não vai junto. O `build`
  num clone limpo prova que passa, antes de qualquer coisa ir para a VPS.
- **Nada é executado na VPS sem o usuário autorizar**; cada comando é mostrado antes.

## Testes

- Caminhos puros: testes Windows atuais intactos; novos casos POSIX (normalização, `//`, barra final, `..`, relativo
  inválido, chave sensível a maiúsculas, limite de 260).
- Isolação: `/var/sf/ANA` e `/var/sf/ana2` fora de `/var/sf/ana`; sabor trocado recusado antes de tocar o disco. Testes
  que tocam o disco no sabor POSIX só rodam em Linux (pulados no Windows).
- Base e seletor: pasta base com sabor errado dá erro claro; `listDrives` devolve `[]` fora do Windows; `parentOf` e
  `createSubfolder` com casos POSIX e disco simulado.
- Rotas: `/api/pastas` e `/api/ai/*` não dão mais 403 por Host; continuam recusando Origin de fora e requisição sem
  sessão.
- Política de destino: tabela de endereços (v4, v6, mapeados), DNS simulado, o caso "o DNS muda entre checagem e
  conexão", e `STUDYFLOW_AI_ALLOW_PRIVATE`.
- Regressão: testes unitários sem falhas novas além das 32 do WIP sem commit; e2e continua em 46/46 no Windows.
- Fumaça no servidor real, após o deploy: login, criar Estudo, seletor de pastas, upload de imagem, testar conexão da IA.

## Ordem de execução

1. Módulo de caminhos puro com sabor + testes.
2. Módulos de servidor e rotas de imagem com sabor.
3. Remoção do `isLocalHost` e ajuste das rotas.
4. Verificação do `undici`; depois `url-policy` e o `fetch` protegido.
5. Arquivos de deploy, README e build em clone limpo.
6. Revisão final da branch.

## Refinamentos feitos ao escrever o plano

Detalhes que a leitura do código mostrou (o plano em `docs/superpowers/plans/2026-10-29-publicacao-linux.md` os aplica):

- **Componentes de cliente:** `FolderPicker` e `StudyFormModal` também tinham `\` e comparação sem diferenciar maiúsculas fixos. Ganham helpers puros em `folder-path.ts` (`joinFolder`, `isInsideFolder`, `folderCrumbs`, `withTrailingSeparator`).
- **`//` no POSIX:** só repetições depois da primeira barra são colapsadas. Entrada que começa com `//` segue candidata a UNC (como hoje); `//a` e `///a` são inválidas.
- **Mensagem de caminho relativo:** uma só, com os dois exemplos (`C:\Estudos\Cálculo ou /var/estudos/calculo`), em vez de variar com a base — evita levar o sabor da base até o schema, que roda no navegador.
- **`createAiClient` exige `fetchImpl`** (sem padrão `fetch`); `createGatewayClient` é a fábrica de produção. A política usa o `fetch` do pacote `undici`, não o global.
- **Rotas de IA já exigem sessão:** `resolveAiConfig` mapeia `AuthError` para 401/403; o plano só prova isso com teste.
- **Testes injetáveis:** `baseFolder(platform)`, `listDrives(query, platform)`, `userRoot(user, base)`; os testes POSIX de disco usam `fs` simulado e rodam no Windows.
