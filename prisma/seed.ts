import "dotenv/config";
import path from "node:path";
import { baseFolder, ensureFolder } from "../src/features/estudo/folders";
import { db } from "../src/lib/db";
import { clearUserDataForSeed } from "./seed-guard";

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
  // Os exemplos pertencem ao superusuário, criado antes por `npm run auth:bootstrap`.
  const superuser = await db.user.findFirst({ where: { role: "SUPER" } });
  if (!superuser) throw new Error("Rode npm run auth:bootstrap antes do seed.");
  if (!superuser.folderName) throw new Error("O superusuário não tem pasta (folderName); rode npm run auth:bootstrap.");
  const userId = superuser.id;
  // Recusa (sem apagar nada) se o superusuário já tem dados, a menos que SEED_FORCE=1 (só em bancos de teste).
  await clearUserDataForSeed(userId, { force: process.env.SEED_FORCE === "1" });
  // Pastas reais em <STUDYFLOW_BASE_DIR>\<pasta do usuário>\<nome>; as que já existem ficam como estão (nada é apagado).
  const base = path.win32.join(baseFolder(), superuser.folderName);
  for (const { atualizado, pasta: nome, ...record } of records) {
    const pasta = path.win32.join(base, nome);
    if (!(await ensureFolder(pasta))) throw new Error(`Não foi possível criar a pasta ${pasta}.`);
    await db.studyRecord.create({
      data: { userId, ...record, pasta, createdAt: noonLocal(record.dataInicial), updatedAt: noonLocal(atualizado) },
    });
  }
  console.log(`Seed concluído: ${records.length} registros para ${superuser.email ?? superuser.name} (${userId}) em ${base}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
