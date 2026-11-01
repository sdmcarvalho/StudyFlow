// Catálogo das vozes instaladas. Só para o servidor (node:fs). Uma voz é um par `<id>.onnx` +
// `<id>.onnx.json` em `<pasta de voz>/voices`. Ids de voz só entram em caminhos e argumentos depois de
// passar por `isInstalledVoice`: nada que o navegador mande chega ao disco sem essa checagem.
import fs from "node:fs/promises";
import path from "node:path";
import { baseFolder } from "@/features/estudo/folders";

export type VoiceInfo = { id: string; label: string };

const VOICE_ID = /^[A-Za-z0-9_-]+$/;
const MODEL_SUFFIX = ".onnx";
const CONFIG_SUFFIX = ".onnx.json";

/** Pasta da voz: `STUDYFLOW_VOZ_DIR` ou `<pasta base>/voz`. Contém `venv`, `voices` e `cache`. */
export function vozDir(): string {
  const value = process.env.STUDYFLOW_VOZ_DIR?.trim();
  return value ? value : path.join(baseFolder(), "voz");
}

export function voicesDir(): string {
  return path.join(vozDir(), "voices");
}

const QUALITY_LABELS: Record<string, string> = {
  x_low: "muito baixa",
  low: "baixa",
  medium: "média",
  high: "alta",
};

/** Rótulo legível a partir do id: "pt_BR-faber-medium" → "faber (média)". Id fora do padrão vira o próprio id. */
export function voiceLabel(id: string): string {
  const parts = id.split("-");
  if (parts.length < 3) return id;
  const quality = QUALITY_LABELS[parts[parts.length - 1]];
  if (!quality) return id;
  return `${parts.slice(1, -1).join("-")} (${quality})`;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Vozes completas (modelo + configuração) da pasta de vozes, em ordem de id. Pasta ausente = lista vazia. */
export async function listInstalledVoices(): Promise<VoiceInfo[]> {
  const dir = voicesDir();
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const ids = [...files]
    .filter((name) => name.endsWith(MODEL_SUFFIX))
    .map((name) => name.slice(0, -MODEL_SUFFIX.length))
    .filter((id) => VOICE_ID.test(id) && files.has(`${id}${CONFIG_SUFFIX}`))
    .sort();
  return ids.map((id) => ({ id, label: voiceLabel(id) }));
}

/** A voz existe no catálogo? O id precisa ser só letras, números, `_` e `-` (sem `..`, barras nem espaço). */
export async function isInstalledVoice(id: string): Promise<boolean> {
  if (typeof id !== "string" || !VOICE_ID.test(id)) return false;
  const dir = voicesDir();
  return (await isFile(path.join(dir, `${id}${MODEL_SUFFIX}`))) && (await isFile(path.join(dir, `${id}${CONFIG_SUFFIX}`)));
}
