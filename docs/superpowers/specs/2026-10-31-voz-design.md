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
  variável que só testes e e2e definem. O e2e roda `next start` (`NODE_ENV=production`), então a trava não pode
  ser o `NODE_ENV`: `ecosystem.config.js` nunca define a variável, e um teste unitário garante isso.
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

## Resultados da Tarefa 1

Medido no Windows 10 (Ryzen 7 2700, 16 threads), com `piper-tts` 1.8.0 num venv do Python 3.14.6 (o `onnxruntime`
1.31.1 tem wheel `cp314`, então o Python local serve; nada a instalar no sistema), rodando o `python -m piper` de
verdade e lendo o `__main__.py` instalado. Não foi possível ouvir: a checagem é por duração e tamanho do WAV (uma
frase de 70 caracteres deu 3,6 a 5,2 s, ou seja, 14 a 20 caracteres por segundo de áudio, coerente com o esperado).

**Decisão: o Piper 1.8.0 grava um WAV por linha de entrada. Não é preciso o plano B (um processo por célula).**
O plano B só valeria se isso falhasse; fica registrado porque o carregamento do modelo é caro (ver abaixo).

### Linha de comando que a Tarefa 4 usa

```
<STUDYFLOW_VOZ_PYTHON> -I -m piper -m <id-da-voz> --data-dir <STUDYFLOW_VOZ_DIR>/voices \
    -i <arquivo-de-celulas.txt> -d <pasta-de-saida> \
    --length-scale <1/velocidade> --volume <volume> --sentence-silence <segundos>
```

| Assunto | Resultado verificado |
|---|---|
| Velocidade | `--length-scale` (também `--length_scale`), float. Valores menores falam mais rápido: 0,5 deu 2,40 s, 1,0 deu 3,59 s e 2,0 deu 6,46 s para a mesma frase. A relação **não é linear** (as pausas não escalam), então `length_scale = 1 / velocidade` é uma regra aproximada. Sem a flag vale o `inference.length_scale` do `.onnx.json` (1.0). |
| Volume | `--volume` (padrão 1,0). **Por padrão o áudio é normalizado** para o pico de 32767: `--volume 0.25` deu pico 8191 (certo), mas `--volume 2.0` continua em 32767 (**satura**, não fica mais alto). Volume acima de 1,0 só funciona junto com `--no-normalize` (aí `--volume 1.0` dá pico ≈ 16642 e `--volume 1.5` dá ≈ 24995, sem saturar até ≈ 1,97). **Pendência para as Tarefas 4 e 7:** a faixa 0,1 a 2,0 da spec não funciona sem tratar isso. Opções: limitar o volume a 1,0, ou usar sempre `--no-normalize --volume <volume>` (então 1,0 fica com metade da escala, e 2,0 chega ao máximo). Decisão do controlador. |
| Silêncio entre frases | `--sentence-silence <segundos>` (também `--sentence_silence`), padrão 0. Vale **entre as frases de uma mesma linha** (não depois da última): 3 frases com 1,0 deram +2,2 s. Não separa as células entre si (isso é o silêncio de 600 ms do `mp3.ts`). |
| Um WAV por linha | **Sim**: `-d/--output-dir <pasta>` (cria a pasta). Cada linha não vazia da entrada vira um WAV. Linhas vazias ou só de espaços são **ignoradas** (não geram arquivo), então o índice do arquivo não é o índice da linha se houver linha vazia: a Tarefa 4 só deve enviar células com texto falável, uma por linha. |
| Nome dos arquivos | Padrão `--output-dir-naming timestamp`: `<time.monotonic_ns()>.wav`, crescente na ordem das linhas (verificado). Não use `--output-dir-naming text` (o nome vira o texto da linha: estoura o limite de nome de arquivo e sobrescreve linhas repetidas). **Mapeamento linha para arquivo:** ler da saída de erro (stderr) as linhas `INFO:__main__:Wrote <caminho>.wav`, uma por linha concluída, na ordem; isso também dá o progresso e o "à medida que termina" do `onCell`. Alternativa: ordenar numericamente os nomes. Nada sai em stdout. |
| Como passar o texto | `-i/--input-file <arquivo>` (repetível), lido como **UTF-8** em qualquer sistema. Sem `-i`, o Piper lê a **entrada padrão** (stdin), que no Windows usa a codificação do console (risco com acentos): **usar `-i`**. Texto como argumento solto também funciona, mas é proibido pela spec. |
| Várias linhas | Cada linha é sintetizada separadamente e vira um WAV; cada linha passa por `strip()`. Por isso o texto falado de uma célula tem de ser **uma linha só** (sem `\n`, `\r`, `\0`). |
| **Linha sem fonema derruba o Piper** | Uma linha só de pontuação (`...`, `---`, `!`) faz o processo terminar com **código 1** (`wave.Error: # channels not specified`), deixando um **WAV de 0 byte** e **abortando as linhas seguintes**. Já `12345`, `*`, `€`, `a`, `(x)` e um emoji são falados normalmente. **Exigência para `speakable.ts` e `piper.ts` (Tarefas 3 e 4):** tratar como "sem texto falável" qualquer célula sem ao menos uma letra ou dígito Unicode (`\p{L}` ou `\p{N}`); e, se o Piper sair com código diferente de 0 ou deixar um WAV vazio, a tarefa dá erro em pt-BR. |
| Formato do WAV | PCM, **mono, 16 bits**. **A taxa depende da voz**: faber, cadu e jeff = 22 050 Hz; **edresson-low = 16 000 Hz**. O `mp3.ts` deve ler a taxa do cabeçalho de cada WAV (e calcular o silêncio de 600 ms com ela), nunca fixar 22 050. |
| Modelo e configuração | `-m` aceita o **id da voz** quando `--data-dir` aponta a pasta; o `.onnx.json` vizinho é lido sozinho (`-c` não é necessário). `--data-dir` é repetível e, se omitido, procura na pasta atual. Voz inexistente: `ValueError: Unable to find voice`. |
| Outras flags | `-s/--speaker` (as quatro vozes têm 1 falante), `--noise-scale`, `--noise-w-scale`, `--cuda`, `--debug`, `-f/--output-file` (concatena tudo num WAV só), `--output-raw`. O `-I` do Python (modo isolado) funciona com o venv. |

### Velocidade de geração (fator de tempo real)

Medição **indicativa, local, nesta máquina do Windows (8 núcleos, 16 threads), voz `pt_BR-faber-medium`;
não representa a VPS de 2 CPUs compartilhada**.

- **Carregar o modelo**: ≈ 9,4 s por processo aqui. É o que torna o plano B caro (pagaria isso a cada célula).
- Texto de 5 017 caracteres em 22 linhas de 200 a 280 caracteres: 278,5 s de áudio (≈ 18 caracteres por segundo
  de áudio) em 32 s de tempo total do processo, dos quais ≈ 22 s de geração. **Fator de tempo real ≈ 0,08** só
  na geração (≈ 0,115 contando o carregamento), ou seja, ≈ 230 caracteres gerados por segundo de relógio.
- Extrapolação **só ilustrativa**: nesse ritmo, 60 000 caracteres levariam ≈ 4 a 5 minutos neste PC. A VPS de
  2 CPUs, compartilhada com `atcrm` e `clivet` e com prioridade reduzida, será várias vezes mais lenta.

### `MAX_CHARS` padrão

**60 000 caracteres** (valor da spec, mantido), **a confirmar na VPS**. A medição na VPS (≈ 5 000 caracteres em
2 CPUs, para fixar um limite de ≈ 10 minutos de geração dentro do teto de 20) não foi feita nesta tarefa, por
ordem do controlador: a VPS é produção compartilhada e não foi tocada. Se a VPS ficar abaixo de ≈ 100 caracteres
por segundo de relógio, reduzir o padrão (por exemplo, 100 × 600 s = 60 000 é o limite para 10 minutos nesse
ritmo); o valor é ajustável por `STUDYFLOW_VOZ_MAX_CHARS`.

### Licenças lidas (cartões `MODEL_CARD` em `huggingface.co/rhasspy/piper-voices`, pasta `pt/pt_BR/<voz>/<qualidade>`)

| Voz | Conjunto de dados | Licença do cartão | Observação |
|---|---|---|---|
| `pt_BR-faber-medium` | OHF-Voice/voice-datasets | **CC0** (domínio público) | Permissiva. |
| `pt_BR-cadu-medium` | OHF-Voice/voice-datasets | **CC0** | Permissiva. |
| `pt_BR-jeff-medium` | OHF-Voice/voice-datasets | **CC0** | Permissiva. |
| `pt_BR-edresson-low` | Edresson/TTS-Portuguese-Corpus | **CC BY 4.0** | Permissiva, mas **exige atribuição** ao autor do corpus (citar no README). Qualidade "low" (16 kHz). |

O repositório `rhasspy/piper-voices` declara `license: mit` no README. As vozes são ajustadas ("finetuned") a partir
das vozes em inglês `lessac` (faber, cadu, jeff) e `ryan` (edresson), cujos conjuntos de dados têm termos próprios
que **não** foram auditados aqui. Nenhuma das quatro é não permissiva: **todas ficam na lista padrão**, com a
atribuição do corpus Edresson (CC BY 4.0) no README.

### Instalação (`npm run voz:install`)

`scripts/voz-install.mjs` (pasta: `--dir`, `STUDYFLOW_VOZ_DIR` ou `<STUDYFLOW_BASE_DIR | C:\StudyFlow | /var/lib/studyflow>/voz`;
Python do sistema que cria o venv: `--python` ou `STUDYFLOW_VOZ_SYSTEM_PYTHON`) cria `venv/`, `voices/` e `cache/`,
instala `piper-tts==1.8.0` e baixa as quatro vozes com `python -m piper.download_voices --data-dir <dir>/voices <voz>`.
Idempotente (a segunda execução pula tudo). No Windows leva ≈ 1 minuto.
