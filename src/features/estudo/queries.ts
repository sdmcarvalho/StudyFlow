import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";
import { parseStoredContent, type Cell } from "./content-schema";
import { buildListPage, type ListPage } from "./list";

export type StudyDocument = { id: string; descricao: string; pasta: string; cells: Cell[] };

/** O id vem da rota: só um texto não vazio chega ao Prisma (um objeto de filtro atingiria outros registros). */
export async function getStudyDocument(id: string): Promise<StudyDocument | null> {
  if (typeof id !== "string" || id.length === 0) return null;
  const userId = await getCurrentUserId();
  const record = await db.studyRecord.findFirst({ where: { id, userId, deletedAt: null } });
  if (!record) return null;
  return {
    id: record.id,
    descricao: record.descricao,
    pasta: record.pasta,
    cells: parseStoredContent(record.conteudo),
  };
}

export async function listStudyRecords(params: { q?: string; page?: number }): Promise<ListPage> {
  const userId = await getCurrentUserId();
  const records = await db.studyRecord.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  const rows = records.map((record) => ({
    id: record.id,
    descricao: record.descricao,
    pasta: record.pasta,
    dataInicial: record.dataInicial,
    dataAtualizacao: toIsoDate(record.updatedAt),
  }));

  return buildListPage(rows, { q: params.q ?? "", page: params.page ?? 1 });
}
