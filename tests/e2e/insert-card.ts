// Insere um card direto no banco e2e (sem passar pelo editor), para montar o cenário do teste.
// O registro vem em E2E_CARD ({"studyId":"…","tema":"…","pergunta":"…","resposta":"…"}).
// Só roda com DATABASE_URL apontando para o banco e2e (ver insertCard em helpers.ts).
import { db } from "../../src/lib/db";

async function main() {
  if (process.env.DATABASE_URL !== "file:./prisma/e2e.db") throw new Error("Use apenas o banco e2e.");
  const { studyId, tema, pergunta, resposta } = JSON.parse(process.env.E2E_CARD ?? "{}") as {
    studyId: string;
    tema: string;
    pergunta: string;
    resposta: string;
  };
  const study = await db.studyRecord.findUnique({ where: { id: studyId } });
  if (!study) throw new Error("Estudo não encontrado no banco e2e.");
  const record = await db.card.create({
    data: {
      userId: study.userId,
      studyId,
      cellId: `e2e-${Math.random().toString(36).slice(2, 10)}`,
      tema,
      pergunta,
      resposta,
    },
  });
  process.stdout.write(record.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
