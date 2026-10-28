// Exibição de uma imagem de `<pasta>\imagens` do próprio Estudo. Qualquer falha é um 404 sem detalhes.
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeFolderPath } from "@/features/estudo/folder-path";
import { imagesDir } from "@/features/estudo/folders";
import { contentTypeFor, isSafeImageFileName } from "@/features/estudo/images";
import { getStudyFolder } from "@/features/estudo/queries";

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });

/** `true` quando `target` é um item direto de `dir` (os dois já passados por realpath). */
function isDirectChild(dir: string, target: string): boolean {
  const relative = path.relative(dir, target);
  return relative !== "" && !path.isAbsolute(relative) && !relative.includes(path.sep) && relative !== "..";
}

async function readImage(id: string, arquivo: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string } | null> {
  if (typeof id !== "string" || id.length === 0) return null;
  if (!isSafeImageFileName(arquivo)) return null;
  const type = contentTypeFor(arquivo);
  if (type === null) return null;

  // Qualquer falha ao achar o Estudo (inclusive sem sessão) é "não encontrado", sem detalhes.
  const pasta = await getStudyFolder(id).catch(() => null);
  if (pasta === null) return null;
  // Pastas antigas (relativas) nunca são resolvidas contra a pasta de trabalho do servidor.
  const folder = normalizeFolderPath(pasta);
  if (!folder.ok) return null;

  const dir = imagesDir(folder.path);
  try {
    const realDir = await fs.realpath(dir);
    const realFile = await fs.realpath(path.win32.join(dir, arquivo));
    // Links simbólicos e junções que apontam para fora de `imagens` não passam.
    if (!isDirectChild(realDir, realFile)) return null;
    const handle = await fs.open(realFile, "r");
    try {
      if (!(await handle.stat()).isFile()) return null;
      return { bytes: new Uint8Array(await handle.readFile()), type };
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; arquivo: string }> },
): Promise<Response> {
  const { id, arquivo } = await ctx.params;
  const image = await readImage(id, arquivo);
  if (image === null) return notFound();
  return new Response(image.bytes, {
    status: 200,
    headers: {
      "Content-Type": image.type,
      "Content-Length": String(image.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
