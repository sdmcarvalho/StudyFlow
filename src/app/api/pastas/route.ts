// Seletor de pastas do campo Pasta: lista unidades/subpastas (GET) e cria uma subpasta (POST).
// Só responde quando o Host é este PC ou a rede local; o POST também exige JSON e Origin do próprio app.
import {
  CREATE_FAILED,
  FOLDER_EXISTS,
  NO_PERMISSION,
  OPEN_FAILED,
  SLOW_FOLDER,
  createSubfolder,
  isLocalHost,
  listDrives,
  listFolder,
} from "@/features/estudo/folder-browser";
import { isSameOrigin } from "@/lib/same-origin";

const FORBIDDEN = "O seletor de pastas só funciona neste computador ou na rede local.";

const fail = (status: number, message: string) => Response.json({ message }, { status });

/** Status HTTP de uma falha do seletor: mensagens de validação viram 400. */
function statusFor(message: string): number {
  if (message === FOLDER_EXISTS) return 409;
  if (message === NO_PERMISSION) return 403;
  if (message === SLOW_FOLDER) return 504;
  if (message === OPEN_FAILED || message === CREATE_FAILED) return 500;
  return 400;
}

export async function GET(request: Request): Promise<Response> {
  if (!isLocalHost(request.headers.get("host"))) return fail(403, FORBIDDEN);

  const caminho = new URL(request.url).searchParams.get("caminho");
  const drives = await listDrives();
  if (caminho === null || caminho.trim() === "") return Response.json({ path: null, parent: null, folders: [], drives });

  const listing = await listFolder(caminho);
  if (!listing.ok) return fail(statusFor(listing.message), listing.message);
  return Response.json({ path: listing.path, parent: listing.parent, folders: listing.folders, drives });
}

export async function POST(request: Request): Promise<Response> {
  if (!isLocalHost(request.headers.get("host")) || !isSameOrigin(request)) return fail(403, FORBIDDEN);
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

  const result = await createSubfolder(pai, nome);
  if (!result.ok) return fail(statusFor(result.message), result.message);
  return Response.json({ path: result.path }, { status: 201 });
}
