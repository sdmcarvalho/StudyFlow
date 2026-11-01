import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "./settings-schema";

/** Configuração de voz do usuário atual, ou os padrões se ele ainda não salvou. Não checa se a voz está
 *  instalada: quem gera o áudio é que responde 503 nesse caso. */
export async function getVoiceSettings(): Promise<VoiceSettings> {
  const userId = await getCurrentUserId();
  const row = await db.voiceSettings.findUnique({ where: { userId } });
  return row ? { voice: row.voice, speed: row.speed, volume: row.volume } : { ...DEFAULT_VOICE_SETTINGS };
}
