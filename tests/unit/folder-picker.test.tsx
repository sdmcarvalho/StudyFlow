import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderPicker } from "@/features/estudo/components/FolderPicker";
import { createFolder, fetchFolder } from "@/features/estudo/folder-api";

type View = { path: string | null; parent: string | null; folders: string[]; drives: string[] };

const DRIVES = ["C:\\", "D:\\"];

/** Disco simulado: pastas por caminho (chave em minúsculas). */
let disk: Record<string, string[]>;
let fetchMock: ReturnType<typeof vi.fn>;

function parentOf(path: string): string | null {
  if (/^[A-Z]:\\$/.test(path)) return null;
  const index = path.lastIndexOf("\\");
  const parent = path.slice(0, index);
  return /^[A-Z]:$/.test(parent) ? `${parent}\\` : parent;
}

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function handle(url: string, init?: RequestInit) {
  const parsed = new URL(url, "http://localhost");
  if (init?.method === "POST") {
    const { pai, nome } = JSON.parse(String(init.body));
    const list = disk[pai.toLowerCase()];
    if (list.includes(nome)) return json(409, { message: "Já existe uma pasta com esse nome." });
    list.push(nome);
    const created = pai.endsWith("\\") ? `${pai}${nome}` : `${pai}\\${nome}`;
    disk[created.toLowerCase()] = [];
    return json(201, { path: created });
  }
  const caminho = parsed.searchParams.get("caminho");
  if (caminho === null) return json(200, { path: null, parent: null, folders: [], drives: DRIVES } satisfies View);
  const folders = disk[caminho.toLowerCase()];
  if (!folders) return json(400, { message: "Informe um caminho absoluto, como C:\\Estudos\\Cálculo." });
  return json(200, { path: caminho, parent: parentOf(caminho), folders: [...folders], drives: DRIVES } satisfies View);
}

beforeEach(() => {
  disk = {
    "c:\\": ["Estudos", "Teste"],
    "c:\\estudos": ["Cálculo", "Física"],
    "c:\\estudos\\física": [],
    "c:\\estudos\\cálculo": [],
    "c:\\teste": [],
    "d:\\": ["Backup"],
  };
  fetchMock = vi.fn((url: string, init?: RequestInit) => handle(url, init));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPicker(initialPath = "C:\\Estudos") {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  render(<FolderPicker initialPath={initialPath} onSelect={onSelect} onCancel={onCancel} />);
  return { onSelect, onCancel };
}

const list = () => screen.getByRole("list", { name: "Subpastas" });
const select = () => screen.getByRole("button", { name: "Selecionar esta pasta" });

describe("FolderPicker", () => {
  it("abre na pasta inicial e lista as subpastas", async () => {
    renderPicker();
    expect(await within(list()).findByRole("button", { name: "Física" })).toBeInTheDocument();
    expect(within(list()).getByRole("button", { name: "Cálculo" })).toBeInTheDocument();
    expect(screen.getByText("C:\\Estudos", { selector: "output" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/pastas?caminho=${encodeURIComponent("C:\\Estudos")}`);
  });

  it("entrar numa subpasta e selecionar devolve o caminho completo", async () => {
    const { onSelect } = renderPicker();
    await userEvent.click(await within(list()).findByRole("button", { name: "Física" }));
    await screen.findByText("C:\\Estudos\\Física", { selector: "output" });
    expect(screen.getByText("Nenhuma subpasta.")).toBeInTheDocument();
    await userEvent.click(select());
    expect(onSelect).toHaveBeenCalledWith("C:\\Estudos\\Física");
  });

  it("“Pasta acima” sobe um nível; na raiz mostra as unidades", async () => {
    renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    await userEvent.click(screen.getByRole("button", { name: "Pasta acima" }));
    await screen.findByText("C:\\", { selector: "output" });
    expect(within(list()).getByRole("button", { name: "Teste" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pasta acima" }));
    expect(await within(list()).findByRole("button", { name: "D:\\" })).toBeInTheDocument();
    expect(select()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Pasta acima" })).not.toBeInTheDocument();

    await userEvent.click(within(list()).getByRole("button", { name: "D:\\" }));
    expect(await within(list()).findByRole("button", { name: "Backup" })).toBeInTheDocument();
  });

  it("trocar a unidade no seletor abre a raiz dela", async () => {
    renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    await userEvent.selectOptions(screen.getByLabelText("Unidade"), "D:\\");
    expect(await within(list()).findByRole("button", { name: "Backup" })).toBeInTheDocument();
  });

  it("os trechos do caminho levam direto para a pasta", async () => {
    renderPicker("C:\\Estudos\\Física");
    await screen.findByText("C:\\Estudos\\Física", { selector: "output" });
    const crumbs = screen.getByRole("navigation", { name: "Caminho" });
    await userEvent.click(within(crumbs).getByRole("button", { name: "C:\\" }));
    expect(await within(list()).findByRole("button", { name: "Teste" })).toBeInTheDocument();
  });

  it("caminho inicial inválido mostra o erro e as unidades", async () => {
    renderPicker("Matemática");
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe um caminho absoluto");
    expect(await within(list()).findByRole("button", { name: "C:\\" })).toBeInTheDocument();
  });

  it("“Nova pasta” cria dentro da pasta atual e entra nela", async () => {
    const { onSelect } = renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    await userEvent.click(screen.getByRole("button", { name: "Nova pasta" }));
    await userEvent.type(screen.getByLabelText("Nome da nova pasta"), "Química{Enter}");
    await screen.findByText("C:\\Estudos\\Química", { selector: "output" });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/pastas");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ pai: "C:\\Estudos", nome: "Química" });
    expect(new Headers(post?.[1]?.headers).get("content-type")).toBe("application/json");
    await userEvent.click(select());
    expect(onSelect).toHaveBeenCalledWith("C:\\Estudos\\Química");
  });

  it("“Nova pasta” com nome repetido mostra a mensagem e continua na pasta", async () => {
    renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    await userEvent.click(screen.getByRole("button", { name: "Nova pasta" }));
    await userEvent.type(screen.getByLabelText("Nome da nova pasta"), "Física");
    await userEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma pasta com esse nome.");
    expect(screen.getByText("C:\\Estudos", { selector: "output" })).toBeInTheDocument();
  });

  it("Esc no campo da nova pasta fecha só o campo", async () => {
    const { onCancel } = renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    await userEvent.click(screen.getByRole("button", { name: "Nova pasta" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByLabelText("Nome da nova pasta")).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Cancelar e Esc chamam onCancel; o Esc sai marcado como tratado (o modal continua aberto)", async () => {
    const { onCancel } = renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    const notHandled = fireEvent.keyDown(within(list()).getByRole("button", { name: "Física" }), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notHandled).toBe(false); // preventDefault

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("setas para cima/baixo movem o foco pela lista", async () => {
    renderPicker();
    const first = await within(list()).findByRole("button", { name: "Pasta acima" });
    first.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(within(list()).getByRole("button", { name: "Cálculo" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(within(list()).getByRole("button", { name: "Física" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(within(list()).getByRole("button", { name: "Cálculo" })).toHaveFocus();
  });

  it("só a resposta do último pedido vale (cliques rápidos)", async () => {
    renderPicker();
    await within(list()).findByRole("button", { name: "Física" });
    let releaseSlow: () => void = () => {};
    fetchMock.mockImplementationOnce(
      (url: string) => new Promise((resolve) => (releaseSlow = () => resolve(handle(url)))),
    );
    await userEvent.click(within(list()).getByRole("button", { name: "Cálculo" })); // lento
    await userEvent.click(screen.getByRole("button", { name: "Pasta acima" })); // rápido
    await screen.findByText("C:\\", { selector: "output" });
    releaseSlow();
    await waitFor(() => expect(screen.getByText("C:\\", { selector: "output" })).toBeInTheDocument());
    expect(within(list()).getByRole("button", { name: "Teste" })).toBeInTheDocument();
  });
});

describe("folder-api", () => {
  it("fetchFolder nunca lança: rede fora vira mensagem", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await fetchFolder("C:\\")).toEqual({ ok: false, message: "Não foi possível abrir a pasta." });
  });

  it("fetchFolder recusa resposta sem o formato esperado", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect((await fetchFolder("C:\\")).ok).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ path: 1, folders: "x" }), { status: 200 }));
    expect((await fetchFolder("C:\\")).ok).toBe(false);
  });

  it("fetchFolder sem caminho pede só as unidades", async () => {
    await fetchFolder(null);
    expect(fetchMock).toHaveBeenCalledWith("/api/pastas");
  });

  it("createFolder repassa a mensagem do servidor e nunca lança", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Use um nome válido." }), { status: 400 }));
    expect(await createFolder("C:\\", "a:b")).toEqual({ ok: false, message: "Use um nome válido." });
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await createFolder("C:\\", "x")).toEqual({ ok: false, message: "Não foi possível criar a pasta." });
  });
});
