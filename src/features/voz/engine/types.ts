// Contrato dos motores de voz (Piper e falso). Só para o servidor.
import type { VoiceSettings } from "@/features/voz/settings-schema";

/** Uma célula a falar: `n` é o número da célula no Estudo, `text` o texto falado (uma linha). */
export type SpeechItem = { n: number; text: string };

export type SpeechEngine = {
  /**
   * Sintetiza os itens na ordem e entrega cada um como WAV (PCM mono 16 bits) assim que fica pronto.
   * Itens sem letra nem dígito são pulados (não recebem `onCell`). Rejeita com `VoiceError` em falha e com
   * `VoiceCancelledError` (subclasse) quando `signal` aborta; depois de abortar, `onCell` não é mais chamado.
   */
  synthesize(
    items: SpeechItem[],
    settings: VoiceSettings,
    signal: AbortSignal,
    onCell: (n: number, wav: Buffer) => void,
  ): Promise<void>;
};

export const MSG_VOICE_FAILED = "A geração de voz falhou.";
export const MSG_VOICE_CANCELLED = "Geração cancelada.";

/** Erro com mensagem em pt-BR segura para mostrar ao usuário (sem detalhe interno). */
export class VoiceError extends Error {
  constructor(message: string = MSG_VOICE_FAILED) {
    super(message);
    this.name = "VoiceError";
  }
}

/** A geração foi cancelada pelo `AbortSignal`. */
export class VoiceCancelledError extends VoiceError {
  constructor() {
    super(MSG_VOICE_CANCELLED);
    this.name = "VoiceCancelledError";
  }
}

// O Piper lê uma célula por linha: separadores de linha (inclusive os que o Python reconhece) e o NUL viram
// espaço. Linha sem letra nem dígito derruba o Piper 1.8.0 (só pontuação) ou é ignorada por ele (vazia),
// o que deslocaria o mapeamento linha → arquivo; por isso essas células nunca são enviadas.
const LINE_BREAKS = /[\r\n\v\f\0\x1c-\x1e\x85\u2028\u2029]/g;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Itens prontos para o motor: texto numa linha só e só os que têm letra ou dígito (os demais saem). */
export function speakableItems(items: SpeechItem[]): SpeechItem[] {
  return items
    .map((item) => ({ n: item.n, text: item.text.replace(LINE_BREAKS, " ") }))
    .filter((item) => HAS_LETTER_OR_DIGIT.test(item.text));
}
