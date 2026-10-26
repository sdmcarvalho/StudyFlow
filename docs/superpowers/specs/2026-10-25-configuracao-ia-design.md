# Configuração do agente de IA — design

Data: 2026-10-25 · Estado: aguardando revisão

## Objetivo

Dar ao StudyFlow uma tela **Configuração** onde o usuário informa um gateway de IA compatível com OpenAI (Gateway base URL + Gateway API key), escolhe um modelo, ajusta os parâmetros dele e testa a conexão. O mesmo gateway serve para qualquer modelo; só um modelo fica ativo por vez. Modelo de referência: `C:\Dev\TradutorLivros` (`app/config.py`, `app/llm.py`, rotas `/api/config*`).

## Escopo

Dentro:
- Item **Configuração** na Sidebar, abaixo de Agenda, rota `/configuracao`.
- Painel **Agente de IA**: Gateway base URL, Gateway API key, Modelo (campo com sugestões + "Buscar modelos"), temperatura, timeout, parâmetros extras (JSON). Botões **Testar** e **Salvar**.
- Persistência por usuário no banco, cliente OpenAI-compatível reutilizável.

Fora:
- Perfis de modelo múltiplos (decidido: um modelo ativo, opção B).
- Criptografia da chave em repouso.
- Qualquer uso da IA (cards, página Testes).
- Copiar a chave do `config.json` do TradutorLivros: o usuário a digita.

## Navegação e tela

- `Sidebar.tsx`: novo item `{ href: "/configuracao", label: "Configuração", Icon: SettingsIcon }` após Agenda. `SettingsIcon` (engrenagem) novo em `src/components/ui/icons.tsx`.
- `src/app/(app)/configuracao/page.tsx` (server component, `metadata.title = "Configuração · StudyFlow"`) carrega as configurações do usuário e renderiza o formulário (client component) em `src/features/ai/components/`.
- Estilo: CSS Modules sobre `src/styles/tokens.css`, como o resto do app. Interface em pt-BR; só os rótulos "Gateway base URL" e "Gateway API key" ficam em inglês.
- Campos: base URL (texto), API key (`type="password"`, placeholder mostra a chave mascarada quando já existe), Modelo (`<input list>` com `<datalist>` preenchido por "Buscar modelos": aceita um item da lista buscada ou texto livre, então continua utilizável se a busca falhar), temperatura, timeout (s), parâmetros extras (textarea JSON). Temperatura e timeout aceitam vírgula decimal ("0,5"): o formulário troca a vírgula por ponto antes de enviar.
- Resultado do Testar aparece em linha abaixo dos botões: `OK · 820 ms · resposta: OK` ou o erro com status HTTP. Salvar mostra toast de sucesso/erro.

## Dados

Novo modelo Prisma, uma linha por usuário:

```prisma
model AiSettings {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id])
  baseUrl     String   @default("")
  apiKey      String   @default("")
  model       String   @default("")
  temperature Float    @default(0.2)
  timeout     Int      @default(300)
  extraParams String   @default("")
  updatedAt   DateTime @updatedAt
}
```

Mais migration própria e relação `aiSettings AiSettings?` em `User`. A chave fica em texto no SQLite local (app local de usuário único), nunca é escrita em log e nunca volta inteira ao navegador: a tela recebe `apiKeyMasked` (`sk-s…VdU`, ou `…` se ≤ 8 caracteres) e `hasKey`. Salvar com chave vazia mantém a chave guardada.

## Servidor

Estrutura `src/features/ai/`:
- `schema.ts` — zod 4. `baseUrl`: URL `http`/`https`, sem barra final (normalizada). `temperature`: 0–2. `timeout`: inteiro 10–600. `extraParams`: vazio ou objeto JSON, sem as chaves reservadas `model`, `messages`, `stream`. `model`: texto ≤ 200.
- `queries.ts` — `getAiSettings()` (sem argumento; usa o usuário atual) devolvendo o tipo público (chave mascarada) e `getAiSettingsWithKey()` para uso só no servidor.
- `actions.ts` — server action `saveAiSettings`, retorna `{ok:true, data}` ou `{ok:false, fieldErrors?, message?}` (mesmo padrão de `src/features/cards/actions.ts`).
- `client.ts` — cliente OpenAI-compatível com `fetch`, sem dependência nova:
  - `chat(...)`: `POST {baseUrl}/chat/completions` com `model`, `temperature`, `messages` e extras mesclados.
  - `listModels()`: `GET {baseUrl}/models`, ids ordenados.
  - `testConnection()`: chat com "Responda apenas: OK", `max_tokens: 5`, timeout 60 s; nunca lança, devolve `{ok, latencyMs, reply, error, status}`.
  - Cabeçalho `Authorization: Bearer <chave>` só se houver chave. Erros truncados em 500 caracteres.
  - Padrão por provedor: `enable_thinking: false` apenas quando a URL contém `aliyuncs.com`; extras do usuário vencem.
- Rotas `src/app/api/ai/testar/route.ts` e `src/app/api/ai/modelos/route.ts` (`POST`): aceitam os valores digitados (sem salvar) e completam o que faltar com o salvo. Se a URL digitada difere da salva, a chave veio vazia **e há uma chave salva** (`hasKey`), respondem 400 "Para testar outra Base URL, digite a API key junto (ou salve antes).", para a chave salva não ser enviada a outro destino. Sem chave salva não há o que vazar, então um gateway sem chave pode ser testado antes de salvar.
- Proteção das rotas: mesma regra de `/api/pastas` (Host local/IP privado; POST exige JSON + Origin do app).

## Erros

- Validação inválida: mensagem pt-BR por campo na tela; nada é gravado.
- Testar/Buscar modelos: falhas de rede, 401/403/404, 429/5xx e resposta não-JSON viram texto legível com o status; a tela nunca fica travada (timeout respeitado, botão volta ao normal).
- Salvar não exige que o teste tenha passado.

## Testes

- Unitários (Vitest): schema (limites, extras reservados, URL); mascaramento e "chave vazia mantém a salva"; `client.ts` com `fetch` simulado (200, 401, 429, 500, rede, JSON inesperado, extras e `enable_thinking`); regra do 400 de URL diferente sem chave (só quando há chave salva); Sidebar mostra e destaca Configuração; formulário (preencher, Testar, Buscar modelos, Salvar). Testes de banco usam `// @vitest-environment node` e `prisma/test.db`.
- e2e (Playwright): abrir Configuração pelo menu, preencher apontando para um servidor falso local, Testar, Buscar modelos, Salvar, recarregar e ver o valor persistido e a chave mascarada. Nunca usa chave real nem a rede.
- Checagens: `tsc`, ESLint, build.

## Critérios de aceitação

1. "Configuração" aparece abaixo de "Agenda" e abre `/configuracao`, com o item destacado.
2. Dá para salvar URL, chave, modelo e ajustes; ao recarregar, tudo persiste e a chave aparece mascarada.
3. Testar mostra sucesso (latência e resposta) ou erro claro, sem salvar.
4. Buscar modelos preenche a lista; o modelo escolhido é salvo.
5. Salvar com chave em branco não apaga a chave existente.
6. A chave completa nunca chega ao navegador nem aparece em logs.
7. `tsc`, ESLint, testes unitários e e2e passam.
