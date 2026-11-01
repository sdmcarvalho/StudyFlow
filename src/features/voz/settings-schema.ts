// Configuração de voz por usuário: tipos, padrões e validação. Sem acesso a banco nem a arquivos, para o
// formulário (cliente) e o servidor usarem as mesmas regras. Os arquivos "use server" só exportam funções
// assíncronas, por isso tipos e constantes ficam aqui.

export type VoiceSettings = { voice: string; speed: number; volume: number };

export type VoiceFieldErrors = Partial<Record<keyof VoiceSettings, string>>;

export const DEFAULT_VOICE: string = "pt_BR-faber-medium";
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { voice: DEFAULT_VOICE, speed: 1, volume: 1 };

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;
export const VOLUME_MIN = 0.1;
export const VOLUME_MAX = 1;

export const MSG_VOICE_REQUIRED = "Escolha uma voz.";
export const MSG_VOICE_NOT_INSTALLED = "Voz não instalada.";
const MSG_SPEED = "Use um valor entre 0,5 e 2,0.";
const MSG_VOLUME = "Use um valor entre 0,1 e 1,0.";

export type ParseVoiceSettingsResult =
  | { ok: true; data: VoiceSettings }
  | { ok: false; fieldErrors: VoiceFieldErrors };

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** Valida a entrada da configuração. Só diz se a voz é um texto não vazio; se ela está instalada é
 *  assunto do catálogo (servidor). Números precisam ser `number` finitos: "1" (texto) é recusado. */
export function parseVoiceSettings(input: unknown): ParseVoiceSettingsResult {
  const source: Record<string, unknown> =
    typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

  const fieldErrors: VoiceFieldErrors = {};
  const voice = typeof source.voice === "string" ? source.voice.trim() : "";
  if (voice === "") fieldErrors.voice = MSG_VOICE_REQUIRED;
  if (!inRange(source.speed, SPEED_MIN, SPEED_MAX)) fieldErrors.speed = MSG_SPEED;
  if (!inRange(source.volume, VOLUME_MIN, VOLUME_MAX)) fieldErrors.volume = MSG_VOLUME;

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { voice, speed: source.speed as number, volume: source.volume as number } };
}

const LANGUAGES: Record<string, string> = {
  pt_BR: "Português (Brasil)",
  pt_PT: "Português (Portugal)",
  en_US: "Inglês (Estados Unidos)",
  en_GB: "Inglês (Reino Unido)",
  es_ES: "Espanhol (Espanha)",
  es_MX: "Espanhol (México)",
};

/** Idioma da voz, só para exibir ("pt_BR-faber-medium" → "Português (Brasil)"). */
export function voiceLanguageLabel(voiceId: string): string {
  const separator = voiceId.indexOf("-");
  if (separator <= 0) return "Idioma desconhecido";
  const code = voiceId.slice(0, separator);
  return LANGUAGES[code] ?? code;
}
