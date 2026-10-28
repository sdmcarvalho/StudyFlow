import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/usuarios/actions", () => ({
  createUser: vi.fn(),
  resetUserPassword: vi.fn(),
  setUserActive: vi.fn(),
  deleteUser: vi.fn(),
}));

import { createUser, deleteUser, resetUserPassword, setUserActive } from "@/features/usuarios/actions";
import { UsersView } from "@/features/usuarios/components/UsersView";
import type { UserRow } from "@/features/usuarios/types";

const users: UserRow[] = [
  {
    id: "u0",
    name: "Admin",
    email: "admin@x.com",
    role: "SUPER",
    active: true,
    createdAt: "2026-01-05T12:00:00.000Z",
    studyCount: 0,
    cardCount: 0,
    scheduleCount: 0,
  },
  {
    id: "u1",
    name: "Ana Souza",
    email: "Ana@X.com",
    role: "USER",
    active: true,
    createdAt: "2026-02-10T12:00:00.000Z",
    studyCount: 3,
    cardCount: 12,
    scheduleCount: 5,
  },
  {
    id: "u2",
    name: "Bia Lima",
    email: "bia@x.com",
    role: "USER",
    active: false,
    createdAt: "2026-03-20T12:00:00.000Z",
    studyCount: 0,
    cardCount: 0,
    scheduleCount: 0,
  },
];

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

beforeEach(() => {
  vi.mocked(createUser).mockReset();
  vi.mocked(resetUserPassword).mockReset();
  vi.mocked(setUserActive).mockReset();
  vi.mocked(deleteUser).mockReset();
});

describe("UsersView: tabela", () => {
  it("lista nome, e-mail, data de criação e status de cada usuário", () => {
    render(<UsersView users={users} />);
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Nome",
      "E-mail",
      "Criado em",
      "Status",
      "Ações",
    ]);
    const ana = within(row("Ana Souza"));
    expect(ana.getByText("Ana@X.com")).toBeInTheDocument();
    expect(ana.getByText("10/02/2026")).toBeInTheDocument();
    expect(ana.getByText("Ativo")).toBeInTheDocument();
    expect(within(row("Bia Lima")).getByText("Desativado")).toBeInTheDocument();
  });

  it("a linha do superusuário mostra o selo e nenhum botão", () => {
    render(<UsersView users={users} />);
    const admin = within(row("Admin"));
    expect(admin.getByText("Superusuário")).toBeInTheDocument();
    expect(admin.queryAllByRole("button")).toHaveLength(0);
  });

  it("cada usuário comum tem Redefinir senha, Desativar/Reativar e Excluir", () => {
    render(<UsersView users={users} />);
    const ana = within(row("Ana Souza"));
    expect(ana.getByRole("button", { name: "Redefinir senha de Ana Souza" })).toBeInTheDocument();
    expect(ana.getByRole("button", { name: "Desativar Ana Souza" })).toBeInTheDocument();
    expect(ana.getByRole("button", { name: "Excluir Ana Souza" })).toBeInTheDocument();
    expect(within(row("Bia Lima")).getByRole("button", { name: "Reativar Bia Lima" })).toBeInTheDocument();
  });
});

describe("UsersView: novo usuário", () => {
  async function fill(nome: string, email: string, senha: string) {
    await userEvent.click(screen.getByRole("button", { name: "Novo usuário" }));
    const dialog = screen.getByRole("dialog", { name: "Novo usuário" });
    await userEvent.type(within(dialog).getByLabelText("Nome"), nome);
    await userEvent.type(within(dialog).getByLabelText("E-mail"), email);
    await userEvent.type(within(dialog).getByLabelText("Senha"), senha);
    return dialog;
  }

  it("envia nome, e-mail e senha, fecha o modal e avisa", async () => {
    vi.mocked(createUser).mockResolvedValue({ ok: true, data: { id: "novo" } });
    render(<UsersView users={users} />);
    const dialog = await fill("Caio", "caio@x.com", "Senha1234");
    await userEvent.click(within(dialog).getByRole("button", { name: "Criar" }));

    expect(createUser).toHaveBeenCalledWith({ nome: "Caio", email: "caio@x.com", senha: "Senha1234" });
    expect(await screen.findByRole("status")).toHaveTextContent("Usuário criado.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("erro de campo aparece junto do campo e o modal continua aberto", async () => {
    vi.mocked(createUser).mockResolvedValue({
      ok: false,
      fieldErrors: { email: "Já existe um usuário com este e-mail." },
    });
    render(<UsersView users={users} />);
    const dialog = await fill("Caio", "ana@x.com", "Senha1234");
    await userEvent.click(within(dialog).getByRole("button", { name: "Criar" }));

    const email = await within(dialog).findByLabelText("E-mail");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("Já existe um usuário com este e-mail.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Novo usuário" })).toBeInTheDocument();
  });

  it("mensagem geral (ex.: sessão expirada) vai para o aviso", async () => {
    vi.mocked(createUser).mockResolvedValue({ ok: false, message: "Sessão expirada, entre novamente." });
    render(<UsersView users={users} />);
    const dialog = await fill("Caio", "caio@x.com", "Senha1234");
    await userEvent.click(within(dialog).getByRole("button", { name: "Criar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sessão expirada, entre novamente.");
  });
});

describe("UsersView: redefinir senha", () => {
  it("envia a nova senha do usuário escolhido", async () => {
    vi.mocked(resetUserPassword).mockResolvedValue({ ok: true, data: undefined });
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Redefinir senha de Ana Souza" }));
    const dialog = screen.getByRole("dialog", { name: "Redefinir senha" });
    expect(dialog).toHaveTextContent("Ana Souza");
    await userEvent.type(within(dialog).getByLabelText("Nova senha"), "NovaSenha99");
    await userEvent.click(within(dialog).getByRole("button", { name: "Redefinir" }));

    expect(resetUserPassword).toHaveBeenCalledWith("u1", { novaSenha: "NovaSenha99" });
    expect(await screen.findByRole("status")).toHaveTextContent("Senha redefinida.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("erro de senha aparece no campo", async () => {
    vi.mocked(resetUserPassword).mockResolvedValue({ ok: false, fieldErrors: { novaSenha: "Use pelo menos 8 caracteres." } });
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Redefinir senha de Ana Souza" }));
    const dialog = screen.getByRole("dialog", { name: "Redefinir senha" });
    await userEvent.type(within(dialog).getByLabelText("Nova senha"), "x");
    await userEvent.click(within(dialog).getByRole("button", { name: "Redefinir" }));
    expect(await within(dialog).findByText("Use pelo menos 8 caracteres.")).toBeInTheDocument();
  });
});

describe("UsersView: desativar e reativar", () => {
  it("Desativar chama setUserActive(id, false) e avisa", async () => {
    vi.mocked(setUserActive).mockResolvedValue({ ok: true, data: undefined });
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Desativar Ana Souza" }));
    expect(setUserActive).toHaveBeenCalledWith("u1", false);
    expect(await screen.findByRole("status")).toHaveTextContent("Usuário desativado.");
  });

  it("Reativar chama setUserActive(id, true)", async () => {
    vi.mocked(setUserActive).mockResolvedValue({ ok: true, data: undefined });
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Reativar Bia Lima" }));
    expect(setUserActive).toHaveBeenCalledWith("u2", true);
    expect(await screen.findByRole("status")).toHaveTextContent("Usuário reativado.");
  });

  it("falha mostra a mensagem devolvida", async () => {
    vi.mocked(setUserActive).mockResolvedValue({ ok: false, message: "Usuário não encontrado." });
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Desativar Ana Souza" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Usuário não encontrado.");
  });
});

describe("UsersView: excluir", () => {
  async function openDelete() {
    render(<UsersView users={users} />);
    await userEvent.click(screen.getByRole("button", { name: "Excluir Ana Souza" }));
    return screen.getByRole("alertdialog");
  }

  it("mostra as contagens e deixa Excluir desabilitado até digitar o e-mail (sem diferenciar caixa)", async () => {
    const dialog = await openDelete();
    expect(dialog).toHaveTextContent("Ana Souza");
    expect(dialog).toHaveTextContent("3 estudos");
    expect(dialog).toHaveTextContent("12 cards");
    expect(dialog).toHaveTextContent("5 agendamentos");

    const confirm = within(dialog).getByRole("button", { name: "Excluir" });
    const field = within(dialog).getByLabelText(/Digite o e-mail/);
    expect(confirm).toBeDisabled();

    await userEvent.type(field, "outro@x.com");
    expect(confirm).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, "  ana@x.COM ");
    expect(confirm).toBeEnabled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("confirmar chama deleteUser com o id e o e-mail digitado e avisa", async () => {
    vi.mocked(deleteUser).mockResolvedValue({ ok: true, data: undefined });
    const dialog = await openDelete();
    await userEvent.type(within(dialog).getByLabelText(/Digite o e-mail/), "ana@x.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));

    expect(deleteUser).toHaveBeenCalledWith("u1", "ana@x.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Usuário excluído.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("singular nas contagens e Cancelar não exclui", async () => {
    render(
      <UsersView users={[users[0], { ...users[1], studyCount: 1, cardCount: 1, scheduleCount: 1 }]} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Excluir Ana Souza" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("1 estudo");
    expect(dialog).toHaveTextContent("1 card");
    expect(dialog).toHaveTextContent("1 agendamento");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("recusa do servidor mantém o modal aberto e mostra o erro no campo", async () => {
    vi.mocked(deleteUser).mockResolvedValue({
      ok: false,
      fieldErrors: { emailConfirmacao: "Digite o e-mail do usuário para confirmar." },
    });
    const dialog = await openDelete();
    await userEvent.type(within(dialog).getByLabelText(/Digite o e-mail/), "ana@x.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect(await within(dialog).findByText("Digite o e-mail do usuário para confirmar.")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
