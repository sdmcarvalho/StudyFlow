import { db } from "@/lib/db";
import { slugFolderName, uniqueFolderName } from "./folder-name";
import { hashPassword } from "./password";
import { parseCreateUserInput } from "./schema";

export type BootstrapInput = { email: string; password: string; name: string };
export type BootstrapResult = { status: "created" | "converted" | "exists"; userId: string };

const LEGACY_USER_ID = "local-user";

/**
 * Garante o único superusuário. Já existindo um SUPER, não mexe em nada (nem na senha); existindo o
 * `local-user` legado, converte-o no lugar (mesmo id, então os Estudos continuam dele); senão cria do zero.
 */
export async function bootstrapSuperuser(input: BootstrapInput): Promise<BootstrapResult> {
  const parsed = parseCreateUserInput({ nome: input.name, email: input.email, senha: input.password });
  if (!parsed.ok) {
    const message = Object.values(parsed.fieldErrors)[0];
    throw new Error(message ?? "Dados do superusuário inválidos.");
  }
  const { nome, email, senha } = parsed.data;

  const superuser = await db.user.findFirst({ where: { role: "SUPER" } });
  if (superuser) return { status: "exists", userId: superuser.id };

  const legacy = await db.user.findUnique({ where: { id: LEGACY_USER_ID } });
  const others = await db.user.findMany({
    where: legacy ? { id: { not: LEGACY_USER_ID } } : {},
    select: { folderName: true },
  });
  const taken = others.flatMap((user) => (user.folderName ? [user.folderName] : []));
  const data = {
    name: nome,
    email,
    passwordHash: await hashPassword(senha),
    folderName: uniqueFolderName(slugFolderName(nome), taken),
    role: "SUPER" as const,
  };

  if (legacy) {
    await db.user.update({ where: { id: legacy.id }, data });
    return { status: "converted", userId: legacy.id };
  }
  const created = await db.user.create({ data });
  return { status: "created", userId: created.id };
}
