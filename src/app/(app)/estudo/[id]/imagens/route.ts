// Envio de imagem para `<pasta>\imagens` (ou `<pasta>/imagens`) do Estudo. Nunca sobrescreve: grava com a flag `wx`.
import fs from "node:fs/promises";
import { authErrorResponse } from "@/lib/auth-response";
import { joinFolder, normalizeFolderPath } from "@/features/estudo/folder-path";
import { ensureFolder, imagesDir } from "@/features/estudo/folders";
import { isForeignPath } from "@/features/estudo/path-api";
import { MAX_IMAGE_BYTES, cleanImageStem, detectImageKind, safeImageName } from "@/features/estudo/images";
import { getStudyFolder } from "@/features/estudo/queries";

const SAVE_FAILED = "Não foi possível salvar a imagem.";
const MAX_NAME_ATTEMPTS = 100;

const fail = (status: number, message: string) => Response.json({ message }, { status });

function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

/** Grava `bytes` em `dir` com um nome livre (`nome.ext`, `nome-2.ext`…), sem sobrescrever nada. */
async function writeUnique(dir: string, fileName: string, bytes: Uint8Array): Promise<string | null> {
  // O nome é juntado à pasta: um separador (de qualquer sabor) sairia de `imagens`.
  if (/[\\/]/.test(fileName)) return null;
  const dot = fileName.lastIndexOf(".");
  const stem = fileName.slice(0, dot);
  const extension = fileName.slice(dot);
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? fileName : `${stem}-${attempt}${extension}`;
    try {
      await fs.writeFile(joinFolder(dir, candidate), bytes, { flag: "wx" });
      return candidate;
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
    }
  }
  return null;
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (typeof id !== "string" || id.length === 0) return fail(404, "Registro não encontrado.");

  let pasta: string | null;
  try {
    pasta = await getStudyFolder(id);
  } catch (error) {
    // Sem sessão válida: 401 com a mensagem padrão (o Estudo é sempre conferido por usuário).
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
  if (pasta === null) return fail(404, "Registro não encontrado.");
  // Pastas antigas (relativas) nunca são resolvidas contra a pasta de trabalho do servidor; pasta de
  // outro sabor que o da plataforma (ex.: `/x` no Windows, que viraria `C:\x`) também não.
  const folder = normalizeFolderPath(pasta);
  if (!folder.ok || isForeignPath(folder.path)) return fail(400, "Defina uma pasta válida para usar imagens");

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return fail(400, "Envie a imagem em um formulário.");
  }
  if (!(file instanceof File)) return fail(400, "Selecione uma imagem.");
  if (file.size > MAX_IMAGE_BYTES) return fail(400, "A imagem deve ter no máximo 10 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return fail(400, "O arquivo está vazio.");
  if (bytes.length > MAX_IMAGE_BYTES) return fail(400, "A imagem deve ter no máximo 10 MB.");
  const kind = detectImageKind(bytes);
  if (kind === null) return fail(400, "Use uma imagem PNG, JPG, GIF ou WebP.");

  const dir = imagesDir(folder.path);
  if (!(await ensureFolder(dir))) return fail(500, SAVE_FAILED);

  let saved: string | null;
  try {
    saved = await writeUnique(dir, safeImageName(file.name, new Date(), kind), bytes);
  } catch {
    return fail(500, SAVE_FAILED);
  }
  if (saved === null) return fail(500, SAVE_FAILED);

  return Response.json({ path: `imagens/${saved}`, alt: cleanImageStem(file.name) });
}
