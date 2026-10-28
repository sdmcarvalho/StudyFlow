import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/auth/actions", () => ({ loginAction: vi.fn() }));

import { loginAction } from "@/features/auth/actions";
import { LoginForm } from "@/features/auth/components/LoginForm";

type LoginResult = Awaited<ReturnType<typeof loginAction>>;

beforeEach(() => {
  vi.mocked(loginAction).mockReset();
  router.replace.mockReset();
  router.refresh.mockReset();
});

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email = "ana@x.com", senha = "Senha1234") {
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), senha);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  it("tem os campos E-mail e Senha (senha mascarada)", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
  });

  it("envia e-mail, senha e o next recebido", async () => {
    const user = userEvent.setup();
    vi.mocked(loginAction).mockResolvedValue({ ok: false, message: "x" });
    render(<LoginForm next="/estudo/abc" />);

    await fillAndSubmit(user);

    expect(loginAction).toHaveBeenCalledWith({ email: "ana@x.com", senha: "Senha1234", next: "/estudo/abc" });
  });

  it("mostra a mensagem de erro do servidor", async () => {
    const user = userEvent.setup();
    vi.mocked(loginAction).mockResolvedValue({ ok: false, message: "E-mail ou senha incorretos." });
    render(<LoginForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText("E-mail ou senha incorretos.")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("mostra os erros por campo ligados ao campo (aria-invalid e aria-describedby)", async () => {
    const user = userEvent.setup();
    vi.mocked(loginAction).mockResolvedValue({
      ok: false,
      fieldErrors: { email: "Informe um e-mail válido.", senha: "Informe a senha." },
    });
    render(<LoginForm />);

    await fillAndSubmit(user);

    const email = await screen.findByLabelText("E-mail");
    const senha = screen.getByLabelText("Senha");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(senha).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Informe um e-mail válido.");
    expect(senha).toHaveAccessibleDescription("Informe a senha.");
  });

  it("desabilita o botão durante o envio", async () => {
    const user = userEvent.setup();
    let resolve!: (value: LoginResult) => void;
    vi.mocked(loginAction).mockReturnValue(new Promise<LoginResult>((r) => (resolve = r)));
    render(<LoginForm />);

    await fillAndSubmit(user);

    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    resolve({ ok: false, message: "E-mail ou senha incorretos." });
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled());
  });

  it("em caso de sucesso troca a rota por redirectTo e atualiza", async () => {
    const user = userEvent.setup();
    vi.mocked(loginAction).mockResolvedValue({ ok: true, data: { redirectTo: "/estudo/abc" } });
    render(<LoginForm next="/estudo/abc" />);

    await fillAndSubmit(user);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/estudo/abc"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("se o servidor falhar, mostra uma mensagem e libera o botão", async () => {
    const user = userEvent.setup();
    vi.mocked(loginAction).mockRejectedValue(new Error("boom"));
    render(<LoginForm />);

    await fillAndSubmit(user);

    expect(await screen.findByText("Não foi possível entrar. Tente novamente.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});
