// Apaga a configuração de IA do banco e2e (o seed não mexe em AiSettings de propósito: um reseed de
// desenvolvimento não pode apagar a chave salva do usuário). Só roda contra o banco e2e.
import { db } from "../../src/lib/db";

async function main() {
  if (process.env.DATABASE_URL !== "file:./prisma/e2e.db") throw new Error("Use apenas o banco e2e.");
  await db.aiSettings.deleteMany();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
