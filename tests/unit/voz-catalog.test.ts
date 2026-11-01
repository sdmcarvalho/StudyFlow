// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isInstalledVoice, listInstalledVoices, vozDir, voiceLabel } from "@/features/voz/engine/catalog";

let dir: string;
let voices: string;

async function install(id: string, parts: ("onnx" | "json")[] = ["onnx", "json"]) {
  if (parts.includes("onnx")) await fs.writeFile(path.join(voices, `${id}.onnx`), "x");
  if (parts.includes("json")) await fs.writeFile(path.join(voices, `${id}.onnx.json`), "{}");
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-"));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  voices = path.join(dir, "voices");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(voices, { recursive: true });
  vi.stubEnv("STUDYFLOW_VOZ_DIR", dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("vozDir", () => {
  it("usa STUDYFLOW_VOZ_DIR (sem espaços nas pontas)", () => {
    vi.stubEnv("STUDYFLOW_VOZ_DIR", `  ${dir}  `);
    expect(vozDir()).toBe(dir);
  });

  it("sem a variável, usa a pasta voz dentro da pasta base", () => {
    vi.stubEnv("STUDYFLOW_VOZ_DIR", "");
    vi.stubEnv("STUDYFLOW_BASE_DIR", path.join(dir, "base"));
    expect(vozDir()).toBe(path.join(path.join(dir, "base"), "voz"));
  });
});

describe("voiceLabel", () => {
  it.each([
    ["pt_BR-faber-medium", "faber (média)"],
    ["pt_BR-edresson-low", "edresson (baixa)"],
    ["pt_BR-cadu-high", "cadu (alta)"],
    ["pt_PT-tugao-medium", "tugao (média)"],
    ["pt_BR-x-y-medium", "x-y (média)"],
    ["pt_BR-faber-x_low", "faber (muito baixa)"],
    ["qualquercoisa", "qualquercoisa"],
    ["pt_BR-faber-estranha", "pt_BR-faber-estranha"],
  ])("%s -> %s", (id, label) => {
    expect(voiceLabel(id)).toBe(label);
  });
});

describe("listInstalledVoices", () => {
  it("lista só os pares .onnx + .onnx.json, ordenados, com rótulo legível", async () => {
    await install("pt_BR-faber-medium");
    await install("pt_BR-edresson-low");
    await install("so_onnx", ["onnx"]);
    await install("so_json", ["json"]);
    await fs.writeFile(path.join(voices, "leiame.txt"), "x");
    expect(await listInstalledVoices()).toEqual([
      { id: "pt_BR-edresson-low", label: "edresson (baixa)" },
      { id: "pt_BR-faber-medium", label: "faber (média)" },
    ]);
  });

  it("ignora ids com espaço ou caracteres fora de [A-Za-z0-9_-]", async () => {
    await install("com espaco");
    await install("com.ponto");
    await install("acentuação");
    await install("ok_1-a");
    expect((await listInstalledVoices()).map((v) => v.id)).toEqual(["ok_1-a"]);
  });

  it("ignora pastas com nome de voz", async () => {
    await fs.mkdir(path.join(voices, "pasta.onnx"));
    await fs.mkdir(path.join(voices, "pasta.onnx.json"));
    expect(await listInstalledVoices()).toEqual([]);
  });

  it("sem a pasta de vozes devolve lista vazia", async () => {
    await fs.rm(voices, { recursive: true, force: true });
    expect(await listInstalledVoices()).toEqual([]);
  });
});

describe("isInstalledVoice", () => {
  it("true para o par completo; false para o que falta, inexistente ou vazio", async () => {
    await install("pt_BR-faber-medium");
    await install("so_onnx", ["onnx"]);
    await install("so_json", ["json"]);
    expect(await isInstalledVoice("pt_BR-faber-medium")).toBe(true);
    expect(await isInstalledVoice("so_onnx")).toBe(false);
    expect(await isInstalledVoice("so_json")).toBe(false);
    expect(await isInstalledVoice("nao_existe")).toBe(false);
    expect(await isInstalledVoice("")).toBe(false);
  });

  it("recusa ids com .., / , \\, espaço ou NUL, mesmo que o arquivo exista fora da pasta", async () => {
    await fs.writeFile(path.join(dir, "fora.onnx"), "x");
    await fs.writeFile(path.join(dir, "fora.onnx.json"), "{}");
    for (const id of ["../fora", "..\\fora", "a/b", "a\\b", "a b", "fora\0", " pt_BR-faber-medium", ".."]) {
      expect(await isInstalledVoice(id)).toBe(false);
    }
  });

  it("recusa o que não é texto", async () => {
    expect(await isInstalledVoice(undefined as unknown as string)).toBe(false);
    expect(await isInstalledVoice(42 as unknown as string)).toBe(false);
  });
});
