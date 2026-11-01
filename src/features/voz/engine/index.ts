// Escolha do motor de voz. Só para o servidor.
// - STUDYFLOW_VOZ_ENGINE=fake: motor falso (só testes e e2e definem; o e2e roda `next start`, então o
//   NODE_ENV não serve de trava);
// - senão, Piper se STUDYFLOW_VOZ_PYTHON aponta um arquivo que existe e há ao menos uma voz instalada;
// - senão, `null` (voz não instalada neste ambiente).
import fs from "node:fs/promises";
import { listInstalledVoices } from "./catalog";
import { FakeEngine } from "./fake";
import { defaultPiperCommand, PiperEngine } from "./piper";
import type { SpeechEngine } from "./types";

export async function getEngine(): Promise<SpeechEngine | null> {
  if (process.env.STUDYFLOW_VOZ_ENGINE === "fake") return new FakeEngine();
  const python = process.env.STUDYFLOW_VOZ_PYTHON?.trim();
  if (!python) return null;
  try {
    if (!(await fs.stat(python)).isFile()) return null;
  } catch {
    return null;
  }
  if ((await listInstalledVoices()).length === 0) return null;
  return new PiperEngine({ ...defaultPiperCommand(), file: python });
}
