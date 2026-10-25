import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToast } from "@/components/ui/Toast";

describe("useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("começa sem toast", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
  });

  it("some sozinho depois de 5000 ms", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.show("Registro criado."));
    expect(result.current.toast?.message).toBe("Registro criado.");
    act(() => vi.advanceTimersByTime(4999));
    expect(result.current.toast).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toast).toBeNull();
  });

  it("um novo toast reinicia a contagem de 5000 ms", () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.show("Primeiro"));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.show("Segundo"));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toast?.message).toBe("Segundo");
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast).toBeNull();
  });

  it("guarda o onUndo e hide() remove o toast", () => {
    const onUndo = vi.fn();
    const { result } = renderHook(() => useToast());
    act(() => result.current.show("Registro excluído.", onUndo));
    expect(result.current.toast?.onUndo).toBe(onUndo);
    act(() => result.current.hide());
    expect(result.current.toast).toBeNull();
  });
});
