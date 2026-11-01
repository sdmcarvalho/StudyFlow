// Insere um Estudo direto no banco e2e (sem passar pela validação do app), para simular dados
// antigos como uma pasta relativa. O registro vem em E2E_STUDY ({"descricao":"…","pasta":"…"}).
// Só roda com DATABASE_URL apontando para o banco e2e (ver insertStudy em helpers.ts).
import { db } from "../../src/lib/db";

async function main() {
  if (process.env.DATABASE_URL !== "file:./prisma/e2e.db") throw new Error("Use apenas o banco e2e.");
  const { descricao, pasta, cells } = JSON.parse(process.env.E2E_STUDY ?? "{}") as {
    descricao: string;
    pasta: string;
    cells?: string[];
  };
  const superuser = await db.user.findFirst({ where: { role: "SUPER" } });
  if (!superuser) throw new Error("O banco e2e não tem superusuário; rode resetData() antes.");
  // `cells` (opcional): o texto de cada célula do conteúdo do Estudo, na ordem.
  const conteudo = JSON.stringify((cells ?? []).map((texto, i) => ({ id: `e2e-cell-${i + 1}`, texto })));
  const record = await db.studyRecord.create({
    data: { userId: superuser.id, descricao, pasta, dataInicial: "2026-10-01", ...(cells ? { conteudo } : {}) },
  });
  process.stdout.write(record.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
