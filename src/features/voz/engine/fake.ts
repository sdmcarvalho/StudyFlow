// Motor falso: silêncio de duração proporcional ao texto (60 ms por caractere, no mínimo 200 ms), a 22 050 Hz,
// sempre igual para o mesmo texto. Só testes e e2e o escolhem (STUDYFLOW_VOZ_ENGINE=fake).
import type { VoiceSettings } from "@/features/voz/settings-schema";
import { silenceWav } from "@/features/voz/wav";
import { speakableItems, VoiceCancelledError, type SpeechEngine, type SpeechItem } from "./types";

const MS_PER_CHAR = 60;
const MIN_MS = 200;

export class FakeEngine implements SpeechEngine {
  async synthesize(
    items: SpeechItem[],
    _settings: VoiceSettings,
    signal: AbortSignal,
    onCell: (n: number, wav: Buffer) => void,
  ): Promise<void> {
    for (const item of speakableItems(items)) {
      // Cede a vez a cada célula, como um motor de verdade, para o cancelamento poder chegar.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (signal.aborted) throw new VoiceCancelledError();
      onCell(item.n, silenceWav(Math.max(MIN_MS, item.text.length * MS_PER_CHAR)));
    }
    if (signal.aborted) throw new VoiceCancelledError();
  }
}
