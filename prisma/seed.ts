import "dotenv/config";
import { db } from "../src/lib/db";

const USER_ID = "local-user";

/** Registros de exemplo do protótipo (Design/script.js). `updatedAt` sempre às 12:00 locais. */
const records = [
  { descricao: "Cálculo I — Limites e derivadas", pasta: "Matemática", dataInicial: "2026-08-04", atualizado: "2026-09-25" },
  { descricao: "Anatomia — Sistema nervoso", pasta: "Medicina", dataInicial: "2026-08-11", atualizado: "2026-10-20" },
  { descricao: "Química Orgânica — Funções e nomenclatura", pasta: "Química", dataInicial: "2026-08-18", atualizado: "2026-08-18" },
  { descricao: "Física II — Eletromagnetismo", pasta: "Física", dataInicial: "2026-09-01", atualizado: "2026-10-14" },
  { descricao: "Programação — Estruturas de dados", pasta: "Ciência da Computação", dataInicial: "2026-09-08", atualizado: "2026-10-23" },
  { descricao: "Direito Constitucional — Direitos fundamentais", pasta: "Direito", dataInicial: "2026-09-15", atualizado: "2026-09-15" },
  { descricao: "História do Brasil — Era Vargas", pasta: "História", dataInicial: "2026-09-22", atualizado: "2026-10-05" },
  { descricao: "Inglês — Phrasal verbs essenciais", pasta: "Idiomas", dataInicial: "2026-09-29", atualizado: "2026-10-12" },
];

function noonLocal(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

async function main() {
  await db.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, name: "Usuário local" },
  });
  await db.studyRecord.deleteMany({ where: { userId: USER_ID } });
  for (const { atualizado, pasta, ...record } of records) {
    await db.studyRecord.create({
      // Só o texto do caminho; a criação das pastas em disco não é feita pelo seed.
      data: { userId: USER_ID, ...record, pasta: `C:\\StudyFlow\\${pasta}`, createdAt: noonLocal(record.dataInicial), updatedAt: noonLocal(atualizado) },
    });
  }
  console.log(`Seed concluído: ${records.length} registros para ${USER_ID}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
