// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => import("./helpers/next-headers"));

import { GET } from "@/app/(app)/estudo/[id]/imagens/[arquivo]/route";
import { POST } from "@/app/(app)/estudo/[id]/imagens/route";
import { getStudyFolder } from "@/features/estudo/queries";
import { MAX_IMAGE_BYTES } from "@/features/estudo/images";
import { getCurrentUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createTestUser, signInAs, signOut } from "./helpers/auth";

// PNG real de 1x1 pixel.
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

let base: string;
let counter = 0;

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "studyflow-images-"));
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.studyRecord.deleteMany();
  await db.aiSettings.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  signOut();
  await signInAs(await createTestUser());
});

afterEach(() => {
  vi.useRealTimers();
});

/** Estudo do usuário atual (ou de `userId`) com uma pasta temporária nova. */
async function createStudy(options: { userId?: string; pasta?: string; deleted?: boolean } = {}) {
  const userId = options.userId ?? (await getCurrentUserId());
  const pasta = options.pasta ?? path.join(base, `Estudo${++counter}`);
  const record = await db.studyRecord.create({
    data: {
      userId,
      descricao: "Estudo",
      pasta,
      dataInicial: "2026-08-04",
      deletedAt: options.deleted ? new Date() : null,
    },
  });
  return { id: record.id, pasta };
}

function upload(id: string, file?: File | string) {
  const form = new FormData();
  if (file !== undefined) form.append("file", file);
  const request = new Request(`http://localhost/estudo/${id}/imagens`, { method: "POST", body: form });
  return POST(request, { params: Promise.resolve({ id }) });
}

function download(id: string, arquivo: string) {
  const request = new Request(`http://localhost/estudo/${id}/imagens/${arquivo}`);
  return GET(request, { params: Promise.resolve({ id, arquivo }) });
}

async function listImages(pasta: string): Promise<string[]> {
  return fs.readdir(path.join(pasta, "imagens")).catch(() => []);
}

const pngFile = (name = "Foto da Praia.png") => new File([PNG_BYTES], name, { type: "image/png" });

describe("getStudyFolder", () => {
  it("devolve a pasta do Estudo do usuário e null nos outros casos", async () => {
    const { id, pasta } = await createStudy();
    expect(await getStudyFolder(id)).toBe(pasta);
    expect(await getStudyFolder("nao-existe")).toBeNull();
    expect(await getStudyFolder("")).toBeNull();
    expect(await getStudyFolder({ not: "x" } as unknown as string)).toBeNull();

    const other = await db.user.create({ data: { name: "Outro" } });
    const alheio = await createStudy({ userId: other.id });
    expect(await getStudyFolder(alheio.id)).toBeNull();

    const excluido = await createStudy({ deleted: true });
    expect(await getStudyFolder(excluido.id)).toBeNull();
  });
});

describe("POST /estudo/[id]/imagens", () => {
  it("grava um PNG válido em <pasta>\\imagens e devolve o caminho relativo", async () => {
    const { id, pasta } = await createStudy();
    const response = await upload(id, pngFile());
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.path).toMatch(/^imagens\/foto-da-praia-\d{8}-\d{6}\.png$/);
    expect(body.alt).toBe("foto-da-praia");

    const saved = await fs.readFile(path.join(pasta, body.path.replace("imagens/", "imagens\\")));
    expect(new Uint8Array(saved)).toEqual(PNG_BYTES);
  });

  it.each([
    ["texto chamado a.png", () => new File(["isto não é uma imagem"], "a.png", { type: "image/png" })],
    ["arquivo vazio", () => new File([], "a.png", { type: "image/png" })],
    [
      "10 MB + 1 byte",
      () => {
        const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
        big.set(PNG_BYTES);
        return new File([big], "grande.png", { type: "image/png" });
      },
    ],
    [
      "SVG",
      () => new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "a.svg", { type: "image/svg+xml" }),
    ],
    ["campo file como texto", () => "não é arquivo"],
    ["requisição sem arquivo", () => undefined],
  ])("%s devolve 400 com mensagem e não cria arquivo", async (_label, makeFile) => {
    const { id, pasta } = await createStudy();
    const response = await upload(id, makeFile());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
    expect(await listImages(pasta)).toEqual([]);
  });

  it("corpo que não é formulário devolve 400", async () => {
    const { id } = await createStudy();
    const request = new Request(`http://localhost/estudo/${id}/imagens`, { method: "POST", body: "xyz" });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
  });

  it("dois envios do mesmo nome no mesmo segundo geram nomes diferentes e nunca sobrescrevem", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 25, 10, 15, 30));
    const { id, pasta } = await createStudy();

    // Um arquivo que já existe com o nome que seria gerado continua intacto.
    await fs.mkdir(path.join(pasta, "imagens"), { recursive: true });
    const existing = path.join(pasta, "imagens", "foto-20261025-101530.png");
    await fs.writeFile(existing, "original");

    const first = await (await upload(id, pngFile("foto.png"))).json();
    const second = await (await upload(id, pngFile("foto.png"))).json();
    expect(first.path).not.toBe(second.path);
    expect(first.path).not.toBe("imagens/foto-20261025-101530.png");
    expect(second.path).not.toBe("imagens/foto-20261025-101530.png");
    expect(await fs.readFile(existing, "utf8")).toBe("original");
    expect((await listImages(pasta)).sort()).toHaveLength(3);
  });

  it("Estudo inexistente, de outro usuário ou excluído devolve 404 e não grava", async () => {
    const other = await db.user.create({ data: { name: "Outro" } });
    const alheio = await createStudy({ userId: other.id });
    const excluido = await createStudy({ deleted: true });

    for (const id of ["nao-existe", alheio.id, excluido.id]) {
      const response = await upload(id, pngFile());
      expect(response.status).toBe(404);
      expect(typeof (await response.json()).message).toBe("string");
    }
    expect(await listImages(alheio.pasta)).toEqual([]);
    expect(await listImages(excluido.pasta)).toEqual([]);
  });

  it("id vazio ou que não é texto devolve 404", async () => {
    for (const id of ["", 123 as unknown as string]) {
      const form = new FormData();
      form.append("file", pngFile());
      const request = new Request("http://localhost/estudo/x/imagens", { method: "POST", body: form });
      const response = await POST(request, { params: Promise.resolve({ id }) });
      expect(response.status).toBe(404);
    }
  });

  it("Estudo com pasta antiga (relativa) devolve 400 e não toca o disco", async () => {
    const cwdBefore = await fs.readdir(process.cwd());
    const { id } = await createStudy({ pasta: "Matemática" });
    const response = await upload(id, pngFile());
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Defina uma pasta válida para usar imagens");
    expect(await fs.readdir(process.cwd())).toEqual(cwdBefore);
  });

  it("Estudo com pasta de outro sabor que o da plataforma devolve 400 e não grava", async () => {
    // No Windows, `/x` seria gravado em `C:\x`; no Linux, `C:\x` viraria um caminho relativo.
    const foreign = process.platform === "win32" ? `/studyflow-teste-${Date.now()}` : "C:\\studyflow-teste";
    const { id } = await createStudy({ pasta: foreign });
    const response = await upload(id, pngFile());
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Defina uma pasta válida para usar imagens");
    if (process.platform === "win32") {
      await expect(fs.stat(path.resolve(foreign))).rejects.toThrow();
    }
  });

  it("pasta inacessível devolve 500 com a mensagem de erro de disco", async () => {
    const { id, pasta } = await createStudy();
    await fs.mkdir(pasta, { recursive: true });
    await fs.writeFile(path.join(pasta, "imagens"), "um arquivo no lugar da pasta");
    const response = await upload(id, pngFile());
    expect(response.status).toBe(500);
    expect((await response.json()).message).toBe("Não foi possível salvar a imagem.");
  });
});

describe("GET /estudo/[id]/imagens/[arquivo]", () => {
  it("devolve a imagem gravada com o tipo e nosniff", async () => {
    const { id } = await createStudy();
    const { path: relative } = await (await upload(id, pngFile())).json();
    const response = await download(id, relative.slice("imagens/".length));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it.each(["nao-existe.png", "..%5C..%5Cx.png", "..\\..\\x.png", "a%2Fb.png", "a/b.png", "%2e%2e", "..", "x.svg"])(
    "devolve 404 para %s",
    async (arquivo) => {
      const { id, pasta } = await createStudy();
      await upload(id, pngFile());
      // um x.png e um x.svg reais fora e dentro de imagens: nenhum pode vazar
      await fs.writeFile(path.join(pasta, "x.png"), PNG_BYTES);
      await fs.writeFile(path.join(pasta, "imagens", "x.svg"), "<svg></svg>");
      const response = await download(id, arquivo);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(pasta);
    },
  );

  it("devolve 404 para um .png que é link simbólico para fora de imagens", async (ctx) => {
    const { id, pasta } = await createStudy();
    await upload(id, pngFile());
    const outside = path.join(pasta, "segredo.png");
    await fs.writeFile(outside, PNG_BYTES);
    try {
      await fs.symlink(outside, path.join(pasta, "imagens", "link.png"), "file");
    } catch {
      ctx.skip(); // o sistema não permite criar links simbólicos sem privilégio
    }
    const response = await download(id, "link.png");
    expect(response.status).toBe(404);
  });

  it("devolve 404 para Estudo de outro usuário, excluído, inexistente ou id inválido", async () => {
    const other = await db.user.create({ data: { name: "Outro" } });
    for (const options of [{ userId: other.id }, { deleted: true }]) {
      const study = await createStudy(options);
      await fs.mkdir(path.join(study.pasta, "imagens"), { recursive: true });
      await fs.writeFile(path.join(study.pasta, "imagens", "a.png"), PNG_BYTES);
      expect((await download(study.id, "a.png")).status).toBe(404);
    }
    expect((await download("nao-existe", "a.png")).status).toBe(404);
    expect((await download("", "a.png")).status).toBe(404);
  });

  it("Estudo com pasta antiga (relativa) devolve 404", async () => {
    const { id } = await createStudy({ pasta: "Matemática" });
    expect((await download(id, "a.png")).status).toBe(404);
  });

  it("Estudo com pasta de outro sabor que o da plataforma devolve 404", async () => {
    const real = path.join(base, `Estudo${++counter}`);
    await fs.mkdir(path.join(real, "imagens"), { recursive: true });
    await fs.writeFile(path.join(real, "imagens", "a.png"), PNG_BYTES);
    // No Windows, a mesma pasta escrita como POSIX (`/Users/...`, sem a letra) apontaria para ela.
    const foreign = process.platform === "win32" ? real.slice(2).replaceAll("\\", "/") : `C:${real}`;
    const { id } = await createStudy({ pasta: foreign });
    expect((await download(id, "a.png")).status).toBe(404);
  });
});
