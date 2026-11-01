# Voz — ler e gravar em MP3 as células de um Estudo — Design

Data: 2026-10-31
Branch: `feat/voz` (a partir da `main`)

## Objetivo

Estudar ouvindo. Na grade da tela **Estudo**, cada registro ganha o botão **Voz**. Ele abre uma tela onde o
usuário escolhe um intervalo de células do Estudo e então:

- **Ler**: abre uma tela que mostra as células do intervalo e as lê em voz alta;
- **Gravar**: gera um MP3 do mesmo intervalo e deixa baixá-lo.

Além disso, a tela **Configuração** ganha a seção **Voz** (voz, velocidade, volume), valendo para Ler e Gravar.

## Decisões já tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Motor de voz | **Piper local** (`piper-tts` 1.8.0, Python ≥ 3.9) | Gratuito, offline, sem terceiros. Escolha do usuário. |
| Onde roda | **VPS (Linux) e PC Windows** | Escolha do usuário. O pacote tem wheels para `win_amd64` e `manylinux x86_64`. |
| Ler e Gravar | **Mesmo motor e mesma configuração**, mesmo pipeline | Soam iguais. Web Speech do navegador está descartada. |
| Arquitetura | **Um processo do Piper por tarefa**, não um serviço residente | Carrega o modelo uma vez por tarefa, não deixa RAM ocupada na VPS compartilhada e é igual nos dois sistemas. |
| MP3 | **`@breezystack/lamejs`** (JavaScript puro) numa `worker_thread` | Nem a VPS nem o Windows têm `ffmpeg`. LGPL-3.0, dependência npm. |
| Tom | **Não existe** | O Piper não tem controle de tom. A seção Voz não mostra esse campo. |
| Idioma | **Informativo**, derivado da voz escolhida | Cada voz do Piper é de um só idioma; só há vozes pt-BR (cadu, edresson, faber, jeff). |
| Tarefas | **Em memória** | Reiniciar o app perde tarefas em andamento; o usuário clica de novo. |
| Botão "Áudio" | **Não há nada a remover** | Nunca foi implementado; só resta uma menção na spec antiga `2026-10-31-testes-agenda-ia-design.md` (histórico, não se edita). O item "Voz" do menu lateral, pedido antes, é substituído por este botão. |

## Tela Voz — `/estudo/[id]/voz`

Servidor: `requireUser()`; o Estudo tem de ser do usuário e não estar excluído, senão "Registro não encontrado"
(mesma página de `/estudo/[id]`). Lê o conteúdo e calcula **N** = número de células. A numeração é a mesma que
o editor mostra sob a lixeira (posição + 1).

| Campo | Comportamento |
|---|---|
| Descrição | Somente leitura; a mesma descrição da grade do Estudo. |
| Células | Somente leitura; N. |
| Célula inicial | Editável, inteiro de 1 a N-1. Padrão: 1. |
| Célula final | Editável, inteiro de `inicial + 1` a N. Padrão: N. |
| Ler | Navega para `/estudo/[id]/voz/ler?de=<inicial>&ate=<final>`. |
| Gravar | Cria a tarefa de gravação e acompanha o progresso na própria tela. |

### Validação (módulo único `src/features/voz/range.ts`, sem acesso a banco, usado pela tela, pela página `ler` e pelas rotas)

Mensagens, junto ao campo (`aria-describedby`, `role="alert"` quando aparecem):

- vazio: "Informe a célula inicial." / "Informe a célula final.";
- não inteiro (texto, decimal, negativo, notação científica): "Use um número inteiro.";
- inicial fora da faixa: "A célula inicial deve estar entre 1 e {N-1}.";
- final fora da faixa: "A célula final deve estar entre {inicial+1} e {N}.".

Regras:

- Enquanto qualquer campo for inválido, **Ler** e **Gravar** ficam desabilitados.
- Ao mudar a inicial: se a final ficar `<= inicial`, ela é reajustada para `min(inicial + 1, N)`; depois os dois
  campos são revalidados. A inicial nunca é alterada pela final.
- **Estudo com menos de 2 células** (N = 0 ou 1): a tela abre normalmente, com o aviso "O estudo precisa de pelo
  menos 2 células para usar a Voz." e os campos e botões desabilitados, mais o link "Voltar ao Estudo". O botão
  **Voz** da grade fica sempre ativo, porque saber N ali exigiria ler o conteúdo de todos os registros.
- O servidor repete a validação na página `ler` e nas rotas; valores inválidos na URL de `ler` mostram o erro com
  link de volta, sem tentar corrigir.

### Gravar

- Estados: ocioso → "Na fila" → "Gerando… {feitas} de {total} células" (barra `role="progressbar"` com
  `aria-valuenow`) → "Pronto" com o botão **Baixar MP3** → ou erro.
- **Cancelar** durante fila ou geração interrompe a tarefa e o processo do Piper.
- Erro mostra a mensagem do servidor em pt-BR e permite tentar de novo.
- O download é um `<a download>` para `/api/voz/jobs/[id]/download`, com o nome
  `<Descrição> - células <inicial> a <final>.mp3` (caracteres inválidos em nome de arquivo viram `-`).
- Sair da tela com a tarefa em andamento a cancela (o navegador avisa o servidor; o servidor também cancela por
  inatividade, ver Tarefas).

## Tela Ler — `/estudo/[id]/voz/ler`

- Mostra as células do intervalo, na mesma renderização de leitura do editor (modo `preview`, Markdown e imagens),
  com o número de cada uma.
- Controles: **Tocar/Pausar**, **Anterior**, **Próxima**, e clicar numa célula toca a partir dela.
- A célula que está sendo lida fica destacada e visível (rola até ela).
- O áudio é gerado pela mesma tarefa do Gravar, no modo `ler`; o navegador toca o MP3 de cada célula assim que ela
  fica pronta e já busca a seguinte. Se a reprodução alcançar a geração, mostra "Gerando a próxima célula…".
- Células sem texto falável são mostradas e puladas na leitura.
- Sair da tela para o áudio e cancela a tarefa.

## Configuração — seção "Voz"

Tabela nova `VoiceSettings` (uma linha por usuário, `userId` único, como `AiSettings`):

| Campo | Tipo | Padrão | Faixa |
|---|---|---|---|
| `voice` | texto | `pt_BR-faber-medium` | um id do catálogo de vozes instaladas |
| `speed` | número | 1.0 | 0.5 a 2.0 (passo 0.1) |
| `volume` | número | 1.0 | 0.1 a 2.0 (passo 0.1) |

- Sem linha salva, valem os padrões. Salvar é uma Server Action `saveVoiceSettings`, no padrão das outras
  (`ActionResult`, `getCurrentUserId()`, mensagens em pt-BR), com caso novo em `session-expired.test.ts`.
- O **idioma** aparece como texto ("Português (Brasil)") derivado do id da voz.
- **Catálogo de vozes**: o servidor lista as vozes realmente instaladas (arquivos `*.onnx` + `*.onnx.json` na
  pasta de vozes). O formulário só oferece essas; o servidor rejeita qualquer outra.
- **Ouvir amostra**: botão que gera uma frase curta fixa com os valores do formulário (ainda não salvos) e toca.
- **Ler e Gravar sempre leem a configuração salva do usuário**, no momento em que a tarefa é criada.
- Velocidade vira o parâmetro de duração do Piper (`length_scale = 1 / velocidade`); o nome exato do parâmetro na
  versão 1.8.0 é conferido na Tarefa 1.

## Servidor

### Texto falado — `src/features/voz/speakable.ts` (função pura)

Converte o Markdown de uma célula em texto para fala. Defaults:

- imagens e HTML: omitidos; link: só o texto do link; ênfase e marcadores: removidos;
- títulos: viram uma frase própria (terminam em ponto) para gerar pausa;
- itens de lista: uma frase por item; tabelas: cada linha vira uma frase, células separadas por vírgula;
- bloco de código: lido como "trecho de código" (o conteúdo não é lido);
- quebras de linha viram espaço (o Piper recebe uma célula por linha de entrada); espaços repetidos colapsam.

Resultado vazio (só imagem, só código, célula vazia) = célula **sem texto falável**: pulada, mas conta na
numeração. Se **todas** as células do intervalo forem assim: erro "As células escolhidas não têm texto para ler.".

### Motor — `src/features/voz/engine/`

Interface `SpeechEngine`: dado uma lista `{ n, text }`, as configurações e um `AbortSignal`, devolve cada célula
como WAV à medida que termina (`onCell(n, wav)`).

- `piper.ts`: um processo `python -m piper` por tarefa, lendo uma célula por linha e escrevendo um WAV por célula.
  Argumentos sempre em lista (sem shell); o texto vai por arquivo ou entrada padrão, nunca na linha de comando.
  Prioridade do processo reduzida (`os.setPriority`) para não atrapalhar `atcrm` e `clivet` na VPS.
  **Verificado na Tarefa 1** (com `--help` e teste real): se o Piper 1.8.0 não gravar um arquivo por linha, a saída
  é um processo por célula (mais lento: recarrega o modelo a cada uma).
- `fake.ts`: gera WAV de silêncio de duração proporcional ao texto. Escolhido por `STUDYFLOW_VOZ_ENGINE=fake`,
  **ignorado quando `NODE_ENV=production`**. Serve a testes unitários e ao e2e.
- `catalog.ts`: lista as vozes instaladas e valida ids (sem `/`, `\`, `..`).
- Configuração por ambiente: `STUDYFLOW_VOZ_PYTHON` (executável do Python do ambiente do Piper) e
  `STUDYFLOW_VOZ_DIR` (padrão: `voz` dentro da pasta base do app, `baseFolder()`; contém `venv/`, `voices/` e
  `cache/`). Sem o Piper instalado, a tela Voz mostra "A voz não está instalada neste ambiente." e desabilita
  Ler, Gravar e Amostra; nada quebra.

### MP3 — `src/features/voz/mp3.ts`

Codifica o WAV (16 bits, mono) em MP3 com `@breezystack/lamejs`, dentro de uma `worker_thread`, para não bloquear o
servidor. Entre as células entra um silêncio curto (600 ms) para separá-las. Cada célula vira um MP3 independente;
o arquivo do Gravar é a concatenação dos MP3 das células, na ordem.

### Cache — `src/features/voz/cache.ts`

Em disco, em `<STUDYFLOW_VOZ_DIR>/cache`. Chave: `sha256(voz | velocidade | volume | texto falado)`.
Validade de 24 h e teto de 500 MB (remove os mais antigos); a limpeza roda quando uma tarefa é criada. Reaproveita
células entre Ler, Gravar e repetições.

### Tarefas — `src/features/voz/jobs.ts`

- Registro em memória; **uma tarefa gerando por vez no servidor** (as demais ficam "na fila"), **no máximo uma
  tarefa ativa por usuário** (criar outra devolve "Você já tem uma voz em andamento.").
- **Limite de tamanho**: total de caracteres falados por tarefa (padrão 60 000, ajustável por
  `STUDYFLOW_VOZ_MAX_CHARS`). A Tarefa 1 mede a velocidade do Piper na VPS e fixa o padrão. Acima do limite:
  "O trecho tem {X} caracteres; o limite é {Y}. Escolha menos células.".
- Tempo máximo por tarefa: 20 minutos, depois "A geração demorou demais." e o processo é encerrado.
- Estados: `na-fila`, `gerando`, `pronto`, `erro`, `cancelado`. Cada tarefa guarda `total`, `feitas` e quais células
  estão prontas.
- Tarefa sem consulta de status por 60 s é cancelada (navegador fechado). Tarefa concluída é apagada após 1 hora.

### Rotas (todas exigem sessão; POST e DELETE exigem a mesma origem; a tarefa só é visível ao dono)

| Rota | O que faz |
|---|---|
| `POST /api/voz/jobs` | Corpo JSON `{ studyId, start, end, mode: "ler" \| "gravar" }`. Valida o intervalo (módulo `range.ts`), o limite e a instalação; cria a tarefa; devolve `{ id }`. |
| `GET /api/voz/jobs/[id]` | Estado, `total`, `feitas`, células prontas e mensagem de erro. |
| `GET /api/voz/jobs/[id]/cells/[n]` | MP3 da célula `n`, quando pronta (`audio/mpeg`). |
| `GET /api/voz/jobs/[id]/download` | MP3 completo, só no modo `gravar` e depois de pronto (`Content-Disposition: attachment`). |
| `DELETE /api/voz/jobs/[id]` | Cancela. |
| `POST /api/voz/amostra` | Corpo `{ voice, speed, volume }`; devolve o MP3 da frase de amostra (entra na mesma fila). |

O texto sempre vem do banco, nunca do navegador. Erros devolvem `{ message }` em pt-BR com o status adequado
(400 validação, 401 sem sessão, 403 origem, 404 não encontrado, 409 já em andamento, 503 voz não instalada).

## Instalação e licenças

- `npm run voz:install` (script Node que funciona em Windows e Linux): cria `venv` em `STUDYFLOW_VOZ_DIR`, instala
  `piper-tts` e baixa as vozes pt-BR (`python -m piper.download_voices`). Idempotente.
- **VPS (Ubuntu 24.04)**: hoje tem Python 3.12 mas não tem `pip` nem `venv`; é preciso `apt install python3-venv`
  antes. Esse passo, como o deploy, depende de o usuário permitir o comando ou rodá-lo.
- **Windows**: exige Python instalado; o script avisa se não achar. O `studyflow.bat` do usuário não é alterado
  (fica fora do git); a instalação é o `npm run voz:install` e a documentação no README.
- **Licenças**: o motor Piper é GPL-3.0 (embute espeak-ng, GPLv3) e roda como **processo separado**, instalado nas
  máquinas do próprio usuário, sem ser linkado nem redistribuído pelo StudyFlow. As vozes constam como MIT no
  repositório `rhasspy/piper-voices`; a Tarefa 1 confere o cartão de cada voz instalada. O `lamejs` (LGPL-3.0) é
  usado como dependência npm.

## Testes

- **Unitários**: `range.ts` (casos de borda: vazio, decimal, negativo, `1e2`, inicial = N, final < inicial, N = 0/1/2),
  `speakable.ts`, esquema e ação de configuração (isolamento por usuário, valores fora da faixa, voz não instalada;
  `session-expired` e `user-isolation` com os casos novos), `catalog.ts` (ids maliciosos), `cache.ts`, `mp3.ts`
  (decodifica a saída), `jobs.ts` com o motor falso (fila, uma por usuário, limite, cancelamento, expiração),
  rotas (sessão, origem, dono, intervalo inválido), componentes (validação e reajuste dos campos, estados do Gravar,
  leitor, voz não instalada, botão **Voz** na grade e no cartão do celular).
- **e2e (Playwright)**: com o motor falso: grade → Voz → campos e erros → Gravar → Baixar MP3 → Ler → trocar de
  célula; configuração de voz salva e relida.
- **Manual (roteiro no README)**: Piper de verdade na VPS e no Windows, ouvindo uma amostra e um intervalo.

## Fora do escopo

- Item "Voz" no menu lateral (substituído pelo botão na grade) e o botão "Áudio".
- Controle de tom, vozes de outros idiomas, vozes de nuvem, Web Speech do navegador.
- Persistir tarefas entre reinícios, histórico de áudios gerados, leitura de cards ou de Testes.
- Mexer na regra da pasta base ou em autenticação.

## Entrega

1. Implementação por tarefas na branch `feat/voz`, com revisão de cada tarefa e da branch inteira.
2. Merge na `main` e `git push`.
3. Na VPS: `apt install python3-venv`, `git pull`, `npm ci`, `npx prisma migrate deploy` (há migração nova:
   `VoiceSettings`), `npm run voz:install`, `npm run build`, `pm2 startOrReload ecosystem.config.js && pm2 save` e
   conferência pelo domínio. Cada comando de produção é mostrado antes de rodar.
