# StudyFlow

App para organizar temas de estudo. Next.js (App Router) + TypeScript, Prisma + SQLite.

`Design/` guarda o protótipo estático e o design system usados como referência visual. Ela não é alterada.
Spec e plano de implementação ficam em `docs/superpowers/`.

## Setup

```bash
cp .env.example .env
# Preencha SUPERUSER_EMAIL, SUPERUSER_PASSWORD e SUPERUSER_NAME no .env antes do próximo passo.
npm install
npm run db:migrate
npm run auth:bootstrap
npm run db:seed
npm run dev
```

Depois do `auth:bootstrap`, apague `SUPERUSER_PASSWORD` do `.env` (ele só é usado nessa etapa). O `db:seed` recusa rodar se o superusuário já tem dados (Estudos, cards, resultados ou agenda); só use `SEED_FORCE=1` em bancos de teste.

Para os testes e2e, instale o navegador uma vez com `npx playwright install chromium`. O `npm run test:e2e` faz um build e sobrescreve `.next` (pare o `npm run dev` antes); ele usa banco (`prisma/e2e.db`), superusuário e pasta base próprios e nunca toca no banco de desenvolvimento.

O app abre em http://localhost:3000 e redireciona para `/estudo`.

## Pasta dos Estudos

Cada Estudo tem uma pasta real no disco (caminho absoluto do Windows, como `C:\Estudos\Cálculo`). O app cria a pasta ao salvar o Estudo, não aceita dois Estudos ativos na mesma pasta e, quando a pasta muda, copia `imagens\` para a nova sem apagar a antiga. O app nunca apaga nada do disco.

A variável opcional `STUDYFLOW_BASE_DIR` (padrão `C:\StudyFlow`) define a pasta base: o `npm run db:seed` cria `<base>\<nome>` para cada registro de exemplo, e o modal de novo Estudo começa com `<base>\` no campo Pasta. Na prática, as pastas de cada usuário ficam em `<base>\<pasta do usuário>` (ver Autenticação). Os testes e2e usam uma pasta temporária própria.

## Autenticação

O acesso é por e-mail e senha em `/login`; todas as páginas e APIs exigem sessão, e o cadastro não é aberto (não há auto-cadastro).

**Primeiro acesso.** Defina `SUPERUSER_EMAIL`, `SUPERUSER_PASSWORD` e `SUPERUSER_NAME` no `.env` e rode `npm run auth:bootstrap`. O comando cria o superusuário (ou converte o usuário local antigo, mantendo os dados dele) e é idempotente: pode rodar de novo sem duplicar nada e não sobrescreve a senha já definida. Depois entre em http://localhost:3000/login e remova `SUPERUSER_PASSWORD` do `.env`.

- **Usuários** (item do menu, só para o superusuário): cria usuários comuns, redefine senha, desativa/reativa e exclui. Só existe um superusuário.
- **Minha conta** (em Configuração): cada usuário troca a própria senha.
- **Dados por usuário**: Estudos, cards, agenda e configuração de IA são de cada usuário. As pastas dos Estudos ficam dentro da raiz do usuário, `<base>\<pasta do usuário>` (por exemplo `C:\StudyFlow\Maria`); o app recusa pastas fora dela. Excluir um usuário apaga só as linhas do banco, nunca as pastas do disco.

> Atenção: `npm run db:seed` **substitui** os registros de exemplo do superusuário (apaga cards, resultados, agenda e Estudos dele e recria os 8 de exemplo). Por segurança ele recusa rodar se o superusuário já tem dados, a menos que `SEED_FORCE=1`; não use isso em um banco com dados reais.

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
| `npm run db:seed` | recria os registros de exemplo do superusuário; recusa se ele já tem dados (só `SEED_FORCE=1` em banco de teste) |

## Deploy na VPS

Publicação em https://estudo.aiontecno.com.br numa VPS Linux (Ubuntu/Debian) que já hospeda o ATCRM (porta 3000). Arquitetura: o app roda via **PM2** (processo `studyflow`, `next start -p 3001 -H 127.0.0.1`) atrás de um **Nginx** com TLS (Certbot). O código fica em `/opt/studyflow`; o banco em `/opt/studyflow-data` e as pastas dos Estudos em `/var/lib/studyflow`, ambos fora do código. Os arquivos de apoio são `ecosystem.config.js` e `deploy/nginx/studyflow.conf`.

### 1. Preparar a VPS

Node, Nginx, Certbot e PM2 já existem por causa do CRM; só confira as versões:

```bash
node -v      # precisa ser >= 22.19.0 (exigência do undici 8, usado pelo cliente de IA)
nginx -v
pm2 -v
```

Se o Node for mais antigo (a instalação do CRM pode ter sido Node 20), há duas saídas:

- **Atualizar o Node** (por exemplo, NodeSource 22: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`). Atenção: a VPS é compartilhada. Atualizar o Node afeta também o CRM; confirme que o CRM roda na versão nova e reinicie o processo dele no PM2 (`pm2 restart atcrm`). A decisão é sua.
- **Manter o Node e fixar o `undici` numa 7.x** (exata, sem `^`; funciona no Node >= 20.18.1) no `package.json`, rodar `npm install` para atualizar o `package-lock.json` e repetir `npx vitest run tests/unit/safe-fetch.test.ts tests/unit/url-policy.test.ts` para confirmar que a política de destino do cliente de IA continua passando. Em qualquer dos casos o `engines` do `package.json` (`>=22.19.0`) faz o `npm ci` avisar se o Node estiver abaixo.

Se algo estiver faltando: `sudo apt install -y nginx certbot python3-certbot-nginx` e `sudo npm i -g pm2`.

### 2. Código, pastas e `.env`

```bash
sudo git clone https://github.com/sdmcarvalho/StudyFlow.git /opt/studyflow
sudo chown -R "$USER": /opt/studyflow            # usuário que roda o PM2
sudo mkdir -p /opt/studyflow-data /var/lib/studyflow
sudo chown "$USER": /opt/studyflow-data /var/lib/studyflow
cd /opt/studyflow
cp .env.example .env
```

Edite o `.env` (nunca vá para o git) com:

```
DATABASE_URL="file:/opt/studyflow-data/studyflow.db"
STUDYFLOW_BASE_DIR="/var/lib/studyflow"
SUPERUSER_EMAIL="seu-email@exemplo.com"
SUPERUSER_PASSWORD="uma-senha-forte-1"
SUPERUSER_NAME="Seu Nome"
```

`DATABASE_URL` precisa ser absoluto na VPS (o padrão relativo `file:./prisma/dev.db` é do desenvolvimento no Windows). Não defina `STUDYFLOW_AI_ALLOW_PRIVATE` em produção (ver "Notas de produção").

### 3. Dependências, banco e build

```bash
npm ci
npx prisma migrate deploy
npm run auth:bootstrap     # cria o superusuário; depois apague SUPERUSER_PASSWORD do .env
npm run build
```

O `auth:bootstrap` usa o `tsx`, que é dependência de desenvolvimento: rode o `npm ci` sem `NODE_ENV=production` no ambiente do shell (ou com `--include=dev`).

### 4. Subir com o PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # só se ainda não estiver configurado por causa do CRM; siga a instrução impressa
pm2 logs studyflow --lines 30
curl -I http://127.0.0.1:3001/login    # deve responder 200
```

### 5. Nginx e HTTPS

Aponte o DNS de `estudo.aiontecno.com.br` para o IP da VPS e então:

```bash
sudo cp deploy/nginx/studyflow.conf /etc/nginx/sites-available/studyflow
sudo ln -s /etc/nginx/sites-available/studyflow /etc/nginx/sites-enabled/studyflow
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d estudo.aiontecno.com.br
```

O Certbot acrescenta o bloco `:443` e o redirecionamento http -> https no próprio arquivo. O HTTPS é obrigatório: o cookie de sessão (`studyflow_session`) é `httpOnly`, `SameSite=Lax` e `secure` quando `NODE_ENV=production` (o PM2 define isso), então o navegador não o aceita por HTTP puro e o login não funciona sem o passo do Certbot.

### Atualizar uma versão

```bash
cd /opt/studyflow
git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart studyflow
```

### Notas de produção

- **Nunca** rode `npm run db:seed` nem `npm run db:migrate` (`prisma migrate dev`) em produção: o seed substitui os dados do superusuário e o `migrate dev` pode resetar o banco. Em produção só `prisma migrate deploy`.
- A porta 3001 escuta só em `127.0.0.1`; só 80/443 ficam públicas. O Nginx precisa repassar o `Host` original (o app compara o cabeçalho `Origin` com o `Host`) e `X-Forwarded-Proto`/`X-Forwarded-Host`; o `deploy/nginx/studyflow.conf` já faz isso, não o altere para reescrever o `Host`.
- Cliente de IA: o servidor só chama gateways **https** cujo nome resolve apenas para endereços públicos. `STUDYFLOW_AI_ALLOW_PRIVATE=1` relaxa essa regra (para um gateway local em desenvolvimento) e **não** deve ser definido na VPS. As variáveis `HTTP_PROXY`/`HTTPS_PROXY` de saída são ignoradas pelo cliente de IA; a VPS precisa ter saída direta para o gateway.
- O banco (`/opt/studyflow-data`) e as pastas dos Estudos (`/var/lib/studyflow`) ficam fora de `/opt/studyflow`, então um `git pull` ou reclone não os afeta. O backup deles é responsabilidade do operador (fora do escopo deste projeto).
