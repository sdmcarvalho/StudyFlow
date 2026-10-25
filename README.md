# StudyFlow

App para organizar temas de estudo. Next.js (App Router) + TypeScript, Prisma + SQLite.

`Design/` guarda o protótipo estático e o design system usados como referência visual. Ela não é alterada.
Spec e plano de implementação ficam em `docs/superpowers/`.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Para os testes e2e, instale o navegador uma vez com `npx playwright install chromium`. O `npm run test:e2e` faz um build e sobrescreve `.next`.

O app abre em http://localhost:3000 e redireciona para `/estudo`.

## Pasta dos Estudos

Cada Estudo tem uma pasta real no disco (caminho absoluto do Windows, como `C:\Estudos\Cálculo`). O app cria a pasta ao salvar o Estudo, não aceita dois Estudos ativos na mesma pasta e, quando a pasta muda, copia `imagens\` para a nova sem apagar a antiga. O app nunca apaga nada do disco.

A variável opcional `STUDYFLOW_BASE_DIR` (padrão `C:\StudyFlow`) define a pasta base: o `npm run db:seed` cria `<base>\<nome>` para cada registro de exemplo, e o modal de novo Estudo começa com `<base>\` no campo Pasta. Os testes e2e usam uma pasta temporária própria.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run lint` | ESLint |
| `npm test` | testes unitários (Vitest) |
| `npm run test:e2e` | testes de ponta a ponta (Playwright) |
| `npm run db:migrate` | aplica migrations no banco de desenvolvimento |
| `npm run db:seed` | recria o usuário local e os registros de exemplo |
