// Cache em disco dos MP3 por célula, em `<pasta de voz>/cache`, reaproveitado entre Ler, Gravar e repetições.
// Só para o servidor. A chave é um sha256 em hexadecimal; nada que não seja isso vira nome de arquivo.
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { vozDir } from "@/features/voz/engine/catalog";
import type { VoiceSettings } from "@/features/voz/settings-schema";

export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CACHE_MAX_BYTES = 500 * 1024 * 1024;

const KEY = /^[0-9a-f]{64}$/;
const SUFFIX = ".mp3";
const FINAL_NAME = /^[0-9a-f]{64}\.mp3$/;
const TEMP_NAME = /^[0-9a-f]{64}\.mp3\.[0-9a-f]+\.tmp$/;

export function cacheDir(): string {
  return path.join(vozDir(), "cache");
}

/** sha256 de voz, velocidade, volume e texto falado. O JSON da lista separa os campos sem ambiguidade. */
export function cacheKey(settings: VoiceSettings, text: string): string {
  const payload = JSON.stringify([settings.voice, settings.speed, settings.volume, text]);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function fileFor(key: string): string | null {
  return KEY.test(key) ? path.join(cacheDir(), `${key}${SUFFIX}`) : null;
}

/** MP3 guardado para a chave, ou `null` (ausente, chave inválida ou erro de leitura). */
export async function cacheGet(key: string): Promise<Buffer | null> {
  const file = fileFor(key);
  if (!file) return null;
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}

/**
 * Guarda o MP3 (arquivo temporário + rename, para quem lê nunca ver um arquivo pela metade). Chave inválida
 * lança erro (é engano de programação); falha de disco é ignorada: o cache é só um atalho.
 */
export async function cachePut(key: string, mp3: Buffer): Promise<void> {
  const file = fileFor(key);
  if (!file) throw new Error("Chave de cache inválida.");
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.mkdir(cacheDir(), { recursive: true });
    await fs.writeFile(temp, mp3);
    await fs.rename(temp, file);
  } catch {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}

/**
 * Limpa o cache: apaga o que tem mais de 24 h (pela data de modificação) e, se o total ainda passar do teto
 * (500 MB), os mais antigos primeiro. Só mexe em arquivos com nome de chave (`<sha256>.mp3` e temporários
 * esquecidos). Erros são ignorados.
 */
export async function cachePrune(
  now: number = Date.now(),
  limits: { maxAgeMs?: number; maxBytes?: number } = {},
): Promise<void> {
  const maxAge = limits.maxAgeMs ?? CACHE_MAX_AGE_MS;
  const maxBytes = limits.maxBytes ?? CACHE_MAX_BYTES;
  const dir = cacheDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }

  const kept: { file: string; size: number; mtime: number; final: boolean }[] = [];
  for (const name of names) {
    const final = FINAL_NAME.test(name);
    if (!final && !TEMP_NAME.test(name)) continue;
    const file = path.join(dir, name);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs > maxAge) await fs.rm(file, { force: true });
      else kept.push({ file, size: stat.size, mtime: stat.mtimeMs, final });
    } catch {
      // Arquivo sumiu ou está em uso: fica para a próxima limpeza.
    }
  }

  let total = kept.reduce((sum, entry) => sum + entry.size, 0);
  kept.sort((a, b) => a.mtime - b.mtime);
  for (const entry of kept) {
    if (total <= maxBytes) break;
    if (!entry.final) continue;
    try {
      await fs.rm(entry.file, { force: true });
      total -= entry.size;
    } catch {
      // Idem.
    }
  }
}
