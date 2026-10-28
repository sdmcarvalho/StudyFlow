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

import { changePasswordAction, loginAction, logoutAction } from "@/features/auth/actions";
import { SESSION_COOKIE, SESSION_DAYS } from "@/features/auth/constants";
import { hashPassword, verifyPassword } from "@/features/auth/password";
import { findSessionUser, hashToken } from "@/features/auth/session";
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
    // A reserva da tentativa fica (não é limpa): conta desativada com senha certa continua contando.
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(recordFailure).toHaveBeenCalledWith("off@x.com");
  });

  it("desativado com a senha errada recebe só a mensagem genérica", async () => {
    await createTestUser({ email: "off@x.com", active: false });

    const result = await loginAction({ email: "off@x.com", senha: "errada123" });

    expect(result).toEqual({ ok: false, message: GENERIC });
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(recordFailure).toHaveBeenCalledWith("off@x.com");
  });

  it("conta exatamente uma tentativa por login não bloqueado: senha errada, e-mail inexistente e sucesso", async () => {
    await createTestUser({ email: "ana@x.com" });

    await loginAction({ email: "ana@x.com", senha: "errada123" });
    expect(recordFailure).toHaveBeenCalledTimes(1);

    vi.mocked(recordFailure).mockClear();
    await loginAction({ email: "ninguem@x.com", senha: "errada123" });
    expect(recordFailure).toHaveBeenCalledTimes(1);

    vi.mocked(recordFailure).mockClear();
    const ok = await loginAction({ email: "ana@x.com", senha: TEST_PASSWORD });
    expect(ok.ok).toBe(true);
    expect(recordFailure).toHaveBeenCalledTimes(1);
    expect(isThrottled("ana@x.com")).toBe(false); // o sucesso limpa a reserva e as falhas
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

  it("pedidos paralelos não furam o limite: no máximo 5 chegam à verificação da senha", async () => {
    await createTestUser({ email: "ana@x.com" });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => loginAction({ email: "ana@x.com", senha: "errada123" })),
    );

    expect(verifyPassword).toHaveBeenCalledTimes(5);
    expect(recordFailure).toHaveBeenCalledTimes(5);
    expect(results.filter((r) => !r.ok && r.message === GENERIC)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.message === THROTTLED)).toHaveLength(3);
    expect(await db.session.count()).toBe(0);
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

describe("changePasswordAction", () => {
  const NEW_PASSWORD = "NovaSenha99";
  const input = (overrides: Record<string, string> = {}) => ({
    senhaAtual: TEST_PASSWORD,
    novaSenha: NEW_PASSWORD,
    confirmacao: NEW_PASSWORD,
    ...overrides,
  });
  const hashOf = async (id: string) => (await db.user.findUniqueOrThrow({ where: { id } })).passwordHash;
  const otherSession = (userId: string, tokenHash: string) =>
    db.session.create({ data: { tokenHash, userId, expiresAt: new Date(Date.now() + DAY_MS) } });

  it("sem sessão devolve a mensagem de sessão expirada e não altera nada", async () => {
    const user = await createTestUser();
    const before = await hashOf(user.id);

    const result = await changePasswordAction(input());

    expect(result).toEqual({ ok: false, message: "Sessão expirada, entre novamente." });
    expect(await hashOf(user.id)).toBe(before);
  });

  it("senha atual errada vira erro em senhaAtual e o hash não muda", async () => {
    const user = await createTestUser();
    await signInAs(user);
    const before = await hashOf(user.id);

    const result = await changePasswordAction(input({ senhaAtual: "Errada1234" }));

    expect(result).toEqual({ ok: false, fieldErrors: { senhaAtual: "Senha atual incorreta." } });
    expect(await hashOf(user.id)).toBe(before);
  });

  it("nova senha fraca vira erro em novaSenha, sem consultar a senha atual", async () => {
    const user = await createTestUser();
    await signInAs(user);
    const before = await hashOf(user.id);

    const result = await changePasswordAction(input({ novaSenha: "abcdefgh", confirmacao: "abcdefgh" }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors?.novaSenha).toBe("Use pelo menos um número.");
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(await hashOf(user.id)).toBe(before);
  });

  it("confirmação diferente vira erro em confirmacao e o hash não muda", async () => {
    const user = await createTestUser();
    await signInAs(user);
    const before = await hashOf(user.id);

    const result = await changePasswordAction(input({ confirmacao: "OutraSenha99" }));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors?.confirmacao).toBe("A confirmação não confere com a nova senha.");
    expect(await hashOf(user.id)).toBe(before);
  });

  it("entrada que não é objeto vira erros de campo", async () => {
    const user = await createTestUser();
    await signInAs(user);

    const result = await changePasswordAction(null);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors).toBeTruthy();
  });

  it("sucesso grava o novo hash: a nova senha passa e a antiga falha", async () => {
    const user = await createTestUser();
    await signInAs(user);

    const result = await changePasswordAction(input());

    expect(result).toEqual({ ok: true, data: undefined });
    const hash = await hashOf(user.id);
    expect(await verifyPassword(NEW_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, hash)).toBe(false);
  });

  it("mantém a sessão atual e revoga as outras sessões do usuário, sem tocar nas de outro usuário", async () => {
    const user = await createTestUser();
    const stranger = await createTestUser();
    const token = await signInAs(user);
    await otherSession(user.id, "outro-dispositivo-1");
    await otherSession(user.id, "outro-dispositivo-2");
    await otherSession(stranger.id, "sessao-do-estranho");

    const result = await changePasswordAction(input());

    expect(result.ok).toBe(true);
    expect((await findSessionUser(token))?.id).toBe(user.id);
    const remaining = (await db.session.findMany()).map((s) => s.tokenHash).sort();
    expect(remaining).toEqual([hashToken(token), "sessao-do-estranho"].sort());
  });

  it("a troca feita pelo usuário A nunca altera o usuário B", async () => {
    const a = await createTestUser({ email: "a@x.com" });
    const b = await createTestUser({ email: "b@x.com" });
    await signInAs(a);
    const bBefore = await hashOf(b.id);

    // Ids vindos do cliente são ignorados: só vale o usuário da sessão.
    const result = await changePasswordAction({ ...input(), id: b.id, userId: b.id, email: "b@x.com" });

    expect(result.ok).toBe(true);
    expect(await verifyPassword(NEW_PASSWORD, (await hashOf(a.id)) as string)).toBe(true);
    expect(await hashOf(b.id)).toBe(bBefore);
    expect(await verifyPassword(TEST_PASSWORD, (await hashOf(b.id)) as string)).toBe(true);
  });

  it("a senha atual de outro usuário não vale", async () => {
    const a = await createTestUser({ email: "a@x.com" });
    const b = await createTestUser({ email: "b@x.com" });
    await db.user.update({ where: { id: b.id }, data: { passwordHash: await hashPassword("SenhaDoB123") } });
    await signInAs(a);

    const result = await changePasswordAction(input({ senhaAtual: "SenhaDoB123" }));

    expect(result).toEqual({ ok: false, fieldErrors: { senhaAtual: "Senha atual incorreta." } });
  });

  it("erro inesperado vira mensagem genérica", async () => {
    const user = await createTestUser();
    await signInAs(user);
    vi.mocked(verifyPassword).mockRejectedValueOnce(new Error("boom"));

    const result = await changePasswordAction(input());

    expect(result).toEqual({ ok: false, message: "Não foi possível alterar a senha. Tente novamente." });
  });
});
