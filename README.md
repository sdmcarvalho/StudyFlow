# StudyFlow

App para organizar temas de estudo. Next.js (App Router) + TypeScript, Prisma + SQLite.

`Design/` guarda o protótipo estático e o design system usados como referência visual. Ela não é alterada.
Spec e plano de implementação ficam em `docs/superpowers/`.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run auth:bootstrap
npm run db:seed
npm run dev
```

Para os testes e2e, instale o navegador uma vez com `npx playwright install chromium`. O `npm run test:e2e` faz um build e sobrescreve `.next` (pare o `npm run dev` antes); ele usa banco (`prisma/e2e.db`), superusuário e pasta base próprios e nunca toca no banco de desenvolvimento.

O app abre em http://localhost:3000 e redireciona para `/estudo`.

## Pasta dos Estudos

Cada Estudo tem uma pasta real no disco (caminho absoluto do Windows, como `C:\Estudos\Cálculo`). O app cria a pasta ao salvar o Estudo, não aceita dois Estudos ativos na mesma pasta e, quando a pasta muda, copia `imagens\` para a nova sem apagar a antiga. O app nunca apaga nada do disco.

A variável opcional `STUDYFLOW_BASE_DIR` (padrão `C:\StudyFlow`) define a pasta base: o `npm run db:seed` cria `<base>\<nome>` para cada registro de exemplo, e o modal de novo Estudo começa com `<base>\` no campo Pasta. Na prática, as pastas de cada usuário ficam em `<base>\<pasta do usuário>` (ver Autenticação). Os testes e2e usam uma pasta temporária própria.

## Autenticação

O acesso é por e-mail e senha em `/login`; todas as páginas e APIs exigem sessão, e o cadastro não é aberto (não há auto-cadastro).

**Primeiro acesso.** Defina `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD` e `SUPERUSER_NAME` no `.env` e rode `npm run auth:bootstrap`. O comando cria o superusuário (ou converte o usuário local antigo, mantendo os dados dele) e é idempotente: pode rodar de novo sem duplicar nada e não sobrescreve a senha já definida. Depois entre em http://localhost:3000/login.

- **Usuários** (item do menu, só para o superusuário): cria usuários comuns, redefine senha, desativa/reativa e exclui. Só existe um superusuário.
- **Minha conta** (em Configuração): cada usuário troca a própria senha.
- **Dados por usuário**: Estudos, cards, agenda e configuração de IA são de cada usuário. As pastas dos Estudos ficam dentro da raiz do usuário, `<base>\<pasta do usuário>` (por exemplo `C:\StudyFlow\Maria`); o app recusa pastas fora dela. Excluir um usuário apaga só as linhas do banco, nunca as pastas do disco.

> Atenção: `npm run db:seed` **substitui** os registros de exemplo do superusuário (apaga os cards e Estudos dele e recria os 8 de exemplo). Não rode em um banco com dados reais.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run lint` | ESLint |
| `npm test` | testes unitários (Vitest) |
| `npm run test:e2e` | testes de ponta a ponta (Playwright) |
| `npm run db:migrate` | aplica migrations no banco de desenvolvimento |
| `npm run auth:bootstrap` | cria (ou converte) o superusuário a partir de `SUPERUSER_*` no `.env`; idempotente |
| `npm run db:seed` | recria os registros de exemplo do superusuário (apaga os dele; não use com dados reais) |
