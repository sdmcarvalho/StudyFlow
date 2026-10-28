// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  findSessionUser,
  hashToken,
} from "@/features/auth/session";
import { db } from "@/lib/db";

const EMAIL = "sessao@auth-test.local";
const NAME = "Ana (teste de sessão)";

// Só toca nos usuários que estes testes criam (nome marcador; um teste zera o e-mail, então não dá para filtrar por ele).
async function cleanup() {
  const where = { name: NAME };
  await db.session.deleteMany({ where: { user: where } });
  await db.user.deleteMany({ where });
}

async function makeUser(data: { active?: boolean; folderName?: string | null } = {}) {
  return db.user.create({
    data: {
      name: NAME,
      email: EMAIL,
      passwordHash: "hash",
      folderName: "folderName" in data ? data.folderName : "Pasta teste sessao",
      active: data.active ?? true,
    },
  });
}

beforeEach(cleanup);
afterAll(cleanup);

describe("sessão", () => {
  it("createSession → findSessionUser devolve o usuário", async () => {
    const user = await makeUser();
    const { token, expiresAt } = await createSession(user.id);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 24 * 3600 * 1000);

    expect(await findSessionUser(token)).toEqual({
      id: user.id,
      name: NAME,
      email: EMAIL,
      role: "USER",
      folderName: "Pasta teste sessao",
    });
  });

  it("guarda apenas o hash do token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    const rows = await db.session.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashToken(token));
    expect(rows[0].tokenHash).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("token desconhecido ou ausente devolve null", async () => {
    expect(await findSessionUser("nao-existe")).toBeNull();
    expect(await findSessionUser(undefined)).toBeNull();
  });

  it("sessão expirada devolve null e a linha some", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await findSessionUser(token)).toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("usuário inativo devolve null", async () => {
    const user = await makeUser({ active: false });
    const { token } = await createSession(user.id);
    expect(await findSessionUser(token)).toBeNull();
  });

  it("usuário sem folderName devolve null", async () => {
    const user = await makeUser({ folderName: null });
    const { token } = await createSession(user.id);
    expect(await findSessionUser(token)).toBeNull();
  });

  it("usuário sem e-mail devolve null", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { email: null } });
    expect(await findSessionUser(token)).toBeNull();
  });

  it("deleteSession apaga a sessão", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id);
    await deleteSession(token);
    expect(await findSessionUser(token)).toBeNull();
    await expect(deleteSession(token)).resolves.toBeUndefined();
  });

  it("deleteUserSessions apaga as outras e mantém a exceção", async () => {
    const user = await makeUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    await deleteUserSessions(user.id, a.token);
    expect(await findSessionUser(a.token)).not.toBeNull();
    expect(await findSessionUser(b.token)).toBeNull();

    await deleteUserSessions(user.id);
    expect(await findSessionUser(a.token)).toBeNull();
  });
});
