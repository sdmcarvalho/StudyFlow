import { beforeEach, describe, expect, it } from "vitest";
import { clearFailures, isThrottled, recordFailure, resetThrottle } from "@/features/auth/throttle";

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
});
