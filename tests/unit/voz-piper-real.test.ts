// @vitest-environment node
// Teste opcional com o Piper de verdade. Só roda com STUDYFLOW_VOZ_PYTHON (Python do venv do Piper) e
// STUDYFLOW_VOZ_DIR (pasta com `voices/`) definidos, por exemplo depois de `npm run voz:install`.
import { describe, expect, it } from "vitest";
import { PiperEngine } from "@/features/voz/engine/piper";
import { parseWav } from "@/features/voz/wav";

const RATES: Record<string, number> = {
  "pt_BR-faber-medium": 22050,
  "pt_BR-edresson-low": 16000,
};

describe.skipIf(!process.env.STUDYFLOW_VOZ_PYTHON)("Piper de verdade", () => {
  it.each(Object.keys(RATES))("%s sintetiza duas células pt-BR", async (voice) => {
    const got: { n: number; wav: Buffer }[] = [];
    await new PiperEngine().synthesize(
      [
        { n: 1, text: "Olá, esta é a primeira célula." },
        { n: 2, text: "E esta é a segunda, com acentuação: ação, coração e pé." },
      ],
      { voice, speed: 1, volume: 1 },
      new AbortController().signal,
      (n, wav) => got.push({ n, wav }),
    );
    expect(got.map((g) => g.n)).toEqual([1, 2]);
    for (const { wav } of got) {
      const parsed = parseWav(wav);
      expect(parsed.sampleRate).toBe(RATES[voice]);
      expect(parsed.samples.length).toBeGreaterThan(parsed.sampleRate);
      expect(parsed.samples.some((s) => s !== 0)).toBe(true);
    }
  }, 120_000);
});
