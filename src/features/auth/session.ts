import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { SESSION_DAYS } from "./constants";
import type { SessionUser } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** O banco guarda só o SHA-256 (hex) do token: um vazamento do banco não entrega sessões válidas. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function findSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const { user } = session;
  if (!user.active || !user.email || !user.folderName) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, folderName: user.folderName };
}

export async function deleteSession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Apaga todas as sessões do usuário, menos a de `exceptToken` (ex.: a sessão atual ao trocar a senha). */
export async function deleteUserSessions(userId: string, exceptToken?: string): Promise<void> {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { tokenHash: { not: hashToken(exceptToken) } } : {}) },
  });
}
