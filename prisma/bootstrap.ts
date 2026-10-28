// Cria (ou converte o usuário local legado em) o único superusuário. Lê SUPERUSER_EMAIL,
// SUPERUSER_PASSWORD e SUPERUSER_NAME do ambiente/.env. Rode com `npm run auth:bootstrap`.
import "dotenv/config";
import { bootstrapSuperuser } from "../src/features/auth/bootstrap";
import { db } from "../src/lib/db";

const MESSAGES = {
  created: "Superusuário criado.",
  converted: "Usuário local convertido em superusuário (os Estudos existentes foram mantidos).",
  exists: "Já existe um superusuário; nada foi alterado.",
};

async function main() {
  const email = process.env.SUPERUSER_EMAIL;
  const password = process.env.SUPERUSER_PASSWORD;
  const name = process.env.SUPERUSER_NAME;
  const missing = [
    !email && "SUPERUSER_EMAIL",
    !password && "SUPERUSER_PASSWORD",
    !name && "SUPERUSER_NAME",
  ].filter(Boolean);
  if (!email || !password || !name) {
    throw new Error(`Defina ${missing.join(", ")} no ambiente ou no .env antes de rodar npm run auth:bootstrap.`);
  }
  const { status, userId } = await bootstrapSuperuser({ email, password, name });
  console.log(`${MESSAGES[status]} (${status}, id ${userId})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
