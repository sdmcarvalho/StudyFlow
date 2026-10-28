import { SESSION_COOKIE } from "@/features/auth/constants";
import { hashPassword } from "@/features/auth/password";
import { createSession } from "@/features/auth/session";
import { slugFolderName, uniqueFolderName } from "@/features/auth/folder-name";
import type { Role } from "@/features/auth/types";
import { db } from "@/lib/db";
import { cookies, resetCookies } from "./next-headers";

export const TEST_PASSWORD = "Senha1234";

type Overrides = { role?: Role; email?: string; name?: string; active?: boolean; folderName?: string };

let counter = 0;

/** Cria um usuário real no banco (senha "Senha1234"); sempre com folderName. */
export async function createTestUser(overrides: Overrides = {}) {
  counter += 1;
  const name = overrides.name ?? "Usuário de teste";
  const email = overrides.email ?? `teste${counter}-${Date.now()}@exemplo.com`;
  let folderName = overrides.folderName;
  if (!folderName) {
    const existing = await db.user.findMany({ select: { folderName: true } });
    const taken = existing.flatMap((user) => (user.folderName ? [user.folderName] : []));
    folderName = uniqueFolderName(slugFolderName(name), taken);
  }
  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      folderName,
      role: overrides.role ?? "USER",
      active: overrides.active ?? true,
    },
  });
  return { id: user.id, name: user.name, email, role: user.role, folderName };
}

/** Cria uma sessão real e grava o cookie simulado; devolve o token. */
export async function signInAs(user: { id: string }): Promise<string> {
  const { token } = await createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, token);
  return token;
}

export function signOut(): void {
  resetCookies();
}
