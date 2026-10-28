// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/next-headers"));
// redirect() do Next lança para interromper a execução; o mock faz o mesmo.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(),
}));
// Passam direto para a implementação real, mas permitem conferir se foram chamadas.
vi.mock("@/features/auth/throttle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/throttle")>();
  return { ...actual, recordFailure: vi.fn(actual.recordFailure) };
});
vi.mock("@/features/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/auth/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

import { loginAction, logoutAction } from "@/features/auth/actions";
import { SESSION_COOKIE, SESSION_DAYS } from "@/features/auth/constants";
import { verifyPassword } from "@/features/auth/password";
import { hashToken } from "@/features/auth/session";
import { isThrottled, recordFailure, resetThrottle } from "@/features/auth/throttle";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut, TEST_PASSWORD } from "./helpers/auth";
import { cookieOptions, cookies } from "./helpers/next-headers";

const DAY_MS = 24 * 60 * 60 * 1000;
const GENERIC = "E-mail ou senha incorretos.";
const DISABLED = "Conta desativada. Fale com o administrador.";
const THROTTLED = "Muitas tentativas. Tente novamente em alguns minutos.";

async function cookieValue(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

beforeEach(async () => {
  signOut();
  resetThrottle();
  vi.mocked(recordFailure).mockClear();
  vi.mocked(verifyPassword).mockClear();
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loginAction: sucesso", () => {
  it("credenciais certas criam a sessão, gravam o cookie e mandam para /estudo", async () => {
    const user = await createTestUser({ email: "ana@x.com" });

    const result = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });

    expect(result).toEqual({ ok: true, data: { redirectTo: "/estudo" } });
    const token = await cookieValue();
    expect(token).toBeTruthy();
    const sessions = await db.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].userId).toBe(user.id);
    expect(sessions[0].tokenHash).toBe(hashToken(token as string));
  });

  it("grava o cookie com httpOnly, sameSite lax, path / e validade de 14 dias; sem secure fora de produção", async () => {
    await createTestUser({ email: "ana@x.com" });
    await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });

    const options = cookieOptions(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    const expires = options?.expires as Date;
    expect(expires).toBeInstanceOf(Date);
    expect(Math.abs(expires.getTime() - (Date.now() + SESSION_DAYS * DAY_MS))).toBeLessThan(60_000);
    const session = await db.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBe(expires.getTime());
  });

  it("em produção o cookie sai com secure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createTestUser({ email: "ana@x.com" });
    await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });

    expect(cookieOptions(SESSION_COOKIE)).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });

  it("respeita um next interno e descarta um next externo ou /login", async () => {
    await createTestUser({ email: "ana@x.com" });

    const internal = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD, next: "/estudo/abc" });
    expect(internal).toEqual({ ok: true, data: { redirectTo: "/estudo/abc" } });

    const external = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD, next: "//evil.com" });
    expect(external).toEqual({ ok: true, data: { redirectTo: "/estudo" } });

    const loop = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD, next: "/login" });
    expect(loop).toEqual({ ok: true, data: { redirectTo: "/estudo" } });
  });

  it("normaliza o e-mail (espaços e maiúsculas) e entra na conta certa", async () => {
    const user = await createTestUser({ email: "ana@x.com" });

    const result = await loginAction({ email: " ANA@x.com ", senha: TEST_PASSWORD });

    expect(result.ok).toBe(true);
    expect((await db.session.findFirstOrThrow()).userId).toBe(user.id);
  });

  it("zera as falhas anteriores do e-mail", async () => {
    await createTestUser({ email: "ana@x.com" });
    for (let i = 0; i < 4; i++) await loginAction({ email: "ana@x.com", senha: "errada123" });

    await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });

    expect(isThrottled("ana@x.com")).toBe(false);
    // Se as 4 falhas tivessem sobrado, mais uma já bloquearia (5ª) e a senha certa seria recusada.
    await loginAction({ email: "ana@x.com", senha: "errada123" });
    const next = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });
    expect(next.ok).toBe(true);
  });
});

describe("loginAction: falhas", () => {
  it("senha errada e e-mail inexistente dão a mesma mensagem genérica", async () => {
    await createTestUser({ email: "ana@x.com" });

    const wrongPassword = await loginAction({ email: "ana@x.com", senha: "errada123" });
    const unknown = await loginAction({ email: "ninguem@x.com", senha: TEST_PASSWORD });

    expect(wrongPassword).toEqual({ ok: false, message: GENERIC });
    expect(unknown).toEqual({ ok: false, message: GENERIC });
    expect(await db.session.count()).toBe(0);
    expect(await cookieValue()).toBeUndefined();
  });

  it("verifica a senha mesmo quando o e-mail não existe (tempo igual)", async () => {
    await loginAction({ email: "ninguem@x.com", senha: TEST_PASSWORD });

    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyPassword).mock.calls[0][1]).toBeUndefined();
  });

  it("usuário sem senha cadastrada nunca entra", async () => {
    await db.user.create({ data: { name: "Sem senha", email: "semsenha@x.com", folderName: "Sem senha" } });

    const withPassword = await loginAction({ email: "semsenha@x.com", senha: TEST_PASSWORD });

    expect(withPassword).toEqual({ ok: false, message: GENERIC });
    expect(await db.session.count()).toBe(0);
  });

  it("desativado com a senha certa vê a mensagem de conta desativada, sem sessão", async () => {
    await createTestUser({ email: "off@x.com", active: false });

    const result = await loginAction({ email: "off@x.com", senha: TEST_PASSWORD });

    expect(result).toEqual({ ok: false, message: DISABLED });
    expect(await db.session.count()).toBe(0);
    expect(await cookieValue()).toBeUndefined();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("desativado com a senha errada recebe só a mensagem genérica", async () => {
    await createTestUser({ email: "off@x.com", active: false });

    const result = await loginAction({ email: "off@x.com", senha: "errada123" });

    expect(result).toEqual({ ok: false, message: GENERIC });
    expect(recordFailure).toHaveBeenCalledWith("off@x.com");
  });

  it("e-mail inválido ou senha em branco voltam como erro de campo, sem consultar senha nem contar falha", async () => {
    const result = await loginAction({ email: "isto-nao-e-email", senha: "" });

    expect(result).toEqual({
      ok: false,
      fieldErrors: { email: "Informe um e-mail válido.", senha: "Informe a senha." },
    });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("entrada que não é objeto vira erro de campo", async () => {
    const result = await loginAction(null);
    expect(result.ok).toBe(false);
  });
});

describe("loginAction: limite de tentativas", () => {
  it("depois de 5 falhas, até a senha certa é bloqueada, sem sessão e sem verificar a senha", async () => {
    await createTestUser({ email: "ana@x.com" });
    for (let i = 0; i < 5; i++) {
      expect(await loginAction({ email: "ana@x.com", senha: "errada123" })).toEqual({ ok: false, message: GENERIC });
    }
    vi.mocked(recordFailure).mockClear();
    vi.mocked(verifyPassword).mockClear();

    const result = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });

    expect(result).toEqual({ ok: false, message: THROTTLED });
    expect(await db.session.count()).toBe(0);
    expect(await cookieValue()).toBeUndefined();
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("o bloqueio vale para o e-mail normalizado e também para e-mails inexistentes", async () => {
    for (let i = 0; i < 5; i++) await loginAction({ email: "ninguem@x.com", senha: "errada123" });

    const result = await loginAction({ email: " NINGUEM@x.com ", senha: "errada123" });

    expect(result).toEqual({ ok: false, message: THROTTLED });
  });

  it("o bloqueio de um e-mail não afeta outro", async () => {
    await createTestUser({ email: "ana@x.com" });
    await createTestUser({ email: "bia@x.com" });
    for (let i = 0; i < 5; i++) await loginAction({ email: "ana@x.com", senha: "errada123" });

    const result = await loginAction({ email: "bia@x.com", senha: TEST_PASSWORD });

    expect(result.ok).toBe(true);
  });
});

describe("logoutAction", () => {
  it("apaga a sessão, limpa o cookie e redireciona para /login", async () => {
    const user = await createTestUser();
    await signInAs(user);
    expect(await db.session.count()).toBe(1);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(await db.session.count()).toBe(0);
    expect(await cookieValue()).toBeUndefined();
  });

  it("só apaga a sessão atual, não as de outros dispositivos", async () => {
    const user = await createTestUser();
    await db.session.create({
      data: { tokenHash: "outra-sessao", userId: user.id, expiresAt: new Date(Date.now() + DAY_MS) },
    });
    await signInAs(user);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect((await db.session.findMany()).map((s) => s.tokenHash)).toEqual(["outra-sessao"]);
  });

  it("sem cookie de sessão ainda redireciona para /login", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(await cookieValue()).toBeUndefined();
  });

  it("com cookie de uma sessão que já não existe no banco, limpa o cookie e redireciona", async () => {
    (await cookies()).set(SESSION_COOKIE, "token-que-nao-existe");

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(await cookieValue()).toBeUndefined();
  });
});
