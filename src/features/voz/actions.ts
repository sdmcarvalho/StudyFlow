"use server";

import { revalidatePath } from "next/cache";
import { authActionMessage } from "@/lib/auth-response";
import { assertSuperuser, getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { clearAudioCache } from "./cache";
import { isInstalledVoice } from "./engine/catalog";
import { discardAllJobs } from "./jobs";
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

export type ClearAudiosResult =
  | { ok: true; data: { files: number; bytes: number } }
  | { ok: false; message: string };

const CLEAR_FAILED = { ok: false, message: "Não foi possível limpar os áudios." } as const;

/**
 * Só o superusuário: apaga todos os MP3 do cache em disco e descarta as tarefas de voz de todos os usuários
 * (as ativas são canceladas). Não mexe no Piper, nas vozes nem nos Estudos.
 */
export async function clearAudios(): Promise<ClearAudiosResult> {
  try {
    await assertSuperuser();
    discardAllJobs();
    return { ok: true, data: await clearAudioCache() };
  } catch (error) {
    const message = authActionMessage(error);
    return message ? { ok: false, message } : CLEAR_FAILED;
  }
}
