// Seletor de pastas do campo Pasta: lista as subpastas (GET) e cria uma subpasta (POST).
// Só responde quando o Host é este PC ou a rede local, para quem tem sessão, e nunca sai da raiz do
// usuário (`<STUDYFLOW_BASE_DIR>\<folderName>`); o POST também exige JSON e Origin do próprio app.
import { folderKey, normalizeFolderPath } from "@/features/estudo/folder-path";
import { ensureUserRoot, isFolderAllowed, isInsideRoot } from "@/features/estudo/folder-scope";
import {
  CREATE_FAILED,
  FOLDER_EXISTS,
  NO_PERMISSION,
  OPEN_FAILED,
  SLOW_FOLDER,
  createSubfolder,
  isLocalHost,
  listFolder,
} from "@/features/estudo/folder-browser";
import type { SessionUser } from "@/features/auth/types";
import { authErrorResponse } from "@/lib/auth-response";
import { AuthError, getCurrentUser } from "@/lib/current-user";
import { isSameOrigin } from "@/lib/same-origin";

const FORBIDDEN = "O seletor de pastas só funciona neste computador ou na rede local.";
const OUTSIDE_ROOT = "Essa pasta fica fora da sua pasta de estudos.";

const fail = (status: number, message: string) => Response.json({ message }, { status });

/** Status HTTP de uma falha do seletor: mensagens de validação viram 400. */
function statusFor(message: string): number {
  if (message === FOLDER_EXISTS) return 409;
  if (message === NO_PERMISSION) return 403;
  if (message === SLOW_FOLDER) return 504;
  if (message === OPEN_FAILED || message === CREATE_FAILED) return 500;
  return 400;
}

/** Usuário da sessão, ou a resposta 401 para quem não tem sessão válida. */
async function sessionUser(): Promise<{ user: SessionUser } | { response: Response }> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AuthError("unauthenticated");
    return { user };
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return { response };
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!isLocalHost(request.headers.get("host"))) return fail(403, FORBIDDEN);
  const session = await sessionUser();
  if ("response" in session) return session.response;

  // O seletor só vive dentro da raiz do usuário: nunca lista unidades nem sobe além dela.
  const root = await ensureUserRoot(session.user);
  const caminho = new URL(request.url).searchParams.get("caminho");
  const requested = caminho === null || caminho.trim() === "" ? root : caminho;

  const normalized = normalizeFolderPath(requested);
  if (!normalized.ok) return fail(400, normalized.message);
  if (!(await isFolderAllowed(root, normalized.path))) return fail(403, OUTSIDE_ROOT);

  const listing = await listFolder(normalized.path);
  if (!listing.ok) return fail(statusFor(listing.message), listing.message);
  // A raiz foi criada acima, então a listagem (que sobe até a pasta existente mais próxima) para nela.
  if (listing.path === null || !isInsideRoot(root, listing.path)) return fail(500, OPEN_FAILED);
  // A raiz não tem pasta acima.
  const parent = folderKey(listing.path) === folderKey(root) ? null : listing.parent;
  return Response.json({ path: listing.path, parent, folders: listing.folders, drives: [] });
}

export async function POST(request: Request): Promise<Response> {
  if (!isLocalHost(request.headers.get("host")) || !isSameOrigin(request)) return fail(403, FORBIDDEN);
  const session = await sessionUser();
  if ("response" in session) return session.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return fail(415, "Envie os dados em JSON.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Envie os dados em JSON.");
  }
  const { pai, nome } = (body ?? {}) as { pai?: unknown; nome?: unknown };
  if (typeof pai !== "string" || typeof nome !== "string") return fail(400, "Informe a pasta e o nome.");

  const parent = normalizeFolderPath(pai);
  if (!parent.ok) return fail(400, parent.message);
  const root = await ensureUserRoot(session.user);
  if (!(await isFolderAllowed(root, parent.path))) return fail(403, OUTSIDE_ROOT);

  const result = await createSubfolder(parent.path, nome);
  if (!result.ok) return fail(statusFor(result.message), result.message);
  return Response.json({ path: result.path }, { status: 201 });
}
