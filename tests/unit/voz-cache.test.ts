// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDir, cacheGet, cacheKey, cachePrune, cachePut } from "@/features/voz/cache";
import type { VoiceSettings } from "@/features/voz/settings-schema";

const HOUR = 60 * 60 * 1000;
const base: VoiceSettings = { voice: "pt_BR-faber-medium", speed: 1, volume: 1 };

let dir: string;
let savedDir: string | undefined;

beforeEach(async () => {
  savedDir = process.env.STUDYFLOW_VOZ_DIR;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-voz-cache-"));
  process.env.STUDYFLOW_VOZ_DIR = dir;
});

afterEach(async () => {
  if (savedDir === undefined) delete process.env.STUDYFLOW_VOZ_DIR;
  else process.env.STUDYFLOW_VOZ_DIR = savedDir;
  await fs.rm(dir, { recursive: true, force: true });
});

async function age(key: string, ms: number, now: number) {
  const when = new Date(now - ms);
  await fs.utimes(path.join(cacheDir(), `${key}.mp3`), when, when);
}

describe("cacheKey", () => {
  it("é sha256 em hexadecimal e estável", () => {
    expect(cacheKey(base, "Olá")).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey(base, "Olá")).toBe(cacheKey({ ...base }, "Olá"));
  });

  it("muda com voz, velocidade, volume ou texto", () => {
    const k = cacheKey(base, "Olá");
    expect(cacheKey({ ...base, voice: "pt_BR-cadu-medium" }, "Olá")).not.toBe(k);
    expect(cacheKey({ ...base, speed: 1.5 }, "Olá")).not.toBe(k);
    expect(cacheKey({ ...base, volume: 0.5 }, "Olá")).not.toBe(k);
    expect(cacheKey(base, "Olá!")).not.toBe(k);
  });

  it("separador não é ambíguo", () => {
    expect(cacheKey({ ...base, voice: "a|1" }, "x")).not.toBe(cacheKey({ ...base, voice: "a" }, "1|x"));
  });
});

describe("cacheGet / cachePut", () => {
  it("fica em <pasta de voz>/cache", () => {
    expect(cacheDir()).toBe(path.join(dir, "cache"));
  });

  it("get antes do put é null; depois devolve o mesmo buffer", async () => {
    const key = cacheKey(base, "Olá");
    expect(await cacheGet(key)).toBeNull();
    const mp3 = Buffer.from([0xff, 0xf3, 1, 2, 3]);
    await cachePut(key, mp3);
    expect(await cacheGet(key)).toEqual(mp3);
    await cachePut(key, Buffer.from([9]));
    expect(await cacheGet(key)).toEqual(Buffer.from([9]));
    const left = await fs.readdir(cacheDir());
    expect(left).toEqual([`${key}.mp3`]);
  });

  it("chave que não é hexadecimal de 64 nunca vira caminho", async () => {
    for (const bad of ["../x", "..\\x", "a".repeat(63), "A".repeat(64), "", `${"a".repeat(64)}/`]) {
      expect(await cacheGet(bad)).toBeNull();
      await expect(cachePut(bad, Buffer.from("x"))).rejects.toThrow();
    }
    await expect(fs.readdir(cacheDir())).rejects.toThrow();
  });
});

describe("cachePrune", () => {
  it("remove os arquivos com mais de 24 h e mantém os recentes", async () => {
    const now = Date.now();
    const old = cacheKey(base, "velho");
    const fresh = cacheKey(base, "novo");
    await cachePut(old, Buffer.from("a"));
    await cachePut(fresh, Buffer.from("b"));
    await age(old, 25 * HOUR, now);
    await age(fresh, 23 * HOUR, now);
    await cachePrune(now);
    expect(await cacheGet(old)).toBeNull();
    expect(await cacheGet(fresh)).toEqual(Buffer.from("b"));
  });

  it("acima do teto apaga os mais antigos primeiro", async () => {
    const now = Date.now();
    const keys = ["a", "b", "c", "d"].map((t) => cacheKey(base, t));
    for (let i = 0; i < keys.length; i++) {
      await cachePut(keys[i], Buffer.alloc(100, i));
      await age(keys[i], (4 - i) * HOUR, now);
    }
    await cachePrune(now, { maxBytes: 250 });
    expect(await cacheGet(keys[0])).toBeNull();
    expect(await cacheGet(keys[1])).toBeNull();
    expect(await cacheGet(keys[2])).not.toBeNull();
    expect(await cacheGet(keys[3])).not.toBeNull();
  });

  it("o teto padrão é 500 MB (arquivos pequenos ficam)", async () => {
    const key = cacheKey(base, "x");
    await cachePut(key, Buffer.alloc(1000));
    await cachePrune();
    expect(await cacheGet(key)).not.toBeNull();
  });

  it("pasta ausente não dá erro; temporário velho esquecido é limpo", async () => {
    await expect(cachePrune()).resolves.toBeUndefined();
    await fs.mkdir(cacheDir(), { recursive: true });
    const stray = path.join(cacheDir(), `${"b".repeat(64)}.mp3.123.tmp`);
    await fs.writeFile(stray, "x");
    const when = new Date(Date.now() - 25 * HOUR);
    await fs.utimes(stray, when, when);
    await cachePrune();
    await expect(fs.stat(stray)).rejects.toThrow();
  });
});
