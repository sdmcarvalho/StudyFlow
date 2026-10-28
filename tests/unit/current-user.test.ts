// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/next-headers"));

import { authActionMessage, authErrorResponse } from "@/lib/auth-response";
import {
  AuthError,
  assertSuperuser,
  getCurrentUserId,
  isAuthError,
  requireSuperuser,
  requireUser,
} from "@/lib/current-user";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

beforeEach(async () => {
  signOut();
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});

describe("getCurrentUserId", () => {
  it("sem sessão rejeita com AuthError unauthenticated", async () => {
    const error = await getCurrentUserId().catch((e: unknown) => e);
    expect(isAuthError(error)).toBe(true);
    expect((error as AuthError).code).toBe("unauthenticated");
  });

  it("não cria usuário sozinho", async () => {
    await getCurrentUserId().catch(() => undefined);
    expect(await db.user.count()).toBe(0);
  });

  it("depois do login devolve o id do usuário", async () => {
    const user = await createTestUser();
    await signInAs(user);
    expect(await getCurrentUserId()).toBe(user.id);
  });

  it("usuário desativado depois do login rejeita", async () => {
    const user = await createTestUser();
    await signInAs(user);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    await expect(getCurrentUserId()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});

describe("assertSuperuser", () => {
  it("sem sessão rejeita com unauthenticated", async () => {
    await expect(assertSuperuser()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("com USER rejeita com forbidden", async () => {
    await signInAs(await createTestUser({ role: "USER" }));
    await expect(assertSuperuser()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("com SUPER devolve o usuário", async () => {
    const user = await createTestUser({ role: "SUPER" });
    await signInAs(user);
    expect(await assertSuperuser()).toMatchObject({ id: user.id, role: "SUPER" });
  });
});

describe("requireUser / requireSuperuser", () => {
  it("requireUser sem sessão rejeita com o redirecionamento do Next", async () => {
    const error = await requireUser().catch((e: unknown) => e);
    expect((error as { digest: string }).digest).toMatch(/^NEXT_REDIRECT/);
    expect((error as { digest: string }).digest).toContain("/login");
  });

  it("requireUser com sessão devolve o usuário", async () => {
    const user = await createTestUser();
    await signInAs(user);
    expect(await requireUser()).toMatchObject({ id: user.id, email: user.email });
  });

  it("requireSuperuser sem sessão redireciona para /login", async () => {
    const error = await requireSuperuser().catch((e: unknown) => e);
    expect((error as { digest: string }).digest).toMatch(/^NEXT_REDIRECT/);
  });

  it("requireSuperuser com USER rejeita com notFound()", async () => {
    await signInAs(await createTestUser({ role: "USER" }));
    const error = await requireSuperuser().catch((e: unknown) => e);
    expect((error as { digest: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("requireSuperuser com SUPER devolve o usuário", async () => {
    const user = await createTestUser({ role: "SUPER" });
    await signInAs(user);
    expect(await requireSuperuser()).toMatchObject({ id: user.id });
  });
});

describe("auth-response", () => {
  it("authErrorResponse devolve 401 para unauthenticated", async () => {
    const response = authErrorResponse(new AuthError("unauthenticated"));
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ message: "Sessão expirada, entre novamente." });
  });

  it("authErrorResponse devolve 403 para forbidden", async () => {
    const response = authErrorResponse(new AuthError("forbidden"));
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ message: "Acesso negado." });
  });

  it("authErrorResponse devolve null para outros erros", () => {
    expect(authErrorResponse(new Error("x"))).toBeNull();
    expect(authErrorResponse("x")).toBeNull();
  });

  it("authActionMessage devolve a mensagem ou null", () => {
    expect(authActionMessage(new AuthError("unauthenticated"))).toBe("Sessão expirada, entre novamente.");
    expect(authActionMessage(new AuthError("forbidden"))).toBe("Acesso negado.");
    expect(authActionMessage(new Error("x"))).toBeNull();
  });
});
