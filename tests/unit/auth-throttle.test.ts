import { beforeEach, describe, expect, it } from "vitest";
import {
  clearFailures,
  isThrottled,
  MAX_FAILURES,
  MAX_KEYS,
  recordFailure,
  resetThrottle,
} from "@/features/auth/throttle";

const EMAIL = "ana@x.com";
const MIN = 60_000;

function fail(times: number, email = EMAIL, now = 0) {
  for (let i = 0; i < times; i++) recordFailure(email, now);
}

beforeEach(() => resetThrottle());

describe("throttle", () => {
  it("bloqueia com 5 falhas e não com 4", () => {
    fail(4);
    expect(isThrottled(EMAIL, 0)).toBe(false);
    fail(1);
    expect(isThrottled(EMAIL, 0)).toBe(true);
  });

  it("libera depois de 15 minutos", () => {
    fail(5);
    expect(isThrottled(EMAIL, 14 * MIN)).toBe(true);
    expect(isThrottled(EMAIL, 15 * MIN + 1)).toBe(false);
  });

  it("clearFailures libera", () => {
    fail(5);
    clearFailures(EMAIL);
    expect(isThrottled(EMAIL, 0)).toBe(false);
  });

  it("e-mails diferentes são independentes", () => {
    fail(5);
    expect(isThrottled("outra@x.com", 0)).toBe(false);
  });

  it("maiúsculas e espaços não burlam o limite", () => {
    recordFailure("Ana@X.com", 0);
    recordFailure(" ANA@x.com ", 0);
    recordFailure("ana@x.com", 0);
    recordFailure("ana@X.COM", 0);
    recordFailure("  ana@x.com", 0);
    expect(isThrottled("ANA@X.COM ", 0)).toBe(true);
  });

  describe("limites de memória", () => {
    const store = () => (globalThis as unknown as { authThrottle: Map<string, number[]> }).authThrottle;

    it("o mapa nunca passa de MAX_KEYS chaves distintas", () => {
      for (let i = 0; i < MAX_KEYS + 500; i++) recordFailure(`u${i}@x.com`, 0);
      expect(store().size).toBeLessThanOrEqual(MAX_KEYS);
      expect(store().size).toBe(MAX_KEYS);
    });

    it("no limite, descarta primeiro as chaves expiradas", () => {
      for (let i = 0; i < MAX_KEYS; i++) recordFailure(`u${i}@x.com`, 0);
      recordFailure("novo@x.com", 20 * MIN);
      expect(store().size).toBe(1);
      expect(store().has("novo@x.com")).toBe(true);
    });

    it("sem expiradas, descarta a chave inserida há mais tempo e aceita a nova", () => {
      for (let i = 0; i < MAX_KEYS; i++) recordFailure(`u${i}@x.com`, 0);
      recordFailure("novo@x.com", 1);
      expect(store().size).toBe(MAX_KEYS);
      expect(store().has("u0@x.com")).toBe(false);
      expect(store().has("u1@x.com")).toBe(true);
      expect(store().has("novo@x.com")).toBe(true);
      expect(isThrottled("novo@x.com", 1)).toBe(false);
      fail(4, "novo@x.com", 1);
      expect(isThrottled("novo@x.com", 1)).toBe(true);
    });

    it("chave já existente no limite não expulsa ninguém", () => {
      for (let i = 0; i < MAX_KEYS; i++) recordFailure(`u${i}@x.com`, 0);
      recordFailure("u5@x.com", 1);
      expect(store().size).toBe(MAX_KEYS);
      expect(store().has("u0@x.com")).toBe(true);
    });

    it("a lista de falhas de uma chave fica limitada, mantendo as mais novas", () => {
      for (let i = 0; i < 1000; i++) recordFailure(EMAIL, i);
      const list = store().get(EMAIL) ?? [];
      expect(list.length).toBeLessThanOrEqual(MAX_FAILURES);
      expect(list.at(-1)).toBe(999);
      expect(isThrottled(EMAIL, 999)).toBe(true);
      // as falhas mais velhas saíram: bem depois da janela das mais novas, libera
      expect(isThrottled(EMAIL, 999 + 15 * MIN)).toBe(false);
    });
  });
});
