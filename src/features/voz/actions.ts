"use server";

import { revalidatePath } from "next/cache";
import { authActionMessage } from "@/lib/auth-response";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { isInstalledVoice } from "./engine/catalog";
import { MSG_VOICE_NOT_INSTALLED, parseVoiceSettings, type VoiceFieldErrors, type VoiceSettings } from "./settings-schema";

export type SaveVoiceSettingsResult =
  | { ok: true; data: VoiceSettings }
  | { ok: false; fieldErrors?: VoiceFieldErrors; message?: string };

const SAVE_FAILED = { ok: false, message: "Não foi possível salvar a configuração." } as const;

/** Salva a configuração de voz do usuário atual. A voz precisa estar instalada (catálogo). */
export async function saveVoiceSettings(input: unknown): Promise<SaveVoiceSettingsResult> {
  const parsed = parseVoiceSettings(input);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const userId = await getCurrentUserId();
    if (!(await isInstalledVoice(parsed.data.voice))) {
      return { ok: false, fieldErrors: { voice: MSG_VOICE_NOT_INSTALLED } };
    }
    const row = await db.voiceSettings.upsert({
      where: { userId },
      update: parsed.data,
      create: { userId, ...parsed.data },
    });
    revalidatePath("/configuracao");
    return { ok: true, data: { voice: row.voice, speed: row.speed, volume: row.volume } };
  } catch (error) {
    const message = authActionMessage(error);
    return message ? { ok: false, message } : SAVE_FAILED;
  }
}
