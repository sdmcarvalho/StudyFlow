import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageDialog } from "@/features/estudo/editor/components/ImageDialog";
import { uploadImage } from "@/features/estudo/editor/upload";

vi.mock("@/features/estudo/editor/upload", () => ({ uploadImage: vi.fn() }));

const uploadMock = vi.mocked(uploadImage);

type UploadResult = Awaited<ReturnType<typeof uploadImage>>;

function deferred() {
  let resolve!: (value: UploadResult) => void;
  const promise = new Promise<UploadResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  const onInsert = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<ImageDialog open studyId="ID" onClose={onClose} onInsert={onInsert} />);
  return { user, onInsert, onClose };
}

function png(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: "image/png" });
}

beforeEach(() => {
  uploadMock.mockReset();
});

describe("ImageDialog — fechado", () => {
  it("não renderiza nada quando open é false", () => {
    render(<ImageDialog open={false} studyId="ID" onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ImageDialog — aba URL", () => {
  it("abre na aba URL, com as duas abas", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "URL" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Enviar do computador" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByLabelText("Endereço da imagem")).toBeInTheDocument();
  });

  it("https://x.com/a.png com alt foto chama onInsert e fecha", async () => {
    const { user, onInsert, onClose } = setup();
    await user.type(screen.getByLabelText("Endereço da imagem"), "https://x.com/a.png");
    await user.type(screen.getByLabelText("Texto alternativo"), "foto");
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onInsert).toHaveBeenCalledWith("![foto](https://x.com/a.png)");
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter no campo também insere", async () => {
    const { user, onInsert } = setup();
    await user.type(screen.getByLabelText("Endereço da imagem"), "http://x.com/b.gif{Enter}");
    expect(onInsert).toHaveBeenCalledWith("![](http://x.com/b.gif)");
  });

  it("javascript:alert(1) mostra o erro e não insere", async () => {
    const { user, onInsert, onClose } = setup();
    const field = screen.getByLabelText("Endereço da imagem");
    await user.type(field, "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(screen.getByText("Use um endereço http ou https.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onInsert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("endereço vazio pede o endereço", async () => {
    const { user, onInsert } = setup();
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(screen.getByText("Informe o endereço da imagem.")).toBeInTheDocument();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it("limpa colchetes, barra vertical e parênteses que quebrariam o Markdown", async () => {
    const { user, onInsert } = setup();
    await user.type(screen.getByLabelText("Endereço da imagem"), "https://x.com/a (1).png");
    await user.type(screen.getByLabelText("Texto alternativo"), "[[a]|b");
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onInsert).toHaveBeenCalledWith("![a b](https://x.com/a%20%281%29.png)");
  });

  it("codifica a barra invertida do endereço", async () => {
    const { user, onInsert } = setup();
    await user.type(screen.getByLabelText("Endereço da imagem"), "https://x.com/a.png?x=\\");
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onInsert).toHaveBeenCalledWith("![](https://x.com/a.png?x=%5C)");
  });

  it("Cancelar fecha sem inserir", async () => {
    const { user, onInsert, onClose } = setup();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });
});

describe("ImageDialog — aba Enviar do computador", () => {
  it("as setas trocam de aba pelo teclado", async () => {
    const { user } = setup();
    screen.getByRole("tab", { name: "URL" }).focus();
    await user.keyboard("{ArrowRight}");
    const upload = screen.getByRole("tab", { name: "Enviar do computador" });
    expect(upload).toHaveFocus();
    expect(upload).toHaveAttribute("aria-selected", "true");
  });

  it("escolher um arquivo envia, o alt começa com o nome e é editável; Inserir insere o caminho relativo", async () => {
    const pending = deferred();
    uploadMock.mockReturnValue(pending.promise);
    const { user, onInsert, onClose } = setup();
    await user.click(screen.getByRole("tab", { name: "Enviar do computador" }));

    const input = screen.getByLabelText("Arquivo de imagem");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/gif,image/webp");
    const file = png("foto.png");
    await user.upload(input, file);

    expect(uploadMock).toHaveBeenCalledWith("ID", file);
    const alt = screen.getByLabelText("Texto alternativo");
    expect(alt).toHaveValue("foto");
    // Durante o envio o botão fica desabilitado.
    const insert = screen.getByRole("button", { name: "Inserir" });
    expect(insert).toBeDisabled();
    expect(screen.getByText("Enviando…")).toBeInTheDocument();

    pending.resolve({ ok: true, path: "imagens/foto-20261025-101530.png", alt: "foto" });
    await waitFor(() => expect(insert).toBeEnabled());

    await user.clear(alt);
    await user.type(alt, "Minha foto");
    await user.click(insert);
    expect(onInsert).toHaveBeenCalledWith("![Minha foto](imagens/foto-20261025-101530.png)");
    expect(onClose).toHaveBeenCalled();
  });

  it("falha no envio mostra a mensagem no diálogo e não insere", async () => {
    uploadMock.mockResolvedValue({ ok: false, message: "Envie uma imagem de até 10 MB." });
    const { user, onInsert, onClose } = setup();
    await user.click(screen.getByRole("tab", { name: "Enviar do computador" }));
    await user.upload(screen.getByLabelText("Arquivo de imagem"), png("grande.png"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Envie uma imagem de até 10 MB.");
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(onInsert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("depois de uma falha, o mesmo arquivo pode ser escolhido de novo", async () => {
    uploadMock.mockResolvedValue({ ok: false, message: "Não foi possível salvar a imagem." });
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Enviar do computador" }));
    const input = screen.getByLabelText("Arquivo de imagem") as HTMLInputElement;
    await user.upload(input, png("foto.png"));
    await screen.findByRole("alert");
    // O valor limpo faz o navegador disparar `change` mesmo com o mesmo arquivo.
    expect(input.value).toBe("");
  });

  it("Inserir sem arquivo pede para escolher a imagem", async () => {
    const { user, onInsert } = setup();
    await user.click(screen.getByRole("tab", { name: "Enviar do computador" }));
    await user.click(screen.getByRole("button", { name: "Inserir" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha uma imagem do computador.");
    expect(onInsert).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("o alt vem do nome limpo do arquivo, sem extensão nem caracteres especiais", async () => {
    uploadMock.mockResolvedValue({ ok: true, path: "imagens/x.png", alt: "x" });
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: "Enviar do computador" }));
    await user.upload(screen.getByLabelText("Arquivo de imagem"), png("Minha [Foto]|1.png"));
    expect(screen.getByLabelText("Texto alternativo")).toHaveValue("minha-foto-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Inserir" })).toBeEnabled());
  });
});
