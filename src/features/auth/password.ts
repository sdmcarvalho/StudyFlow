import { compare, hash } from "bcryptjs";

const COST = 10;

// Hash descartável (de uma senha aleatória já esquecida): quando o usuário não existe, comparamos contra
// ele para que a resposta leve o mesmo tempo e não revele se o e-mail está cadastrado.
const DUMMY_HASH = "$2b$10$mrjQIsFR3k1ZiiL9icJJg.XNraxodUo1WOz9/MkO06QkFBlf1seZi";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, COST);
}

export async function verifyPassword(plain: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) {
    await compare(plain, DUMMY_HASH);
    return false;
  }
  return compare(plain, passwordHash);
}
