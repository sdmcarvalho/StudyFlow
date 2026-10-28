// Limpa os usuários do banco e2e antes de cada reset: apaga os usuários que não são SUPER, com seus
// dados e sessões, e as sessões do SUPER (logins de testes anteriores). Só roda contra o banco e2e.
import { db } from "../../src/lib/db";

async function main() {
  if (process.env.DATABASE_URL !== "file:./prisma/e2e.db") throw new Error("Use apenas o banco e2e.");
  const others = { user: { role: { not: "SUPER" as const } } };
  // Ordem das chaves estrangeiras: resultados e agendas antes dos cards e dos Estudos, e tudo antes do usuário.
  await db.cardResult.deleteMany({ where: others });
  await db.schedule.deleteMany({ where: others });
  await db.card.deleteMany({ where: others });
  await db.studyRecord.deleteMany({ where: others });
  await db.aiSettings.deleteMany({ where: others });
  await db.session.deleteMany();
  await db.user.deleteMany({ where: { role: { not: "SUPER" } } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
