import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/voz/actions", () => ({ saveVoiceSettings: vi.fn() }));

import { saveVoiceSettings } from "@/features/voz/actions";
import { VoiceSettingsForm } from "@/features/voz/components/VoiceSettingsForm";

const voices = [
  { id: "pt_BR-edresson-low", label: "edresson (baixa)" },
  { id: "pt_BR-faber-medium", label: "faber (média)" },
];
const initial = { voice: "pt_BR-faber-medium", speed: 1, volume: 1 };

beforeEach(() => {
  vi.mocked(saveVoiceSettings).mockReset();
});

describe("VoiceSettingsForm", () => {
  it("mostra a voz salva, o idioma como texto e os números com passo 0,1", () => {
    render(<VoiceSettingsForm initial={{ voice: "pt_BR-faber-medium", speed: 1.5, volume: 0.4 }} voices={voices} />);

    expect(screen.getByLabelText("Voz", { selector: "select" })).toHaveValue("pt_BR-faber-medium");
    expect(screen.getByRole("option", { name: "faber (média)" })).toBeInTheDocument();
    expect(screen.getByText("Português (Brasil)")).toBeInTheDocument();
    const speed = screen.getByLabelText("Velocidade");
    expect(speed).toHaveValue(1.5);
    expect(speed).toHaveAttribute("step", "0.1");
    expect(speed).toHaveAttribute("min", "0.5");
    expect(speed).toHaveAttribute("max", "2");
    const volume = screen.getByLabelText("Volume");
    expect(volume).toHaveValue(0.4);
    expect(volume).toHaveAttribute("step", "0.1");
    expect(volume).toHaveAttribute("min", "0.1");
    expect(volume).toHaveAttribute("max", "1");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("salvar chama a ação com a voz e os números digitados", async () => {
    vi.mocked(saveVoiceSettings).mockResolvedValue({ ok: true, data: { voice: "pt_BR-edresson-low", speed: 1.2, volume: 0.5 } });
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.selectOptions(screen.getByLabelText("Voz", { selector: "select" }), "pt_BR-edresson-low");
    const speed = screen.getByLabelText("Velocidade");
    await userEvent.clear(speed);
    await userEvent.type(speed, "1.2");
    const volume = screen.getByLabelText("Volume");
    await userEvent.clear(volume);
    await userEvent.type(volume, "0.5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(saveVoiceSettings).toHaveBeenCalledTimes(1));
    expect(saveVoiceSettings).toHaveBeenCalledWith({ voice: "pt_BR-edresson-low", speed: 1.2, volume: 0.5 });
    expect(await screen.findByText("Configuração salva.")).toBeInTheDocument();
  });

  it("mostra o erro de cada campo junto dele", async () => {
    vi.mocked(saveVoiceSettings).mockResolvedValue({
      ok: false,
      fieldErrors: { speed: "Use um valor entre 0,5 e 2,0.", volume: "Use um valor entre 0,1 e 1,0.", voice: "Voz não instalada." },
    });
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Use um valor entre 0,5 e 2,0.")).toBeInTheDocument();
    expect(screen.getByText("Use um valor entre 0,1 e 1,0.")).toBeInTheDocument();
    expect(screen.getByText("Voz não instalada.")).toBeInTheDocument();
    expect(screen.getByLabelText("Velocidade")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Volume")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Voz", { selector: "select" })).toHaveAttribute("aria-invalid", "true");
  });

  it("campo vazio ou ilegível vai como texto, para o servidor recusar com a mensagem do campo", async () => {
    vi.mocked(saveVoiceSettings).mockResolvedValue({ ok: false, fieldErrors: { speed: "Use um valor entre 0,5 e 2,0." } });
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.clear(screen.getByLabelText("Velocidade"));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(saveVoiceSettings).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveVoiceSettings).mock.calls[0][0]).toEqual({ voice: "pt_BR-faber-medium", speed: "", volume: 1 });
    expect(await screen.findByText("Use um valor entre 0,5 e 2,0.")).toBeInTheDocument();
  });

  it("mensagem geral da ação aparece como aviso", async () => {
    vi.mocked(saveVoiceSettings).mockResolvedValue({ ok: false, message: "Sessão expirada, entre novamente." });
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Sessão expirada, entre novamente.")).toBeInTheDocument();
  });

  it("falha inesperada da ação mostra a mensagem padrão", async () => {
    vi.mocked(saveVoiceSettings).mockRejectedValue(new Error("rede"));
    render(<VoiceSettingsForm initial={initial} voices={voices} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Não foi possível salvar a configuração.")).toBeInTheDocument();
  });

  it("voz salva que não está mais instalada: o seletor mostra a primeira instalada", () => {
    render(<VoiceSettingsForm initial={{ ...initial, voice: "pt_BR-sumiu-medium" }} voices={voices} />);
    expect(screen.getByLabelText("Voz", { selector: "select" })).toHaveValue("pt_BR-edresson-low");
  });

  it("sem vozes instaladas avisa e desabilita tudo", async () => {
    render(<VoiceSettingsForm initial={initial} voices={[]} />);

    expect(screen.getByText("A voz não está instalada neste ambiente.")).toBeInTheDocument();
    expect(screen.getByLabelText("Voz", { selector: "select" })).toBeDisabled();
    expect(screen.getByLabelText("Velocidade")).toBeDisabled();
    expect(screen.getByLabelText("Volume")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(saveVoiceSettings).not.toHaveBeenCalled();
  });
});
