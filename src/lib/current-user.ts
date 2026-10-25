import { db } from "@/lib/db";

const LOCAL_USER_ID = "local-user";

/**
 * Usuário único por enquanto. Quando o login existir, este é o único ponto
 * a trocar: devolva o id do usuário autenticado.
 */
export async function getCurrentUserId(): Promise<string> {
  const user = await db.user.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, name: "Usuário local" },
  });
  return user.id;
}
