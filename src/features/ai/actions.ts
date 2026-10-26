"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toPublicSettings } from "./queries";
import { parseAiSettingsInput } from "./schema";
import type { AiFieldErrors, AiSettingsPublic } from "./types";

export type SaveAiSettingsResult =
  | { ok: true; data: AiSettingsPublic }
  | { ok: false; fieldErrors?: AiFieldErrors; message?: string };

const SAVE_FAILED = { ok: false, message: "Não foi possível salvar a configuração." } as const;

/** Salva a configuração do usuário atual. `apiKey` vazia mantém a chave guardada; o retorno nunca contém a chave. */
export async function saveAiSettings(input: unknown): Promise<SaveAiSettingsResult> {
  const parsed = parseAiSettingsInput(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  const { apiKey, ...rest } = parsed.data;
  try {
    const userId = await getCurrentUserId();
    const row = await db.aiSettings.upsert({
      where: { userId },
      update: { ...rest, ...(apiKey !== "" ? { apiKey } : {}) },
      create: { userId, ...rest, apiKey },
    });
    revalidatePath("/configuracao");
    return { ok: true, data: toPublicSettings(row) };
  } catch {
    return SAVE_FAILED;
  }
}
