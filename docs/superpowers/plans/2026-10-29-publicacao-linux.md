# Publicação do StudyFlow em servidor Linux — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o StudyFlow rodar em `https://estudo.aiontecno.com.br` (VPS Linux) sem quebrar o uso no Windows: caminhos independentes de plataforma, sem o guarda `isLocalHost`, e destino da IA protegido contra SSRF.

**Architecture:** O "sabor" do caminho (`win32` | `posix`) é inferido do próprio texto num módulo puro (`folder-path.ts`, que também roda no navegador); o servidor escolhe `path.win32`/`path.posix` pelo sabor do caminho, nunca pelo sistema. O `fetch` da IA passa por um agente `undici` cujo `lookup` valida o endereço no momento da conexão.

**Tech Stack:** Next.js 16.4.3 (App Router), TypeScript, Vitest, Prisma/libsql, `undici` (novo), PM2 + Nginx na VPS.

**Spec:** `docs/superpowers/specs/2026-10-29-publicacao-linux-design.md`

## Global Constraints

- **Next 16:** `AGENTS.md` manda ler `node_modules/next/dist/docs/` antes de escrever código de rota/proxy; convenções diferem do Next que você conhece.
- Textos de interface e mensagens em **pt-BR**. Commits em pt-BR no formato `tipo(escopo): mensagem`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Branch `feat/publicacao-linux` (já criada). **Nunca** commitar nem alterar os arquivos sem commit do usuário: `docs/Pedido do editor de textos.docx`, `src/components/ui/{input,label}.tsx`, `src/features/cards/components/Test{List,Modal}.{tsx,module.css}`, `src/lib/utils.ts`, `studyflow.bat`, `tests/unit/{ai-card-generation,card-form-modal-ai,editor-summarize}.test.*`. Nunca ler/imprimir `.env`.
- Única dependência nova permitida: `undici` (versão exata, ≥ 2 semanas de publicada).
- Limite de caminho: 260 caracteres nos dois sabores. Regras de nome de segmento (`isValidSegment`) iguais nos dois sabores.
- POSIX diferencia maiúsculas; Windows não.
- Nada é executado na VPS neste plano: só arquivos e verificações locais.
- **Gates (rodar antes de cada commit):** `npx tsc --noEmit` — só podem aparecer erros nos arquivos sem commit listados acima (filtrar com `grep -v -E "TestList|TestModal|ai-card-generation|card-form-modal-ai|editor-summarize|src/lib/utils|components/ui/(input|label)"`; saída vazia = ok). `npm test` — linha de base: **32 falhas, todas nos 3 testes sem commit**; qualquer falha fora deles é regressão. `npx eslint <arquivos tocados>` sem erros novos.
- Shell: Windows (Git Bash/PowerShell). `npm test` pode passar de 5 min: rodar em segundo plano.

## Review Focus

Entradas que o spec implica e nenhum teste óbvio cobre; cada uma tem seu teste na tarefa dona:

1. `/var/sf/ANA` (outra caixa) **não** pode contar como dentro de `/var/sf/ana` no POSIX (Task 1 e 2).
2. Caminho de outro sabor (`C:\x` numa raiz POSIX e vice-versa) é recusado **antes de qualquer acesso a disco** (Task 2).
3. Link simbólico dentro da raiz POSIX apontando para fora (`/var/sf/ana/link → /etc`) é recusado (Task 2).
4. Destinos escondidos na URL da IA: `https://2130706433/`, `https://localhost./`, `https://foo.localhost`, IPv4 mapeado em IPv6 (`::ffff:127.0.0.1`), `https://[::1]/` (Task 5).
5. DNS que devolve endereço público **e** privado juntos é recusado; a falha chega ao usuário como "Endereço do gateway não permitido." e não como "fetch failed" (Task 5).

## Refinamentos ao spec (decididos ao escrever o plano)

- **Componentes de cliente** (`FolderPicker`, `StudyFormModal`) também tinham `\` e caixa fixos: ganham helpers puros em `folder-path.ts` (Task 1/3). Não estava listado no spec.
- **`//` no POSIX:** só repetições *depois* da primeira barra são colapsadas. Entrada que começa com `//` continua sendo candidata a UNC (como hoje); `//a` e `///a` são inválidas.
- **Mensagem de caminho relativo:** uma só, com os dois exemplos (`C:\Estudos\Cálculo ou /var/estudos/calculo`), em vez de depender da base. Evita passar o sabor da base até o schema zod (que roda no cliente). Custo: ruído pequeno na mensagem.
- **`createAiClient` passa a exigir `fetchImpl`** (sem padrão `fetch`), e `createGatewayClient` (Task 5) é a fábrica de produção. Assim nenhuma chamada nova à IA contorna a política sem erro de compilação. Usa o `fetch` do próprio pacote `undici` (não o global), o que elimina a questão de compatibilidade de versões do agente.
- **Padrões injetáveis nos testes:** `baseFolder(platform = process.platform)`; `listDrives(query, platform)`; `userRoot(user, base = baseFolder())`. Os testes POSIX de disco usam `fs` simulado, então rodam no Windows.

---

### Task 1: Módulo de caminhos puro com sabor

**Files:**
- Modify: `src/features/estudo/folder-path.ts`
- Create: `tests/unit/folder-path-posix.test.ts`
- Modify (só a mensagem esperada, se necessário): `tests/unit/folder-path.test.ts`, `tests/unit/estudo-schema.test.ts` e qualquer teste que cite "Informe um caminho absoluto"

**Interfaces:**
- Produces (todas puras, sem `node:*`):
  - `type PathFlavor = "win32" | "posix"`
  - `flavorOf(path: string): PathFlavor | null`
  - `normalizeFolderPath(input: string): FolderPathResult` (assinatura inalterada; agora aceita POSIX)
  - `folderKey(path: string): string` (POSIX: sem `toLowerCase`)
  - `isInsideFolder(root: string, target: string): boolean`
  - `joinFolder(parent: string, name: string): string` — sem validar; sabor do `parent`
  - `withTrailingSeparator(folder: string): string`
  - `type Crumb = { label: string; path: string }` e `folderCrumbs(path: string, rootPath?: string): Crumb[]`
- Consumes: nada.

- [ ] **Step 1: Escrever `tests/unit/folder-path-posix.test.ts` (deve falhar)** com estas asserções:
  - `flavorOf`: `"C:\\a"`, `"c:/a"`, `"\\\\srv\\share"`, `"//srv/share"` → `"win32"`; `"/var/sf"`, `"/"` → `"posix"`; `"abc"`, `"\\a"`, `""` → `null`.
  - `normalizeFolderPath` POSIX válidos: `"/var/sf/ana"` → ok `"/var/sf/ana"`; `"/var/sf/ana/"` → `"/var/sf/ana"`; `"/var//sf///ana"` → `"/var/sf/ana"`; `"/"` → ok `"/"`; `"  /var/sf  "` → `"/var/sf"`; `"/" + "a".repeat(259)` ok.
  - Inválidos (`ok: false`): `"/var/../etc"`, `"/var/./x"`, `"/a/b."`, `"/a/ b"`, `"/a/CON"`, `"/a/b:c"`, `"/a\\b"`, `"/a/\u0000b"`, `"//a"`, `"///a"`, `"var/sf"`, `"/" + "a".repeat(260)` (mensagem `"Use no máximo 260 caracteres."`).
  - `folderKey("/var/sf/ANA") !== folderKey("/var/sf/ana")`; `folderKey("C:\\S\\ANA") === folderKey("c:\\s\\ana")`.
  - `isInsideFolder("/var/sf/ana", x)`: `true` para `"/var/sf/ana"`, `"/var/sf/ana/"`, `"/var/sf/ana/a/b"`; `false` para `"/var/sf/ANA"`, `"/var/sf/ana2"`, `"/var/sf"`, `"/var/sf/ana/../x"`, `"C:\\S\\ana\\x"`. `isInsideFolder("/", "/a")` → `true`. `isInsideFolder("C:\\S\\ana", "/var/sf/ana/x")` → `false`. Casos Windows atuais seguem (`"c:\\s\\ANA\\x"` dentro de `"C:\\S\\ana"`).
  - `joinFolder`: `("/var/sf","ana")` → `"/var/sf/ana"`; `("/","a")` → `"/a"`; `("C:\\S","ana")` → `"C:\\S\\ana"`; `("C:\\","a")` → `"C:\\a"`.
  - `withTrailingSeparator`: `"C:\\S"` → `"C:\\S\\"`; `"C:\\"` → `"C:\\"`; `"/var"` → `"/var/"`; `"/"` → `"/"`.
  - `folderCrumbs("/var/sf/ana/Cálculo", "/var/sf/ana")` → `[{label:"/var/sf/ana",path:"/var/sf/ana"},{label:"Cálculo",path:"/var/sf/ana/Cálculo"}]`; sem `rootPath` → `[{"/","/"},{"var","/var"},{"sf","/var/sf"},…]`; `folderCrumbs("C:\\S\\ana\\x","C:\\S\\ana")` → raiz `C:\S\ana` + `x`; `folderCrumbs("\\\\srv\\sh\\a")` → raiz `\\srv\sh` + `a`; fora da raiz informada ⇒ usa a raiz do próprio caminho (`C:\` / `/`).

- [ ] **Step 2: Rodar** `npx vitest run tests/unit/folder-path-posix.test.ts` — esperado: FALHA (funções não existem).

- [ ] **Step 3: Implementar em `folder-path.ts`.** `ABSOLUTE_PATH_MESSAGE` vira `"Informe um caminho absoluto, como C:\\Estudos\\Cálculo ou /var/estudos/calculo."`. Detecção de sabor sobre o texto aparado: unidade (`^[A-Za-z]:[\\/]`) ou prefixo `\\`/`//` ⇒ win32 (caminho atual: trocar `/` por `\` e validar como hoje, inclusive UNC; `//a` falha na regex UNC ⇒ inválido); senão começa com `/` ⇒ posix: dividir por `/` apenas, colapsar vazios intermediários, rejeitar segmento que contenha `\` ou que falhe `isValidSegment`, remover barra final (raiz `/` permanece), checar 260. Demais ⇒ inválido. `folderKey`: minúsculas só quando o sabor é `win32` ou desconhecido. `isInsideFolder`: normaliza ambos, exige o mesmo sabor; win32 compara em minúsculas com prefixo `\`; posix compara exato com prefixo `/` (raiz `/` aceita tudo POSIX). `folderCrumbs` replica a lógica atual de `FolderPicker.crumbsOf` por sabor.

- [ ] **Step 4: Atualizar** os testes antigos que citam a mensagem antiga para a nova constante. **Rodar** `npx vitest run tests/unit/folder-path-posix.test.ts tests/unit/folder-path.test.ts tests/unit/estudo-schema.test.ts` — esperado: PASS.

- [ ] **Step 5: Gates e commit** `feat(estudo): caminhos de pasta aceitam o sabor POSIX no módulo puro`.

---

### Task 2: Servidor ciente do sabor (disco, isolação, seletor, imagens)

**Files:**
- Create: `src/features/estudo/path-api.ts`, `tests/unit/folder-scope-posix.test.ts`
- Modify: `src/features/estudo/{folders,folder-scope,folder-browser}.ts`, `src/app/(app)/estudo/[id]/imagens/route.ts`, `src/app/(app)/estudo/[id]/imagens/[arquivo]/route.ts`
- Modify (se preciso): testes existentes `folders.test.ts`, `folder-scope.test.ts`, `folder-browser.test.ts`, `image-routes.test.ts`

**Interfaces:**
- Consumes (Task 1): `flavorOf`, `joinFolder`, `isInsideFolder`, `normalizeFolderPath`.
- Produces:
  - `pathApi(flavor: PathFlavor): typeof path.win32 | typeof path.posix` (em `path-api.ts`, só servidor)
  - `baseFolder(platform: NodeJS.Platform = process.platform): string` — padrão `C:\StudyFlow` (win32) / `/var/lib/studyflow` (demais); lança `Error` com o nome `STUDYFLOW_BASE_DIR` quando o sabor **conhecido** da variável difere do da plataforma (`win32` ↔ `posix`); valor sem sabor (inválido) mantém o comportamento atual (devolve o texto cru)
  - `userRoot(user: { folderName: string }, base: string = baseFolder()): string`
  - `isInsideRoot(root, target)` delega a `isInsideFolder` (mesmo nome/assinatura)
  - `listDrives(query = queryDrives, platform: NodeJS.Platform = process.platform): Promise<string[]>` — `[]` sem chamar `query` quando `platform !== "win32"`
  - `parentOf(folder: string): string | null` passa a ser **exportada**

- [ ] **Step 1: Escrever `tests/unit/folder-scope-posix.test.ts` (deve falhar)**, com `vi.mock("node:fs/promises")` (`realpath`, `mkdir`, `stat`, `readdir` simulados; `realpath` resolve por tabela e rejeita com `{code:"ENOENT"}` o que não existe):
  - `baseFolder("linux")` com `STUDYFLOW_BASE_DIR="C:\\Estudos"` lança `/STUDYFLOW_BASE_DIR/`; `baseFolder("win32")` com `"/var/sf"` lança; `baseFolder("linux")` sem variável → `"/var/lib/studyflow"`; `baseFolder("win32")` sem variável → `"C:\\StudyFlow"`; `baseFolder("linux")` com `"/var/sf/"` → `"/var/sf"`.
  - `userRoot({folderName:"ana"}, "/var/lib/studyflow")` → `"/var/lib/studyflow/ana"`.
  - `isFolderAllowed("/var/sf/ana", "/var/sf/ana/a")` → `true` (tabela: `/var/sf/ana` existe; `/var/sf/ana/a` ENOENT); `…("/var/sf/ana", "/var/sf/ana/link")` → `false` com `realpath("/var/sf/ana/link")` → `"/etc"`; `…("/var/sf/ana", "/var/sf/ANA/x")` → `false` e `realpath` **não chamado**; `…("/var/sf/ana", "C:\\x")` → `false` e `realpath` **não chamado**; `…("C:\\S\\ana", "/var/sf/ana/x")` → `false` sem disco.
  - `imagesDir("/var/sf/ana/x")` → `"/var/sf/ana/x/imagens"`; `imagesDir("C:\\S\\x")` → `"C:\\S\\x\\imagens"`.
  - `parentOf`: `"/"`→`null`, `"/a"`→`"/"`, `"/a/b"`→`"/a"`, `"C:\\"`→`null`, `"C:\\a"`→`"C:\\"`, `"\\\\srv\\sh"`→`null`.
  - `listDrives(spy, "linux")` → `[]` e `spy` não chamado.
  - `createSubfolder("/var/sf/ana", "x")` chama `fs.mkdir("/var/sf/ana/x")` e devolve `{ok:true,path:"/var/sf/ana/x"}`; nomes `"a/b"` e `"a\\b"` → `{ok:false}` (`INVALID_NAME`).

- [ ] **Step 2: Rodar** o arquivo novo — esperado: FALHA.

- [ ] **Step 3: Implementar.** Trocar todo `path.win32.*` fixo por `pathApi(flavorOf(x)!)` (ou `joinFolder`) em `folders.ts` (`imagesDir`), `folder-scope.ts` (`userRoot`, `resolveReal`), `folder-browser.ts` (`parentOf`, `createSubfolder`) e nas duas rotas de imagem (`writeUnique` e `readImage`: juntar com o sabor da pasta do Estudo; nome de arquivo com `/` ou `\` recusado). `isFolderAllowed` deve retornar `false` pelo teste de texto (`isInsideRoot`) **antes** de qualquer chamada de disco. `resolveReal` usa `pathApi` do sabor de `current`. Não tocar na lógica de `isLocalHost` (sai na Task 4).

- [ ] **Step 4: Rodar** `npx vitest run tests/unit/folder-scope-posix.test.ts tests/unit/folder-scope.test.ts tests/unit/folders.test.ts tests/unit/folder-browser.test.ts tests/unit/image-routes.test.ts tests/unit/folder-route.test.ts` — esperado: PASS (testes Windows existentes intactos).

- [ ] **Step 5: Gates e commit** `feat(estudo): isolação e disco usam o sabor do caminho (Windows ou POSIX)`.

---

### Task 3: Componentes de cliente cientes do sabor

**Files:**
- Modify: `src/features/estudo/components/FolderPicker.tsx`, `src/features/estudo/components/StudyFormModal.tsx`
- Modify: `tests/unit/folder-picker.test.tsx` (+ o teste existente do `StudyFormModal`, se houver; localizar com Grep por `StudyFormModal` em `tests/unit`)

**Interfaces:**
- Consumes (Task 1): `folderCrumbs`, `joinFolder`, `isInsideFolder`, `withTrailingSeparator`.
- Produces: nada novo.

- [ ] **Step 1: Escrever testes (devem falhar):** em `folder-picker.test.tsx`, com `fetch` simulado devolvendo `{path:"/var/sf/ana",parent:null,folders:["Cálculo"],drives:[]}`: o botão do trecho `/var/sf/ana` existe; clicar na pasta `Cálculo` chama `fetch` com `caminho=/var/sf/ana/Cálculo` (URL-codificado); "Pasta acima" desabilitado. No teste do `StudyFormModal`: `baseDir="/var/sf/ana"` ⇒ o campo Pasta de um novo Estudo vale `"/var/sf/ana/"`; `baseDir="D:\\"` ⇒ `"D:\\"` (sem barra duplicada). Todos os testes Windows atuais continuam.

- [ ] **Step 2: Rodar** `npx vitest run tests/unit/folder-picker.test.tsx` — esperado: FALHA nos casos POSIX.

- [ ] **Step 3: Implementar.** `FolderPicker`: remover `isInside`/`crumbsOf`/`driveOf` duplicados que dependem de `\`; usar `folderCrumbs(path, rootPath)`, `joinFolder(path, folder)` e (para o limite de raiz) `isInsideFolder`. `StudyFormModal.newFolderPrefix` → `withTrailingSeparator(baseDir)`. Manter o bloco de unidades só para sabor `win32` (já é `[]` na prática; não apagar o código de unidades — fora do escopo).

- [ ] **Step 4: Rodar** os testes do passo 2 e `npx vitest run tests/unit/estudo-*.test.ts*` — esperado: PASS.

- [ ] **Step 5: Gates e commit** `feat(estudo): seletor de pastas e formulário usam os helpers de caminho com sabor`.

---

### Task 4: Remover `isLocalHost` e ajustar as rotas

**Files:**
- Modify: `src/features/estudo/folder-browser.ts` (remover `isLocalHost`, `isPrivateIpv4`, `IPV4`), `src/app/api/pastas/route.ts`, `src/features/ai/route-guard.ts`, `README.md` (menções a "neste computador/rede local")
- Modify: `tests/unit/folder-browser.test.ts` (remover os testes de `isLocalHost`), `tests/unit/folder-route.test.ts`, `tests/unit/ai-routes.test.ts`

**Interfaces:**
- Consumes: `isSameOrigin` (inalterado), `authErrorResponse`.
- Produces: `rejectUnsafePost(request: Request): Response | null` — agora só `Origin` do próprio app (403 `"Origem não permitida."`) e corpo JSON (415, inalterado); `FORBIDDEN` do `/api/pastas` vira `"Origem não permitida."`.

- [ ] **Step 1: Atualizar/escrever testes (devem falhar):**
  - `GET /api/pastas` com `Host: estudo.aiontecno.com.br` e sessão simulada → **200** (antes 403); sem sessão → 401 (inalterado).
  - `POST /api/pastas` com `Origin: https://evil.example` e `Host: estudo.aiontecno.com.br` → 403 `"Origem não permitida."`; com `Origin: https://estudo.aiontecno.com.br` → segue o fluxo normal.
  - `POST /api/ai/testar` e `/api/ai/modelos` com Host público e Origin igual → **não** 403 (chega a `resolveAiConfig`); Origin de fora → 403 `"Origem não permitida."`; sem sessão → 401 (`resolveAiConfig` já mapeia `AuthError`; só provar).
  - Remover os 4 testes de `isLocalHost`.

- [ ] **Step 2: Rodar** `npx vitest run tests/unit/folder-route.test.ts tests/unit/ai-routes.test.ts` — esperado: FALHA.

- [ ] **Step 3: Implementar** a remoção e os ajustes acima; remover do README a frase de que o seletor/IA só funcionam localmente.

- [ ] **Step 4: Rodar** os mesmos testes + `tests/unit/folder-browser.test.ts` — esperado: PASS. `Grep` por `isLocalHost` em `src` e `tests` — esperado: nenhuma ocorrência.

- [ ] **Step 5: Gates e commit** `refactor(estudo): remove o guarda isLocalHost; origem e sessão protegem as rotas`.

---

### Task 5: Política de destino da IA (SSRF)

**Files:**
- Create: `src/features/ai/url-policy.ts`, `src/features/ai/gateway.ts`, `tests/unit/url-policy.test.ts`, `tests/unit/safe-fetch.test.ts`
- Modify: `package.json` (+ `package-lock.json`: `undici`), `src/features/ai/client.ts` (`fetchImpl` obrigatório), `src/app/api/ai/{testar,modelos}/route.ts` (usar `createGatewayClient`), `src/features/ai/resolve-config.ts` e `src/features/ai/actions.ts` (checagem sintática), `tests/unit/ai-client.test.ts` / `ai-routes.test.ts` (ajustes de assinatura)
- Modify: `.env.example` (documentar `STUDYFLOW_AI_ALLOW_PRIVATE`)

**Interfaces:**
- Produces (`url-policy.ts`, só servidor):
  - `const GATEWAY_BLOCKED_MESSAGE = "Endereço do gateway não permitido."`
  - `class BlockedDestinationError extends Error` (mensagem = a constante)
  - `allowPrivateDestinations(): boolean` — `process.env.STUDYFLOW_AI_ALLOW_PRIVATE === "1"`
  - `isBlockedAddress(address: string): boolean` — IPv4/IPv6 literal
  - `checkGatewayUrlSyntax(url: string): string | null` — mensagem de erro ou `null`
  - `createSafeLookup(resolve?: (host: string) => Promise<{ address: string; family: number }[]>)` — função `lookup(hostname, options, callback)` compatível com `net.connect`; trata `options.all` verdadeiro (callback recebe array) e falso (um endereço)
  - `createSafeFetch(): typeof fetch` — usa `fetch` e `Agent` do pacote `undici`, com `connect: { lookup }`; recusa esquema ≠ `https` (exceto `allowPrivateDestinations()`); converte falha de conexão cuja `cause` é `BlockedDestinationError` em `throw` dessa própria exceção; mantém `redirect: "error"` do chamador
- Produces (`gateway.ts`): `createGatewayClient(config: AiClientConfig): ReturnType<typeof createAiClient>` = `createAiClient(config, createSafeFetch())`
- Altera: `createAiClient(config: AiClientConfig, fetchImpl: typeof fetch)` — sem valor padrão.

- [ ] **Step 1: Viabilidade (spike, antes de qualquer código de produção).** `npm install undici@<versão exata>`; num script descartável em `C:\Users\Sandro\AppData\Local\Temp\claude\c--Dev-StudyFlow\cb4a130d-dff5-423f-804d-3cf4e1c2fe71\scratchpad\undici-spike.mjs` provar que `new Agent({ connect: { lookup } })` + `fetch` do `undici` (a) recebe `options.all === true` no lookup do Node 24 e (b) conecta usando o endereço devolvido; e que `import { fetch, Agent } from "undici"` funciona dentro de uma rota Next (`next build` não quebra; se preciso, `serverExternalPackages: ["undici"]` em `next.config`). **Se não encaixar:** parar e reportar BLOCKED com o erro — o plano B é `node:https` com invólucro que devolve `Response` (decisão do controlador, não do implementador). Resultado do spike vai no relatório.

- [ ] **Step 2: Escrever `tests/unit/url-policy.test.ts` (deve falhar):**
  - `isBlockedAddress` → `true` para `127.0.0.1`, `127.255.255.254`, `10.0.0.1`, `172.16.0.1`, `172.31.255.255`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `100.127.255.255`, `0.0.0.0`, `224.0.0.1`, `255.255.255.255`, `240.0.0.1`, `::1`, `::`, `fc00::1`, `fd12::1`, `fe80::1`, `ff02::1`, `::ffff:127.0.0.1`, `::ffff:10.0.0.1`; `false` para `8.8.8.8`, `1.1.1.1`, `172.32.0.1`, `172.15.255.255`, `100.63.255.255`, `100.128.0.1`, `2606:4700:4700::1111`, `::ffff:8.8.8.8`.
  - `checkGatewayUrlSyntax` → `null` para `https://api.openai.com/v1` e `https://dashscope.aliyuncs.com/compatible-mode/v1`; mensagem (não nula) para `http://api.openai.com`, `https://localhost:11434`, `https://localhost./`, `https://foo.localhost/`, `https://127.0.0.1/`, `https://2130706433/`, `https://[::1]/`, `https://10.1.2.3/`, `https://[::ffff:127.0.0.1]/`, `ftp://x`, `texto solto`. Com `vi.stubEnv("STUDYFLOW_AI_ALLOW_PRIVATE","1")`: `http://localhost:11434` e `https://127.0.0.1/` → `null`.
  - `createSafeLookup(resolver)`: resolver → `[{8.8.8.8,4}]` entrega `[{address:"8.8.8.8",family:4}]` com `options.all=true` e `("8.8.8.8",4)` com `all` falso; `[{8.8.8.8},{10.0.0.1}]` → callback com `BlockedDestinationError`; `[{127.0.0.1}]` → erro; resolver rejeitando → o erro original; com `STUDYFLOW_AI_ALLOW_PRIVATE=1` o privado passa. O resolver é chamado **uma vez** por conexão (o endereço validado é o usado).

- [ ] **Step 3: Escrever `tests/unit/safe-fetch.test.ts` (deve falhar):** `createSafeFetch()("http://api.example.com/models")` rejeita com `BlockedDestinationError` sem rede; `("https://127.0.0.1/")` idem; `("https://localhost:<porta>/")` com um servidor HTTP local real em `127.0.0.1` rejeita com `"Endereço do gateway não permitido."` (prova o caminho do `lookup` e o desembrulho da `cause`, não `"fetch failed"`); com `STUDYFLOW_AI_ALLOW_PRIVATE=1`, `("http://127.0.0.1:<porta>/models")` responde 200 (modo relaxado funciona).

- [ ] **Step 4: Rodar** `npx vitest run tests/unit/url-policy.test.ts tests/unit/safe-fetch.test.ts` — esperado: FALHA.

- [ ] **Step 5: Implementar** `url-policy.ts` e `gateway.ts` conforme as interfaces. Ranges de IPv4/IPv6 bloqueados: os do teste acima (loopback, privados 10/8, 172.16/12, 192.168/16, link-local 169.254/16 e `fe80::/10`, CGNAT 100.64/10, `0.0.0.0/8`, multicast 224/4 e `ff00::/8`, reservado 240/4, ULA `fc00::/7`, `::`, `::1`, IPv4-mapeado avaliado pelas regras de IPv4). `checkGatewayUrlSyntax` usa `new URL`; recusa também host `localhost`, terminado em `.localhost`, com ponto final, e IP literal bloqueado.

- [ ] **Step 6: Ligar.** `client.ts`: `fetchImpl` obrigatório; `testar`/`modelos` usam `createGatewayClient`. `resolve-config.ts`: após `normalizeBaseUrl`, se `!allowPrivateDestinations()`, `checkGatewayUrlSyntax(baseUrl)` ⇒ `bad(mensagem)` (400). `actions.ts` (salvar): mesma checagem sobre o `baseUrl` ⇒ erro de campo `baseUrl`. Atualizar `ai-client.test.ts`/`ai-routes.test.ts`. Documentar a variável no `.env.example`.

- [ ] **Step 7: Rodar** `npx vitest run tests/unit/url-policy.test.ts tests/unit/safe-fetch.test.ts tests/unit/ai-client.test.ts tests/unit/ai-routes.test.ts tests/unit/ai-settings.test.ts tests/unit/ai-schema.test.ts` — esperado: PASS. `Grep` por `createAiClient(` em `src` — todas as chamadas de produção passam por `createGatewayClient`.

- [ ] **Step 8: Gates e commit** `feat(ai): política de destino do gateway contra SSRF (https, endereços públicos, lookup validado)`.

---

### Task 6: Arquivos de deploy, README e build em clone limpo

**Files:**
- Create: `deploy/nginx/studyflow.conf`, `ecosystem.config.js`
- Modify: `README.md` (seção "Deploy na VPS"), `.env.example` (`STUDYFLOW_BASE_DIR` Linux, `DATABASE_URL` absoluto)

**Interfaces:** nenhuma de código. Contrato de deploy: processo PM2 `studyflow`, `next start -p 3001 -H 127.0.0.1`, `cwd` `/opt/studyflow`; Nginx → `127.0.0.1:3001`.

- [ ] **Step 1: `deploy/nginx/studyflow.conf`** no molde de `C:\Dev\CrmAT\deploy\nginx\atcrm.conf`: `server_name estudo.aiontecno.com.br;`, `client_max_body_size 12m;` (imagens: 10 MB + formulário), `proxy_pass http://127.0.0.1:3001;` com `proxy_http_version 1.1` e os cabeçalhos `Host $host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto $scheme`, `X-Forwarded-Host $host`; `limit_req_zone $binary_remote_addr zone=studyflow_login:10m rate=10r/m;` (fora do `server`) e `location = /login { limit_req zone=studyflow_login burst=10 nodelay; <mesmo proxy_pass/cabeçalhos> }`. Comentários de instalação e Certbot como no modelo do CRM.

- [ ] **Step 2: `ecosystem.config.js`** (CommonJS): app `studyflow`, `script: "node_modules/next/dist/bin/next"`, `args: "start -p 3001 -H 127.0.0.1"`, `cwd: __dirname`, `instances: 1`, `exec_mode: "fork"`, `env: { NODE_ENV: "production" }`, `max_memory_restart: "500M"`, `restart_delay: 3000`, `max_restarts: 10`, `time: true`.

- [ ] **Step 3: README "Deploy na VPS".** Passos numerados com comandos: preparar a VPS (Node LTS, Nginx, Certbot, PM2 — já presentes por causa do CRM, conferir `node -v` ≥ 20); `git clone <origin> /opt/studyflow`; criar `/opt/studyflow-data` e `/var/lib/studyflow` com dono do usuário do PM2; `.env` com `DATABASE_URL=file:/opt/studyflow-data/studyflow.db`, `STUDYFLOW_BASE_DIR=/var/lib/studyflow`, `SUPERUSER_*`; `npm ci`; `npx prisma migrate deploy`; `npm run auth:bootstrap` e depois remover `SUPERUSER_PASSWORD` do `.env`; `npm run build`; `pm2 start ecosystem.config.js`, `pm2 save`; Nginx (`sites-available` → `sites-enabled`, `nginx -t`, reload); `certbot --nginx -d estudo.aiontecno.com.br`. Seção de atualização (`git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart studyflow`). **Avisos:** nunca `npm run db:seed`/`db:migrate` em produção; a porta 3001 só escuta no localhost; banco e pastas ficam fora de `/opt/studyflow`; backup do banco e de `/var/lib/studyflow` é responsabilidade do operador (fora do escopo).

- [ ] **Step 4: Verificar `DATABASE_URL` absoluto.** Num diretório temporário do scratchpad, com `DATABASE_URL=file:<caminho absoluto>/t.db`, rodar `npx prisma migrate deploy` e `npm run auth:bootstrap` (com `SUPERUSER_*` fictícios passados só nessa execução) e confirmar que o banco é criado ali e não em `./prisma`. Se o adaptador exigir outra sintaxe, ajustar README/`.env.example` com a que funciona. Nunca apontar para `prisma/dev.db`.

- [ ] **Step 5: Build em clone limpo.** `git clone --no-hardlinks . <scratchpad>/sf-clean` (HEAD da branch, sem o WIP), `cd` lá, `npm ci`, `DATABASE_URL=file:<scratchpad>/clean.db npx prisma migrate deploy`, `npx next build` — esperado: build conclui sem erros. Se falhar por arquivo que só existe no WIP do usuário, reportar (não "consertar" o WIP).

- [ ] **Step 6: Gates e commit** `docs(deploy): nginx, PM2 e passo a passo da publicação em Linux`.

---

### Task 7: Verificação final da branch

**Files:** nenhum (só verificação; correções entram como commits `fix(...)`).

- [ ] **Step 1:** `npm test` (segundo plano). Esperado: as mesmas **32 falhas**, todas nos 3 testes sem commit; zero falhas novas. Contar passes (antes: 1160 + novos).
- [ ] **Step 2:** `npx tsc --noEmit` filtrado (ver Global Constraints) — saída vazia. `npx eslint src tests` — sem erros novos além da linha de base (agenda: 3 warnings; arquivos do WIP).
- [ ] **Step 3: e2e.** O servidor de desenvolvimento do usuário está parado; confirmar com `Get-NetTCPConnection -LocalPort 3000` que a porta 3000 está livre; se estiver ocupada, **parar e perguntar ao controlador**. Rodar `npm run test:e2e` com os arquivos do WIP temporariamente excluídos do `tsconfig.json` (como na autenticação) e **reverter** a exclusão; esperado: 46/46. Conferir que o `sha256` de `prisma/dev.db` não mudou.
- [ ] **Step 4:** `Grep` por `path.win32` em `src` — só deve restar em `path-api.ts`. `Grep` por `isLocalHost` — nenhuma ocorrência.
- [ ] **Step 5:** `git status --short` — apenas os arquivos do WIP do usuário sem commit; `git log --oneline main..HEAD` — commits das Tasks 1–6 (mais a spec e este plano).
