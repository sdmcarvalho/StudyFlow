import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { DEFAULT_TEMPERATURE, DEFAULT_TIMEOUT, maskKey } from "./schema";
import type { AiSettingsPublic } from "./types";

const EMPTY_SETTINGS: AiSettingsPublic = {
  baseUrl: "",
  apiKeyMasked: "",
  hasKey: false,
  model: "",
  temperature: DEFAULT_TEMPERATURE,
  timeout: DEFAULT_TIMEOUT,
  extraParams: "",
};

export type AiSettingsRow = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeout: number;
  extraParams: string;
};

/** Converte a linha do banco no tipo público: a chave nunca sai, só a versão mascarada. */
export function toPublicSettings(row: AiSettingsRow): AiSettingsPublic {
  return {
    baseUrl: row.baseUrl,
    apiKeyMasked: maskKey(row.apiKey),
    hasKey: row.apiKey !== "",
    model: row.model,
    temperature: row.temperature,
    timeout: row.timeout,
    extraParams: row.extraParams,
  };
}

/** Configuração do usuário atual, com a chave mascarada. Seguro para enviar ao navegador. */
export async function getAiSettings(): Promise<AiSettingsPublic> {
  const userId = await getCurrentUserId();
  const row = await db.aiSettings.findUnique({ where: { userId } });
  return row ? toPublicSettings(row) : { ...EMPTY_SETTINGS };
}

/** Inclui a chave inteira. Uso exclusivo do servidor: nunca devolver este valor ao navegador. */
export async function getAiSettingsWithKey(): Promise<AiSettingsPublic & { apiKey: string }> {
  const userId = await getCurrentUserId();
  const row = await db.aiSettings.findUnique({ where: { userId } });
  return row ? { ...toPublicSettings(row), apiKey: row.apiKey } : { ...EMPTY_SETTINGS, apiKey: "" };
}
