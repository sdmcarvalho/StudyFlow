// Limite de login: 5 falhas por e-mail em 15 minutos, contado em memória (some ao reiniciar o servidor).
// O estado fica em globalThis para sobreviver ao HMR do desenvolvimento.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

const globalForThrottle = globalThis as unknown as { authThrottle?: Map<string, number[]> };
const failures = (globalForThrottle.authThrottle ??= new Map<string, number[]>());

const keyOf = (email: string) => email.trim().toLowerCase();

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (list.length > 0) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function isThrottled(email: string, now: number = Date.now()): boolean {
  return recent(keyOf(email), now).length >= MAX_FAILURES;
}

export function recordFailure(email: string, now: number = Date.now()): void {
  const key = keyOf(email);
  failures.set(key, [...recent(key, now), now]);
}

export function clearFailures(email: string): void {
  failures.delete(keyOf(email));
}

/** Só para testes. */
export function resetThrottle(): void {
  failures.clear();
}
