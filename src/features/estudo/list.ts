export const PAGE_SIZE = 5;

export type StudyRecordRow = {
  id: string;
  descricao: string;
  pasta: string;
  dataInicial: string;
  dataAtualizacao: string;
};

export type ListPage = {
  items: StudyRecordRow[];
  /** Registros após o filtro de busca. */
  total: number;
  /** Registros sem filtro, para distinguir "vazio" de "sem resultado". */
  totalAll: number;
  page: number;
  totalPages: number;
  /** Índice (base 0) do primeiro item da página. */
  start: number;
};

export function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function parsePageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return 1;
  return Number(value);
}

export function parseQueryParam(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? "";
}

/** Filtra e pagina, mantendo a ordem recebida (a ordenação é feita na query). */
export function buildListPage(rows: StudyRecordRow[], opts: { q: string; page: number }): ListPage {
  const query = normalize(opts.q.trim());
  const filtered = query
    ? rows.filter((row) => normalize(row.descricao).includes(query) || normalize(row.pasta).includes(query))
    : rows;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number.isFinite(opts.page) ? Math.trunc(opts.page) : 1;
  const page = Math.min(Math.max(1, requested), totalPages);
  const start = (page - 1) * PAGE_SIZE;

  return {
    items: filtered.slice(start, start + PAGE_SIZE),
    total: filtered.length,
    totalAll: rows.length,
    page,
    totalPages,
    start,
  };
}

export function buildStudyHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/estudo?${query}` : "/estudo";
}
