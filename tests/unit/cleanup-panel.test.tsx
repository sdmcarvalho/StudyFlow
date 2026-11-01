import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/voz/actions", () => ({ clearAudios: vi.fn() }));

import { clearAudios } from "@/features/voz/actions";
import { CleanupPanel, formatBytes } from "@/features/voz/components/CleanupPanel";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clearAudios).mockResolvedValue({ ok: true, data: { files: 3, bytes: 1_572_864 } });
});

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Limpar Audios" }));
  return screen.getByRole("alertdialog");
}

describe("formatBytes", () => {
  it("usa B, KB e MB com vírgula decimal", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1_572_864)).toBe("1,5 MB");
  });
});

describe("CleanupPanel", () => {
  it("tem o título Limpeza e o botão Limpar Audios", () => {
    render(<CleanupPanel />);
    expect(screen.getByRole("heading", { name: "Limpeza" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Limpar Audios" })).toBeEnabled();
  });

  it("clicar só abre a confirmação, sem apagar", async () => {
    const user = userEvent.setup();
    render(<CleanupPanel />);
    const dialog = await openConfirm(user);
    expect(within(dialog).getByText(/não afeta os Estudos/)).toBeVisible();
    expect(clearAudios).not.toHaveBeenCalled();
  });

  it("Cancelar fecha sem apagar", async () => {
    const user = userEvent.setup();
    render(<CleanupPanel />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(clearAudios).not.toHaveBeenCalled();
  });

  it("confirmar apaga, fecha e mostra quantos arquivos e bytes", async () => {
    const user = userEvent.setup();
    render(<CleanupPanel />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(clearAudios).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("3 arquivos apagados (1,5 MB).");
  });

  it("singular e nenhum áudio", async () => {
    const user = userEvent.setup();
    vi.mocked(clearAudios).mockResolvedValueOnce({ ok: true, data: { files: 1, bytes: 2048 } });
    render(<CleanupPanel />);
    await user.click(within(await openConfirm(user)).getByRole("button", { name: "Apagar" }));
    expect(await screen.findByText("1 arquivo apagado (2,0 KB).")).toBeVisible();

    vi.mocked(clearAudios).mockResolvedValueOnce({ ok: true, data: { files: 0, bytes: 0 } });
    await user.click(within(await openConfirm(user)).getByRole("button", { name: "Apagar" }));
    expect(await screen.findByText("Não havia áudios para apagar.")).toBeVisible();
  });

  it("erro da ação aparece em alerta dentro da confirmação, que continua aberta", async () => {
    const user = userEvent.setup();
    vi.mocked(clearAudios).mockResolvedValue({ ok: false, message: "Acesso negado." });
    render(<CleanupPanel />);
    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole("button", { name: "Apagar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Acesso negado.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("exceção vira mensagem genérica e libera o botão", async () => {
    const user = userEvent.setup();
    vi.mocked(clearAudios).mockRejectedValue(new Error("rede"));
    render(<CleanupPanel />);
    const dialog = await openConfirm(user);
    const confirm = within(dialog).getByRole("button", { name: "Apagar" });
    await user.click(confirm);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Não foi possível limpar os áudios.");
    expect(confirm).toBeEnabled();
  });

  it("clique duplo em Apagar chama a ação uma vez só", async () => {
    const user = userEvent.setup();
    let resolve!: (value: { ok: true; data: { files: number; bytes: number } }) => void;
    vi.mocked(clearAudios).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CleanupPanel />);
    const confirm = within(await openConfirm(user)).getByRole("button", { name: "Apagar" });
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(clearAudios).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: { files: 0, bytes: 0 } });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
