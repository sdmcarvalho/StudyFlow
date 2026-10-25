import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { useUnsavedGuard } from "@/features/estudo/editor/unsaved-guard";

function Links() {
  return (
    <div>
      <a href="/testes">Interno</a>
      <a href="/agenda?x=1#y">
        <span>Interno com filho</span>
      </a>
      <a href="https://example.com/fora">Externo</a>
      <a href="/agenda" target="_blank">
        Nova aba
      </a>
      <a href="/agenda" download>
        Baixar
      </a>
    </div>
  );
}

function setup(active: boolean) {
  render(<Links />);
  const hook = renderHook(({ on }) => useUnsavedGuard(on), { initialProps: { on: active } });
  return {
    guard: () => hook.result.current,
    setActive: (on: boolean) => hook.rerender({ on }),
  };
}

/** Dispara o clique e diz se ele foi cancelado (true = o navegador não navegaria). */
function click(element: HTMLElement, init: MouseEventInit = {}): boolean {
  let cancelled = false;
  // Último ouvinte (bolha na window): registra o resultado e impede o jsdom de tentar navegar.
  const record = (event: Event) => {
    cancelled = event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", record);
  try {
    fireEvent.click(element, { button: 0, ...init });
  } finally {
    window.removeEventListener("click", record);
  }
  return cancelled;
}

beforeEach(() => {
  router.push.mockReset();
});

describe("useUnsavedGuard", () => {
  it("inativo não intercepta cliques", () => {
    const { guard } = setup(false);
    expect(click(screen.getByText("Interno"))).toBe(false);
    expect(guard().pendingHref).toBeNull();
  });

  it("ativo intercepta link interno, define pendingHref e leave() navega com router.push", () => {
    const { guard } = setup(true);
    expect(click(screen.getByText("Interno"))).toBe(true);
    expect(guard().pendingHref).toBe("/testes");

    act(() => guard().leave());
    expect(router.push).toHaveBeenCalledWith("/testes");
    expect(guard().pendingHref).toBeNull();
  });

  it("clique num filho do link também é interceptado, com busca e âncora", () => {
    const { guard } = setup(true);
    expect(click(screen.getByText("Interno com filho"))).toBe(true);
    expect(guard().pendingHref).toBe("/agenda?x=1#y");
  });

  it("stay() limpa pendingHref sem navegar", () => {
    const { guard } = setup(true);
    click(screen.getByText("Interno"));
    act(() => guard().stay());
    expect(guard().pendingHref).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("não intercepta link externo, target=_blank, download nem Ctrl/Meta/Shift", () => {
    const { guard } = setup(true);
    expect(click(screen.getByText("Externo"))).toBe(false);
    expect(click(screen.getByText("Nova aba"))).toBe(false);
    expect(click(screen.getByText("Baixar"))).toBe(false);
    expect(click(screen.getByText("Interno"), { ctrlKey: true })).toBe(false);
    expect(click(screen.getByText("Interno"), { metaKey: true })).toBe(false);
    expect(click(screen.getByText("Interno"), { shiftKey: true })).toBe(false);
    expect(guard().pendingHref).toBeNull();
  });

  it("não intercepta botão do meio nem clique já cancelado", () => {
    const { guard } = setup(true);
    expect(click(screen.getByText("Interno"), { button: 1 })).toBe(false);

    const link = screen.getByText("Interno");
    const cancel = (event: Event) => event.preventDefault();
    window.addEventListener("click", cancel, true);
    try {
      click(link);
    } finally {
      window.removeEventListener("click", cancel, true);
    }
    expect(guard().pendingHref).toBeNull();
  });

  it("leave() sem pendingHref não navega", () => {
    const { guard } = setup(true);
    act(() => guard().leave());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("beforeunload chama preventDefault só quando ativo", () => {
    const { setActive } = setup(true);
    const active = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(active);
    expect(active.defaultPrevented).toBe(true);

    setActive(false);
    const inactive = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(inactive);
    expect(inactive.defaultPrevented).toBe(false);
  });

  it("ficar inativo deixa de interceptar", () => {
    const { guard, setActive } = setup(true);
    setActive(false);
    expect(click(screen.getByText("Interno"))).toBe(false);
    expect(guard().pendingHref).toBeNull();
  });
});
