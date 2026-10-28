import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/features/auth/password";

describe("password", () => {
  it("hashPassword não devolve o texto e verifyPassword confere a senha", async () => {
    const hash = await hashPassword("abc12345");
    expect(hash).not.toBe("abc12345");
    expect(await verifyPassword("abc12345", hash)).toBe(true);
    expect(await verifyPassword("errada123", hash)).toBe(false);
  });

  it("sem hash devolve false", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
  });
});
