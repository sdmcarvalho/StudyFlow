"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type UnsavedGuard = {
  /** Endereço interno que o usuário tentou abrir com alterações pendentes. */
  pendingHref: string | null;
  stay(): void;
  leave(): void;
};

/** Link que a própria página navegaria (mesma origem, mesma aba, sem download). */
function internalHref(anchor: HTMLAnchorElement): string | null {
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Enquanto `active`, intercepta (em captura, antes do `Link` do Next) cliques em links internos e
 * guarda o destino em `pendingHref`; fechar ou recarregar a aba dispara o `beforeunload`.
 * O botão Voltar do navegador não é interceptável.
 */
export function useUnsavedGuard(active: boolean): UnsavedGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = internalHref(anchor);
      if (href === null) return;
      event.preventDefault();
      setPendingHref(href);
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Navegadores antigos só mostram o aviso com returnValue preenchido.
      event.returnValue = "";
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  const stay = useCallback(() => setPendingHref(null), []);

  const leave = useCallback(() => {
    if (pendingHref === null) return;
    setPendingHref(null);
    router.push(pendingHref);
  }, [pendingHref, router]);

  return { pendingHref, stay, leave };
}
