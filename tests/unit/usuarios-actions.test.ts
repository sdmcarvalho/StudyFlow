// @vitest-environment node
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => import("./helpers/next-headers"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { verifyPassword } from "@/features/auth/password";
import { createSession, findSessionUser } from "@/features/auth/session";
import { createUser, deleteUser, resetUserPassword, setUserActive } from "@/features/usuarios/actions";
import { db } from "@/lib/db";
import { TEST_PASSWORD, createTestUser, signInAs, signOut } from "./helpers/auth";

const EXPIRED = "Sessão expirada, entre novamente.";
const DENIED = "Acesso negado.";
const NOT_FOUND = "Usuário não encontrado.";

const tmpDirs: string[] = [];

async function wipe() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

/** Pasta base de cada teste: um diretório novo e vazio, para o createUser não olhar o C:\StudyFlow real. */
let baseDir = "";

beforeEach(async () => {
  baseDir = await mkdtemp(path.join(os.tmpdir(), "studyflow-base-"));
  tmpDirs.push(baseDir);
  vi.stubEnv("STUDYFLOW_BASE_DIR", baseDir);
  signOut();
  vi.mocked(revalidatePath).mockClear();
  await wipe();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await wipe();
  await Promise.all(tmpDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function asSuper() {
  const superuser = await createTestUser({ role: "SUPER", name: "Super", email: "super@x.com" });
  await signInAs(superuser);
  return superuser;
}

/** Cria um Estudo ativo e um na lixeira, um Card, um resultado, uma agenda, as configurações de IA e uma sessão. */
async function seedData(userId: string, tag: string) {
  const study = await db.studyRecord.create({
    data: { userId, descricao: `Ativo ${tag}`, pasta: `C:\\${tag}\\a`, dataInicial: "2026-01-01" },
  });
  const trashed = await db.studyRecord.create({
    data: { userId, descricao: `Lixeira ${tag}`, pasta: `C:\\${tag}\\b`, dataInicial: "2026-01-01", deletedAt: new Date() },
  });
  const card = await db.card.create({
    data: { userId, studyId: study.id, cellId: "c1", tema: "t", pergunta: "p", resposta: "r" },
  });
  await db.cardResult.create({ data: { userId, studyId: study.id, cardId: card.id, correct: true } });
  await db.schedule.create({
    data: { userId, studyId: trashed.id, reviewDate: "2026-02-01", createdAt: "2026-01-01", session: "S1" },
  });
  await db.aiSettings.create({ data: { userId, model: `modelo-${tag}` } });
  await createSession(userId);
}

async function counts(userId: string) {
  return {
    studies: await db.studyRecord.count({ where: { userId } }),
    cards: await db.card.count({ where: { userId } }),
    results: await db.cardResult.count({ where: { userId } }),
    schedules: await db.schedule.count({ where: { userId } }),
    ai: await db.aiSettings.count({ where: { userId } }),
    sessions: await db.session.count({ where: { userId } }),
    users: await db.user.count({ where: { id: userId } }),
  };
}

describe("autorização das quatro actions", () => {
  async function callAll() {
    const target = await createTestUser({ email: "alvo@x.com" });
    return Promise.all([
      createUser({ nome: "Bia", email: "bia@x.com", senha: "Senha1234" }),
      resetUserPassword(target.id, { novaSenha: "Outra1234" }),
      setUserActive(target.id, false),
      deleteUser(target.id, "alvo@x.com"),
    ]);
  }

  it("USER logado recebe Acesso negado em cada uma", async () => {
    await signInAs(await createTestUser({ role: "USER" }));
    for (const result of await callAll()) expect(result).toEqual({ ok: false, message: DENIED });
    expect(await db.user.count({ where: { email: "bia@x.com" } })).toBe(0);
    expect(await db.user.count({ where: { email: "alvo@x.com" } })).toBe(1);
  });

  it("sem sessão recebe Sessão expirada em cada uma", async () => {
    for (const result of await callAll()) expect(result).toEqual({ ok: false, message: EXPIRED });
    expect(await db.user.count({ where: { email: "bia@x.com" } })).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createUser", () => {
  it("normaliza o e-mail, cria USER ativo com senha em hash e revalida /usuarios", async () => {
    await asSuper();
    const result = await createUser({ nome: "  Bia  ", email: " Bia@X.com ", senha: "Senha1234" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await db.user.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(user).toMatchObject({ name: "Bia", email: "bia@x.com", role: "USER", active: true, folderName: "Bia" });
    expect(user.passwordHash).not.toBe("Senha1234");
    expect(await verifyPassword("Senha1234", user.passwordHash)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("dois usuários chamados Ana ficam com pastas Ana e Ana 2", async () => {
    await asSuper();
    const first = await createUser({ nome: "Ana", email: "ana1@x.com", senha: "Senha1234" });
    const second = await createUser({ nome: "Ana", email: "ana2@x.com", senha: "Senha1234" });
    if (!first.ok || !second.ok) throw new Error("criação falhou");
    const rows = await db.user.findMany({ where: { id: { in: [first.data.id, second.data.id] } } });
    expect(rows.map((row) => row.folderName).sort()).toEqual(["Ana", "Ana 2"]);
  });

  it("recriar um usuário excluído não herda a pasta que ficou no disco: Ana vira Ana 2", async () => {
    await asSuper();
    const first = await createUser({ nome: "Ana", email: "ana@x.com", senha: "Senha1234" });
    if (!first.ok) throw new Error("criação falhou");
    await mkdir(path.join(baseDir, "Ana", "imagens"), { recursive: true });
    await writeFile(path.join(baseDir, "Ana", "nota.md"), "dados antigos");
    expect(await deleteUser(first.data.id, "ana@x.com")).toEqual({ ok: true, data: undefined });

    const again = await createUser({ nome: "Ana", email: "ana-nova@x.com", senha: "Senha1234" });
    if (!again.ok) throw new Error("criação falhou");
    const user = await db.user.findUniqueOrThrow({ where: { id: again.data.id } });
    expect(user.folderName).toBe("Ana 2");
    expect((await stat(path.join(baseDir, "Ana", "nota.md"))).isFile()).toBe(true); // a pasta antiga segue intocada
  });

  it("pasta que só difere na caixa (ana no disco, Ana no cadastro) também conta como ocupada", async () => {
    await asSuper();
    await mkdir(path.join(baseDir, "ana"));
    const result = await createUser({ nome: "Ana", email: "ana@x.com", senha: "Senha1234" });
    if (!result.ok) throw new Error("criação falhou");
    const user = await db.user.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(user.folderName).toBe("Ana 2");
  });

  it("pasta base que não existe não dá erro e o nome fica livre", async () => {
    await asSuper();
    vi.stubEnv("STUDYFLOW_BASE_DIR", path.join(baseDir, "nao-existe"));
    const result = await createUser({ nome: "Bia", email: "bia@x.com", senha: "Senha1234" });
    if (!result.ok) throw new Error("criação falhou");
    const user = await db.user.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(user.folderName).toBe("Bia");
  });

  it("e-mail repetido, mesmo com outra caixa, vira erro de campo e não cria nada", async () => {
    await asSuper();
    await createUser({ nome: "Bia", email: "bia@x.com", senha: "Senha1234" });
    const before = await db.user.count();
    const result = await createUser({ nome: "Outra", email: " BIA@x.COM ", senha: "Senha1234" });
    expect(result).toEqual({ ok: false, fieldErrors: { email: "Já existe um usuário com este e-mail." } });
    expect(await db.user.count()).toBe(before);
  });

  it("e-mail igual ao do superusuário também é recusado", async () => {
    await asSuper();
    const result = await createUser({ nome: "Falso", email: "SUPER@x.com", senha: "Senha1234" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { email: "Já existe um usuário com este e-mail." } });
  });

  it("entrada inválida devolve erros de campo e não cria nada", async () => {
    await asSuper();
    const before = await db.user.count();
    const result = await createUser({ nome: "A", email: "nao-e-email", senha: "curta" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["email", "nome", "senha"]);
    expect(await db.user.count()).toBe(before);
  });
});

describe("resetUserPassword", () => {
  it("troca o hash, apaga as sessões do alvo e preserva as dos outros", async () => {
    await asSuper();
    const target = await createTestUser({ email: "alvo@x.com" });
    const other = await createTestUser({ email: "outro@x.com" });
    const targetSession = await createSession(target.id);
    const otherSession = await createSession(other.id);
    const before = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;

    const result = await resetUserPassword(target.id, { novaSenha: "NovaSenha99" });
    expect(result).toEqual({ ok: true, data: undefined });

    const after = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    expect(after).not.toBe(before);
    expect(await verifyPassword("NovaSenha99", after)).toBe(true);
    expect(await verifyPassword(TEST_PASSWORD, after)).toBe(false);
    expect(await findSessionUser(targetSession.token)).toBeNull();
    expect(await findSessionUser(otherSession.token)).not.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("senha inválida devolve erro em novaSenha e não muda nada", async () => {
    await asSuper();
    const target = await createTestUser();
    const session = await createSession(target.id);
    const before = (await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash;
    const result = await resetUserPassword(target.id, { novaSenha: "curta" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.novaSenha).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).passwordHash).toBe(before);
    expect(await findSessionUser(session.token)).not.toBeNull();
  });
});

describe("setUserActive", () => {
  it("desativar apaga as sessões e o alvo não consegue mais usá-las", async () => {
    await asSuper();
    const target = await createTestUser();
    const { token } = await createSession(target.id);
    expect(await findSessionUser(token)).not.toBeNull();

    expect(await setUserActive(target.id, false)).toEqual({ ok: true, data: undefined });

    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(false);
    expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await findSessionUser(token)).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("reativar volta o usuário a ativo", async () => {
    await asSuper();
    const target = await createTestUser({ active: false });
    expect(await setUserActive(target.id, true)).toEqual({ ok: true, data: undefined });
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(true);
  });

  it("valor que não é booleano é recusado", async () => {
    await asSuper();
    const target = await createTestUser();
    const result = await setUserActive(target.id, "false" as unknown as boolean);
    expect(result.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).active).toBe(true);
  });
});

describe("alvos que nunca são afetados", () => {
  it("nenhuma das ações age sobre o SUPER, nem sobre o próprio superusuário logado", async () => {
    const superuser = await asSuper();
    await seedData(superuser.id, "super");
    const before = await db.user.findUniqueOrThrow({ where: { id: superuser.id } });
    const sessionsBefore = await db.session.count({ where: { userId: superuser.id } });

    const results = await Promise.all([
      resetUserPassword(superuser.id, { novaSenha: "NovaSenha99" }),
      setUserActive(superuser.id, false),
      deleteUser(superuser.id, "super@x.com"),
    ]);
    for (const result of results) expect(result).toEqual({ ok: false, message: NOT_FOUND });

    expect(await db.user.findUniqueOrThrow({ where: { id: superuser.id } })).toEqual(before);
    expect(await db.session.count({ where: { userId: superuser.id } })).toBe(sessionsBefore);
    expect((await counts(superuser.id)).studies).toBe(2);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("outro SUPER (inserido direto no banco) também é protegido", async () => {
    await asSuper();
    const other = await createTestUser({ role: "SUPER", email: "super2@x.com" });
    expect(await setUserActive(other.id, false)).toEqual({ ok: false, message: NOT_FOUND });
    expect(await deleteUser(other.id, "super2@x.com")).toEqual({ ok: false, message: NOT_FOUND });
  });

  it("id inexistente, vazio ou que não é texto vira Usuário não encontrado e não toca em ninguém", async () => {
    await asSuper();
    const bystander = await createTestUser();
    const bad: unknown[] = ["nao-existe", "", { not: "" }, undefined, 42];
    for (const id of bad) {
      expect(await resetUserPassword(id as string, { novaSenha: "NovaSenha99" })).toEqual({ ok: false, message: NOT_FOUND });
      expect(await setUserActive(id as string, false)).toEqual({ ok: false, message: NOT_FOUND });
      expect(await deleteUser(id as string, "x@x.com")).toEqual({ ok: false, message: NOT_FOUND });
    }
    expect(await db.user.findUniqueOrThrow({ where: { id: bystander.id } })).toMatchObject({ active: true });
  });
});

describe("deleteUser", () => {
  it("e-mail de confirmação errado não apaga nada", async () => {
    await asSuper();
    const target = await createTestUser({ email: "alvo@x.com" });
    await seedData(target.id, "alvo");
    const before = await counts(target.id);

    const result = await deleteUser(target.id, "outro@x.com");
    expect(result).toEqual({
      ok: false,
      fieldErrors: { emailConfirmacao: "Digite o e-mail do usuário para confirmar." },
    });
    expect(await counts(target.id)).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("apaga todas as linhas do alvo, preserva por completo os dados de outro usuário e as pastas no disco", async () => {
    await asSuper();
    const target = await createTestUser({ email: "alvo@x.com" });
    const other = await createTestUser({ email: "outro@x.com" });
    await seedData(target.id, "alvo");
    await seedData(other.id, "outro");
    const otherBefore = await counts(other.id);
    expect(otherBefore).toEqual({ studies: 2, cards: 1, results: 1, schedules: 1, ai: 1, sessions: 1, users: 1 });

    const root = await mkdtemp(path.join(os.tmpdir(), "studyflow-usuarios-"));
    tmpDirs.push(root);
    const folder = path.join(root, target.folderName, "Estudo");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "nota.md"), "conteúdo");

    // Caixa e espaços diferentes na confirmação.
    const result = await deleteUser(target.id, "  ALVO@x.com ");
    expect(result).toEqual({ ok: true, data: undefined });

    expect(await counts(target.id)).toEqual({ studies: 0, cards: 0, results: 0, schedules: 0, ai: 0, sessions: 0, users: 0 });
    expect(await counts(other.id)).toEqual(otherBefore);
    expect((await stat(path.join(folder, "nota.md"))).isFile()).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("confirmação vazia nunca confere", async () => {
    await asSuper();
    const target = await createTestUser();
    expect(await deleteUser(target.id, "")).toMatchObject({
      ok: false,
      fieldErrors: { emailConfirmacao: expect.any(String) },
    });
    expect(await deleteUser(target.id, undefined as unknown as string)).toMatchObject({ ok: false });
    expect(await db.user.count({ where: { id: target.id } })).toBe(1);
  });
});
