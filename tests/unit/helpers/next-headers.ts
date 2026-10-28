// Substituto em memória de "next/headers" para os testes de dados.
// Uso: vi.mock("next/headers", () => import("./helpers/next-headers"));

type StoredCookie = { name: string; value: string };

const jar = new Map<string, string>();

export async function cookies() {
  return {
    get(name: string): StoredCookie | undefined {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string): void {
      jar.set(name, value);
    },
    delete(name: string): void {
      jar.delete(name);
    },
  };
}

export function resetCookies(): void {
  jar.clear();
}
