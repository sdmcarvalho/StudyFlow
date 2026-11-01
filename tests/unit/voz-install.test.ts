import { describe, expect, it, vi } from "vitest";
import { DEFAULT_VOICES, envValue, finalMessage, planInstall, resolveInstall, venvStatus } from "../../scripts/voz-install.mjs";

describe("venvStatus", () => {
  const python = "/srv/voz/venv/bin/python";

  it("sem o Python do venv: ausente (e nem testa o pip)", async () => {
    const runCmd = vi.fn();
    expect(await venvStatus(python, { exists: () => false, runCmd })).toBe("ausente");
    expect(runCmd).not.toHaveBeenCalled();
  });

  it("com Python e pip funcionando: ok", async () => {
    const runCmd = vi.fn().mockResolvedValue({ code: 0, stdout: "pip 24.0" });
    expect(await venvStatus(python, { exists: () => true, runCmd })).toBe("ok");
    expect(runCmd).toHaveBeenCalledWith([python, "-m", "pip", "--version"]);
  });

  it("com Python mas sem pip (venv que parou no ensurepip): incompleto", async () => {
    const runCmd = vi.fn().mockResolvedValue({ code: 1, stdout: "No module named pip" });
    expect(await venvStatus(python, { exists: () => true, runCmd })).toBe("incompleto");
  });

  it("Python do venv que nem executa: incompleto", async () => {
    const runCmd = vi.fn().mockResolvedValue({ code: -1, stdout: "", error: new Error("ENOENT") });
    expect(await venvStatus(python, { exists: () => true, runCmd })).toBe("incompleto");
  });
});

const VOICES = ["pt_BR-faber-medium", "pt_BR-cadu-medium"];

describe("planInstall", () => {
  it("no Windows o Python do venv fica em <dir>\\venv\\Scripts\\python.exe", () => {
    const plan = planInstall({ platform: "win32", dir: "C:\\StudyFlow\\voz", voices: VOICES });
    expect(plan.python).toBe("C:\\StudyFlow\\voz\\venv\\Scripts\\python.exe");
    expect(plan.venvCmd).toEqual(["python", "-m", "venv", "C:\\StudyFlow\\voz\\venv"]);
  });

  it("no Linux o Python do venv fica em <dir>/venv/bin/python", () => {
    const plan = planInstall({ platform: "linux", dir: "/var/lib/studyflow/voz", voices: VOICES });
    expect(plan.python).toBe("/var/lib/studyflow/voz/venv/bin/python");
    expect(plan.venvCmd).toEqual(["python3", "-m", "venv", "/var/lib/studyflow/voz/venv"]);
  });

  it("instala piper-tts==1.8.0 com o pip do próprio venv", () => {
    const plan = planInstall({ platform: "linux", dir: "/srv/voz", voices: VOICES });
    expect(plan.pipCmd).toEqual([plan.python, "-m", "pip", "install", "piper-tts==1.8.0"]);
  });

  it("gera um comando de download por voz, cada um com --data-dir <dir>/voices", () => {
    const plan = planInstall({ platform: "linux", dir: "/srv/voz", voices: VOICES });
    expect(plan.voiceCmds).toHaveLength(VOICES.length);
    plan.voiceCmds.forEach((cmd, i) => {
      expect(cmd).toEqual([plan.python, "-m", "piper.download_voices", "--data-dir", "/srv/voz/voices", VOICES[i]]);
    });
  });

  it("usa o separador do Windows também nas vozes", () => {
    const plan = planInstall({ platform: "win32", dir: "C:\\x\\voz", voices: ["pt_BR-faber-medium"] });
    expect(plan.voiceCmds[0]).toContain("C:\\x\\voz\\voices");
  });

  it("sem lista de vozes usa as quatro vozes pt-BR padrão", () => {
    const plan = planInstall({ platform: "linux", dir: "/srv/voz" });
    expect(DEFAULT_VOICES).toEqual([
      "pt_BR-faber-medium",
      "pt_BR-cadu-medium",
      "pt_BR-edresson-low",
      "pt_BR-jeff-medium",
    ]);
    expect(plan.voiceCmds.map((c) => c[c.length - 1])).toEqual(DEFAULT_VOICES);
  });

  it("nenhum comando usa shell nem encadeamento", () => {
    const plan = planInstall({ platform: "linux", dir: "/srv/voz", voices: VOICES });
    for (const cmd of [plan.venvCmd, plan.pipCmd, ...plan.voiceCmds]) {
      expect(Array.isArray(cmd)).toBe(true);
      for (const part of cmd) {
        expect(part).not.toMatch(/&&|;|\||\bshell\b|\bsh\b|cmd\.exe|powershell/i);
      }
    }
  });
});

describe("resolveInstall (pasta e Python do sistema)", () => {
  it("sem nada definido usa <STUDYFLOW_BASE_DIR>/voz e diz que é a pasta padrão", () => {
    expect(resolveInstall({ platform: "linux", env: {} })).toEqual({
      dir: "/var/lib/studyflow/voz",
      isDefault: true,
      systemPython: undefined,
    });
    expect(resolveInstall({ platform: "win32", env: { STUDYFLOW_BASE_DIR: "D:\\SF" } }).dir).toBe("D:\\SF\\voz");
  });

  it("variáveis vazias ou só com espaços contam como ausentes", () => {
    const env = { STUDYFLOW_VOZ_DIR: "", STUDYFLOW_VOZ_SYSTEM_PYTHON: "   ", STUDYFLOW_BASE_DIR: " " };
    expect(resolveInstall({ platform: "linux", env })).toEqual({
      dir: "/var/lib/studyflow/voz",
      isDefault: true,
      systemPython: undefined,
    });
    expect(envValue("X", { X: "" })).toBeUndefined();
    expect(envValue("X", { X: "  a  " })).toBe("a");
  });

  it("STUDYFLOW_VOZ_DIR ou --dir é pasta fora do padrão; --dir e --python vencem as variáveis", () => {
    const env = { STUDYFLOW_VOZ_DIR: " /opt/voz ", STUDYFLOW_VOZ_SYSTEM_PYTHON: "python3.12" };
    expect(resolveInstall({ platform: "linux", env })).toEqual({
      dir: "/opt/voz",
      isDefault: false,
      systemPython: "python3.12",
    });
    expect(resolveInstall({ platform: "linux", env, args: { dir: "/srv/v", python: "py" } })).toEqual({
      dir: "/srv/v",
      isDefault: false,
      systemPython: "py",
    });
  });
});

describe("finalMessage", () => {
  it("na pasta padrão: nada a configurar, sem pedir STUDYFLOW_VOZ_DIR nem STUDYFLOW_VOZ_PYTHON", () => {
    const text = finalMessage({ dir: "/var/lib/studyflow/voz", python: "/var/lib/studyflow/voz/venv/bin/python", isDefault: true }).join("\n");
    expect(text).toContain("nada a configurar");
    expect(text).not.toContain("STUDYFLOW_VOZ_DIR");
    expect(text).not.toContain("STUDYFLOW_VOZ_PYTHON");
  });

  it("fora da pasta padrão: pede STUDYFLOW_VOZ_DIR e cita STUDYFLOW_VOZ_PYTHON com caminho absoluto", () => {
    const text = finalMessage({ dir: "/opt/voz", python: "/opt/voz/venv/bin/python", isDefault: false }).join("\n");
    expect(text).toContain("STUDYFLOW_VOZ_DIR=/opt/voz");
    expect(text).toContain("STUDYFLOW_VOZ_PYTHON=/opt/voz/venv/bin/python (caminho absoluto)");
  });
});
