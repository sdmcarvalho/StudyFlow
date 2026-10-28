// Substituto em memória de "next/headers" para os testes de dados.
// Uso: vi.mock("next/headers", () => import("./helpers/next-headers"));

type StoredCookie = { name: string; value: string };
/** Opções passadas a `cookies().set` (httpOnly, sameSite, secure, path, expires...). */
export type CookieOptions = Record<string, unknown>;

const jar = new Map<string, string>();
const jarOptions = new Map<string, CookieOptions>();

export async function cookies() {
  return {
    get(name: string): StoredCookie | undefined {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, options?: CookieOptions): void {
      jar.set(name, value);
      if (options) jarOptions.set(name, options);
      else jarOptions.delete(name);
    },
    delete(name: string): void {
      jar.delete(name);
      jarOptions.delete(name);
    },
  };
}

/** Opções da última gravação do cookie (undefined se não existe ou foi gravado sem opções). */
export function cookieOptions(name: string): CookieOptions | undefined {
  return jarOptions.get(name);
}

export function resetCookies(): void {
  jar.clear();
  jarOptions.clear();
}
