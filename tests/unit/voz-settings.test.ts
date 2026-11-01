// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { revalidatePath } from "next/cache";
import { saveVoiceSettings } from "@/features/voz/actions";
import { getVoiceSettings } from "@/features/voz/queries";
import {
  DEFAULT_VOICE_SETTINGS,
  parseVoiceSettings,
  voiceLanguageLabel,
} from "@/features/voz/settings-schema";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

const VOICE = "pt_BR-faber-medium";

/** Apaga tudo que referencia User (o banco de teste é compartilhado; outro arquivo pode ter deixado linhas). */
async function clearUsers() {
  await db.schedule.deleteMany();
  await db.cardResult.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.voiceSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

const ok = (over: Record<string, unknown> = {}) => parseVoiceSettings({ voice: VOICE, speed: 1, volume: 1, ...over });

describe("parseVoiceSettings", () => {
  it("padrões: faber-medium, velocidade 1 e volume 1", () => {
    expect(DEFAULT_VOICE_SETTINGS).toEqual({ voice: "pt_BR-faber-medium", speed: 1, volume: 1 });
  });

  it("aceita os limites de velocidade (0,5 a 2,0)", () => {
    expect(ok({ speed: 0.5 })).toEqual({ ok: true, data: { voice: VOICE, speed: 0.5, volume: 1 } });
    expect(ok({ speed: 2 })).toEqual({ ok: true, data: { voice: VOICE, speed: 2, volume: 1 } });
  });

  it("aceita os limites de volume (0,1 a 1,0)", () => {
    expect(ok({ volume: 0.1 })).toEqual({ ok: true, data: { voice: VOICE, speed: 1, volume: 0.1 } });
    expect(ok({ volume: 1 })).toEqual({ ok: true, data: { voice: VOICE, speed: 1, volume: 1 } });
  });

  it.each([0.4, 2.1, -1, 0])("recusa velocidade %s com a mensagem junto ao campo", (speed) => {
    const result = ok({ speed });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.speed).toBe("Use um valor entre 0,5 e 2,0.");
      expect(result.fieldErrors.volume).toBeUndefined();
      expect(result.fieldErrors.voice).toBeUndefined();
    }
  });

  it.each([0.09, 1.1, 2, 0])("recusa volume %s com a mensagem junto ao campo", (volume) => {
    const result = ok({ volume });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors.volume).toBe("Use um valor entre 0,1 e 1,0.");
      expect(result.fieldErrors.speed).toBeUndefined();
    }
  });

  it.each([Number.NaN, Infinity, -Infinity, "1", "", null, undefined, true, [1]])(
    "recusa velocidade e volume que não são números finitos (%s)",
    (value) => {
      const result = ok({ speed: value, volume: value });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.fieldErrors.speed).toBeTruthy();
        expect(result.fieldErrors.volume).toBeTruthy();
      }
    },
  );

  it.each([undefined, null, "", "  ", 3, {}])("recusa voz inválida (%j)", (voice) => {
    const result = ok({ voice });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.voice).toBe("Escolha uma voz.");
  });

  it.each([null, undefined, "x", 3, []])("entrada que não é objeto (%j) devolve erro em todos os campos", (input) => {
    const result = parseVoiceSettings(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["speed", "voice", "volume"]);
  });

  it("ignora campos extras", () => {
    expect(ok({ extra: "x" })).toEqual({ ok: true, data: { voice: VOICE, speed: 1, volume: 1 } });
  });
});

describe("voiceLanguageLabel", () => {
  it("pt_BR vira Português (Brasil)", () => {
    expect(voiceLanguageLabel("pt_BR-faber-medium")).toBe("Português (Brasil)");
  });
  it("outros idiomas conhecidos e desconhecidos", () => {
    expect(voiceLanguageLabel("pt_PT-tugao-medium")).toBe("Português (Portugal)");
    expect(voiceLanguageLabel("xx_YY-nome-low")).toBe("xx_YY");
    expect(voiceLanguageLabel("semtraco")).toBe("Idioma desconhecido");
  });
});

describe("saveVoiceSettings / getVoiceSettings", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-settings-"));
    await fs.mkdir(path.join(dir, "voices"), { recursive: true });
    for (const id of [VOICE, "pt_BR-edresson-low"]) {
      await fs.writeFile(path.join(dir, "voices", `${id}.onnx`), "x");
      await fs.writeFile(path.join(dir, "voices", `${id}.onnx.json`), "{}");
    }
    vi.stubEnv("STUDYFLOW_VOZ_DIR", dir);
  });

  afterAll(async () => {
    await clearUsers();
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    vi.mocked(revalidatePath).mockClear();
    await clearUsers();
    signOut();
    await signInAs(await createTestUser());
  });

  it("sem linha, getVoiceSettings devolve os padrões", async () => {
    expect(await getVoiceSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("grava, relê e revalida /configuracao", async () => {
    const result = await saveVoiceSettings({ voice: "pt_BR-edresson-low", speed: 1.5, volume: 0.4 });
    expect(result).toEqual({ ok: true, data: { voice: "pt_BR-edresson-low", speed: 1.5, volume: 0.4 } });
    expect(await getVoiceSettings()).toEqual({ voice: "pt_BR-edresson-low", speed: 1.5, volume: 0.4 });
    expect(revalidatePath).toHaveBeenCalledWith("/configuracao");
  });

  it("a segunda gravação atualiza a mesma linha (upsert)", async () => {
    await saveVoiceSettings({ voice: VOICE, speed: 1, volume: 1 });
    const first = await db.voiceSettings.findFirstOrThrow();
    await saveVoiceSettings({ voice: VOICE, speed: 2, volume: 0.5 });
    expect(await db.voiceSettings.count()).toBe(1);
    const second = await db.voiceSettings.findFirstOrThrow();
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ speed: 2, volume: 0.5 });
  });

  it("recusa voz fora do catálogo com erro no campo voice e não grava", async () => {
    for (const voice of ["pt_BR-nao-instalada-medium", "../x", "a/b"]) {
      expect(await saveVoiceSettings({ voice, speed: 1, volume: 1 })).toEqual({
        ok: false,
        fieldErrors: { voice: "Voz não instalada." },
      });
    }
    expect(await db.voiceSettings.count()).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("valores fora da faixa voltam como erro do campo e não gravam", async () => {
    const result = await saveVoiceSettings({ voice: VOICE, speed: 2.1, volume: 1.1 });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { speed: "Use um valor entre 0,5 e 2,0.", volume: "Use um valor entre 0,1 e 1,0." },
    });
    expect(await db.voiceSettings.count()).toBe(0);
  });

  it("getVoiceSettings devolve a linha gravada mesmo que a voz tenha sido removida do catálogo", async () => {
    const user = await db.user.findFirstOrThrow();
    await db.voiceSettings.create({ data: { userId: user.id, voice: "pt_BR-sumiu-medium", speed: 1.2, volume: 0.8 } });
    expect(await getVoiceSettings()).toEqual({ voice: "pt_BR-sumiu-medium", speed: 1.2, volume: 0.8 });
  });

  it("apagar o usuário apaga a configuração de voz (cascata)", async () => {
    await saveVoiceSettings({ voice: VOICE, speed: 1, volume: 1 });
    await db.session.deleteMany();
    await db.user.deleteMany();
    expect(await db.voiceSettings.count()).toBe(0);
  });
});
