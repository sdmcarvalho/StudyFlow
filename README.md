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
