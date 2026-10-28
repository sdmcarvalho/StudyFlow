// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapSuperuser } from "@/features/auth/bootstrap";
import { verifyPassword } from "@/features/auth/password";
import { db } from "@/lib/db";

const INPUT = { email: "  Admin@Exemplo.COM ", password: "Senha1234", name: "Administrador" };

async function clean() {
  await db.cardResult.deleteMany();
  await db.schedule.deleteMany();
  await db.card.deleteMany();
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
}

let baseDir = "";

beforeEach(async () => {
  // Pasta base nova e vazia: o bootstrap não pode olhar o C:\StudyFlow real.
  baseDir = await mkdtemp(path.join(os.tmpdir(), "studyflow-boot-"));
  vi.stubEnv("STUDYFLOW_BASE_DIR", baseDir);
  await clean();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(baseDir, { recursive: true, force: true });
});

describe("bootstrapSuperuser", () => {
  it("escolhe uma pasta livre quando o nome já existe no disco (de um usuário excluído)", async () => {
    await mkdir(path.join(baseDir, "administrador")); // caixa diferente de "Administrador"
    const result = await bootstrapSuperuser(INPUT);
    expect(result.status).toBe("created");
    const user = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.folderName).toBe("Administrador 2");
  });

  it("ao converter o local-user, também evita a pasta que já existe no disco", async () => {
    await db.user.create({ data: { id: "local-user", name: "Usuário local" } });
    await mkdir(path.join(baseDir, "Administrador"));
    await bootstrapSuperuser(INPUT);
    const user = await db.user.findUniqueOrThrow({ where: { id: "local-user" } });
    expect(user.folderName).toBe("Administrador 2");
  });

  it("converte o local-user no lugar, mantendo o id e os dados", async () => {
    await db.user.create({ data: { id: "local-user", name: "Usuário local" } });
    const study = await db.studyRecord.create({
      data: { userId: "local-user", descricao: "Cálculo I", pasta: "C:\\StudyFlow\\Calculo", dataInicial: "2026-08-04" },
    });

    const result = await bootstrapSuperuser(INPUT);

    expect(result).toEqual({ status: "converted", userId: "local-user" });
    const user = await db.user.findUniqueOrThrow({ where: { id: "local-user" } });
    expect(user.role).toBe("SUPER");
    expect(user.name).toBe("Administrador");
    expect(user.email).toBe("admin@exemplo.com");
    expect(user.folderName).toBe("Administrador");
    expect(await verifyPassword("Senha1234", user.passwordHash)).toBe(true);
    const kept = await db.studyRecord.findUniqueOrThrow({ where: { id: study.id } });
    expect(kept.userId).toBe("local-user");
    expect(await db.studyRecord.count()).toBe(1); // nenhum registro duplicado ou órfão
    expect(await db.user.count()).toBe(1);
  });

  it("cria o superusuário do zero quando não há local-user", async () => {
    const result = await bootstrapSuperuser(INPUT);

    expect(result.status).toBe("created");
    const user = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user).toMatchObject({ role: "SUPER", email: "admin@exemplo.com", folderName: "Administrador", active: true });
    expect(await verifyPassword("Senha1234", user.passwordHash)).toBe(true);
  });

  it("devolve exists sem alterar nada (nem a senha) quando já há um SUPER", async () => {
    const first = await bootstrapSuperuser(INPUT);
    const before = await db.user.findUniqueOrThrow({ where: { id: first.userId } });

    const second = await bootstrapSuperuser({ email: "outro@exemplo.com", password: "OutraSenha99", name: "Outro" });

    expect(second).toEqual({ status: "exists", userId: first.userId });
    const after = await db.user.findUniqueOrThrow({ where: { id: first.userId } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.email).toBe("admin@exemplo.com");
    expect(await db.user.count({ where: { role: "SUPER" } })).toBe(1);
    expect(await db.user.count()).toBe(1);
  });

  it("recusa senha inválida, com a mensagem do campo, e não cria nada", async () => {
    await expect(bootstrapSuperuser({ ...INPUT, password: "curta" })).rejects.toThrow("Use pelo menos 8 caracteres.");
    expect(await db.user.count()).toBe(0);
  });

  it("recusa e-mail inválido sem criar nada", async () => {
    await expect(bootstrapSuperuser({ ...INPUT, email: "isto-nao-e-email" })).rejects.toThrow("Informe um e-mail válido.");
    expect(await db.user.count()).toBe(0);
  });
});
