// Escolha do motor de voz. Só para o servidor.
// - STUDYFLOW_VOZ_ENGINE=fake: motor falso (só testes e e2e definem; o e2e roda `next start`, então o
//   NODE_ENV não serve de trava);
// - senão, Piper se o Python existe e há ao menos uma voz instalada. O Python é STUDYFLOW_VOZ_PYTHON, se
//   definido e não vazio; senão, o do venv criado por `npm run voz:install` (`<pasta de voz>/venv/...`, R16);
// - senão, `null` (voz não instalada neste ambiente).
import fs from "node:fs/promises";
import { listInstalledVoices } from "./catalog";
import { FakeEngine } from "./fake";
import { defaultPiperCommand, PiperEngine } from "./piper";
import type { SpeechEngine } from "./types";

export async function getEngine(): Promise<SpeechEngine | null> {
  if (process.env.STUDYFLOW_VOZ_ENGINE === "fake") return new FakeEngine();
  const command = defaultPiperCommand();
  try {
    if (!(await fs.stat(command.file)).isFile()) return null;
  } catch {
    return null;
  }
  if ((await listInstalledVoices()).length === 0) return null;
  return new PiperEngine(command);
}
