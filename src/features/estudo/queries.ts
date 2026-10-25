import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";
import { buildListPage, type ListPage } from "./list";

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
