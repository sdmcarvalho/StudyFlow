// Cliente da rota /api/pastas (seletor do campo Pasta). Nunca lança: falhas viram `{ ok: false, message }`.

export type FolderView = { path: string | null; parent: string | null; folders: string[]; drives: string[] };

export type FolderViewResult = { ok: true; view: FolderView } | { ok: false; message: string };
export type CreateFolderResult = { ok: true; path: string } | { ok: false; message: string };

const OPEN_FAILED = "Não foi possível abrir a pasta.";
const CREATE_FAILED = "Não foi possível criar a pasta.";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

async function request(url: string, init?: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> } | null> {
  try {
    const response = await (init ? fetch(url, init) : fetch(url));
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return null;
    return { ok: response.ok, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}

function messageOf(data: Record<string, unknown>, fallback: string): string {
  const { message } = data;
  return typeof message === "string" && message.trim() !== "" ? message : fallback;
}

/** Subpastas de `caminho` (ou só as unidades, com `null`). */
export async function fetchFolder(caminho: string | null): Promise<FolderViewResult> {
  const url = caminho === null ? "/api/pastas" : `/api/pastas?caminho=${encodeURIComponent(caminho)}`;
  const result = await request(url);
  if (result === null) return { ok: false, message: OPEN_FAILED };
  if (!result.ok) return { ok: false, message: messageOf(result.data, OPEN_FAILED) };

  const { path, parent, folders, drives } = result.data;
  if (!isNullableString(path) || !isNullableString(parent) || !isStringArray(folders) || !isStringArray(drives)) {
    return { ok: false, message: OPEN_FAILED };
  }
  return { ok: true, view: { path, parent, folders, drives } };
}

/** Cria `<pai>\<nome>` no disco e devolve o caminho completo. */
export async function createFolder(pai: string, nome: string): Promise<CreateFolderResult> {
  const result = await request("/api/pastas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pai, nome }),
  });
  if (result === null) return { ok: false, message: CREATE_FAILED };
  if (!result.ok) return { ok: false, message: messageOf(result.data, CREATE_FAILED) };
  const { path } = result.data;
  return typeof path === "string" ? { ok: true, path } : { ok: false, message: CREATE_FAILED };
}
