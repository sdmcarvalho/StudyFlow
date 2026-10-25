import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Cell } from "@/features/estudo/content-schema";
import {
  createAutosave,
  type AutosaveState,
} from "@/features/estudo/editor/autosave";

function doc(texto: string): Cell[] {
  return [{ id: "a", texto }];
}

type Deferred = { cells: Cell[]; resolve: (ok: boolean) => void; reject: (e: unknown) => void };

function controllableSave() {
  const pending: Deferred[] = [];
  const save = vi.fn((cells: Cell[]) => {
    return new Promise<boolean>((resolve, reject) => {
      pending.push({ cells, resolve, reject });
    });
  });
  return {
    save,
    pending,
    async settle(ok: boolean) {
      const next = pending.shift();
      if (!next) throw new Error("nenhum save em andamento");
      next.resolve(ok);
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

function setup(options: { retryDelaysMs?: number[]; validate?: (cells: Cell[]) => boolean } = {}) {
  const control = controllableSave();
  const states: AutosaveState[] = [];
  const clock = new Date("2026-10-25T10:30:00");
  const autosave = createAutosave({
    save: control.save,
    onState: (state) => states.push(state),
    now: () => clock,
    ...options,
  });
  const statuses = () => states.map((s) => s.status);
  return { ...control, autosave, states, statuses, clock };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createAutosave", () => {
  describe("debounce", () => {
    it("marca dirty na hora e só salva após 2000 ms sem novas alterações", async () => {
      const t = setup();

      t.autosave.change(doc("um"));

      expect(t.statuses()).toEqual(["dirty"]);
      expect(t.autosave.hasPending()).toBe(true);
      await vi.advanceTimersByTimeAsync(1999);
      expect(t.save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(1);
      expect(t.save).toHaveBeenCalledWith(doc("um"));
    });

    it("reinicia a contagem a cada change e salva as células da última chamada", async () => {
      const t = setup();

      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(1500);
      t.autosave.change(doc("dois"));
      await vi.advanceTimersByTimeAsync(1999);
      expect(t.save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(t.save).toHaveBeenCalledTimes(1);
      expect(t.save).toHaveBeenCalledWith(doc("dois"));
    });

    it("respeita delayMs personalizado", async () => {
      const control = controllableSave();
      const autosave = createAutosave({
        save: control.save,
        onState: () => {},
        delayMs: 300,
      });

      autosave.change(doc("x"));
      await vi.advanceTimersByTimeAsync(299);
      expect(control.save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(control.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("sucesso", () => {
    it("percorre dirty, saving, saved com savedAt = now() e zera o pendente", async () => {
      const t = setup();

      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.statuses()).toEqual(["dirty", "saving"]);
      expect(t.autosave.hasPending()).toBe(true);

      await t.settle(true);

      expect(t.statuses()).toEqual(["dirty", "saving", "saved"]);
      expect(t.states.at(-1)).toEqual({ status: "saved", savedAt: t.clock });
      expect(t.autosave.hasPending()).toBe(false);
    });

    it("hasPending é false antes de qualquer alteração", () => {
      const t = setup();

      expect(t.autosave.hasPending()).toBe(false);
      expect(t.states).toEqual([]);
    });
  });

  describe("alteração durante um salvamento", () => {
    it("não marca a versão nova como salva e agenda novo salvamento após 2000 ms", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);

      t.autosave.change(doc("dois"));
      expect(t.autosave.hasPending()).toBe(true);
      await t.settle(true);

      expect(t.statuses().at(-1)).toBe("dirty");
      expect(t.autosave.hasPending()).toBe(true);
      expect(t.save).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1999);
      expect(t.save).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(2);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));

      await t.settle(true);

      expect(t.statuses().at(-1)).toBe("saved");
      expect(t.autosave.hasPending()).toBe(false);
    });

    it("se o salvamento em andamento falhar, a versão nova segue pelo debounce normal", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);

      t.autosave.change(doc("dois"));
      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).toHaveBeenCalledTimes(2);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));
      await t.settle(true);
      expect(t.statuses().at(-1)).toBe("saved");
      expect(t.autosave.hasPending()).toBe(false);
    });
  });

  describe("falha e novas tentativas", () => {
    it("tenta de novo aos 5000, 10000 e 20000 ms e termina em failed sem mais tentativas", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(4999);
      expect(t.save).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(2);
      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(9999);
      expect(t.save).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(3);
      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(19999);
      expect(t.save).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(4);
      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("failed");
      expect(t.autosave.hasPending()).toBe(true);
      await vi.advanceTimersByTimeAsync(120000);
      expect(t.save).toHaveBeenCalledTimes(4);
      expect(t.statuses().at(-1)).toBe("failed");
      expect(t.autosave.hasPending()).toBe(true);
    });

    it("uma tentativa que dá certo volta a saved e para de repetir", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(5000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(10000);

      await t.settle(true);

      expect(t.states.at(-1)).toEqual({ status: "saved", savedAt: t.clock });
      expect(t.autosave.hasPending()).toBe(false);
      await vi.advanceTimersByTimeAsync(120000);
      expect(t.save).toHaveBeenCalledTimes(3);
    });

    it("trata uma promessa rejeitada como falha, sem rejeição não tratada", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);

      t.pending.shift()!.reject(new Error("rede"));
      await vi.advanceTimersByTimeAsync(0);

      expect(t.statuses().at(-1)).toBe("retrying");
      expect(t.autosave.hasPending()).toBe(true);
      await vi.advanceTimersByTimeAsync(5000);
      expect(t.save).toHaveBeenCalledTimes(2);
      expect(t.save).toHaveBeenLastCalledWith(doc("um"));
    });

    it("trata um save que lança de forma síncrona como falha", async () => {
      const save = vi.fn(() => {
        throw new Error("boom");
      });
      const states: AutosaveState[] = [];
      const autosave = createAutosave({
        save: save as unknown as (cells: Cell[]) => Promise<boolean>,
        onState: (state) => states.push(state),
      });

      autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);

      expect(states.at(-1)?.status).toBe("retrying");
      expect(autosave.hasPending()).toBe(true);
    });

    it("respeita retryDelaysMs personalizado", async () => {
      const t = setup({ retryDelaysMs: [100] });
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(t.save).toHaveBeenCalledTimes(2);

      await t.settle(false);

      expect(t.statuses().at(-1)).toBe("failed");
      await vi.advanceTimersByTimeAsync(60000);
      expect(t.save).toHaveBeenCalledTimes(2);
    });

    it("um change em retrying cancela a tentativa agendada e recomeça pelo debounce", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(5000);
      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("retrying");

      t.autosave.change(doc("dois"));

      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(1999);
      expect(t.save).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.save).toHaveBeenCalledTimes(3);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));

      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(5000);
      expect(t.save).toHaveBeenCalledTimes(4);
    });

    it("um change em failed volta a dirty, salva após 2000 ms e reinicia as tentativas", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(5000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(10000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(20000);
      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("failed");

      t.autosave.change(doc("dois"));

      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).toHaveBeenCalledTimes(5);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));
      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("retrying");
      await vi.advanceTimersByTimeAsync(5000);
      expect(t.save).toHaveBeenCalledTimes(6);
    });
  });

  describe("saveNow", () => {
    it("salva na hora, cancela o timer pendente e devolve o resultado", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(500);

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);

      expect(t.save).toHaveBeenCalledTimes(1);
      expect(t.save).toHaveBeenCalledWith(doc("um"));
      expect(t.statuses().at(-1)).toBe("saving");
      await t.settle(true);
      await expect(result).resolves.toBe(true);
      expect(t.statuses().at(-1)).toBe("saved");
      expect(t.autosave.hasPending()).toBe(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(t.save).toHaveBeenCalledTimes(1);
    });

    it("em falha devolve false, fica em failed sem agendar tentativas e mantém o rascunho pendente", async () => {
      const t = setup();
      t.autosave.change(doc("um"));

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      await t.settle(false);

      await expect(result).resolves.toBe(false);
      expect(t.statuses().at(-1)).toBe("failed");
      expect(t.autosave.hasPending()).toBe(true);
      await vi.advanceTimersByTimeAsync(120000);
      expect(t.save).toHaveBeenCalledTimes(1);
    });

    it("chamado em failed tenta de novo com o mesmo rascunho", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(5000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(10000);
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(20000);
      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("failed");

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(t.save).toHaveBeenCalledTimes(5);
      expect(t.save).toHaveBeenLastCalledWith(doc("um"));
      await t.settle(true);

      await expect(result).resolves.toBe(true);
      expect(t.states.at(-1)).toEqual({ status: "saved", savedAt: t.clock });
      expect(t.autosave.hasPending()).toBe(false);
    });

    it("cancela a nova tentativa agendada em retrying e salva na hora", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      expect(t.statuses().at(-1)).toBe("retrying");

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(t.save).toHaveBeenCalledTimes(2);
      await t.settle(true);

      await expect(result).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(60000);
      expect(t.save).toHaveBeenCalledTimes(2);
    });

    it("com um salvamento em andamento espera por ele e salva de novo se o rascunho for mais novo", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      t.autosave.change(doc("dois"));

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(t.save).toHaveBeenCalledTimes(1);
      await t.settle(true);

      expect(t.save).toHaveBeenCalledTimes(2);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));
      await t.settle(true);
      await expect(result).resolves.toBe(true);
      expect(t.statuses().at(-1)).toBe("saved");
      expect(t.autosave.hasPending()).toBe(false);
      await vi.advanceTimersByTimeAsync(10000);
      expect(t.save).toHaveBeenCalledTimes(2);
    });

    it("com um salvamento em andamento sem alterações novas não salva de novo", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      await t.settle(true);

      await expect(result).resolves.toBe(true);
      expect(t.save).toHaveBeenCalledTimes(1);
    });

    it("sem nada pendente devolve true sem chamar save", async () => {
      const t = setup();

      await expect(t.autosave.saveNow()).resolves.toBe(true);

      expect(t.save).not.toHaveBeenCalled();
      expect(t.states).toEqual([]);
    });

    it("não lança quando save rejeita e devolve false", async () => {
      const t = setup();
      t.autosave.change(doc("um"));

      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);
      t.pending.shift()!.reject(new Error("rede"));

      await expect(result).resolves.toBe(false);
      expect(t.statuses().at(-1)).toBe("failed");
      expect(t.autosave.hasPending()).toBe(true);
    });

    it("alteração durante o saveNow volta a dirty com novo salvamento agendado", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      const result = t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(0);

      t.autosave.change(doc("dois"));
      await t.settle(false);

      await expect(result).resolves.toBe(false);
      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).toHaveBeenCalledTimes(2);
      expect(t.save).toHaveBeenLastCalledWith(doc("dois"));
    });
  });

  describe("dispose", () => {
    it("cancela o debounce pendente", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      const emitted = t.states.length;

      t.autosave.dispose();
      await vi.advanceTimersByTimeAsync(60000);

      expect(t.save).not.toHaveBeenCalled();
      expect(t.states).toHaveLength(emitted);
    });

    it("cancela as novas tentativas agendadas", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      await t.settle(false);
      const emitted = t.states.length;

      t.autosave.dispose();
      await vi.advanceTimersByTimeAsync(60000);

      expect(t.save).toHaveBeenCalledTimes(1);
      expect(t.states).toHaveLength(emitted);
    });

    it("ignora o resultado de um salvamento em andamento", async () => {
      const t = setup();
      t.autosave.change(doc("um"));
      await vi.advanceTimersByTimeAsync(2000);
      const emitted = t.states.length;

      t.autosave.dispose();
      await t.settle(false);
      await vi.advanceTimersByTimeAsync(60000);

      expect(t.save).toHaveBeenCalledTimes(1);
      expect(t.states).toHaveLength(emitted);
    });

    it("change e saveNow depois de dispose não fazem nada", async () => {
      const t = setup();
      t.autosave.dispose();

      t.autosave.change(doc("um"));
      const result = await t.autosave.saveNow();
      await vi.advanceTimersByTimeAsync(60000);

      expect(result).toBe(false);
      expect(t.save).not.toHaveBeenCalled();
      expect(t.states).toEqual([]);
    });
  });

  describe("documento fora do limite (validate)", () => {
    const valid = (cells: Cell[]) => !cells.some((cell) => cell.texto.includes("grande"));

    it("não chama o servidor nem tenta de novo: fica em invalid e continua pendente", async () => {
      const t = setup({ validate: valid });
      t.autosave.change(doc("grande"));
      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).not.toHaveBeenCalled();
      expect(t.statuses().at(-1)).toBe("invalid");
      expect(t.autosave.hasPending()).toBe(true);
      await vi.advanceTimersByTimeAsync(60000);
      expect(t.save).not.toHaveBeenCalled();
      expect(t.statuses().at(-1)).toBe("invalid");
    });

    it("saveNow com documento inválido devolve false sem chamar o servidor", async () => {
      const t = setup({ validate: valid });
      t.autosave.change(doc("grande"));
      await expect(t.autosave.saveNow()).resolves.toBe(false);
      expect(t.save).not.toHaveBeenCalled();
      expect(t.statuses().at(-1)).toBe("invalid");
    });

    it("alteração que continua inválida mantém invalid na hora; voltando ao limite, salva de novo", async () => {
      const t = setup({ validate: valid });
      t.autosave.change(doc("grande"));
      await vi.advanceTimersByTimeAsync(2000);
      t.autosave.change(doc("grande 2"));
      expect(t.statuses().at(-1)).toBe("invalid");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).not.toHaveBeenCalled();

      t.autosave.change(doc("pequeno"));
      expect(t.statuses().at(-1)).toBe("dirty");
      await vi.advanceTimersByTimeAsync(2000);
      expect(t.save).toHaveBeenCalledWith(doc("pequeno"));
      await t.settle(true);
      expect(t.statuses().at(-1)).toBe("saved");
    });
  });
});
