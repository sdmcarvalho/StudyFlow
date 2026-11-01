// Instala o Piper (TTS local) num venv próprio e baixa as vozes pt-BR do recurso "Voz".
// Funciona em Windows e Linux. Idempotente: pula o que já existe.
//
//   npm run voz:install                       (pasta padrão: <pasta base do app>/voz)
//   npm run voz:install -- --dir D:\voz       (ou STUDYFLOW_VOZ_DIR)
//   npm run voz:install -- --python py        (ou STUDYFLOW_VOZ_SYSTEM_PYTHON: Python usado para criar o venv)
//
// Layout em <dir>: venv/, voices/, cache/.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const PIPER_PACKAGE = "piper-tts==1.8.0";
export const DEFAULT_VOICES = [
  "pt_BR-faber-medium",
  "pt_BR-cadu-medium",
  "pt_BR-edresson-low",
  "pt_BR-jeff-medium",
];
export const MIN_PYTHON = [3, 9];

function isWindows(platform) {
  return platform === "win32";
}

/** Junta partes com o separador do sistema de destino (puro: não depende de onde o teste roda). */
function joinFor(platform, ...parts) {
  const sep = isWindows(platform) ? "\\" : "/";
  const [first, ...rest] = parts;
  let out = first.replace(/[\\/]+$/, "");
  for (const part of rest) out += sep + part;
  return out;
}

/**
 * Plano de instalação (puro). O script executa cada comando com `spawn` e lista de argumentos, sem shell.
 * `systemPython` é o Python que cria o venv (padrão: `python` no Windows, `python3` no resto).
 * @param {{ platform: string, dir: string, voices?: string[], systemPython?: string }} options
 * @returns {{ python: string, venvCmd: string[], pipCmd: string[], voiceCmds: string[][] }}
 */
export function planInstall({ platform, dir, voices = DEFAULT_VOICES, systemPython }) {
  const venvDir = joinFor(platform, dir, "venv");
  const voicesDir = joinFor(platform, dir, "voices");
  const python = isWindows(platform)
    ? joinFor(platform, venvDir, "Scripts", "python.exe")
    : joinFor(platform, venvDir, "bin", "python");
  const base = systemPython ?? (isWindows(platform) ? "python" : "python3");
  return {
    python,
    venvCmd: [base, "-m", "venv", venvDir],
    pipCmd: [python, "-m", "pip", "install", PIPER_PACKAGE],
    voiceCmds: voices.map((voice) => [python, "-m", "piper.download_voices", "--data-dir", voicesDir, voice]),
  };
}

function defaultBaseDir(platform) {
  const fromEnv = process.env.STUDYFLOW_BASE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return isWindows(platform) ? "C:\\StudyFlow" : "/var/lib/studyflow";
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir" && argv[i + 1]) out.dir = argv[++i];
    else if (argv[i] === "--python" && argv[i + 1]) out.python = argv[++i];
  }
  return out;
}

/** Executa um comando (lista de argumentos, sem shell). Resolve { code, stdout }. */
function run(cmd, { inherit = false } = {}) {
  return new Promise((resolve) => {
    let stdout = "";
    let child;
    try {
      child = spawn(cmd[0], cmd.slice(1), { stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"], shell: false });
    } catch (error) {
      resolve({ code: -1, stdout: "", error });
      return;
    }
    if (!inherit) {
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stdout += chunk));
    }
    child.on("error", (error) => resolve({ code: -1, stdout, error }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout }));
  });
}

async function pythonVersion(cmd) {
  const result = await run([cmd, "-c", "import sys;print('%d.%d' % sys.version_info[:2])"]);
  if (result.code !== 0) return null;
  const match = /(\d+)\.(\d+)/.exec(result.stdout);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function fail(message) {
  console.error(`\nErro: ${message}`);
  process.exit(1);
}

async function step(title, cmd) {
  console.log(`\n> ${title}`);
  const result = await run(cmd, { inherit: true });
  if (result.code !== 0) fail(`falhou: ${title}.`);
}

async function main() {
  const platform = process.platform;
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir ?? process.env.STUDYFLOW_VOZ_DIR?.trim() ?? joinFor(platform, defaultBaseDir(platform), "voz");
  const systemPython = args.python ?? process.env.STUDYFLOW_VOZ_SYSTEM_PYTHON?.trim() ?? undefined;
  const plan = planInstall({ platform, dir, systemPython });
  const base = plan.venvCmd[0];

  console.log(`Pasta da Voz: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(joinFor(platform, dir, "voices"), { recursive: true });
  fs.mkdirSync(joinFor(platform, dir, "cache"), { recursive: true });

  if (fs.existsSync(plan.python)) {
    console.log("venv já existe: pulando a criação.");
  } else {
    const version = await pythonVersion(base);
    if (!version) {
      fail(
        `não encontrei "${base}". Instale o Python ${MIN_PYTHON.join(".")} ou mais novo ` +
          (isWindows(platform) ? "(python.org, marcando \"Add python.exe to PATH\")" : "(apt install python3 python3-venv)") +
          " ou indique outro com --python / STUDYFLOW_VOZ_SYSTEM_PYTHON.",
      );
    }
    if (version[0] < MIN_PYTHON[0] || (version[0] === MIN_PYTHON[0] && version[1] < MIN_PYTHON[1])) {
      fail(`o Python ${version.join(".")} é velho demais; o Piper pede ${MIN_PYTHON.join(".")} ou mais novo.`);
    }
    const created = await run(plan.venvCmd);
    if (created.code !== 0 || !fs.existsSync(plan.python)) {
      console.error(created.stdout);
      fail(
        isWindows(platform)
          ? "não consegui criar o ambiente virtual (venv). Reinstale o Python incluindo o módulo venv."
          : "não consegui criar o ambiente virtual (venv). Instale o módulo: apt install python3-venv",
      );
    }
    console.log("venv criado.");
  }

  const installed = await run([plan.python, "-m", "pip", "show", "piper-tts"]);
  if (installed.code === 0 && /^Version:\s*1\.8\.0\s*$/m.test(installed.stdout)) {
    console.log("piper-tts 1.8.0 já instalado: pulando.");
  } else {
    await step(`instalando ${PIPER_PACKAGE}`, plan.pipCmd);
  }

  for (const cmd of plan.voiceCmds) {
    const voice = cmd[cmd.length - 1];
    const voicesDir = cmd[cmd.length - 2];
    const model = joinFor(platform, voicesDir, `${voice}.onnx`);
    if (fs.existsSync(model) && fs.existsSync(`${model}.json`)) {
      console.log(`voz ${voice} já baixada: pulando.`);
      continue;
    }
    await step(`baixando a voz ${voice}`, cmd);
  }

  console.log(`\nPronto. Para o app usar esta instalação: STUDYFLOW_VOZ_DIR=${dir}`);
  console.log(`Python do venv (STUDYFLOW_VOZ_PYTHON): ${plan.python}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
